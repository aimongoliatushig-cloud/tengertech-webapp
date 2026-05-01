# -*- coding: utf-8 -*-

from uuid import uuid4

from odoo import api, fields, models
from odoo.exceptions import UserError


class MunicipalComplaint(models.Model):
    _name = "municipal.complaint"
    _description = "Municipal Complaint"
    _order = "create_date desc, id desc"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(string="Гомдлын дугаар", required=True, default="Шинэ", tracking=True)
    complainant_name = fields.Char(string="Иргэний нэр")
    complainant_phone = fields.Char(string="Иргэний утас")
    complaint_type = fields.Selection(
        [
            ("garbage_not_collected", "Хог аваагүй"),
            ("dirty_street", "Гудамж бохир байна"),
            ("tree_dry", "Мод хатсан"),
            ("bench_broken", "Сандал эвдэрсэн"),
            ("light_off", "Гэрэлтүүлэг асахгүй байна"),
            ("other", "Бусад"),
        ],
        string="Гомдлын төрөл",
        default="other",
        required=True,
        tracking=True,
    )
    description = fields.Text(string="Тайлбар", required=True, tracking=True)
    location_text = fields.Char(string="Байршил")
    gps_latitude = fields.Float(string="Өргөрөг", digits=(10, 7))
    gps_longitude = fields.Float(string="Уртраг", digits=(10, 7))
    photo_ids = fields.Many2many(
        "ir.attachment",
        "municipal_complaint_photo_attachment_rel",
        "complaint_id",
        "attachment_id",
        string="Зураг",
    )
    department_id = fields.Many2one("hr.department", string="Хариуцах хэлтэс", tracking=True)
    work_id = fields.Many2one("municipal.work", string="Холбоотой ажил", readonly=True, copy=False)
    assigned_user_id = fields.Many2one("res.users", string="Хариуцсан хэрэглэгч", tracking=True)
    state = fields.Selection(
        [
            ("new", "Шинэ"),
            ("assigned", "Хуваарилсан"),
            ("in_progress", "Шийдвэрлэж байна"),
            ("resolved", "Шийдвэрлэсэн"),
            ("rejected", "Татгалзсан"),
            ("cancelled", "Цуцлагдсан"),
        ],
        string="Төлөв",
        default="new",
        required=True,
        tracking=True,
        index=True,
    )
    received_by = fields.Many2one(
        "res.users",
        string="Хүлээн авсан",
        default=lambda self: self.env.user,
        readonly=True,
    )
    resolved_by = fields.Many2one("res.users", string="Шийдвэрлэсэн хэрэглэгч", readonly=True)
    resolved_date = fields.Datetime(string="Шийдвэрлэсэн огноо", readonly=True)
    resolution_note = fields.Text(string="Шийдвэрлэсэн тэмдэглэл")
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        default=lambda self: self.env.company,
        required=True,
    )
    qr_token = fields.Char(string="QR token", copy=False, index=True)
    qr_url = fields.Char(string="QR холбоос", compute="_compute_qr_url", store=True)

    @api.model_create_multi
    def create(self, vals_list):
        sequence = self.env["ir.sequence"].sudo()
        for vals in vals_list:
            if vals.get("name", "Шинэ") == "Шинэ":
                vals["name"] = sequence.next_by_code("municipal.complaint") or "Шинэ"
        complaints = super().create(vals_list)
        complaints._ensure_qr_token()
        return complaints

    @api.depends("qr_token")
    def _compute_qr_url(self):
        for complaint in self:
            complaint.qr_url = "/mobile/qr/complaint/%s" % complaint.qr_token if complaint.qr_token else False

    def _ensure_qr_token(self):
        for complaint in self:
            if not complaint.qr_token:
                complaint.qr_token = uuid4().hex

    def _get_or_create_complaint_work_type(self):
        work_type = self.env["municipal.work.type"].search([("code", "=", "complaint")], limit=1)
        if work_type:
            return work_type
        department = self.department_id or self.env["hr.department"].search([], limit=1)
        return self.env["municipal.work.type"].create(
            {
                "name": "Иргэний гомдол",
                "code": "complaint",
                "department_id": department.id if department else False,
                "default_requires_photo": True,
                "default_requires_approval": True,
                "default_unit_of_measure": "ш",
            }
        )

    def action_assign(self):
        for complaint in self:
            if not complaint.assigned_user_id:
                raise UserError("Хариуцах хэрэглэгч сонгоно уу.")
        self.write({"state": "assigned"})
        return True

    def action_create_work(self):
        for complaint in self:
            if complaint.work_id:
                continue
            if not complaint.department_id:
                raise UserError("Ажил үүсгэхийн өмнө хариуцах хэлтэс сонгоно уу.")
            work = self.env["municipal.work"].create(
                {
                    "name": "%s - %s" % (complaint.name, dict(complaint._fields["complaint_type"].selection).get(complaint.complaint_type)),
                    "department_id": complaint.department_id.id,
                    "work_type_id": complaint._get_or_create_complaint_work_type().id,
                    "responsible_user_id": complaint.assigned_user_id.id or False,
                    "manager_id": self.env.user.id,
                    "description": complaint.description,
                    "location_text": complaint.location_text,
                    "requires_photo": True,
                    "requires_approval": True,
                }
            )
            complaint.work_id = work.id
        return True

    def action_start(self):
        for complaint in self:
            if not complaint.work_id:
                complaint.action_create_work()
        self.write({"state": "in_progress"})
        return True

    def action_resolve(self):
        for complaint in self:
            if not complaint.resolution_note:
                raise UserError("Шийдвэрлэсэн тэмдэглэл оруулна уу.")
            if complaint.work_id and complaint.work_id.requires_photo:
                approved_reports = complaint.work_id.report_ids.filtered(lambda report: report.state == "approved")
                if not approved_reports or not any(report.attachment_ids for report in approved_reports):
                    raise UserError("Шийдвэрлэхийн өмнө зурагтай баталгаажсан ажлын тайлан шаардлагатай.")
        self.write(
            {
                "state": "resolved",
                "resolved_by": self.env.user.id,
                "resolved_date": fields.Datetime.now(),
            }
        )
        return True

    def action_reject(self):
        for complaint in self:
            if not complaint.resolution_note:
                raise UserError("Татгалзсан шалтгаан оруулна уу.")
        self.write({"state": "rejected", "resolved_by": self.env.user.id, "resolved_date": fields.Datetime.now()})
        return True

    def action_cancel(self):
        self.write({"state": "cancelled"})
        return True

    def write(self, vals):
        before_state = {record.id: record.state for record in self} if "state" in vals else {}
        result = super().write(vals)
        if before_state and not self.env.context.get("skip_municipal_audit"):
            audit = self.env["municipal.audit.log"]
            for record in self:
                if before_state.get(record.id) != record.state:
                    audit.log_change(record, "state", before_state.get(record.id), record.state, "state")
        return result
