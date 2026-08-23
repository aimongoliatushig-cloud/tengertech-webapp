# -*- coding: utf-8 -*-

import calendar
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError


GREEN_CLEAN_DEPARTMENT_NAME = "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс"
ULAANBAATAR_TZ = ZoneInfo("Asia/Ulaanbaatar")


class GreenCleanWorkCategory(models.Model):
    _name = "green.clean.work.category"
    _description = "Ногоон байгууламж, цэвэрлэгээний ажлын ангилал"
    _order = "section, sequence, name"

    name = fields.Char(required=True, translate=True)
    code = fields.Char(required=True, index=True)
    section = fields.Selection(
        [("green", "Ногоон байгууламж"), ("cleaning", "Цэвэрлэгээ үйлчилгээ")],
        required=True,
        index=True,
    )
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)
    _code_unique = models.Constraint("unique (code)", "Ангиллын код давхардаж болохгүй.")


class GreenCleanUnit(models.Model):
    _name = "green.clean.unit"
    _description = "Ногоон байгууламж, цэвэрлэгээний хэмжих нэгж"
    _order = "sequence, name"

    name = fields.Char(required=True)
    code = fields.Char(required=True, index=True)
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)
    _code_unique = models.Constraint("unique (code)", "Хэмжих нэгжийн код давхардаж болохгүй.")


