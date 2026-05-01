# -*- coding: utf-8 -*-

from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError


WEEKDAY_SELECTION = [
    ("0", "Даваа"),
    ("1", "Мягмар"),
    ("2", "Лхагва"),
    ("3", "Пүрэв"),
    ("4", "Баасан"),
    ("5", "Бямба"),
    ("6", "Ням"),
]

ROUTE_STATES = [
    ("draft", "Ноорог"),
    ("planned", "Төлөвлөсөн"),
    ("dispatched", "Хуваарилсан"),
    ("in_progress", "Явцтай"),
    ("submitted", "Илгээсэн"),
    ("verified", "Баталгаажсан"),
    ("delayed", "Саатсан"),
    ("cancelled", "Цуцлагдсан"),
]


class MfoDistrict(models.Model):
    _name = "mfo.district"
    _description = "Хог тээвэрлэлтийн дүүрэг"
    _order = "name"

    name = fields.Char(string="Дүүрэг", required=True)
    active = fields.Boolean(string="Идэвхтэй", default=True)


class MfoSubdistrict(models.Model):
    _name = "mfo.subdistrict"
    _description = "Хог тээвэрлэлтийн хороо"
    _order = "district_id, name"

    name = fields.Char(string="Хороо", required=True)
    district_id = fields.Many2one("mfo.district", string="Дүүрэг", index=True)
    active = fields.Boolean(string="Идэвхтэй", default=True)


class MfoCrewTeam(models.Model):
    _name = "mfo.crew.team"
    _description = "Хог тээвэрлэлтийн баг"
    _order = "name"
    _inherit = ["mail.thread"]

    name = fields.Char(string="Багийн нэр", required=True, tracking=True)
    operation_type = fields.Selection(
        [("garbage", "Хог тээвэрлэлт")],
        string="Ажиллагааны төрөл",
        default="garbage",
        required=True,
    )
    vehicle_id = fields.Many2one("fleet.vehicle", string="Машин", tracking=True)
    driver_employee_id = fields.Many2one("hr.employee", string="Жолооч", tracking=True)
    inspector_employee_id = fields.Many2one("hr.employee", string="Хяналтын ажилтан", tracking=True)
    collector_employee_ids = fields.Many2many(
        "hr.employee",
        "mfo_crew_team_collector_rel",
        "team_id",
        "employee_id",
        string="Ачигчид",
    )
    member_user_ids = fields.Many2many(
        "res.users",
        "mfo_crew_team_user_rel",
        "team_id",
        "user_id",
        string="Гар утасны хэрэглэгчид",
    )
    active = fields.Boolean(string="Идэвхтэй", default=True)
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        default=lambda self: self.env.company,
        required=True,
    )


