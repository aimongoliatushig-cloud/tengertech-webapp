# -*- coding: utf-8 -*-

from odoo import api, fields, models


class MunicipalDashboardSnapshot(models.Model):
    _name = "municipal.dashboard.snapshot"
    _description = "Municipal Dashboard Snapshot"
    _order = "generated_at desc, id desc"

    name = fields.Char(string="Нэр", required=True, default="Dashboard snapshot")
    dashboard_type = fields.Selection(
        [
            ("management", "Удирдлагын dashboard"),
            ("department", "Хэлтсийн dashboard"),
            ("hr", "HR dashboard"),
            ("inspector", "Хяналтын dashboard"),
            ("repair", "Засварын dashboard"),
        ],
        string="Dashboard төрөл",
        required=True,
        default="management",
    )
    generated_at = fields.Datetime(string="Үүсгэсэн огноо", default=fields.Datetime.now, required=True)
    data_json = fields.Text(string="Өгөгдөл")
    company_id = fields.Many2one("res.company", string="Компани", default=lambda self: self.env.company)

    @api.model
    def get_management_dashboard_data(self):
        today = fields.Date.context_today(self)
        work_model = self.env["municipal.work"]
        report_model = self.env["municipal.work.report"]
        route_model = self.env["mfo.route.execution"]
        vehicle_model = self.env["fleet.vehicle"]
        repair_model = self.env["municipal.repair.request"]
        attendance_model = self.env["municipal.attendance.issue"]
        return {
            "totalWork": work_model.search_count([]),
            "doneWork": work_model.search_count([("state", "=", "done")]),
            "underReview": work_model.search_count([("state", "in", ["report_submitted", "under_review"])]),
            "returned": work_model.search_count([("state", "=", "returned")]),
            "overdue": work_model.search_count([("deadline_datetime", "!=", False), ("state", "not in", ["done", "cancelled"])]),
            "todayRoutes": route_model.search_count([("date", "=", today)]),
            "activeVehicles": vehicle_model.search_count([("x_municipal_operational_status", "in", ["available", "assigned"])]),
            "vehiclesInRepair": vehicle_model.search_count([("x_municipal_operational_status", "=", "in_repair")]),
            "attendanceSummary": {
                "present": attendance_model.search_count([("date", "=", today), ("attendance_status", "=", "present")]),
                "late": attendance_model.search_count([("date", "=", today), ("issue_type", "=", "late")]),
                "absent": attendance_model.search_count([("date", "=", today), ("issue_type", "=", "absent")]),
            },
            "reportsWaitingApproval": report_model.search_count([("state", "in", ["submitted", "under_review"])]),
            "newRepairRequests": repair_model.search_count([("state", "=", "new")]),
        }

    @api.model
    def get_department_dashboard_data(self, department_id=False):
        domain = [("department_id", "=", department_id)] if department_id else []
        work_model = self.env["municipal.work"]
        return {
            "todayWork": work_model.search_count(domain + [("start_datetime", "!=", False)]),
            "completedWork": work_model.search_count(domain + [("state", "=", "done")]),
            "underReview": work_model.search_count(domain + [("state", "in", ["report_submitted", "under_review"])]),
            "returned": work_model.search_count(domain + [("state", "=", "returned")]),
            "overdue": work_model.search_count(domain + [("deadline_datetime", "!=", False), ("state", "not in", ["done", "cancelled"])]),
        }

    @api.model
    def get_inspector_dashboard_data(self):
        return {
            "reportsToReview": self.env["municipal.work.report"].search_count([("state", "in", ["submitted", "under_review"])]),
            "routeChecks": self.env["mfo.route.execution"].search_count([("state", "in", ["submitted", "in_progress"])]),
            "violations": self.env["mfo.issue.report"].search_count([("state", "!=", "resolved")]),
            "returnedReports": self.env["municipal.work.report"].search_count([("state", "=", "returned")]),
            "photoMissingReports": self.env["municipal.work.report"].search_count([("attachment_ids", "=", False)]),
        }

    @api.model
    def get_repair_dashboard_data(self):
        repair_model = self.env["municipal.repair.request"]
        return {
            "newRepairRequests": repair_model.search_count([("state", "=", "new")]),
            "vehiclesInRepair": repair_model.search_count([("state", "=", "in_repair")]),
            "waitingParts": repair_model.search_count([("state", "=", "waiting_parts")]),
            "waitingApproval": repair_model.search_count([("state", "=", "waiting_approval")]),
            "completedRepairs": repair_model.search_count([("state", "in", ["done", "vehicle_returned"])]),
            "costSummary": sum(repair_model.search([]).mapped("amount_total")),
        }
