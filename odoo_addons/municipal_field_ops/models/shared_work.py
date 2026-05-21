# -*- coding: utf-8 -*-

from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError


SHARED_WORK_STATUS = [
    ("draft", "Ноорог"),
    ("planned", "Төлөвлөсөн"),
    ("in_progress", "Явагдаж байгаа"),
    ("partially_completed", "Хэсэгчлэн дууссан"),
    ("completed", "Дууссан"),
    ("cancelled", "Цуцлагдсан"),
]

DEPARTMENT_TASK_STATUS = [
    ("pending", "Хүлээгдэж байгаа"),
    ("planned", "Төлөвлөсөн"),
    ("in_progress", "Явагдаж байгаа"),
    ("completed", "Дууссан"),
    ("blocked", "Саатсан"),
    ("cancelled", "Цуцлагдсан"),
]


class SharedWork(models.Model):
    _name = "shared.work"
    _description = "Хамтарсан ажил"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "planned_start_date desc, id desc"

    name = fields.Char(string="Ажлын нэр", required=True, tracking=True)
    code = fields.Char(string="Код", default="Шинэ", readonly=True, copy=False, tracking=True)
    description = fields.Text(string="Тайлбар")
    location_text = fields.Char(string="Байршил", tracking=True)
    priority = fields.Selection(
        [
            ("0", "Энгийн"),
            ("1", "Чухал"),
            ("2", "Яаралтай"),
            ("3", "Маш яаралтай"),
        ],
        string="Эрэмбэ",
        default="1",
        tracking=True,
    )
    planned_start_date = fields.Datetime(string="Төлөвлөсөн эхлэх огноо", tracking=True)
    planned_end_date = fields.Datetime(string="Төлөвлөсөн дуусах огноо", tracking=True)
    status = fields.Selection(
        SHARED_WORK_STATUS,
        string="Төлөв",
        default="draft",
        required=True,
        tracking=True,
        index=True,
    )
    created_by = fields.Many2one(
        "res.users",
        string="Үүсгэсэн хэрэглэгч",
        default=lambda self: self.env.user,
        readonly=True,
        tracking=True,
    )
    created_department_id = fields.Many2one(
        "hr.department",
        string="Үүсгэсэн хэлтэс",
        default=lambda self: self.env.user.employee_id.department_id,
        tracking=True,
    )
    involved_department_ids = fields.Many2many(
        "hr.department",
        "shared_work_department_rel",
        "shared_work_id",
        "department_id",
        string="Оролцох хэлтсүүд",
        tracking=True,
    )
    department_task_ids = fields.One2many(
        "shared.work.department.task",
        "shared_work_id",
        string="Хэлтсийн ажлууд",
    )
    report_ids = fields.One2many("shared.work.report", "shared_work_id", string="Тайлангууд")
    attachment_ids = fields.Many2many(
        "ir.attachment",
        "shared_work_ir_attachment_rel",
        "shared_work_id",
        "attachment_id",
        string="Хавсралт",
    )
    progress_percent = fields.Float(
        string="Нийт явц",
        compute="_compute_progress_percent",
        store=True,
    )
    active = fields.Boolean(string="Идэвхтэй", default=True)
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        required=True,
        default=lambda self: self.env.company,
        index=True,
    )

    @api.depends("department_task_ids.progress_percent", "department_task_ids.status")
    def _compute_progress_percent(self):
        for work in self:
            tasks = work.department_task_ids.filtered(lambda task: task.status != "cancelled")
            work.progress_percent = round(sum(tasks.mapped("progress_percent")) / len(tasks), 2) if tasks else 0

    @api.constrains("planned_start_date", "planned_end_date")
    def _check_dates(self):
        for work in self:
            if work.planned_start_date and work.planned_end_date and work.planned_end_date < work.planned_start_date:
                raise ValidationError("Дуусах огноо эхлэх огнооноос өмнө байж болохгүй.")

    @api.constrains("involved_department_ids")
    def _check_involved_departments(self):
        for work in self:
            if not work.involved_department_ids:
                raise ValidationError("Хамтарсан ажилд дор хаяж нэг хэлтэс сонгоно уу.")

    @api.model_create_multi
    def create(self, vals_list):
        sequence = self.env["ir.sequence"].sudo()
        for vals in vals_list:
            if vals.get("code", "Шинэ") == "Шинэ":
                vals["code"] = sequence.next_by_code("shared.work") or "Шинэ"
        records = super().create(vals_list)
        records._ensure_department_tasks()
        records._notify_department_heads_created()
        return records

    def write(self, vals):
        result = super().write(vals)
        if "involved_department_ids" in vals:
            self._ensure_department_tasks()
        return result

    def _ensure_department_tasks(self):
        Task = self.env["shared.work.department.task"].sudo()
        for work in self:
            existing_departments = set(work.department_task_ids.mapped("department_id").ids)
            values = []
            for department in work.involved_department_ids:
                if department.id in existing_departments:
                    continue
                values.append(
                    {
                        "shared_work_id": work.id,
                        "department_id": department.id,
                        "department_head_id": department.manager_id.id or False,
                        "status": "pending",
                    }
                )
            if values:
                Task.create(values)

    def _notify_department_heads_created(self):
        for work in self:
            partners = work.department_task_ids.mapped("department_head_id.user_id.partner_id")
            if partners:
                work.message_subscribe(partner_ids=partners.ids)
                work.message_post(
                    body=_("Шинэ хамтарсан ажил үүсэж, танай хэлтэст хариуцах ажил автоматаар үүссэн."),
                    partner_ids=partners.ids,
                    subtype_xmlid="mail.mt_comment",
                )

    def _sync_status_from_department_tasks(self):
        for work in self:
            if work.status == "cancelled":
                continue
            tasks = work.department_task_ids
            if not tasks:
                continue
            active_tasks = tasks.filtered(lambda task: task.status != "cancelled")
            if not active_tasks:
                next_status = "cancelled"
            elif all(task.status == "completed" for task in active_tasks):
                next_status = "completed"
            elif any(task.status == "in_progress" for task in active_tasks):
                next_status = "in_progress"
            elif any(task.status == "completed" for task in active_tasks):
                next_status = "partially_completed"
            elif all(task.status == "planned" for task in active_tasks):
                next_status = "planned"
            else:
                next_status = work.status if work.status != "draft" else "planned"
            if work.status != next_status:
                work.status = next_status

    def action_plan(self):
        self.write({"status": "planned"})
        self.department_task_ids.filtered(lambda task: task.status == "pending").write({"status": "planned"})
        return True

    def action_cancel(self):
        self.write({"status": "cancelled"})
        self.department_task_ids.filtered(lambda task: task.status != "completed").write({"status": "cancelled"})
        return True

    def action_reset_to_draft(self):
        self.write({"status": "draft"})
        self.department_task_ids.write({"status": "pending", "progress_percent": 0})
        return True