class MfoRoute(models.Model):
    _name = "mfo.route"
    _description = "Хог тээвэрлэлтийн маршрут"
    _order = "code, name"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(string="Маршрут", required=True, tracking=True)
    code = fields.Char(string="Код", index=True, tracking=True)
    department_id = fields.Many2one("hr.department", string="Хэлтэс", index=True, tracking=True)
    project_id = fields.Many2one("project.project", string="Төсөл", ondelete="set null")
    operation_type = fields.Selection(
        [("garbage", "Хог тээвэрлэлт")],
        string="Ажиллагааны төрөл",
        default="garbage",
        required=True,
    )
    vehicle_id = fields.Many2one("fleet.vehicle", string="Машин", tracking=True)
    assigned_vehicle_id = fields.Many2one(
        "fleet.vehicle",
        string="Оноосон машин",
        related="vehicle_id",
        readonly=False,
        store=True,
    )
    driver_id = fields.Many2one("hr.employee", string="Жолооч", tracking=True)
    inspector_id = fields.Many2one("hr.employee", string="Хяналтын ажилтан", tracking=True)
    team_id = fields.Many2one("mfo.crew.team", string="Баг", tracking=True)
    crew_team_id = fields.Many2one(
        "mfo.crew.team",
        string="Ажиллах баг",
        related="team_id",
        readonly=False,
        store=True,
    )
    weekday = fields.Selection(WEEKDAY_SELECTION, string="Гараг", default="0")
    shift_type = fields.Selection(
        [
            ("morning", "Өглөөний ээлж"),
            ("day", "Өдрийн ээлж"),
            ("evening", "Оройн ээлж"),
            ("night", "Шөнийн ээлж"),
        ],
        string="Ээлж",
        default="morning",
    )
    start_time = fields.Float(string="Эхлэх цаг")
    state = fields.Selection(ROUTE_STATES, string="Төлөв", default="draft", required=True, tracking=True)
    line_ids = fields.One2many("mfo.route.line", "route_id", string="Хогийн цэгүүд")
    collection_point_count = fields.Integer(string="Цэгийн тоо", compute="_compute_route_summary")
    subdistrict_names = fields.Char(string="Хороод", compute="_compute_route_summary")
    active = fields.Boolean(string="Идэвхтэй", default=True)
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        default=lambda self: self.env.company,
        required=True,
    )

    _sql_constraints = [
        ("mfo_route_code_uniq", "unique(code)", "Маршрутын код давхардахгүй байх ёстой."),
    ]

    @api.depends("line_ids.collection_point_id", "line_ids.collection_point_id.khoroo")
    def _compute_route_summary(self):
        for route in self:
            route.collection_point_count = len(route.line_ids)
            names = route.line_ids.mapped("collection_point_id.khoroo")
            route.subdistrict_names = ", ".join(sorted(set(filter(None, names))))

    def _set_state(self, state):
        self.write({"state": state})
        return True

    def action_plan(self):
        return self._set_state("planned")

    def action_dispatch(self):
        return self._set_state("dispatched")

    def action_start(self):
        return self._set_state("in_progress")

    def action_submit(self):
        return self._set_state("submitted")

    def action_verify(self):
        return self._set_state("verified")

    def action_delay(self):
        return self._set_state("delayed")

    def action_cancel(self):
        return self._set_state("cancelled")

    def action_reset_to_draft(self):
        return self._set_state("draft")


class MfoRouteLine(models.Model):
    _name = "mfo.route.line"
    _description = "Маршрутын цэгийн дараалал"
    _order = "route_id, sequence, id"

    route_id = fields.Many2one("mfo.route", string="Маршрут", required=True, ondelete="cascade", index=True)
    collection_point_id = fields.Many2one(
        "mfo.collection.point",
        string="Хогийн цэг",
        required=True,
        ondelete="restrict",
        index=True,
    )
    sequence = fields.Integer(string="Дараалал", default=10)
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        related="route_id.company_id",
        store=True,
        readonly=True,
    )

    @api.constrains("collection_point_id")
    def _check_active_point(self):
        for line in self:
            if line.collection_point_id and not line.collection_point_id.active:
                raise ValidationError("Идэвхгүй хогийн цэгийг маршрутанд оруулах боломжгүй.")


class MfoCollectionPoint(models.Model):
    _name = "mfo.collection.point"
    _description = "Хогийн цэг"
    _order = "district, khoroo, name"
    _inherit = ["mail.thread"]

    name = fields.Char(string="Хогийн цэг", required=True, tracking=True)
    location_text = fields.Char(string="Байршил")
    address = fields.Char(string="Хаяг")
    district = fields.Char(string="Дүүрэг")
    khoroo = fields.Char(string="Хороо")
    district_id = fields.Many2one("mfo.district", string="Дүүрэг")
    subdistrict_id = fields.Many2one("mfo.subdistrict", string="Хороо")
    gps_latitude = fields.Float(string="Байршлын өргөрөг", digits=(10, 7))
    gps_longitude = fields.Float(string="Байршлын уртраг", digits=(10, 7))
    route_id = fields.Many2one("mfo.route", string="Үндсэн маршрут")
    frequency = fields.Selection(
        [
            ("daily", "Өдөр бүр"),
            ("weekly", "7 хоног бүр"),
            ("custom", "Тусгай"),
        ],
        string="Давтамж",
        default="daily",
    )
    operation_type = fields.Selection(
        [("garbage", "Хог тээвэрлэлт")],
        string="Ажиллагааны төрөл",
        default="garbage",
        required=True,
    )
    attachment_ids = fields.Many2many(
        "ir.attachment",
        "mfo_collection_point_ir_attachment_rel",
        "point_id",
        "attachment_id",
        string="Зураг / хавсралт",
    )
    active = fields.Boolean(string="Идэвхтэй", default=True)
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        default=lambda self: self.env.company,
        required=True,
    )

    @api.onchange("location_text")
    def _onchange_location_text(self):
        for point in self:
            if point.location_text and not point.address:
                point.address = point.location_text