class GreenCleanWorkTemplate(models.Model):
    _name = "green.clean.work.template"
    _description = "Ногоон байгууламж, цэвэрлэгээний ажлын загвар"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "active desc, category_id, name"

    name = fields.Char(string="Ажлын нэр", required=True, tracking=True)
    code = fields.Char(string="Код", required=True, index=True, tracking=True)
    department_id = fields.Many2one("hr.department", string="Хэлтэс", required=True, index=True, tracking=True)
    category_id = fields.Many2one("green.clean.work.category", string="Ангилал", required=True, index=True)
    work_kind = fields.Selection(
        [("recurring", "Өдөр тутмын давтагддаг"), ("quantity", "Тогтмол тоо хэмжээтэй"), ("one_time", "Нэг удаагийн")],
        string="Ажлын төрөл",
        required=True,
        default="recurring",
        tracking=True,
    )
    frequency = fields.Selection(
        [
            ("daily", "Өдөр бүр"),
            ("weekly", "7 хоног бүр"),
            ("monthly", "Сар бүр"),
            ("semi_monthly", "Сар бүрийн 15, 30-нд"),
            ("twice_weekly", "7 хоногт 2 удаа"),
            ("three_weekly", "7 хоногт 3 удаа"),
            ("weekdays", "Тодорхой гараг"),
            ("custom", "Custom"),
        ],
        string="Давтамж",
        default="daily",
        tracking=True,
    )
    weekday_ids = fields.Many2many("green.clean.weekday", string="Ажиллах гараг")
    interval_days = fields.Integer(string="Custom хоногийн зай", default=1)
    day_of_month = fields.Integer(string="Сарын өдөр", default=1)
    unit_id = fields.Many2one("green.clean.unit", string="Хэмжих нэгж", required=True)
    daily_planned_quantity = fields.Float(string="Өдрийн төлөвлөгөө", tracking=True)
    total_planned_quantity = fields.Float(string="Нийт төлөвлөгөө", tracking=True)
    allow_over_completion = fields.Boolean(string="100%-аас дээш зөвшөөрөх")
    responsible_employee_id = fields.Many2one("hr.employee", string="Хариуцсан ажилтан", tracking=True)
    crew_team_id = fields.Many2one("mfo.crew.team", string="Бригад", tracking=True)
    team_leader_id = fields.Many2one("res.users", string="Ахлагч / хянагч", tracking=True)
    location_id = fields.Many2one("municipal.green.location", string="Байршил")
    khoroo = fields.Char(string="Хороо")
    street = fields.Char(string="Гудамж")
    area_name = fields.Char(string="Талбай")
    object_name = fields.Char(string="Объект")
    location_name = fields.Char(string="Байршлын тайлбар")
    gps_latitude = fields.Float(string="GPS өргөрөг", digits=(10, 7))
    gps_longitude = fields.Float(string="GPS уртраг", digits=(10, 7))
    start_date = fields.Date(string="Эхлэх огноо", required=True, default=fields.Date.context_today)
    end_date = fields.Date(string="Дуусах огноо")
    generation_time = fields.Float(string="Ажил эхлэх цаг", default=5.0)
    requires_photo = fields.Boolean(string="Фото шаардах", default=True)
    requires_gps = fields.Boolean(string="GPS шаардах", default=True)
    requires_approval = fields.Boolean(string="Батлах шаардах", default=True)
    watering_liters_per_tree = fields.Float(string="Нэг модонд ногдох литр")
    watering_vehicle_id = fields.Many2one("fleet.vehicle", string="Усалгааны машин")
    watering_driver_id = fields.Many2one("hr.employee", string="Жолооч")
    generated_task_count = fields.Integer(string="Үүссэн даалгавар", compute="_compute_generated_task_count")
    completed_quantity = fields.Float(string="Нийт гүйцэтгэл", compute="_compute_template_progress")
    remaining_quantity = fields.Float(string="Нийт үлдэгдэл", compute="_compute_template_progress")
    progress_percent = fields.Float(string="Нийт гүйцэтгэлийн хувь", compute="_compute_template_progress")
    last_generated_date = fields.Date(string="Сүүлд үүсгэсэн", readonly=True, tracking=True)
    active = fields.Boolean(default=True, tracking=True)

    _code_unique = models.Constraint("unique (code)", "Ажлын загварын код давхардаж болохгүй.")

    @api.depends("code")
    def _compute_generated_task_count(self):
        task_model = self.env["project.task"]
        for template in self:
            template.generated_task_count = task_model.search_count([("green_clean_template_id", "=", template.id)])

    def _compute_template_progress(self):
        task_model = self.env["project.task"]
        for template in self:
            completed = sum(task_model.search([("green_clean_template_id", "=", template.id)]).mapped("ops_completed_quantity"))
            planned = template.total_planned_quantity or 0.0
            template.completed_quantity = completed
            template.remaining_quantity = max(planned - completed, 0.0) if planned else 0.0
            template.progress_percent = round(completed / planned * 100, 2) if planned else 0.0

    @api.constrains("department_id")
    def _check_green_clean_department(self):
        for template in self:
            normalized = " ".join((template.department_id.name or "").lower().split())
            if "ногоон байгууламж" not in normalized or "цэвэрлэгээ үйлчилгээ" not in normalized:
                raise ValidationError(_("Энэ ажлын загварыг зөвхөн Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэст бүртгэнэ."))

    @api.constrains("daily_planned_quantity", "total_planned_quantity", "interval_days", "day_of_month")
    def _check_quantities_and_schedule(self):
        for template in self:
            if template.daily_planned_quantity < 0 or template.total_planned_quantity < 0:
                raise ValidationError(_("Төлөвлөгөөт хэмжээ сөрөг байж болохгүй."))
            if template.interval_days < 1:
                raise ValidationError(_("Custom давтамжийн хоногийн зай 1-ээс багагүй байна."))
            if not 1 <= template.day_of_month <= 31:
                raise ValidationError(_("Сарын өдөр 1-31 хооронд байна."))

    def _should_generate_on(self, target_date):
        self.ensure_one()
        target_date = fields.Date.to_date(target_date)
        start_date = fields.Date.to_date(self.start_date)
        end_date = fields.Date.to_date(self.end_date) if self.end_date else False
        if not self.active or self.work_kind == "one_time" or target_date < start_date or (end_date and target_date > end_date):
            return False
        weekday = str(target_date.weekday())
        if self.frequency == "daily":
            return True
        if self.frequency == "weekly":
            return target_date.weekday() == start_date.weekday()
        if self.frequency == "monthly":
            last_day = calendar.monthrange(target_date.year, target_date.month)[1]
            return target_date.day == min(self.day_of_month, last_day)
        if self.frequency == "semi_monthly":
            return target_date.day in (15, 30)
        if self.frequency == "twice_weekly":
            return target_date.weekday() in (0, 3)
        if self.frequency == "three_weekly":
            return target_date.weekday() in (0, 2, 4)
        if self.frequency == "weekdays":
            return weekday in self.weekday_ids.mapped("code")
        if self.frequency == "custom":
            return (target_date - start_date).days % self.interval_days == 0
        return False

    def _get_or_create_project(self, target_date):
        self.ensure_one()
        year = fields.Date.to_date(target_date).year
        project_name = "%s - %s" % (self.name, year)
        project = self.env["project.project"].sudo().search(
            [("name", "=", project_name), ("ops_department_id", "=", self.department_id.id)], limit=1
        )
        if not project:
            project = self.env["project.project"].sudo().create(
                {"name": project_name, "privacy_visibility": "employees", "ops_department_id": self.department_id.id}
            )
        return project

    def _get_or_create_work_type(self):
        self.ensure_one()
        code = "green_clean_%s" % self.category_id.code
        work_type = self.env["municipal.work.type"].sudo().search([("code", "=", code)], limit=1)
        if not work_type:
            work_type = self.env["municipal.work.type"].sudo().create(
                {
                    "name": self.category_id.name,
                    "code": code,
                    "department_id": self.department_id.id,
                    "default_requires_photo": self.requires_photo,
                    "default_requires_approval": self.requires_approval,
                    "default_unit_of_measure": self.unit_id.code,
                }
            )
        return work_type

    def action_generate_task(self, target_date=None):
        generated = self.env["project.task"]
        target_date = fields.Date.to_date(target_date or fields.Date.context_today(self))
        for template in self:
            existing = self.env["project.task"].sudo().search(
                [("green_clean_template_id", "=", template.id), ("green_clean_scheduled_date", "=", target_date)], limit=1
            )
            if existing:
                generated |= existing
                continue
            if template.work_kind != "one_time" and not template._should_generate_on(target_date):
                continue
            project = template._get_or_create_project(target_date)
            work_type = template._get_or_create_work_type()
            completed = sum(
                self.env["project.task"].sudo().search(
                    [("green_clean_template_id", "=", template.id)]
                ).mapped("ops_completed_quantity")
            )
            remaining = max((template.total_planned_quantity or 0.0) - completed, 0.0)
            if template.work_kind == "quantity" and template.total_planned_quantity and remaining <= 0:
                continue
            planned = template.daily_planned_quantity or template.total_planned_quantity
            if template.work_kind == "quantity" and template.total_planned_quantity:
                planned = min(planned, remaining)
            local_start = datetime.combine(
                target_date,
                time.min,
                tzinfo=ULAANBAATAR_TZ,
            ) + timedelta(hours=template.generation_time or 5.0)
            scheduled_start = local_start.astimezone(timezone.utc).replace(tzinfo=None)
            local_deadline = datetime.combine(target_date, time.max, tzinfo=ULAANBAATAR_TZ)
            scheduled_deadline = local_deadline.astimezone(timezone.utc).replace(tzinfo=None)
            task_name = "%s — %s" % (target_date.strftime("%Y.%m.%d"), template.name)
            work = self.env["municipal.work"].sudo().create(
                {
                    "name": task_name,
                    "department_id": template.department_id.id,
                    "work_type_id": work_type.id,
                    "responsible_user_id": template.responsible_employee_id.user_id.id or False,
                    "responsible_employee_id": template.responsible_employee_id.id or False,
                    "manager_id": template.team_leader_id.id or False,
                    "start_datetime": scheduled_start,
                    "deadline_datetime": scheduled_deadline,
                    "planned_quantity": planned,
                    "unit_of_measure": template.unit_id.code,
                    "location_text": template.location_name or template.location_id.name or template.khoroo,
                    "requires_photo": template.requires_photo,
                    "requires_approval": template.requires_approval,
                    "work_date": target_date,
                    "state": "assigned" if template.responsible_employee_id else "planned",
                }
            )
            task_values = {
                "name": task_name,
                "project_id": project.id,
                "municipal_work_id": work.id,
                "ops_department_id": template.department_id.id,
                "ops_team_leader_id": template.team_leader_id.id or False,
                "ops_planned_quantity": planned,
                "ops_measurement_unit": template.unit_id.name,
                "ops_measurement_unit_code": template.unit_id.code,
                "mfo_crew_team_id": template.crew_team_id.id or False,
                "date_deadline": target_date,
                "green_clean_template_id": template.id,
                "green_clean_scheduled_date": target_date,
                "green_clean_category_id": template.category_id.id,
                "green_clean_work_kind": template.work_kind,
                "green_clean_location_name": template.location_name or template.location_id.name,
                "green_clean_khoroo": template.khoroo,
                "green_clean_street": template.street,
                "green_clean_area_name": template.area_name,
                "green_clean_object_name": template.object_name,
                "green_clean_gps_latitude": template.gps_latitude,
                "green_clean_gps_longitude": template.gps_longitude,
                "green_clean_requires_gps": template.requires_gps,
                "green_clean_allow_over_completion": template.allow_over_completion,
                "green_clean_watering_liters_per_tree": template.watering_liters_per_tree,
                "green_clean_watering_vehicle_id": template.watering_vehicle_id.id or False,
                "green_clean_watering_driver_id": template.watering_driver_id.id or False,
            }
            if template.responsible_employee_id.user_id:
                task_values["user_ids"] = [(6, 0, [template.responsible_employee_id.user_id.id])]
            task = self.env["project.task"].sudo().create(task_values)
            template.last_generated_date = target_date
            generated |= task
        return generated

    @api.model
    def cron_generate_green_clean_tasks(self):
        # Cron сервер UTC дээр ажилладаг. Өдрийн ажлыг Улаанбаатарын
        # тухайн өдрөөр үүсгэхгүй бол 04:50-д өмнөх өдрийн ажил үүсдэг.
        today = datetime.now(ULAANBAATAR_TZ).date()
        templates = self.sudo().search([("active", "=", True), ("work_kind", "in", ["recurring", "quantity"])])
        templates.action_generate_task(today)
        return True

    @api.model
    def seed_default_green_clean_templates(self):
        department = self.env["hr.department"].sudo().search(
            [
                ("name", "ilike", "Ногоон байгууламж"),
                ("name", "ilike", "цэвэрлэгээ үйлчилгээ"),
            ],
            limit=1,
        )
        if not department:
            return False
        category_model = self.env["green.clean.work.category"].sudo()
        unit_model = self.env["green.clean.unit"].sudo()
        defaults = [
            ("GC-TREE-SHAPING", "Мод хэлбэржүүлэлт", "tree_shaping", "ш", "quantity", "daily", 54, 1286, 0),
            ("GC-TREE-WATERING", "Мод усалгаа", "tree_watering", "ш", "quantity", "three_weekly", 18538, 18538, 70),
            ("GC-FLOWER-PLANTING", "Цэцэг тарих", "flower_planting", "ш", "quantity", "daily", 0, 260000, 0),
            ("GC-TREE-REPLANTING", "Мод, бут нөхөн тарих", "tree_replanting", "ш", "quantity", "daily", 0, 850, 0),
            ("GC-LAWN-PLANTING", "Зүлэг тарих", "lawn_planting", "м²", "quantity", "daily", 0, 5283, 0),
            ("GC-ROAD-CLEANING", "Зам талбайн цэвэрлэгээ", "road_cleaning", "м²", "recurring", "daily", 27065, 0, 0),
            ("GC-FLOOD-DAM", "Үерийн далан цэвэрлэгээ", "flood_dam", "м", "quantity", "daily", 0, 450, 0),
        ]
        for code, name, category_code, unit_code, work_kind, frequency, daily, total, liters in defaults:
            if self.sudo().search_count([("code", "=", code)]):
                continue
            category = category_model.search([("code", "=", category_code)], limit=1)
            unit = unit_model.search([("code", "=", unit_code)], limit=1)
            if not category or not unit:
                continue
            self.sudo().create(
                {
                    "name": name,
                    "code": code,
                    "department_id": department.id,
                    "category_id": category.id,
                    "unit_id": unit.id,
                    "work_kind": work_kind,
                    "frequency": frequency,
                    "daily_planned_quantity": daily,
                    "total_planned_quantity": total,
                    "watering_liters_per_tree": liters,
                }
            )
        return True

    @api.model
    def seed_recurring_wash_templates(self):
        department = self.env["hr.department"].sudo().search(
            [("name", "ilike", "Ногоон байгууламж"), ("name", "ilike", "цэвэрлэгээ үйлчилгээ")],
            limit=1,
        )
        if not department:
            return False

        category_model = self.env["green.clean.work.category"].sudo()
        unit_model = self.env["green.clean.unit"].sudo()
        thursday = self.env["green.clean.weekday"].sudo().search([("code", "=", "3")], limit=1)
        unit_piece = unit_model.search([("code", "=", "ш")], limit=1)
        unit_meter = unit_model.search([("code", "=", "м")], limit=1)
        unit_square_meter = unit_model.search([("code", "=", "м²")], limit=1)

        definitions = [
            ("GC-WASH-BUS-STOP", "Автобусны буудал угаах", "bus_stop_washing", "Автобусны буудлын угаалга", unit_piece, 18, "weekdays"),
            ("GC-WASH-BIN", "Хогийн сав угаах", "bin_washing", "Хогийн савны угаалга", unit_piece, 16, "weekdays"),
            ("GC-WASH-MONUMENT", "Хөшөө угаах", "monument_washing", "Хөшөөний угаалга", unit_piece, 1, "weekdays"),
            ("GC-WASH-SIDEWALK", "Явган зам угаах", "sidewalk_washing", "Явган замын угаалга", unit_square_meter, 0, "weekdays"),
            ("GC-WASH-FENCE", "Хайс угаах", "fence_washing", "Хайсны угаалга", unit_meter, 0, "weekdays"),
            ("GC-WASH-CURB", "Хашлага угаах", "curb_washing", "Хашлагын угаалга", unit_meter, 0, "weekdays"),
            ("GC-WASH-VEHICLE", "Машин угаах", "vehicle_washing", "Машин угаалга", unit_piece, 0, "semi_monthly"),
        ]

        for sequence, (code, name, category_code, category_name, unit, quantity, frequency) in enumerate(definitions, 320):
            category = category_model.search([("code", "=", category_code)], limit=1)
            if not category:
                category = category_model.create(
                    {"name": category_name, "code": category_code, "section": "cleaning", "sequence": sequence}
                )
            if not unit or self.sudo().search_count([("code", "=", code)]):
                continue
            values = {
                "name": name,
                "code": code,
                "department_id": department.id,
                "category_id": category.id,
                "unit_id": unit.id,
                "work_kind": "recurring",
                "frequency": frequency,
                "daily_planned_quantity": quantity,
                "generation_time": 5.0,
                "requires_photo": True,
                "requires_gps": True,
                "requires_approval": True,
            }
            if frequency == "weekdays" and thursday:
                values["weekday_ids"] = [(6, 0, [thursday.id])]
            self.sudo().create(values)
        return True


