# -*- coding: utf-8 -*-

from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError

from .municipal_cleaning_area import CLEANING_DEFAULT_LINES


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
    cleaning_area_id = fields.Many2one(
        "municipal.cleaning.area",
        string="Цэвэрлэх талбай",
        index=True,
        tracking=True,
        ondelete="set null",
    )
    work_date = fields.Date(string="Ажлын огноо", index=True, tracking=True)
    master_id = fields.Many2one(
        "hr.employee",
        string="Хариуцсан мастер",
        index=True,
        tracking=True,
    )
    start_time = fields.Datetime(string="Эхэлсэн цаг", tracking=True)
    end_time = fields.Datetime(string="Дууссан цаг", tracking=True)
    before_image = fields.Binary(string="Өмнөх зураг", attachment=True)
    after_image = fields.Binary(string="Дараах зураг", attachment=True)
    employee_note = fields.Text(string="Ажилтны тайлбар")
    review_note = fields.Text(string="Мастерын тэмдэглэл", tracking=True)
    reviewed_by = fields.Many2one("res.users", string="Хянасан хэрэглэгч", readonly=True)
    reviewed_date = fields.Datetime(string="Хянасан огноо", readonly=True)
    review_state = fields.Selection(
        [
            ("pending", "Хүлээгдэж байна"),
            ("returned", "Буцаасан"),
            ("approved", "Баталгаажсан"),
        ],
        string="Хяналтын төлөв",
        default="pending",
        tracking=True,
    )
    line_ids = fields.One2many(
        "municipal.work.line",
        "work_id",
        string="Даалгаврууд",
    )
    cleaning_street_name = fields.Char(
        related="cleaning_area_id.street_name",
        string="Гудамж / замын нэр",
        readonly=True,
    )
    cleaning_start_point = fields.Char(
        related="cleaning_area_id.start_point",
        string="Эхлэх цэг",
        readonly=True,
    )
    cleaning_end_point = fields.Char(
        related="cleaning_area_id.end_point",
        string="Дуусах цэг",
        readonly=True,
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

    def write(self, vals):
        basic_worker = (
            self.env.user.has_group("municipal_core.group_municipal_worker")
            and not self.env.user.has_group("municipal_core.group_municipal_master")
            and not self.env.user.has_group("municipal_core.group_municipal_department_head")
            and not self.env.user.has_group("municipal_core.group_municipal_manager")
            and not self.env.user.has_group("municipal_core.group_municipal_director")
            and not self.env.user.has_group("municipal_core.group_municipal_admin")
        )
        if basic_worker:
            allowed_fields = {
                "line_ids",
                "before_image",
                "after_image",
                "employee_note",
                "start_time",
                "end_time",
                "state",
            }
            if set(vals) - allowed_fields:
                raise UserError("Ажилтан зөвхөн өөрийн гүйцэтгэлийн мэдээллийг шинэчилнэ.")
            if vals.get("state") and vals["state"] not in {"started", "report_submitted", "done"}:
                raise UserError("Ажилтан зөвхөн ажил эхлүүлэх, тайлан илгээх болон дуусгах төлөвт шилжүүлнэ.")
            for record in self:
                if not (
                    record.responsible_user_id == self.env.user
                    or record.responsible_employee_id.user_id == self.env.user
                ):
                    raise UserError("Та зөвхөн өөрт хуваарилагдсан ажлыг шинэчилнэ.")
        return super().write(vals)

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

    def _create_default_cleaning_lines(self):
        for record in self.filtered("cleaning_area_id"):
            if record.line_ids:
                continue
            self.env["municipal.work.line"].sudo().create(
                [
                    {
                        "work_id": record.id,
                        "name": line_name,
                        "sequence": index * 10,
                    }
                    for index, line_name in enumerate(CLEANING_DEFAULT_LINES, start=1)
                ]
            )
        return True

    def _user_can_manage_cleaning_work(self):
        self.ensure_one()
        user = self.env.user
        if (
            user.has_group("municipal_core.group_municipal_manager")
            or user.has_group("municipal_core.group_municipal_director")
            or user.has_group("municipal_core.group_municipal_admin")
        ):
            return True
        if self.manager_id == user:
            return True
        if self.master_id.user_id == user:
            return True
        if self.department_id.manager_id.user_id == user:
            return True
        return False

    def _check_cleaning_employee_or_manager(self):
        for record in self.filtered("cleaning_area_id"):
            user = self.env.user
            is_employee = (
                record.responsible_user_id == user
                or record.responsible_employee_id.user_id == user
            )
            if not is_employee and not record._user_can_manage_cleaning_work():
                raise UserError("Та зөвхөн өөрт хуваарилагдсан цэвэрлэгээний ажлыг гүйцэтгэнэ.")

    def action_start_work(self):
        self._check_cleaning_employee_or_manager()
        return self._set_state("started", {"start_time": fields.Datetime.now()})

    def action_finish_work(self):
        self._check_cleaning_employee_or_manager()
        for record in self.filtered("cleaning_area_id"):
            if not record.before_image or not record.after_image:
                raise UserError("Ажил дуусгахын өмнө өмнөх болон дараах зураг оруулна уу.")
        return self._set_state("done", {"end_time": fields.Datetime.now()})

    def action_approve_work(self):
        for record in self.filtered("cleaning_area_id"):
            if not record._user_can_manage_cleaning_work():
                raise UserError("Энэ ажлыг баталгаажуулах эрх танд байхгүй.")
        return self._set_state(
            "approved",
            {
                "review_state": "approved",
                "reviewed_by": self.env.user.id,
                "reviewed_date": fields.Datetime.now(),
                "approved_by": self.env.user.id,
            },
        )

    def action_return_work(self):
        for record in self.filtered("cleaning_area_id"):
            if not record._user_can_manage_cleaning_work():
                raise UserError("Энэ ажлыг буцаах эрх танд байхгүй.")
            if not record.review_note:
                raise UserError("Буцаахын өмнө мастерын тэмдэглэл оруулна уу.")
        return self._set_state(
            "returned",
            {
                "review_state": "returned",
                "reviewed_by": self.env.user.id,
                "reviewed_date": fields.Datetime.now(),
                "rejected_by": self.env.user.id,
                "rejection_reason": self[:1].review_note,
            },
        )

    @api.model
    def create_compat_report(self, values):
        """Minimal API helper for later PWA integration without changing frontend routes."""
        return self.env["municipal.work.report"].create(values)