class MfoRouteTemplate(models.Model):
    _name = "mfo.route.template"
    _description = "7 хоногийн маршрут загвар"
    _order = "weekday, name"
    _inherit = ["mail.thread"]

    name = fields.Char(string="Загварын нэр", required=True, tracking=True)
    department_id = fields.Many2one("hr.department", string="Хэлтэс", index=True)
    weekday = fields.Selection(WEEKDAY_SELECTION, string="Гараг", required=True, default="0")
    route_id = fields.Many2one("mfo.route", string="Маршрут", required=True)
    vehicle_id = fields.Many2one("fleet.vehicle", string="Машин")
    driver_id = fields.Many2one("hr.employee", string="Жолооч")
    team_id = fields.Many2one("mfo.crew.team", string="Баг")
    inspector_id = fields.Many2one("hr.employee", string="Хяналтын ажилтан")
    start_time = fields.Float(string="Эхлэх цаг")
    active = fields.Boolean(string="Идэвхтэй", default=True)
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        default=lambda self: self.env.company,
        required=True,
    )


class MfoRouteExecution(models.Model):
    _name = "mfo.route.execution"
    _description = "Өдрийн маршрут"
    _order = "date desc, id desc"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    route_id = fields.Many2one("mfo.route", string="Маршрут", required=True, index=True)
    template_id = fields.Many2one("mfo.route.template", string="Загвар")
    task_id = fields.Many2one("project.task", string="Холбоотой ажил", ondelete="set null")
    date = fields.Date(string="Огноо", required=True, default=fields.Date.context_today, index=True)
    vehicle_id = fields.Many2one("fleet.vehicle", string="Машин", index=True)
    driver_id = fields.Many2one("hr.employee", string="Жолооч", index=True)
    inspector_id = fields.Many2one("hr.employee", string="Хяналтын ажилтан", index=True)
    state = fields.Selection(ROUTE_STATES, string="Төлөв", default="draft", required=True, tracking=True)
    start_datetime = fields.Datetime(string="Эхэлсэн цаг")
    end_datetime = fields.Datetime(string="Дууссан цаг")
    stop_line_ids = fields.One2many("mfo.stop.execution.line", "execution_id", string="Зогсолтын мөр")
    report_ids = fields.One2many("mfo.proof.image", "execution_id", string="Зурагт тайлан")
    issue_ids = fields.One2many("mfo.issue.report", "execution_id", string="Асуудлын тайлан")
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        default=lambda self: self.env.company,
        required=True,
    )

    @api.constrains("route_id")
    def _check_active_route(self):
        for execution in self:
            if execution.route_id and not execution.route_id.active:
                raise ValidationError("Идэвхгүй маршрутаар өдрийн маршрут үүсгэх боломжгүй.")

    @api.constrains("start_datetime", "end_datetime")
    def _check_execution_dates(self):
        for execution in self:
            if execution.start_datetime and execution.end_datetime and execution.end_datetime < execution.start_datetime:
                raise ValidationError("Дууссан цаг эхэлсэн цагаас өмнө байж болохгүй.")

    @api.constrains("vehicle_id", "driver_id", "start_datetime", "end_datetime", "state")
    def _check_overlapping_assignments(self):
        active_states = ["planned", "dispatched", "in_progress", "submitted"]
        for execution in self:
            if not execution.start_datetime or not execution.end_datetime or execution.state in ("cancelled", "verified"):
                continue
            domain = [
                ("id", "!=", execution.id),
                ("state", "in", active_states),
                ("start_datetime", "<", execution.end_datetime),
                ("end_datetime", ">", execution.start_datetime),
            ]
            if execution.vehicle_id:
                if self.search_count(domain + [("vehicle_id", "=", execution.vehicle_id.id)]):
                    raise ValidationError("Нэг машин давхардсан цагт хоёр маршрутанд оноогдож болохгүй.")
                status = execution.vehicle_id._fields.get("x_municipal_operational_status")
                if status and execution.vehicle_id.x_municipal_operational_status == "in_repair":
                    raise ValidationError("Засварт байгаа машиныг маршрутанд оноох боломжгүй.")
            if execution.driver_id and self.search_count(domain + [("driver_id", "=", execution.driver_id.id)]):
                raise ValidationError("Нэг жолооч давхардсан цагт хоёр маршрутанд оноогдож болохгүй.")

    def _set_state(self, state):
        self.write({"state": state})
        return True

    def action_plan(self):
        return self._set_state("planned")

    def action_dispatch(self):
        return self._set_state("dispatched")

    def action_start(self):
        return self.write({"state": "in_progress", "start_datetime": fields.Datetime.now()})

    def action_submit(self):
        return self.write({"state": "submitted", "end_datetime": fields.Datetime.now()})

    def action_verify(self):
        return self._set_state("verified")

    def action_delay(self):
        return self._set_state("delayed")

    def action_cancel(self):
        return self._set_state("cancelled")

    def action_reset_to_draft(self):
        return self._set_state("draft")


