# -*- coding: utf-8 -*-

from odoo import api, fields, models
from odoo.exceptions import UserError


class ProjectProject(models.Model):
    _inherit = "project.project"

    mfo_is_operation_project = fields.Boolean(string="Талбайн ажиллагааны төсөл")
    mfo_operation_type = fields.Selection(
        [("garbage", "Хог тээвэрлэлт"), ("garbage_seasonal", "Улирлын хог тээвэрлэлт")],
        string="Ажиллагааны төрөл",
    )
    mfo_default_shift_type = fields.Selection(
        [("morning", "Өглөө"), ("day", "Өдөр"), ("evening", "Орой"), ("night", "Шөнө")],
        string="Анхдагч ээлж",
        default="morning",
    )
    mfo_selected_shift_type = fields.Selection(
        [("morning", "Өглөө"), ("day", "Өдөр"), ("evening", "Орой"), ("night", "Шөнө")],
        string="Сонгосон ээлж",
        default="morning",
    )
    mfo_selected_vehicle_id = fields.Many2one("fleet.vehicle", string="Сонгосон машин")
    mfo_crew_team_id = fields.Many2one("mfo.crew.team", string="Ажиллах баг")
    ops_department_id = fields.Many2one("hr.department", string="Хэлтэс")

    @api.model
    def action_mfo_create_garbage_daily_project(self, values):
        route = self.env["mfo.route"].browse(values.get("route_id")).exists()
        if not route:
            raise UserError("Маршрут сонгоно уу.")
        shift_date = values.get("shift_date") or fields.Date.context_today(self)
        vehicle_id = values.get("vehicle_id") or route.vehicle_id.id
        department = route.department_id or self.env.user.employee_id.department_id or self.env["hr.department"].search([], limit=1)
        if not department:
            raise UserError("Маршрут үүсгэхийн өмнө хэлтэс тохируулна уу.")
        project = self.create(
            {
                "name": "%s - %s" % (route.name, shift_date),
                "privacy_visibility": "employees",
                "mfo_is_operation_project": True,
                "mfo_operation_type": "garbage",
                "mfo_selected_shift_type": route.shift_type,
                "mfo_selected_vehicle_id": vehicle_id or False,
                "mfo_crew_team_id": route.team_id.id or False,
                "ops_department_id": department.id,
            }
        )
        work = self.env["municipal.work"].create(
            {
                "name": project.name,
                "department_id": department.id,
                "work_type_id": self._mfo_get_or_create_garbage_work_type().id,
                "responsible_user_id": self.env.user.id,
                "responsible_employee_id": route.driver_id.id or False,
                "manager_id": self.env.user.id,
                "start_datetime": fields.Datetime.now(),
                "requires_photo": True,
                "requires_approval": True,
                "location_text": route.name,
            }
        )
        task = self.env["project.task"].create(
            {
                "name": project.name,
                "project_id": project.id,
                "mfo_operation_type": "garbage",
                "mfo_state": "dispatched",
                "mfo_shift_date": shift_date,
                "mfo_shift_type": route.shift_type,
                "mfo_route_id": route.id,
                "mfo_vehicle_id": vehicle_id or False,
                "mfo_driver_employee_id": route.driver_id.id or False,
                "mfo_inspector_employee_id": route.inspector_id.id or False,
                "mfo_crew_team_id": route.team_id.id or False,
                "municipal_work_id": work.id,
            }
        )
        execution = self.env["mfo.route.execution"].create(
            {
                "route_id": route.id,
                "date": shift_date,
                "vehicle_id": vehicle_id or False,
                "driver_id": route.driver_id.id or False,
                "inspector_id": route.inspector_id.id or False,
                "state": "dispatched",
                "task_id": task.id,
            }
        )
        for line in route.line_ids:
            self.env["mfo.stop.execution.line"].create(
                {
                    "execution_id": execution.id,
                    "task_id": task.id,
                    "collection_point_id": line.collection_point_id.id,
                    "sequence": line.sequence,
                }
            )
        return {"project_id": project.id, "task_id": task.id, "execution_id": execution.id}

    def _mfo_get_or_create_garbage_work_type(self):
        work_type = self.env["municipal.work.type"].search([("code", "=", "garbage_route")], limit=1)
        if work_type:
            return work_type
        department = self.env["hr.department"].search([], limit=1)
        return self.env["municipal.work.type"].create(
            {
                "name": "Хог тээвэрлэлтийн маршрут",
                "code": "garbage_route",
                "department_id": department.id or False,
                "default_requires_photo": True,
                "default_requires_approval": True,
                "default_unit_of_measure": "рейс",
            }
        )


