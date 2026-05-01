# -*- coding: utf-8 -*-

from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError


REPORT_STATES = [
    ("draft", "Ноорог"),
    ("submitted", "Илгээсэн"),
    ("under_review", "Хяналтад"),
    ("returned", "Буцаагдсан"),
    ("approved", "Баталгаажсан"),
]


class MunicipalWorkReport(models.Model):
    _name = "municipal.work.report"
    _description = "Municipal Work Report"
    _order = "report_datetime desc, id desc"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    work_id = fields.Many2one(
        "municipal.work",
        string="Ажил",
        required=True,
        index=True,
        ondelete="cascade",
        tracking=True,
    )
    employee_id = fields.Many2one(
        "hr.employee",
        string="Ажилтан",
        index=True,
        tracking=True,
    )
    user_id = fields.Many2one(
        "res.users",
        string="Хэрэглэгч",
        default=lambda self: self.env.user,
        index=True,
        tracking=True,
    )
    report_datetime = fields.Datetime(
        string="Тайлангийн огноо",
        default=fields.Datetime.now,
        required=True,
        tracking=True,
    )
    attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_work_report_ir_attachment_rel",
        "report_id",
        "attachment_id",
        string="Зураг / хавсралт",
    )
    description = fields.Text(string="Тайлбар", tracking=True)
    actual_quantity = fields.Float(string="Гүйцэтгэсэн тоо хэмжээ")
    unit_of_measure = fields.Char(string="Хэмжих нэгж")
    location_text = fields.Char(string="Байршил")
    gps_latitude = fields.Float(string="Байршлын өргөрөг", digits=(10, 7))
    gps_longitude = fields.Float(string="Байршлын уртраг", digits=(10, 7))
    delay_reason = fields.Text(string="Хоцролтын шалтгаан")
    state = fields.Selection(
        REPORT_STATES,
        string="Төлөв",
        default="draft",
        required=True,
        tracking=True,
        index=True,
    )
    reviewed_by = fields.Many2one("res.users", string="Хянасан хэрэглэгч", readonly=True)
    approved_by = fields.Many2one("res.users", string="Баталсан хэрэглэгч", readonly=True)
    rejected_by = fields.Many2one("res.users", string="Буцаасан хэрэглэгч", readonly=True)
    rejection_reason = fields.Text(string="Буцаасан шалтгаан", tracking=True)
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        related="work_id.company_id",
        store=True,
        readonly=True,
    )

    @api.onchange("work_id")
    def _onchange_work_id(self):
        for record in self:
            if record.work_id:
                record.unit_of_measure = record.work_id.unit_of_measure
                record.location_text = record.work_id.location_text
                if not record.employee_id:
                    record.employee_id = record.work_id.responsible_employee_id

    @api.constrains("state", "description", "rejection_reason", "attachment_ids")
    def _check_report_state_requirements(self):
        for record in self:
            if record.state in ("submitted", "under_review", "approved") and not record.description:
                raise ValidationError("Тайлан илгээхэд тайлбар заавал оруулна.")
            if record.state == "returned" and not record.rejection_reason:
                raise ValidationError("Буцаах үед шалтгаан заавал оруулна.")
            if (
                record.state in ("submitted", "approved")
                and record.work_id.requires_photo
                and not record.attachment_ids
            ):
                raise ValidationError("Энэ ажилд зураг хавсаргах шаардлагатай.")

    def _user_has_review_role(self):
        self.ensure_one()
        user = self.env.user
        review_groups = [
            "municipal_core.group_municipal_director",
            "municipal_core.group_municipal_manager",
            "municipal_core.group_municipal_department_head",
            "municipal_core.group_municipal_inspector",
            "municipal_core.group_municipal_admin",
        ]
        return any(user.has_group(group) for group in review_groups)

    def _ensure_not_self_approval(self):
        for record in self:
            if record.user_id == self.env.user and not record._user_has_review_role():
                raise UserError("Өөрийн тайланг батлах боломжгүй.")

    def _set_state(self, state, extra_values=None):
        values = {"state": state}
        if extra_values:
            values.update(extra_values)
        self.write(values)
        return True

    def action_submit(self):
        for record in self:
            if not record.description:
                raise UserError("Тайлан илгээхэд тайлбар заавал оруулна.")
            if record.work_id.requires_photo and not record.attachment_ids:
                raise UserError("Энэ ажилд зураг хавсаргах шаардлагатай.")
        result = self._set_state("submitted")
        self.mapped("work_id").write({"state": "report_submitted"})
        return result

    def action_review(self):
        return self._set_state("under_review", {"reviewed_by": self.env.user.id})

    def action_return(self):
        for record in self:
            if not record.rejection_reason:
                raise UserError("Буцаах шалтгаан оруулна уу.")
        return self._set_state("returned", {"rejected_by": self.env.user.id})

    def action_approve(self):
        self._ensure_not_self_approval()
        for record in self:
            if record.work_id.requires_photo and not record.attachment_ids:
                raise UserError("Батлахын өмнө зураг хавсаргасан байх ёстой.")
        return self._set_state("approved", {"approved_by": self.env.user.id})

    def action_reset_to_draft(self):
        return self._set_state(
            "draft",
            {
                "reviewed_by": False,
                "approved_by": False,
                "rejected_by": False,
                "rejection_reason": False,
            },
        )