class MfoStopExecutionLine(models.Model):
    _name = "mfo.stop.execution.line"
    _description = "Өдрийн маршрутын цэг"
    _order = "execution_id, sequence, id"
    _inherit = ["mail.thread"]

    execution_id = fields.Many2one("mfo.route.execution", string="Өдрийн маршрут", ondelete="cascade", index=True)
    task_id = fields.Many2one("project.task", string="Ажил", index=True, ondelete="cascade")
    collection_point_id = fields.Many2one("mfo.collection.point", string="Хогийн цэг", required=True, index=True)
    garbage_point_id = fields.Many2one(
        "mfo.collection.point",
        string="Хогийн цэг",
        related="collection_point_id",
        readonly=False,
        store=True,
    )
    district_id = fields.Many2one("mfo.district", string="Дүүрэг", related="collection_point_id.district_id", store=True)
    subdistrict_id = fields.Many2one("mfo.subdistrict", string="Хороо", related="collection_point_id.subdistrict_id", store=True)
    sequence = fields.Integer(string="Дараалал", default=10)
    state = fields.Selection(
        [
            ("draft", "Хүлээгдэж байна"),
            ("arrived", "Очсон"),
            ("done", "Дууссан"),
            ("skipped", "Алгассан"),
            ("issue", "Асуудалтай"),
        ],
        string="Төлөв",
        default="draft",
        required=True,
        tracking=True,
    )
    status = fields.Selection(
        string="Гүйцэтгэл",
        related="state",
        readonly=False,
        store=True,
    )
    planned_arrival_hour = fields.Float(string="Төлөвлөсөн очих цаг")
    planned_service_minutes = fields.Float(string="Үйлчилгээний минут")
    arrival_datetime = fields.Datetime(string="Очсон цаг")
    completed_datetime = fields.Datetime(string="Дууссан цаг")
    departure_datetime = fields.Datetime(string="Явсан цаг")
    proof_ids = fields.One2many("mfo.proof.image", "stop_line_id", string="Зураг")
    photo_ids = fields.One2many("mfo.proof.image", "stop_line_id", string="Зураг")
    note = fields.Text(string="Тэмдэглэл")
    skip_reason = fields.Char(string="Алгассан шалтгаан")
    issue_type = fields.Char(string="Асуудлын төрөл")
    issue_ids = fields.One2many("mfo.issue.report", "stop_line_id", string="Асуудал")
    proof_count = fields.Integer(string="Зургийн тоо", compute="_compute_counts")
    issue_count = fields.Integer(string="Асуудлын тоо", compute="_compute_counts")
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        default=lambda self: self.env.company,
        required=True,
    )

    @api.depends("proof_ids", "issue_ids")
    def _compute_counts(self):
        for line in self:
            line.proof_count = len(line.proof_ids)
            line.issue_count = len(line.issue_ids)

    @api.constrains("collection_point_id")
    def _check_active_point(self):
        for line in self:
            if line.collection_point_id and not line.collection_point_id.active:
                raise ValidationError("Идэвхгүй хогийн цэгийг өдрийн маршрутанд оноох боломжгүй.")

    def action_mark_arrived(self):
        self.write({"state": "arrived", "arrival_datetime": fields.Datetime.now()})
        return True

    def action_mark_done(self):
        self.write({"state": "done", "completed_datetime": fields.Datetime.now(), "departure_datetime": fields.Datetime.now()})
        return True

    def action_mark_skipped(self):
        self.write({"state": "skipped", "departure_datetime": fields.Datetime.now()})
        return True