class ProjectTask(models.Model):
    _inherit = "project.task"

    municipal_work_id = fields.Many2one("municipal.work", string="Хот тохижилтын ажил", ondelete="set null")
    ops_department_id = fields.Many2one("hr.department", string="Хэлтэс")
    ops_team_leader_id = fields.Many2one("res.users", string="Багийн ахлагч")
    ops_planned_quantity = fields.Float(string="Төлөвлөсөн тоо")
    ops_completed_quantity = fields.Float(string="Гүйцэтгэсэн тоо")
    ops_remaining_quantity = fields.Float(string="Үлдсэн тоо", compute="_compute_ops_progress", store=True)
    ops_progress_percent = fields.Float(string="Гүйцэтгэлийн хувь", compute="_compute_ops_progress", store=True)
    ops_measurement_unit = fields.Char(string="Хэмжих нэгж")
    ops_measurement_unit_code = fields.Char(string="Хэмжих нэгжийн код")
    mfo_operation_type = fields.Selection(
        [("garbage", "Хог тээвэрлэлт"), ("garbage_seasonal", "Улирлын хог тээвэрлэлт")],
        string="Ажиллагааны төрөл",
    )
    mfo_state = fields.Selection(
        [
            ("draft", "Ноорог"),
            ("dispatched", "Хуваарилсан"),
            ("in_progress", "Ажиллаж байна"),
            ("submitted", "Илгээсэн"),
            ("verified", "Баталгаажсан"),
            ("returned", "Буцаагдсан"),
            ("cancelled", "Цуцлагдсан"),
        ],
        string="Талбайн төлөв",
        default="draft",
        tracking=True,
    )
    mfo_shift_date = fields.Date(string="Ээлжийн огноо", index=True)
    mfo_shift_type = fields.Selection(
        [("morning", "Өглөө"), ("day", "Өдөр"), ("evening", "Орой"), ("night", "Шөнө")],
        string="Ээлж",
        default="morning",
    )
    mfo_route_id = fields.Many2one("mfo.route", string="Маршрут")
    mfo_district_id = fields.Many2one("mfo.district", string="Дүүрэг")
    mfo_vehicle_id = fields.Many2one("fleet.vehicle", string="Машин")
    mfo_driver_employee_id = fields.Many2one("hr.employee", string="Жолооч")
    mfo_collector_employee_ids = fields.Many2many(
        "hr.employee",
        "project_task_mfo_collector_rel",
        "task_id",
        "employee_id",
        string="Ачигчид",
    )
    mfo_inspector_employee_id = fields.Many2one("hr.employee", string="Хяналтын ажилтан")
    mfo_crew_team_id = fields.Many2one("mfo.crew.team", string="Ажиллах баг")
    mfo_dispatch_datetime = fields.Datetime(string="Хуваарилсан цаг")
    mfo_start_datetime = fields.Datetime(string="Эхэлсэн цаг")
    mfo_attendance_issue_id = fields.Many2one("municipal.attendance.issue", string="Ирцийн холбоос", ondelete="set null")
    mfo_end_datetime = fields.Datetime(string="Дууссан цаг")
    mfo_end_shift_summary = fields.Text(string="Ээлжийн тайлбар")
    mfo_stop_line_ids = fields.One2many("mfo.stop.execution.line", "task_id", string="Маршрутын цэгүүд")
    mfo_proof_image_ids = fields.One2many("mfo.proof.image", "task_id", string="Зураг")
    mfo_issue_ids = fields.One2many("mfo.issue.report", "task_id", string="Асуудал")
    mfo_stop_count = fields.Integer(string="Цэгийн тоо", compute="_compute_mfo_counts")
    mfo_completed_stop_count = fields.Integer(string="Дууссан цэг", compute="_compute_mfo_counts")
    mfo_skipped_stop_count = fields.Integer(string="Алгассан цэг", compute="_compute_mfo_counts")
    mfo_unresolved_stop_count = fields.Integer(string="Дутуу цэг", compute="_compute_mfo_counts")
    mfo_missing_proof_stop_count = fields.Integer(string="Зураг дутуу цэг", compute="_compute_mfo_counts")
    mfo_proof_count = fields.Integer(string="Зургийн тоо", compute="_compute_mfo_counts")
    mfo_issue_count = fields.Integer(string="Асуудлын тоо", compute="_compute_mfo_counts")
    mfo_progress_percent = fields.Float(string="Явц", compute="_compute_mfo_counts")
    mfo_total_net_weight = fields.Float(string="Нийт цэвэр жин", compute="_compute_mfo_counts")
    mfo_route_deviation_stop_count = fields.Integer(string="Маршрутаас зөрсөн цэг", default=0)
    mfo_skipped_without_reason_count = fields.Integer(string="Шалтгаангүй алгассан", compute="_compute_mfo_counts")
    mfo_weight_sync_warning = fields.Boolean(string="Жингийн анхааруулга", default=False)
    mfo_quality_exception_count = fields.Integer(string="Чанарын зөрчил", default=0)
    mfo_can_start = fields.Boolean(string="Эхлүүлэх боломжтой", compute="_compute_mfo_permissions")
    mfo_can_submit = fields.Boolean(string="Илгээх боломжтой", compute="_compute_mfo_permissions")

    @api.depends("ops_planned_quantity", "ops_completed_quantity")
    def _compute_ops_progress(self):
        for task in self:
            planned = task.ops_planned_quantity or 0
            done = task.ops_completed_quantity or 0
            task.ops_remaining_quantity = max(planned - done, 0)
            task.ops_progress_percent = round(done / planned * 100, 2) if planned else 0

    @api.depends(
        "mfo_stop_line_ids.state",
        "mfo_stop_line_ids.proof_count",
        "mfo_stop_line_ids.skip_reason",
        "mfo_proof_image_ids",
        "mfo_issue_ids",
    )
    def _compute_mfo_counts(self):
        weight_model = self.env["mfo.daily.weight.total"]
        for task in self:
            stops = task.mfo_stop_line_ids
            done = stops.filtered(lambda line: line.state == "done")
            skipped = stops.filtered(lambda line: line.state == "skipped")
            task.mfo_stop_count = len(stops)
            task.mfo_completed_stop_count = len(done)
            task.mfo_skipped_stop_count = len(skipped)
            task.mfo_unresolved_stop_count = len(stops.filtered(lambda line: line.state not in ("done", "skipped")))
            task.mfo_missing_proof_stop_count = len(done.filtered(lambda line: not line.proof_ids))
            task.mfo_proof_count = len(task.mfo_proof_image_ids)
            task.mfo_issue_count = len(task.mfo_issue_ids)
            task.mfo_progress_percent = round((len(done) + len(skipped)) / len(stops) * 100, 2) if stops else 0
            task.mfo_skipped_without_reason_count = len(skipped.filtered(lambda line: not line.skip_reason))
            weights = weight_model.search([("task_id", "=", task.id)])
            task.mfo_total_net_weight = sum(weights.mapped("net_weight_total"))

    @api.depends("mfo_state")
    def _compute_mfo_permissions(self):
        for task in self:
            task.mfo_can_start = task.mfo_state in ("draft", "dispatched", "returned")
            task.mfo_can_submit = task.mfo_state == "in_progress"

    def action_mfo_start_shift(self):
        start_datetime = fields.Datetime.now()
        self.write({"mfo_state": "in_progress", "mfo_start_datetime": start_datetime})
        for task in self:
            task._mfo_mark_attendance_present(start_datetime)
        self.mapped("municipal_work_id").action_start()
        return True

    def _mfo_mark_attendance_present(self, start_datetime):
        self.ensure_one()
        employee = (
            self.mfo_driver_employee_id
            or self.env.user.employee_id
            or self.municipal_work_id.responsible_employee_id
        )
        if not employee or self.mfo_attendance_issue_id:
            return
        self.mfo_attendance_issue_id = self.env["municipal.attendance.issue"].sudo().create(
            {
                "employee_id": employee.id,
                "date": fields.Date.context_today(self),
                "issue_type": "other",
                "attendance_status": "present",
                "actual_check_in": start_datetime,
                "reason": "Талбарын ажил эхлүүлэх үед автоматаар бүртгэсэн.",
                "source_work_id": self.municipal_work_id.id or False,
            }
        ).id

    def action_mfo_submit_for_verification(self):
        for task in self:
            if task.municipal_work_id.requires_photo and not task.mfo_proof_image_ids:
                raise UserError("Тайлан илгээхийн өмнө зураг хавсаргана уу.")
        self.write({"mfo_state": "submitted", "mfo_end_datetime": fields.Datetime.now()})
        self.mapped("municipal_work_id").action_submit_report()
        return True

    def action_mfo_verify(self):
        self.write({"mfo_state": "verified"})
        works = self.mapped("municipal_work_id")
        for work in works:
            if work.state != "approved":
                work.action_approve()
        return True

    def action_mfo_return(self, reason=None):
        reason = reason or "Тайлан буцаагдсан."
        self.write({"mfo_state": "returned"})
        for work in self.mapped("municipal_work_id"):
            work.rejection_reason = reason
            work.action_return()
        return True

    def action_ops_create_mobile_report(self, values):
        self.ensure_one()
        report = self.env["ops.task.report"].create(
            {
                "task_id": self.id,
                "reporter_id": self.env.user.id,
                "reporter_employee_id": self.env.user.employee_id.id or False,
                "report_summary": values.get("report_text") or values.get("report_summary") or "",
                "reported_quantity": values.get("reported_quantity") or 0,
            }
        )
        if self.municipal_work_id:
            municipal_report = self.env["municipal.work.report"].create(
                {
                    "work_id": self.municipal_work_id.id,
                    "employee_id": self.env.user.employee_id.id or self.municipal_work_id.responsible_employee_id.id,
                    "user_id": self.env.user.id,
                    "description": report.report_summary,
                    "actual_quantity": report.reported_quantity,
                    "unit_of_measure": self.municipal_work_id.unit_of_measure,
                    "state": "draft",
                }
            )
            report.municipal_report_id = municipal_report.id
        return report.id

    def action_ops_submit_for_review(self):
        reports = self.env["ops.task.report"].search([("task_id", "in", self.ids), ("state", "in", ["draft", "returned"])])
        reports.action_submit()
        return self.action_mfo_submit_for_verification()