class GreenCleanWeekday(models.Model):
    _name = "green.clean.weekday"
    _description = "Давтагдах ажлын гараг"
    _order = "sequence"

    name = fields.Char(required=True)
    code = fields.Selection([(str(index), label) for index, label in enumerate(["Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба", "Ням"])], required=True)
    sequence = fields.Integer(default=10)
    _code_unique = models.Constraint("unique (code)", "Гараг давхардаж болохгүй.")


class ProjectTask(models.Model):
    _inherit = "project.task"

    green_clean_template_id = fields.Many2one("green.clean.work.template", string="Ажлын загвар", index=True, ondelete="set null")
    green_clean_scheduled_date = fields.Date(string="Ажилбарын огноо", index=True)
    green_clean_category_id = fields.Many2one("green.clean.work.category", string="Ангилал", index=True)
    green_clean_work_kind = fields.Selection([("recurring", "Давтагддаг"), ("quantity", "Тоо хэмжээтэй"), ("one_time", "Нэг удаагийн")])
    green_clean_location_name = fields.Char(string="Байршил")
    green_clean_khoroo = fields.Char(string="Хороо")
    green_clean_street = fields.Char(string="Гудамж")
    green_clean_area_name = fields.Char(string="Талбай")
    green_clean_object_name = fields.Char(string="Объект")
    green_clean_gps_latitude = fields.Float(string="GPS өргөрөг", digits=(10, 7))
    green_clean_gps_longitude = fields.Float(string="GPS уртраг", digits=(10, 7))
    green_clean_requires_gps = fields.Boolean(string="GPS шаардах")
    green_clean_allow_over_completion = fields.Boolean(string="100%-аас дээш зөвшөөрөх")
    green_clean_watering_liters_per_tree = fields.Float(string="Нэг модонд ногдох литр")
    green_clean_watering_vehicle_id = fields.Many2one("fleet.vehicle", string="Усалгааны машин")
    green_clean_watering_driver_id = fields.Many2one("hr.employee", string="Усалгааны жолооч")

    _green_clean_unique_schedule = models.Constraint(
        "unique (green_clean_template_id, green_clean_scheduled_date)",
        "Ижил ажлын загвар, огноогоор давхар даалгавар үүсгэхгүй.",
    )

    @api.constrains("ops_completed_quantity", "ops_planned_quantity", "green_clean_allow_over_completion")
    def _check_green_clean_completion_limit(self):
        for task in self.filtered("green_clean_template_id"):
            if not task.green_clean_allow_over_completion and task.ops_planned_quantity > 0 and task.ops_completed_quantity > task.ops_planned_quantity:
                raise ValidationError(_("Гүйцэтгэл төлөвлөгөөт хэмжээнээс их байж болохгүй."))


