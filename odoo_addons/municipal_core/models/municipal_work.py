# -*- coding: utf-8 -*-

from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError


WORK_STATES = [
    ("draft", "Ноорог"),
    ("planned", "Төлөвлөсөн"),
    ("assigned", "Хуваарилсан"),
    ("started", "Эхэлсэн"),
    ("report_submitted", "Тайлан илгээсэн"),
    ("under_review", "Хяналтад"),
    ("returned", "Буцаагдсан"),
    ("approved", "Баталгаажсан"),
    ("done", "Дууссан"),
    ("cancelled", "Цуцлагдсан"),
]


class MunicipalWork(models.Model):
    _name = "municipal.work"
    _description = "Municipal Work"
    _order = "priority desc, deadline_datetime asc, id desc"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(string="Ажлын нэр", required=True, tracking=True)
    department_id = fields.Many2one(
        "hr.department",
        string="Хэлтэс",
        required=True,
        index=True,
        tracking=True,
    )
    work_type_id = fields.Many2one(
        "municipal.work.type",
        string="Ажлын төрөл",
        required=True,
        index=True,
        tracking=True,
    )
    responsible_user_id = fields.Many2one(
        "res.users",
        string="Хариуцсан хэрэглэгч",
        index=True,
        tracking=True,
    )
    responsible_employee_id = fields.Many2one(
        "hr.employee",
        string="Хариуцсан ажилтан",
        index=True,
        tracking=True,
    )
    manager_id = fields.Many2one(
        "res.users",
        string="Менежер",
        index=True,
        tracking=True,
    )
    start_datetime = fields.Datetime(string="Эхлэх огноо", tracking=True)
    deadline_datetime = fields.Datetime(string="Дуусах хугацаа", tracking=True)
    state = fields.Selection(
        WORK_STATES,
        string="Төлөв",
        default="draft",
        required=True,
        tracking=True,
        index=True,
    )
    priority = fields.Selection(
        [
            ("0", "Энгийн"),
            ("1", "Чухал"),
            ("2", "Яаралтай"),
            ("3", "Маш яаралтай"),
        ],
        string="Эрэмбэ",
        default="0",
        tracking=True,
    )
    description = fields.Text(string="Тайлбар")
    planned_quantity = fields.Float(string="Төлөвлөсөн тоо хэмжээ")
    actual_quantity = fields.Float(
        string="Гүйцэтгэсэн тоо хэмжээ",
        compute="_compute_actual_quantity",
        store=True,
    )
    unit_of_measure = fields.Char(string="Хэмжих нэгж")
    location_text = fields.Char(string="Байршил")
    requires_photo = fields.Boolean(string="Зураг шаардах", default=True, tracking=True)
    requires_approval = fields.Boolean(string="Батлах шаардах", default=True, tracking=True)
    attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_work_ir_attachment_rel",
        "work_id",
        "attachment_id",
        string="Хавсралт",
    )
    report_ids = fields.One2many(
        "municipal.work.report",
        "work_id",
        string="Тайлангууд",
    )
    created_by = fields.Many2one(
        "res.users",
        string="Үүсгэсэн хэрэглэгч",
        default=lambda self: self.env.user,
        readonly=True,
    )
    approved_by = fields.Many2one("res.users", string="Баталсан хэрэглэгч", readonly=True)
    rejected_by = fields.Many2one("res.users", string="Буцаасан хэрэглэгч", readonly=True)
    rejection_reason = fields.Text(string="Буцаасан шалтгаан", tracking=True)
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        required=True,
        default=lambda self: self.env.company,
        index=True,
    )
    active = fields.Boolean(string="Идэвхтэй", default=True)

    @api.onchange("work_type_id")
    def _onchange_work_type_id(self):
        for record in self:
            if record.work_type_id:
                record.requires_photo = record.work_type_id.default_requires_photo
                record.requires_approval = record.work_type_id.default_requires_approval
                record.unit_of_measure = record.work_type_id.default_unit_of_measure
                if record.work_type_id.department_id:
                    record.department_id = record.work_type_id.department_id

    @api.depends("report_ids.state", "report_ids.actual_quantity")
    def _compute_actual_quantity(self):
        for record in self:
            approved_reports = record.report_ids.filtered(lambda report: report.state == "approved")
            record.actual_quantity = sum(approved_reports.mapped("actual_quantity"))

    @api.constrains("start_datetime", "deadline_datetime")
    def _check_deadline_after_start(self):
        for record in self:
            if (
                record.start_datetime
                and record.deadline_datetime
                and record.deadline_datetime < record.start_datetime
            ):
                raise ValidationError("Дуусах хугацаа эхлэх огнооноос өмнө байж болохгүй.")

    @api.constrains("state", "rejection_reason")
    def _check_return_reason(self):
        for record in self:
            if record.state == "returned" and not record.rejection_reason:
                raise ValidationError("Буцаах үед шалтгаан заавал оруулна.")

    def _has_report_photo(self):
        self.ensure_one()
        return any(report.attachment_ids for report in self.report_ids)

    def _has_approved_report(self):
        self.ensure_one()
        return bool(self.report_ids.filtered(lambda report: report.state == "approved"))

    def _set_state(self, state, extra_values=None):
        values = {"state": state}
        if extra_values:
            values.update(extra_values)
        self.write(values)
        return True

    def action_plan(self):
        return self._set_state("planned")

    def action_assign(self):
        for record in self:
            if not record.responsible_user_id and not record.responsible_employee_id:
                raise UserError("Хариуцсан хэрэглэгч эсвэл ажилтан сонгоно уу.")
        return self._set_state("assigned")

    def action_start(self):
        return self._set_state("started")

    def action_submit_report(self):
        return self._set_state("report_submitted")

    def action_review(self):
        return self._set_state("under_review")

    def action_return(self):
        for record in self:
            if not record.rejection_reason:
                raise UserError("Буцаах шалтгаан оруулна уу.")
        return self._set_state("returned", {"rejected_by": self.env.user.id})

    def action_approve(self):
        for record in self:
            if record.requires_photo and not record._has_report_photo():
                raise UserError("Батлахын өмнө тайланд зураг хавсаргасан байх ёстой.")
            if record.requires_approval and not record._has_approved_report():
                raise UserError("Батлахын өмнө баталгаажсан тайлан шаардлагатай.")
        return self._set_state("approved", {"approved_by": self.env.user.id})

    def action_done(self):
        for record in self:
            if record.requires_approval and record.state != "approved":
                raise UserError("Батлах шаардлагатай ажлыг дуусгахын өмнө баталгаажуулна уу.")
        return self._set_state("done")

    def action_cancel(self):
        return self._set_state("cancelled")

    def action_reset_to_draft(self):
        return self._set_state(
            "draft",
            {
                "approved_by": False,
                "rejected_by": False,
                "rejection_reason": False,
            },
        )

    @api.model
    def create_compat_report(self, values):
        """Minimal API helper for later PWA integration without changing frontend routes."""
        return self.env["municipal.work.report"].create(values)
