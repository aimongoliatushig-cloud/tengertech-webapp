# -*- coding: utf-8 -*-

from dateutil.relativedelta import relativedelta

from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError


class MunicipalDiscipline(models.Model):
    _name = "municipal.discipline"
    _description = "Municipal Discipline"
    _order = "violation_date desc, id desc"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    employee_id = fields.Many2one(
        "hr.employee",
        string="Ажилтан",
        required=True,
        index=True,
        tracking=True,
    )
    department_id = fields.Many2one(
        "hr.department",
        string="Хэлтэс",
        related="employee_id.department_id",
        store=True,
        readonly=True,
        index=True,
    )
    violation_type = fields.Selection(
        [
            ("attendance", "Ирц"),
            ("safety", "ХАБЭА"),
            ("quality", "Чанар"),
            ("behavior", "Ёс зүй"),
            ("property", "Эд хөрөнгө"),
            ("no_report", "Тайлан өгөөгүй"),
            ("returned_report", "Тайлан буцаагдсан"),
            ("other", "Бусад"),
        ],
        string="Зөрчлийн төрөл",
        required=True,
        default="attendance",
        tracking=True,
    )
    violation_date = fields.Date(
        string="Зөрчлийн огноо",
        required=True,
        default=fields.Date.context_today,
        tracking=True,
    )
    repeated = fields.Boolean(
        string="Давтан зөрчил",
        compute="_compute_repeated",
        readonly=False,
        store=True,
        tracking=True,
    )
    repeated_violation_count = fields.Integer(
        string="90 хоногийн давтамж",
        compute="_compute_repeated",
    )
    action_type = fields.Selection(
        [
            ("warning", "Сануулга"),
            ("reprimand", "Зэмлэл"),
            ("penalty", "Торгууль"),
            ("deduction", "Суутгал"),
            ("termination_proposal", "Чөлөөлөх санал"),
            ("other", "Бусад"),
        ],
        string="Арга хэмжээ",
        required=True,
        default="warning",
        tracking=True,
    )
    penalty_amount = fields.Float(string="Торгуулийн дүн")
    deduction_percent = fields.Float(string="Суутгалын хувь")
    explanation = fields.Text(string="Тайлбар")
    employee_explanation = fields.Text(string="Ажилтны тайлбар", tracking=True)
    employee_response = fields.Selection(
        [
            ("pending", "Хүлээгдэж байна"),
            ("agree", "Зөвшөөрсөн"),
            ("disagree", "Зөвшөөрөөгүй"),
        ],
        string="Ажилтны байр суурь",
        default="pending",
        tracking=True,
    )
    attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_discipline_ir_attachment_rel",
        "discipline_id",
        "attachment_id",
        string="Хавсралт",
    )
    employee_attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_discipline_employee_attachment_rel",
        "discipline_id",
        "attachment_id",
        string="Ажилтны хавсралт",
    )
    source_attendance_issue_id = fields.Many2one(
        "municipal.attendance.issue",
        string="Холбоотой ирцийн асуудал",
        ondelete="set null",
    )
    source_work_report_id = fields.Many2one(
        "municipal.work.report",
        string="Холбоотой ажлын тайлан",
        ondelete="set null",
    )
    state = fields.Selection(
        [
            ("draft", "Ноорог"),
            ("hr_review", "Хүний нөөцийн хяналт"),
            ("manager_review", "Менежерийн хяналт"),
            ("employee_explanation", "Ажилтны тайлбар"),
            ("admin_review", "Захиргааны хяналт"),
            ("approved", "Баталгаажсан"),
            ("archived", "Архивласан"),
            ("cancelled", "Цуцлагдсан"),
        ],
        string="Төлөв",
        default="approved",
        required=True,
        tracking=True,
    )
    approved_by = fields.Many2one("res.users", string="Баталсан хэрэглэгч", readonly=True)
    order_attachment_id = fields.Many2one(
        "ir.attachment",
        string="Тушаалын хавсралт",
        ondelete="set null",
    )
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        default=lambda self: self.env.company,
        required=True,
    )

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            vals.setdefault("state", "approved")
            if vals.get("state") == "approved" and not vals.get("approved_by"):
                vals["approved_by"] = self.env.user.id
        return super().create(vals_list)

    def write(self, vals):
        self._check_employee_self_service_write(vals)
        return super().write(vals)

    def _check_employee_self_service_write(self, vals):
        if self.env.context.get("allow_employee_explanation_submit") and set(vals) == {"state"}:
            for record in self:
                if record.employee_id.user_id == self.env.user and record.state == "employee_explanation":
                    continue
                raise AccessError("Зөвхөн өөрийн тайлбар авах шатанд тайлбар илгээх боломжтой.")
            return
        if not vals or self.env.user.has_group("municipal_core.group_municipal_hr"):
            return
        privileged_groups = [
            "municipal_core.group_municipal_department_head",
            "municipal_core.group_municipal_manager",
            "municipal_core.group_municipal_director",
            "municipal_core.group_municipal_admin",
            "hr_custom_mn.group_hr_custom_mn_officer",
            "hr_custom_mn.group_hr_custom_mn_admin",
        ]
        if any(self.env.user.has_group(group) for group in privileged_groups):
            return
        allowed_fields = {"employee_explanation", "employee_response", "employee_attachment_ids"}
        if set(vals).issubset(allowed_fields):
            for record in self:
                if record.employee_id.user_id == self.env.user and record.state == "employee_explanation":
                    continue
                raise AccessError("Зөвхөн өөрийн тайлбар авах шатанд тайлбар засах боломжтой.")
            return
        if self.env.user.has_group("municipal_core.group_municipal_worker"):
            raise AccessError("Сахилгын бүртгэлийг засах эрх хүрэлцэхгүй байна.")

    @api.constrains("penalty_amount", "deduction_percent")
    def _check_penalty_values(self):
        for record in self:
            if record.penalty_amount < 0:
                raise ValidationError("Торгуулийн дүн сөрөг байж болохгүй.")
            if record.deduction_percent < 0 or record.deduction_percent > 100:
                raise ValidationError("Суутгалын хувь 0-100 хооронд байна.")

    @api.constrains("action_type", "penalty_amount", "deduction_percent")
    def _check_required_penalty_fields(self):
        for record in self:
            if record.action_type == "penalty" and not record.penalty_amount:
                raise ValidationError("Торгуулийн арга хэмжээнд торгуулийн дүн оруулна уу.")
            if record.action_type == "deduction" and not record.deduction_percent:
                raise ValidationError("Суутгалын арга хэмжээнд суутгалын хувь оруулна уу.")

    @api.depends("employee_id", "violation_type", "violation_date", "state")
    def _compute_repeated(self):
        for record in self:
            record.repeated_violation_count = 0
            if not record.employee_id or not record.violation_type or not record.violation_date:
                record.repeated = False
                continue
            start_date = record.violation_date - relativedelta(days=90)
            domain = [
                ("employee_id", "=", record.employee_id.id),
                ("violation_type", "=", record.violation_type),
                ("violation_date", ">=", start_date),
                ("violation_date", "<=", record.violation_date),
                ("state", "not in", ["cancelled", "archived"]),
            ]
            if record.id:
                domain.append(("id", "!=", record.id))
            total_count = self.search_count(domain) + 1
            record.repeated_violation_count = total_count
            record.repeated = total_count >= 2

    def action_hr_review(self):
        self.write({"state": "hr_review"})
        return True

    def action_manager_review(self):
        self.write({"state": "manager_review"})
        return True

    def action_employee_explanation(self):
        self.write({"state": "employee_explanation"})
        return True

    def action_submit_employee_explanation(self):
        for record in self:
            if not record.employee_explanation:
                raise UserError("Ажилтны тайлбар оруулна уу.")
        self.with_context(allow_employee_explanation_submit=True).write({"state": "manager_review"})
        return True

    def action_admin_review(self):
        self.write({"state": "admin_review"})
        return True

    def action_approve(self):
        self.write({"state": "approved", "approved_by": self.env.user.id})
        return True

    def action_archive(self):
        self.write({"state": "archived"})
        return True

    def action_cancel(self):
        self.write({"state": "cancelled"})
        return True

    def action_reset_to_draft(self):
        self.write({"state": "draft", "approved_by": False})
        return True