class SharedWorkDepartmentTask(models.Model):
    _name = "shared.work.department.task"
    _description = "Хамтарсан ажлын хэлтсийн ажил"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "shared_work_id desc, department_id"

    shared_work_id = fields.Many2one(
        "shared.work",
        string="Хамтарсан ажил",
        required=True,
        ondelete="cascade",
        index=True,
        tracking=True,
    )
    department_id = fields.Many2one("hr.department", string="Хэлтэс", required=True, index=True, tracking=True)
    department_head_id = fields.Many2one("hr.employee", string="Хэлтсийн дарга", tracking=True)
    assigned_employee_ids = fields.Many2many(
        "hr.employee",
        "shared_work_department_task_employee_rel",
        "task_id",
        "employee_id",
        string="Оноосон ажилтнууд",
        tracking=True,
    )
    assigned_vehicle_ids = fields.Many2many(
        "fleet.vehicle",
        "shared_work_department_task_vehicle_rel",
        "task_id",
        "vehicle_id",
        string="Оноосон машинууд",
        tracking=True,
    )
    team_ids = fields.Many2many(
        "mfo.crew.team",
        "shared_work_department_task_team_rel",
        "task_id",
        "team_id",
        string="Оноосон багууд",
        tracking=True,
    )
    route_ids = fields.Many2many(
        "mfo.route",
        "shared_work_department_task_route_rel",
        "task_id",
        "route_id",
        string="Оноосон маршрут",
        tracking=True,
    )
    operational_task_ids = fields.Many2many(
        "project.task",
        "shared_work_department_task_project_task_rel",
        "department_task_id",
        "project_task_id",
        string="Дотоод даалгаврууд",
    )
    status = fields.Selection(
        DEPARTMENT_TASK_STATUS,
        string="Төлөв",
        default="pending",
        required=True,
        tracking=True,
        index=True,
    )
    progress_percent = fields.Float(string="Явц", default=0, tracking=True)
    notes = fields.Text(string="Тэмдэглэл", tracking=True)
    started_at = fields.Datetime(string="Эхэлсэн цаг", tracking=True)
    completed_at = fields.Datetime(string="Дууссан цаг", tracking=True)
    report_ids = fields.One2many("shared.work.report", "department_task_id", string="Тайлангууд")
    company_id = fields.Many2one(related="shared_work_id.company_id", store=True, readonly=True)

    _sql_constraints = [
        (
            "shared_work_department_unique",
            "unique(shared_work_id, department_id)",
            "Нэг хэлтэс нэг хамтарсан ажил дээр зөвхөн нэг хэлтсийн ажилтай байна.",
        )
    ]

    @api.onchange("department_id")
    def _onchange_department_id(self):
        for task in self:
            task.department_head_id = task.department_id.manager_id

    @api.constrains("assigned_employee_ids", "department_id")
    def _check_employee_department(self):
        for task in self:
            other_department_employees = task.assigned_employee_ids.filtered(
                lambda employee: employee.department_id and employee.department_id != task.department_id
            )
            if other_department_employees:
                raise ValidationError("Зөвхөн тухайн хэлтсийн ажилтныг онооно.")

    @api.constrains("assigned_vehicle_ids", "department_id")
    def _check_vehicle_department(self):
        for task in self:
            for vehicle in task.assigned_vehicle_ids:
                vehicle_department = False
                if "municipal_department_id" in vehicle._fields:
                    vehicle_department = vehicle.municipal_department_id
                elif "department_id" in vehicle._fields:
                    vehicle_department = vehicle.department_id
                if vehicle_department and vehicle_department != task.department_id:
                    raise ValidationError("Зөвхөн тухайн хэлтсийн машиныг онооно.")

    def _user_can_update_assignment(self):
        user = self.env.user
        if (
            user.has_group("municipal_core.group_municipal_manager")
            or user.has_group("municipal_core.group_municipal_director")
            or user.has_group("municipal_core.group_municipal_admin")
        ):
            return True
        self.ensure_one()
        return self.department_id.manager_id.user_id == user or self.department_head_id.user_id == user

    def write(self, vals):
        assignment_fields = {
            "assigned_employee_ids",
            "assigned_vehicle_ids",
            "team_ids",
            "route_ids",
            "operational_task_ids",
            "department_id",
            "department_head_id",
        }
        if set(vals).intersection(assignment_fields):
            for task in self:
                if not task._user_can_update_assignment():
                    raise UserError("Та зөвхөн өөрийн хэлтсийн хуваарилалтыг шинэчилнэ.")

        if vals.get("status") == "in_progress" and not vals.get("started_at"):
            vals["started_at"] = fields.Datetime.now()
        if vals.get("status") == "completed":
            vals.setdefault("progress_percent", 100)
            vals.setdefault("completed_at", fields.Datetime.now())
        if "progress_percent" in vals:
            vals["progress_percent"] = max(0, min(float(vals["progress_percent"] or 0), 100))

        result = super().write(vals)
        self.mapped("shared_work_id")._sync_status_from_department_tasks()
        if vals.get("status") == "completed":
            self._notify_department_task_completed()
        return result

    def _notify_department_task_completed(self):
        Users = self.env["res.users"].sudo()
        user_group_field = "groups_id" if "groups_id" in Users._fields else "group_ids"
        manager_group_ids = [
            self.env.ref("municipal_core.group_municipal_manager").id,
            self.env.ref("municipal_core.group_municipal_director").id,
            self.env.ref("municipal_core.group_municipal_admin").id,
        ]
        for task in self:
            partners = task.shared_work_id.created_by.partner_id
            manager_partners = Users.search([(user_group_field, "in", manager_group_ids)]).mapped("partner_id")
            partners |= manager_partners
            if partners:
                task.shared_work_id.message_post(
                    body=_("%s хэлтсийн ажил дууссан.") % task.department_id.display_name,
                    partner_ids=partners.ids,
                    subtype_xmlid="mail.mt_comment",
                )

    def action_plan(self):
        return self.write({"status": "planned"})

    def action_start(self):
        return self.write({"status": "in_progress"})

    def action_complete(self):
        return self.write({"status": "completed", "progress_percent": 100})

    def action_block(self):
        return self.write({"status": "blocked"})

    def action_cancel(self):
        return self.write({"status": "cancelled"})

    def action_create_operational_task(self):
        ProjectTask = self.env["project.task"].sudo()
        for task in self:
            project = self.env["project.project"].sudo().search(
                [("name", "=", task.shared_work_id.name), ("ops_department_id", "=", task.department_id.id)],
                limit=1,
            )
            if not project:
                project = self.env["project.project"].sudo().create(
                    {
                        "name": "%s - %s" % (task.shared_work_id.name, task.department_id.display_name),
                        "privacy_visibility": "employees",
                        "ops_department_id": task.department_id.id,
                    }
                )
            project_task = ProjectTask.create(
                {
                    "name": task.shared_work_id.name,
                    "project_id": project.id,
                    "ops_department_id": task.department_id.id,
                    "description": task.shared_work_id.description or "",
                }
            )
            task.operational_task_ids = [(4, project_task.id)]
        return True