class MfoProofImage(models.Model):
    _name = "mfo.proof.image"
    _description = "Маршрутын зурагт нотолгоо"
    _order = "capture_datetime desc, id desc"
    _inherit = ["mail.thread"]

    name = fields.Char(string="Нэр", required=True)
    execution_id = fields.Many2one("mfo.route.execution", string="Өдрийн маршрут", ondelete="cascade")
    task_id = fields.Many2one("project.task", string="Ажил", index=True, ondelete="cascade")
    stop_line_id = fields.Many2one("mfo.stop.execution.line", string="Маршрутын цэг", index=True, ondelete="cascade")
    proof_type = fields.Selection(
        [
            ("before", "Өмнө"),
            ("after", "Дараа"),
            ("completion", "Дууссан"),
            ("incident", "Асуудал"),
        ],
        string="Зургийн төрөл",
        default="completion",
        required=True,
    )
    image_1920 = fields.Image(string="Зураг", max_width=1920, max_height=1920)
    capture_datetime = fields.Datetime(string="Авсан цаг", default=fields.Datetime.now)
    uploader_user_id = fields.Many2one("res.users", string="Оруулсан хэрэглэгч", default=lambda self: self.env.user)
    latitude = fields.Float(string="Байршлын өргөрөг", digits=(10, 7))
    longitude = fields.Float(string="Байршлын уртраг", digits=(10, 7))
    description = fields.Text(string="Тайлбар")
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        default=lambda self: self.env.company,
        required=True,
    )


class MfoIssueReport(models.Model):
    _name = "mfo.issue.report"
    _description = "Маршрутын асуудлын тайлан"
    _order = "report_datetime desc, id desc"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(string="Гарчиг", required=True)
    execution_id = fields.Many2one("mfo.route.execution", string="Өдрийн маршрут", ondelete="cascade")
    task_id = fields.Many2one("project.task", string="Ажил", index=True, ondelete="cascade")
    stop_line_id = fields.Many2one("mfo.stop.execution.line", string="Маршрутын цэг", index=True, ondelete="set null")
    issue_type = fields.Selection(
        [
            ("route", "Маршрутын асуудал"),
            ("vehicle", "Машины асуудал"),
            ("crew", "Багийн асуудал"),
            ("safety", "Аюулгүй байдлын эрсдэл"),
            ("citizen", "Иргэний гомдол"),
            ("other", "Бусад"),
        ],
        string="Асуудлын төрөл",
        default="other",
        required=True,
    )
    severity = fields.Selection(
        [
            ("low", "Бага"),
            ("medium", "Дунд"),
            ("high", "Өндөр"),
            ("critical", "Ноцтой"),
        ],
        string="Ноцтой байдал",
        default="medium",
        required=True,
    )
    description = fields.Text(string="Тайлбар", required=True)
    photo_ids = fields.Many2many(
        "ir.attachment",
        "mfo_issue_report_ir_attachment_rel",
        "issue_id",
        "attachment_id",
        string="Зураг / хавсралт",
    )
    reported_by = fields.Many2one("res.users", string="Мэдээлсэн хэрэглэгч", default=lambda self: self.env.user)
    report_datetime = fields.Datetime(string="Мэдээлсэн цаг", default=fields.Datetime.now)
    state = fields.Selection(
        [
            ("new", "Шинэ"),
            ("in_progress", "Шийдвэрлэж байна"),
            ("resolved", "Шийдвэрлэсэн"),
            ("cancelled", "Цуцлагдсан"),
        ],
        string="Төлөв",
        default="new",
        required=True,
        tracking=True,
    )
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        default=lambda self: self.env.company,
        required=True,
    )

    def action_resolve(self):
        self.write({"state": "resolved"})
        return True

    def action_cancel(self):
        self.write({"state": "cancelled"})
        return True


