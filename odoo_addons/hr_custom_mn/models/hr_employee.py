# -*- coding: utf-8 -*-
import base64
from collections import defaultdict
from dateutil.relativedelta import relativedelta

from odoo import api, fields, models, _
from odoo.exceptions import UserError

from .ir_attachment import DOCUMENT_TYPES
from .xlsx_export import build_xlsx


REQUIRED_DOCUMENT_TYPES = [
    "id_card",
    "diploma",
    "employment_contract",
    "appointment_order",
]


class HrEmployee(models.Model):
    _inherit = "hr.employee"

    x_mn_employee_code = fields.Char(
        string="Ажилтны код",
        copy=False,
        readonly=True,
        index=True,
        tracking=True,
    )
    x_mn_english_name = fields.Char(string="Англи нэр", tracking=True)
    x_mn_registration_number = fields.Char(
        string="Регистрийн дугаар",
        copy=False,
        index=True,
        tracking=True,
        groups="hr.group_hr_user",
    )
    x_mn_blood_type = fields.Selection(
        [
            ("a_pos", "A+"),
            ("a_neg", "A-"),
            ("b_pos", "B+"),
            ("b_neg", "B-"),
            ("ab_pos", "AB+"),
            ("ab_neg", "AB-"),
            ("o_pos", "O+"),
            ("o_neg", "O-"),
        ],
        string="Цусны бүлэг",
        groups="hr.group_hr_user",
        tracking=True,
    )
    x_mn_current_address = fields.Text(string="Одоо оршин суугаа хаяг", groups="hr.group_hr_user")
    x_mn_permanent_address = fields.Text(string="Байнгын хаяг", groups="hr.group_hr_user")
    x_mn_grade_rank = fields.Char(string="Зэрэг / Дэв", tracking=True)
    x_mn_employment_status = fields.Selection(
        [
            ("active", "Идэвхтэй"),
            ("probation", "Туршилтын хугацаа"),
            ("suspended", "Түр түдгэлзсэн"),
            ("terminated", "Чөлөөлөгдсөн"),
            ("rehired", "Дахин ажилд орсон"),
        ],
        string="Ажил эрхлэлтийн төлөв",
        default="active",
        required=True,
        tracking=True,
    )
    x_mn_public_service_category = fields.Selection(
        [
            ("administrative", "Төрийн захиргаа"),
            ("special", "Төрийн тусгай"),
            ("service", "Төрийн үйлчилгээ"),
            ("political", "Улс төрийн"),
            ("support", "Туслах"),
        ],
        string="Төрийн албаны ангилал",
        tracking=True,
    )
    x_mn_state_rank = fields.Char(string="Төрийн албаны зэрэг дэв", tracking=True)
    x_mn_appointment_order_no = fields.Char(string="Томилгооны тушаалын дугаар", tracking=True)
    x_mn_appointment_date = fields.Date(string="Томилогдсон огноо", tracking=True)
    x_mn_military_status = fields.Selection(
        [
            ("served", "Цэргийн алба хаасан"),
            ("not_served", "Цэргийн алба хаагаагүй"),
            ("exempted", "Чөлөөлөгдсөн"),
            ("reserve", "Бэлтгэл офицер / бүртгэлтэй"),
        ],
        string="Цэргийн албаны байдал",
        groups="hr.group_hr_user",
    )
    x_mn_disability_status = fields.Selection(
        [
            ("none", "Хөгжлийн бэрхшээлгүй"),
            ("temporary", "Түр"),
            ("permanent", "Байнгын"),
        ],
        string="Хөгжлийн бэрхшээлийн байдал",
        default="none",
        groups="hr.group_hr_user",
    )
    x_mn_medical_notes = fields.Text(string="Эрүүл мэндийн тэмдэглэл", groups="hr.group_hr_user")
    x_mn_bank_name = fields.Char(string="Банкны нэр", groups="hr.group_hr_user")
    x_mn_bank_account_number = fields.Char(string="Дансны дугаар", groups="hr.group_hr_user")
    x_mn_tax_number = fields.Char(string="Татвар төлөгчийн дугаар", groups="hr.group_hr_user")
    x_mn_insurance_number = fields.Char(string="Нийгмийн даатгалын дугаар", groups="hr.group_hr_user")
    x_mn_graduation_year = fields.Integer(string="Төгссөн он", groups="hr.group_hr_user")
    x_mn_certificate_notes = fields.Text(string="Сертификатын тэмдэглэл", groups="hr.group_hr_user")
    x_mn_document_count = fields.Integer(string="Баримтын тоо", compute="_compute_x_mn_document_stats")
    x_mn_missing_document_count = fields.Integer(
        string="Дутуу баримтын тоо",
        compute="_compute_x_mn_document_stats",
        search="_search_x_mn_has_missing_documents",
    )
    x_mn_has_missing_documents = fields.Boolean(
        string="Дутуу баримттай",
        compute="_compute_x_mn_document_stats",
        search="_search_x_mn_has_missing_documents",
    )
    x_mn_age = fields.Integer(string="Нас", compute="_compute_x_mn_age", search="_search_x_mn_age")
    x_mn_service_years = fields.Float(
        string="Ажилласан жил",
        compute="_compute_x_mn_service_years",
    )
    x_mn_retirement_soon = fields.Boolean(
        string="Тэтгэвэрт ойртсон",
        compute="_compute_x_mn_date_flags",
        search="_search_x_mn_retirement_soon",
    )
    x_mn_contract_ending_soon = fields.Boolean(
        string="Гэрээ дуусах дөхсөн",
        compute="_compute_x_mn_date_flags",
        search="_search_x_mn_contract_ending_soon",
    )
    x_mn_birthday_this_month = fields.Boolean(
        string="Энэ сард төрсөн өдөртэй",
        compute="_compute_x_mn_date_flags",
        search="_search_x_mn_birthday_this_month",
    )
    x_mn_history_ids = fields.One2many(
        "hr.custom.mn.employee.history",
        "employee_id",
        string="Үйлдлийн түүх",
    )
    x_mn_history_count = fields.Integer(string="Түүх", compute="_compute_x_mn_counts")
    x_mn_performance_ids = fields.One2many(
        "hr.custom.mn.performance",
        "employee_id",
        string="Гүйцэтгэлийн үнэлгээ",
    )
    x_mn_reward_ids = fields.One2many(
        "hr.custom.mn.reward",
        "employee_id",
        string="Шагналын түүх",
    )
    x_mn_warning_ids = fields.One2many(
        "hr.custom.mn.warning",
        "employee_id",
        string="Сануулгын түүх",
    )
    x_mn_performance_count = fields.Integer(string="Үнэлгээ", compute="_compute_x_mn_counts")
    x_mn_latest_performance_id = fields.Many2one(
        "hr.custom.mn.performance",
        string="Сүүлийн үнэлгээ",
        compute="_compute_x_mn_latest_performance",
    )
    x_mn_performance_score = fields.Float(
        string="KPI оноо",
        compute="_compute_x_mn_latest_performance",
    )
    x_mn_task_completion_percent = fields.Float(
        string="Даалгаврын биелэлт %",
        compute="_compute_x_mn_latest_performance",
    )
    x_mn_discipline_score = fields.Float(
        string="Сахилгын оноо",
        compute="_compute_x_mn_latest_performance",
    )

    _sql_constraints = [
        (
            "x_mn_employee_code_uniq",
            "unique(x_mn_employee_code)",
            "Ажилтны код давхардахгүй байх ёстой.",
        ),
        (
            "x_mn_registration_number_uniq",
            "unique(x_mn_registration_number)",
            "Регистрийн дугаар давхардахгүй байх ёстой.",
        ),
    ]

    @api.model_create_multi
    def create(self, vals_list):
        sequence = self.env["ir.sequence"].sudo()
        for vals in vals_list:
            if not vals.get("x_mn_employee_code"):
                vals["x_mn_employee_code"] = sequence.next_by_code("hr.custom.mn.employee") or _("New")
        employees = super().create(vals_list)
        for employee in employees:
            employee._x_mn_log_history("create", note="Ажилтны мастер бүртгэл үүссэн.")
        return employees

    def write(self, vals):
        tracked_fields = {
            "department_id",
            "job_id",
            "parent_id",
            "x_mn_grade_rank",
            "x_mn_employment_status",
        }
        before = {}
        if tracked_fields.intersection(vals):
            for employee in self:
                before[employee.id] = {
                    "department_id": employee.department_id.id,
                    "job_id": employee.job_id.id,
                    "parent_id": employee.parent_id.id,
                    "x_mn_grade_rank": employee.x_mn_grade_rank,
                    "x_mn_employment_status": employee.x_mn_employment_status,
                }
        result = super().write(vals)
        for employee in self:
            previous = before.get(employee.id)
            if previous:
                employee._x_mn_log_history(
                    "edit",
                    old_department_id=previous["department_id"],
                    new_department_id=employee.department_id.id,
                    old_job_id=previous["job_id"],
                    new_job_id=employee.job_id.id,
                    old_manager_id=previous["parent_id"],
                    new_manager_id=employee.parent_id.id,
                    old_grade_rank=previous["x_mn_grade_rank"],
                    new_grade_rank=employee.x_mn_grade_rank,
                    note="Ажилтны үндсэн мэдээлэл шинэчлэгдсэн.",
                )
        return result

    def _x_mn_log_history(self, action_type, **values):
        self.ensure_one()
        history_values = {
            "employee_id": self.id,
            "action_type": action_type,
            "user_id": self.env.user.id,
        }
        history_values.update({key: value for key, value in values.items() if value})
        return self.env["hr.custom.mn.employee.history"].sudo().create(history_values)

    @api.depends("birthday")
    def _compute_x_mn_age(self):
        today = fields.Date.context_today(self)
        for employee in self:
            employee.x_mn_age = (
                relativedelta(today, employee.birthday).years if employee.birthday else 0
            )

    def _search_x_mn_age(self, operator, value):
        if operator not in ["=", "!=", "<", "<=", ">", ">="]:
            return []
        today = fields.Date.context_today(self)
        target_birthdate = today - relativedelta(years=int(value or 0))
        reversed_operator = {
            ">": "<",
            ">=": "<=",
            "<": ">",
            "<=": ">=",
            "=": "=",
            "!=": "!=",
        }[operator]
        return [("birthday", reversed_operator, target_birthdate)]

    @api.depends("contract_date_start", "x_mn_appointment_date")
    def _compute_x_mn_service_years(self):
        today = fields.Date.context_today(self)
        for employee in self:
            start_date = employee.contract_date_start or employee.x_mn_appointment_date
            if start_date:
                delta = relativedelta(today, start_date)
                employee.x_mn_service_years = delta.years + round(delta.months / 12, 2)
            else:
                employee.x_mn_service_years = 0.0

    @api.depends("birthday", "contract_date_end")
    def _compute_x_mn_date_flags(self):
        today = fields.Date.context_today(self)
        retirement_limit = today + relativedelta(months=6)
        contract_limit = today + relativedelta(days=60)
        for employee in self:
            retirement_date = employee.birthday + relativedelta(years=60) if employee.birthday else False
            employee.x_mn_retirement_soon = bool(
                retirement_date and today <= retirement_date <= retirement_limit
            )
            employee.x_mn_contract_ending_soon = bool(
                employee.contract_date_end and today <= employee.contract_date_end <= contract_limit
            )
            employee.x_mn_birthday_this_month = bool(
                employee.birthday and employee.birthday.month == today.month
            )

    def _search_x_mn_retirement_soon(self, operator, value):
        today = fields.Date.context_today(self)
        start_birthdate = today - relativedelta(years=60)
        end_birthdate = (today + relativedelta(months=6)) - relativedelta(years=60)
        domain = [
            ("birthday", ">=", start_birthdate),
            ("birthday", "<=", end_birthdate),
        ]
        employee_ids = self.search(domain).ids
        return [("id", "in", employee_ids)] if (operator == "=" and value) else [("id", "not in", employee_ids)]

    def _search_x_mn_contract_ending_soon(self, operator, value):
        today = fields.Date.context_today(self)
        domain = [
            ("contract_date_end", ">=", today),
            ("contract_date_end", "<=", today + relativedelta(days=60)),
        ]
        employee_ids = self.search(domain).ids
        return [("id", "in", employee_ids)] if (operator == "=" and value) else [("id", "not in", employee_ids)]

    def _search_x_mn_birthday_this_month(self, operator, value):
        employees = self.search([("birthday", "!=", False)])
        month = fields.Date.context_today(self).month
        employee_ids = employees.filtered(lambda employee: employee.birthday.month == month).ids
        domain = [("id", "in", employee_ids)]
        return domain if (operator == "=" and value) else [("id", "not in", employee_ids)]

    def _compute_x_mn_document_stats(self):
        attachment_model = self.env["ir.attachment"].sudo()
        grouped_types = defaultdict(set)
        grouped_counts = defaultdict(int)
        attachments = attachment_model.search(
            [
                ("res_model", "=", "hr.employee"),
                ("res_id", "in", self.ids),
                ("x_mn_document_type", "!=", False),
            ]
        )
        for attachment in attachments:
            grouped_types[attachment.res_id].add(attachment.x_mn_document_type)
            grouped_counts[attachment.res_id] += 1
        required_types = set(REQUIRED_DOCUMENT_TYPES)
        for employee in self:
            present_types = grouped_types.get(employee.id, set())
            missing = required_types - present_types
            employee.x_mn_document_count = grouped_counts.get(employee.id, 0)
            employee.x_mn_missing_document_count = len(missing)
            employee.x_mn_has_missing_documents = bool(missing)

    def _search_x_mn_has_missing_documents(self, operator, value):
        employees = self.search([])
        employee_ids = employees.filtered(lambda employee: employee.x_mn_has_missing_documents).ids
        if (operator == "=" and value) or (operator == "!=" and not value):
            return [("id", "in", employee_ids)]
        return [("id", "not in", employee_ids)]

    def _compute_x_mn_counts(self):
        history_groups = self.env["hr.custom.mn.employee.history"].read_group(
            [("employee_id", "in", self.ids)],
            ["employee_id"],
            ["employee_id"],
        )
        performance_groups = self.env["hr.custom.mn.performance"].read_group(
            [("employee_id", "in", self.ids)],
            ["employee_id"],
            ["employee_id"],
        )
        history_count = {
            item["employee_id"][0]: item["employee_id_count"] for item in history_groups
        }
        performance_count = {
            item["employee_id"][0]: item["employee_id_count"] for item in performance_groups
        }
        for employee in self:
            employee.x_mn_history_count = history_count.get(employee.id, 0)
            employee.x_mn_performance_count = performance_count.get(employee.id, 0)

    def _compute_x_mn_latest_performance(self):
        performance_model = self.env["hr.custom.mn.performance"]
        for employee in self:
            performance = performance_model.search(
                [("employee_id", "=", employee.id)],
                order="evaluation_month desc, id desc",
                limit=1,
            )
            employee.x_mn_latest_performance_id = performance
            employee.x_mn_performance_score = performance.kpi_score if performance else 0
            employee.x_mn_task_completion_percent = (
                performance.task_completion_percent if performance else 0
            )
            employee.x_mn_discipline_score = performance.discipline_score if performance else 0

    def action_hr_mn_new_employee(self):
        return {
            "type": "ir.actions.act_window",
            "name": "Шинэ ажилтан",
            "res_model": "hr.employee",
            "view_mode": "form",
            "target": "current",
            "context": {"default_x_mn_employment_status": "active"},
        }

    def action_hr_mn_edit(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": "Ажилтны бүртгэл засах",
            "res_model": "hr.employee",
            "res_id": self.id,
            "view_mode": "form",
            "target": "current",
        }

    def _action_hr_mn_wizard(self, action_type):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": "HR үйлдэл",
            "res_model": "hr.custom.mn.employee.action.wizard",
            "view_mode": "form",
            "target": "new",
            "context": {
                "default_employee_id": self.id,
                "default_action_type": action_type,
            },
        }

    def action_hr_mn_transfer(self):
        return self._action_hr_mn_wizard("transfer")

    def action_hr_mn_promote(self):
        return self._action_hr_mn_wizard("promote")

    def action_hr_mn_terminate(self):
        return self._action_hr_mn_wizard("terminate")

    def action_hr_mn_suspend(self):
        for employee in self:
            employee.write({"x_mn_employment_status": "suspended"})
            employee._x_mn_log_history("suspend", note="Ажилтныг түр түдгэлзүүлсэн.")
        return True

    def action_hr_mn_rehire(self):
        for employee in self:
            employee.write({"active": True, "x_mn_employment_status": "rehired"})
            employee._x_mn_log_history("rehire", note="Ажилтныг дахин ажилд авсан.")
        return True

    def action_hr_mn_archive(self):
        for employee in self:
            employee.write({"active": False})
            employee._x_mn_log_history("archive", note="Ажилтны бүртгэлийг архивласан.")
        return True

    def action_hr_mn_documents(self):
        self.ensure_one()
        list_view = self.env.ref("hr_custom_mn.view_ir_attachment_hr_custom_mn_list", raise_if_not_found=False)
        return {
            "type": "ir.actions.act_window",
            "name": "Ажилтны баримтууд",
            "res_model": "ir.attachment",
            "view_mode": "list,form",
            "views": [(list_view.id, "list"), (False, "form")] if list_view else False,
            "domain": [("res_model", "=", "hr.employee"), ("res_id", "=", self.id)],
            "context": {
                "default_res_model": "hr.employee",
                "default_res_id": self.id,
                "default_x_mn_employee_id": self.id,
            },
        }

    def action_hr_mn_history(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": "Ажилтны түүх",
            "res_model": "hr.custom.mn.employee.history",
            "view_mode": "list,form",
            "domain": [("employee_id", "=", self.id)],
            "context": {"default_employee_id": self.id},
        }

    def action_hr_mn_performance(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": "Гүйцэтгэлийн үнэлгээ",
            "res_model": "hr.custom.mn.performance",
            "view_mode": "list,form",
            "domain": [("employee_id", "=", self.id)],
            "context": {"default_employee_id": self.id},
        }

    def action_hr_mn_print_employee_card(self):
        self.ensure_one()
        return self.env.ref("hr_custom_mn.action_report_hr_employee_card").report_action(self)

    def action_hr_mn_export_excel(self):
        self.ensure_one()
        headers = [
            "Ажилтны код",
            "Овог нэр",
            "Англи нэр",
            "Регистр",
            "Хэлтэс",
            "Албан тушаал",
            "Зэрэг",
            "Ажлын утас",
            "И-мэйл",
            "Төлөв",
        ]
        rows = [
            [
                self.x_mn_employee_code,
                self.name,
                self.x_mn_english_name,
                self.x_mn_registration_number,
                self.department_id.name,
                self.job_title,
                self.x_mn_grade_rank,
                self.work_phone,
                self.work_email,
                dict(self._fields["x_mn_employment_status"].selection).get(
                    self.x_mn_employment_status,
                    "",
                ),
            ]
        ]
        data = build_xlsx(headers, rows, sheet_name="Employee")
        attachment = self.env["ir.attachment"].sudo().create(
            {
                "name": "%s.xlsx" % (self.x_mn_employee_code or self.name),
                "type": "binary",
                "datas": base64.b64encode(data).decode(),
                "mimetype": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "res_model": "hr.employee",
                "res_id": self.id,
            }
        )
        return {
            "type": "ir.actions.act_url",
            "url": "/web/content/%s?download=true" % attachment.id,
            "target": "self",
        }

    @api.model
    def action_hr_mn_backfill_employee_codes(self):
        employees = self.with_context(active_test=False).search([("x_mn_employee_code", "=", False)])
        sequence = self.env["ir.sequence"].sudo()
        for employee in employees:
            employee.x_mn_employee_code = sequence.next_by_code("hr.custom.mn.employee")
        return True

    @api.model
    def get_hr_custom_mn_dashboard_data(self):
        employees = self.with_context(active_test=False).search([])
        active_employees = employees.filtered("active")
        today = fields.Date.context_today(self)
        month_start = today.replace(day=1)
        new_this_month = active_employees.filtered(
            lambda employee: employee.contract_date_start
            and employee.contract_date_start >= month_start
        )
        on_leave_today = self.env["hr.leave"].search_count(
            [
                ("state", "=", "validate"),
                ("request_date_from", "<=", today),
                ("request_date_to", ">=", today),
            ]
        )
        male_count = len(active_employees.filtered(lambda employee: employee.sex == "male"))
        female_count = len(active_employees.filtered(lambda employee: employee.sex == "female"))
        department_groups = self.read_group(
            [("active", "=", True)],
            ["department_id"],
            ["department_id"],
            orderby="department_id",
        )
        education_groups = self.read_group(
            [("active", "=", True)],
            ["certificate"],
            ["certificate"],
        )
        leave_groups = self.env["hr.leave"].read_group(
            [("state", "in", ["confirm", "validate1", "validate"])],
            ["holiday_status_id", "number_of_days:sum"],
            ["holiday_status_id"],
        )
        return {
            "cards": {
                "total": len(employees),
                "active": len(active_employees),
                "newThisMonth": len(new_this_month),
                "onLeaveToday": on_leave_today,
                "retiringSoon": len(active_employees.filtered("x_mn_retirement_soon")),
                "contractExpiring": len(active_employees.filtered("x_mn_contract_ending_soon")),
                "male": male_count,
                "female": female_count,
            },
            "departmentHeadcount": [
                {
                    "label": item["department_id"][1] if item.get("department_id") else "Хэлтэсгүй",
                    "value": item["department_id_count"],
                }
                for item in department_groups
            ],
            "educationLevel": [
                {
                    "label": item["certificate"] or "Бүртгээгүй",
                    "value": item["certificate_count"],
                }
                for item in education_groups
            ],
            "ageDistribution": self._get_hr_custom_mn_age_distribution(active_employees),
            "leaveStatistics": [
                {
                    "label": item["holiday_status_id"][1]
                    if item.get("holiday_status_id")
                    else "Төрөлгүй",
                    "value": round(item.get("number_of_days", 0), 2),
                }
                for item in leave_groups
            ],
            "monthlyHiringTrend": self._get_hr_custom_mn_hiring_trend(active_employees),
            "municipal": self._get_hr_custom_mn_municipal_dashboard_extension(),
        }

    @api.model
    def _get_hr_custom_mn_municipal_dashboard_extension(self):
        if (
            not self.env.registry.get("municipal.attendance.issue")
            or not self.env.registry.get("municipal.discipline")
        ):
            return {}
        today = fields.Date.context_today(self)
        attendance_model = self.env["municipal.attendance.issue"].sudo()
        discipline_model = self.env["municipal.discipline"].sudo()
        today_attendance = attendance_model.search([("date", "=", today)])
        discipline_count = discipline_model.search_count(
            [("state", "not in", ["cancelled", "archived"])]
        )
        repeated_absence = attendance_model.search(
            [
                ("issue_type", "=", "absent"),
                ("state", "not in", ["cancelled", "archived"]),
            ]
        ).filtered(lambda issue: issue.repeated_issue_count >= 2)
        return {
            "todayAttendance": len(today_attendance),
            "present": len(today_attendance.filtered(lambda issue: issue.attendance_status == "present")),
            "late": len(today_attendance.filtered(lambda issue: issue.issue_type == "late")),
            "absent": len(today_attendance.filtered(lambda issue: issue.issue_type == "absent")),
            "leave": len(today_attendance.filtered(lambda issue: issue.attendance_status in ("leave", "annual_leave"))),
            "sick": len(today_attendance.filtered(lambda issue: issue.attendance_status == "sick")),
            "repeatedAbsence": len(repeated_absence),
            "disciplineCases": discipline_count,
        }

    def _get_hr_custom_mn_age_distribution(self, employees):
        buckets = [
            ("20 хүртэл", lambda age: age and age < 20),
            ("20-29", lambda age: 20 <= age <= 29),
            ("30-39", lambda age: 30 <= age <= 39),
            ("40-49", lambda age: 40 <= age <= 49),
            ("50-59", lambda age: 50 <= age <= 59),
            ("60+", lambda age: age >= 60),
        ]
        return [
            {
                "label": label,
                "value": len(employees.filtered(lambda employee, matcher=matcher: matcher(employee.x_mn_age))),
            }
            for label, matcher in buckets
        ]

    def _get_hr_custom_mn_hiring_trend(self, employees):
        today = fields.Date.context_today(self)
        result = []
        for index in range(5, -1, -1):
            month_date = today - relativedelta(months=index)
            month_start = month_date.replace(day=1)
            month_end = month_start + relativedelta(months=1, days=-1)
            result.append(
                {
                    "label": month_date.strftime("%Y-%m"),
                    "value": len(
                        employees.filtered(
                            lambda employee: employee.contract_date_start
                            and month_start <= employee.contract_date_start <= month_end
                        )
                    ),
                }
            )
        return result

    @api.model
    def get_hr_custom_mn_org_chart_data(self):
        employees = self.search([("active", "=", True)], order="department_id, parent_id, name")
        departments = defaultdict(list)
        for employee in employees:
            departments[employee.department_id.display_name or "Хэлтэсгүй"].append(employee)
        result = []
        for department_name, department_employees in sorted(departments.items()):
            managers = [employee for employee in department_employees if employee.child_ids]
            manager_payload = []
            used_employee_ids = set()
            for manager in sorted(managers, key=lambda item: item.name or ""):
                children = [child for child in manager.child_ids if child in department_employees]
                used_employee_ids.update(child.id for child in children)
                manager_payload.append(
                    {
                        "id": manager.id,
                        "name": manager.name,
                        "jobTitle": manager.job_title or "",
                        "children": [
                            {
                                "id": child.id,
                                "name": child.name,
                                "jobTitle": child.job_title or "",
                            }
                            for child in sorted(children, key=lambda item: item.name or "")
                        ],
                    }
                )
            loose_employees = [
                employee
                for employee in department_employees
                if employee.id not in used_employee_ids and employee not in managers
            ]
            result.append(
                {
                    "department": department_name,
                    "managers": manager_payload,
                    "employees": [
                        {
                            "id": employee.id,
                            "name": employee.name,
                            "jobTitle": employee.job_title or "",
                        }
                        for employee in sorted(loose_employees, key=lambda item: item.name or "")
                    ],
                }
            )
        director = employees.filtered(lambda employee: not employee.parent_id)[:1]
        return {
            "director": {
                "id": director.id,
                "name": director.name,
                "jobTitle": director.job_title or "",
            }
            if director
            else False,
            "departments": result,
        }

    @api.model
    def cron_hr_custom_mn_refresh_employee_codes(self):
        return self.action_hr_mn_backfill_employee_codes()

    @api.model
    def get_hr_custom_mn_document_types(self):
        return DOCUMENT_TYPES