class SharedWorkReport(models.Model):
    _name = "shared.work.report"
    _description = "Хамтарсан ажлын тайлан"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "created_at desc, id desc"

    shared_work_id = fields.Many2one("shared.work", string="Хамтарсан ажил", required=True, ondelete="cascade", index=True)
    department_task_id = fields.Many2one(
        "shared.work.department.task",
        string="Хэлтсийн ажил",
        required=True,
        ondelete="cascade",
        index=True,
    )
    employee_id = fields.Many2one(
        "hr.employee",
        string="Ажилтан",
        default=lambda self: self.env.user.employee_id,
        index=True,
        tracking=True,
    )
    note = fields.Text(string="Тайлбар", required=True, tracking=True)
    image_ids = fields.Many2many(
        "ir.attachment",
        "shared_work_report_image_rel",
        "report_id",
        "attachment_id",
        string="Зургууд",
    )
    created_at = fields.Datetime(string="Бүртгэсэн цаг", default=fields.Datetime.now, readonly=True)
    latitude = fields.Float(string="Өргөрөг", digits=(16, 7))
    longitude = fields.Float(string="Уртраг", digits=(16, 7))
    company_id = fields.Many2one(related="shared_work_id.company_id", store=True, readonly=True)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            task = self.env["shared.work.department.task"].browse(vals.get("department_task_id")).exists()
            if task:
                vals.setdefault("shared_work_id", task.shared_work_id.id)
                vals.setdefault("employee_id", self.env.user.employee_id.id or task.department_head_id.id or False)
        reports = super().create(vals_list)
        reports.mapped("department_task_id").filtered(lambda task: task.status == "pending").write({"status": "in_progress"})
        return reports