class MfoDailyWeightTotal(models.Model):
    _name = "mfo.daily.weight.total"
    _description = "Өдрийн жингийн дүн"
    _order = "shift_date desc, id desc"

    task_id = fields.Many2one("project.task", string="Ажил", required=True, ondelete="cascade")
    shift_date = fields.Date(string="Ээлжийн огноо", related="task_id.mfo_shift_date", store=True, readonly=True)
    net_weight_total = fields.Float(string="Цэвэр жин")
    source = fields.Selection(
        [
            ("manual", "Гараар оруулсан"),
            ("external", "Гаднын тасалбар"),
            ("wrs_normalized", "Шөнийн жингийн дүн"),
        ],
        string="Эх сурвалж",
        default="manual",
    )
    external_reference = fields.Char(string="Гаднын дугаар")
    note = fields.Text(string="Тэмдэглэл")
    company_id = fields.Many2one("res.company", string="Компани", default=lambda self: self.env.company, required=True)


class MfoPlanningTemplate(models.Model):
    _name = "mfo.planning.template"
    _description = "7 хоногийн төлөвлөлтийн compatibility загвар"
    _order = "name"
    _inherit = ["mail.thread"]

    name = fields.Char(string="Төлөвлөгөө", required=True)
    department_id = fields.Many2one("hr.department", string="Хэлтэс")
    weekday = fields.Selection(WEEKDAY_SELECTION, string="Гараг", default="0")
    line_ids = fields.One2many("mfo.planning.template.line", "template_id", string="Мөрүүд")
    active = fields.Boolean(string="Идэвхтэй", default=True)
    company_id = fields.Many2one("res.company", string="Компани", default=lambda self: self.env.company, required=True)


class MfoPlanningTemplateLine(models.Model):
    _name = "mfo.planning.template.line"
    _description = "7 хоногийн төлөвлөлтийн мөр"
    _order = "template_id, sequence, id"

    template_id = fields.Many2one("mfo.planning.template", string="Төлөвлөгөө", required=True, ondelete="cascade")
    route_id = fields.Many2one("mfo.route", string="Маршрут")
    collection_point_id = fields.Many2one("mfo.collection.point", string="Хогийн цэг")
    sequence = fields.Integer(string="Дараалал", default=10)
    weekday = fields.Selection(WEEKDAY_SELECTION, string="Гараг", related="template_id.weekday", store=True)
    company_id = fields.Many2one("res.company", string="Компани", related="template_id.company_id", store=True, readonly=True)


class MfoPlanningOverride(models.Model):
    _name = "mfo.planning.override"
    _description = "Маршрутын төлөвлөлтийн өөрчлөлт"
    _order = "date desc, id desc"

    name = fields.Char(string="Өөрчлөлт", required=True)
    date = fields.Date(string="Огноо", required=True, default=fields.Date.context_today)
    route_id = fields.Many2one("mfo.route", string="Маршрут")
    reason = fields.Text(string="Шалтгаан")
    company_id = fields.Many2one("res.company", string="Компани", default=lambda self: self.env.company, required=True)
