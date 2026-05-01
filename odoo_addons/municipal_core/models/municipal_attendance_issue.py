# -*- coding: utf-8 -*-

from dateutil.relativedelta import relativedelta

from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError


class MunicipalAttendanceIssue(models.Model):
    _name = "municipal.attendance.issue"
    _description = "Municipal Attendance Issue"
    _order = "date desc, id desc"
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
    date = fields.Date(string="Огноо", required=True, default=fields.Date.context_today)
    issue_type = fields.Selection(
        [
            ("late", "Хоцорсон"),
            ("absent", "Тасалсан"),
            ("early_leave", "Эрт явсан"),
            ("no_report", "Тайлан өгөөгүй"),
            ("other", "Бусад"),
        ],
        string="Асуудлын төрөл",
        required=True,
        default="late",
        tracking=True,
    )
    attendance_status = fields.Selection(
        [
            ("present", "Ирсэн"),
            ("late", "Хоцорсон"),
            ("absent", "Тасалсан"),
            ("leave", "Чөлөөтэй"),
            ("sick", "Өвчтэй"),
            ("business_trip", "Томилолттой"),
            ("annual_leave", "Ээлжийн амралттай"),
            ("terminated", "Ажлаас чөлөөлөгдсөн"),
            ("unknown", "Тодорхойгүй"),
        ],
        string="Ирцийн төлөв",
        default="unknown",
        required=True,
        tracking=True,
    )
    planned_start_time = fields.Float(string="Төлөвлөсөн эхлэх цаг")
    actual_check_in = fields.Datetime(string="Бодит ирсэн цаг")
    actual_check_out = fields.Datetime(string="Бодит гарсан цаг")
    late_minutes = fields.Integer(string="Хоцорсон минут")
    reason = fields.Text(string="Шалтгаан")
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
        "municipal_attendance_issue_ir_attachment_rel",
        "issue_id",
        "attachment_id",
        string="Хавсралт",
    )
    employee_attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_attendance_issue_employee_attachment_rel",
        "issue_id",
        "attachment_id",
        string="Ажилтны хавсралт",
    )
    source_work_id = fields.Many2one(
        "municipal.work",
        string="Холбоотой ажил",
        ondelete="set null",
    )
    source_work_report_id = fields.Many2one(
        "municipal.work.report",
        string="Холбоотой тайлан",
        ondelete="set null",
    )
    registered_by = fields.Many2one(
        "res.users",
        string="Бүртгэсэн хэрэглэгч",
        default=lambda self: self.env.user,
        readonly=True,
    )
    approved_by = fields.Many2one("res.users", string="Баталсан хэрэглэгч", readonly=True)
    repeated_issue_count = fields.Integer(
        string="30 хоногийн давтамж",
        compute="_compute_repeated_issue",
        store=True,
    )
    suggested_action = fields.Selection(
        [
            ("none", "Саналгүй"),
            ("reminder", "Сануулга санал болгох"),
            ("written_warning", "Бичгээр анхааруулах санал"),
            ("discipline_proposal", "Сахилгын арга хэмжээ санал"),
        ],
        string="Системийн санал",
        compute="_compute_repeated_issue",
        store=True,
    )
    state = fields.Selection(
        [
            ("draft", "Ноорог"),
            ("hr_review", "Хүний нөөцийн хяналт"),
            ("manager_review", "Менежерийн хяналт"),
            ("employee_explanation", "Ажилтны тайлбар"),
            ("approved", "Баталгаажсан"),
            ("archived", "Архивласан"),
            ("cancelled", "Цуцлагдсан"),
        ],
        string="Төлөв",
        default="draft",
        required=True,
        tracking=True,
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
            if not vals.get("attendance_status") or vals.get("attendance_status") == "unknown":
                vals["attendance_status"] = self._attendance_status_from_issue_type(
                    vals.get("issue_type")
                )
        return super().create(vals_list)

    def write(self, vals):
        self._check_employee_self_service_write(vals)
        if "issue_type" in vals and "attendance_status" not in vals:
            vals = dict(vals)
            vals["attendance_status"] = self._attendance_status_from_issue_type(vals.get("issue_type"))
        return super().write(vals)

    @api.model
    def _attendance_status_from_issue_type(self, issue_type):
        return {
            "late": "late",
            "absent": "absent",
            "early_leave": "present",
            "no_report": "present",
            "other": "unknown",
        }.get(issue_type or "other", "unknown")

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
            raise AccessError("Ирцийн бүртгэлийг засах эрх хүрэлцэхгүй байна.")

    @api.constrains("late_minutes")
    def _check_late_minutes(self):
        for record in self:
            if record.late_minutes < 0:
                raise ValidationError("Хоцорсон минут сөрөг байж болохгүй.")

    @api.constrains("actual_check_in", "actual_check_out")
    def _check_check_out_after_check_in(self):
        for record in self:
            if (
                record.actual_check_in
                and record.actual_check_out
                and record.actual_check_out < record.actual_check_in
            ):
                raise ValidationError("Гарсан цаг ирсэн цагаас өмнө байж болохгүй.")

    @api.depends("employee_id", "issue_type", "date", "state")
    def _compute_repeated_issue(self):
        for record in self:
            record.repeated_issue_count = 0
            record.suggested_action = "none"
            if not record.employee_id or not record.issue_type or not record.date:
                continue
            start_date = record.date - relativedelta(days=30)
            domain = [
                ("employee_id", "=", record.employee_id.id),
                ("issue_type", "=", record.issue_type),
                ("date", ">=", start_date),
                ("date", "<=", record.date),
                ("state", "not in", ["cancelled", "archived"]),
            ]
            if record.id:
                domain.append(("id", "!=", record.id))
            total_count = self.search_count(domain) + 1
            record.repeated_issue_count = total_count
            if record.issue_type == "absent" and total_count >= 3:
                record.suggested_action = "discipline_proposal"
            elif total_count >= 3:
                record.suggested_action = "discipline_proposal"
            elif total_count >= 2:
                record.suggested_action = "written_warning"
            elif record.issue_type in ("late", "absent", "no_report"):
                record.suggested_action = "reminder"

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

    def action_create_discipline(self):
        discipline_model = self.env["municipal.discipline"]
        for record in self:
            if record.suggested_action == "none":
                raise UserError("Сахилгын бүртгэл үүсгэх санал хараахан гараагүй байна.")
            discipline_model.create(
                {
                    "employee_id": record.employee_id.id,
                    "violation_type": "attendance",
                    "violation_date": record.date,
                    "repeated": record.repeated_issue_count >= 2,
                    "action_type": "warning"
                    if record.suggested_action in ("reminder", "written_warning")
                    else "reprimand",
                    "explanation": record.reason
                    or dict(record._fields["issue_type"].selection).get(record.issue_type),
                    "source_attendance_issue_id": record.id,
                    "company_id": record.company_id.id,
                }
            )
        return True