class OpsTaskReport(models.Model):
    _inherit = "ops.task.report"

    green_clean_gps_latitude = fields.Float(string="GPS өргөрөг", digits=(10, 7))
    green_clean_gps_longitude = fields.Float(string="GPS уртраг", digits=(10, 7))
    green_clean_location_name = fields.Char(string="Байршил")
    green_clean_start_datetime = fields.Datetime(string="Эхлэх цаг")
    green_clean_end_datetime = fields.Datetime(string="Дуусах цаг")
    green_clean_watered_tree_count = fields.Float(string="Усалсан мод")
    green_clean_liters_per_tree = fields.Float(string="Нэг модонд ногдох литр")
    green_clean_total_liters = fields.Float(string="Нийт литр", compute="_compute_green_clean_total_liters", store=True)
    green_clean_watering_vehicle_id = fields.Many2one("fleet.vehicle", string="Усалгааны машин")
    green_clean_watering_driver_id = fields.Many2one("hr.employee", string="Усалгааны жолооч")
    green_clean_photo_type = fields.Selection([("before", "Өмнө"), ("progress", "Явц"), ("after", "Дараа")], string="Фото төрөл")

    @api.depends("green_clean_watered_tree_count", "green_clean_liters_per_tree")
    def _compute_green_clean_total_liters(self):
        for report in self:
            report.green_clean_total_liters = report.green_clean_watered_tree_count * report.green_clean_liters_per_tree

    def _sync_green_clean_task_quantity(self, tasks=None):
        tasks = tasks or self.mapped("task_id")
        tasks = tasks.filtered("green_clean_template_id")
        report_model = self.env["ops.task.report"]
        for task in tasks:
            approved = report_model.search([("task_id", "=", task.id), ("state", "=", "approved")])
            completed = sum(approved.mapped("reported_quantity"))
            task.ops_completed_quantity = completed

    @api.model_create_multi
    def create(self, vals_list):
        reports = super().create(vals_list)
        reports._sync_green_clean_task_quantity()
        return reports

    def write(self, values):
        old_tasks = self.mapped("task_id")
        result = super().write(values)
        if {"reported_quantity", "state", "task_id"}.intersection(values):
            self._sync_green_clean_task_quantity(old_tasks | self.mapped("task_id"))
        return result

    def unlink(self):
        tasks = self.mapped("task_id")
        result = super().unlink()
        self._sync_green_clean_task_quantity(tasks)
        return result

    @api.constrains("green_clean_gps_latitude", "green_clean_gps_longitude", "state")
    def _check_green_clean_required_gps(self):
        for report in self.filtered(lambda item: item.task_id.green_clean_template_id and item.state in ("submitted", "under_review", "approved")):
            if report.task_id.green_clean_requires_gps and not (report.green_clean_gps_latitude and report.green_clean_gps_longitude):
                raise ValidationError(_("Энэ ажилд GPS байршил заавал авна."))
