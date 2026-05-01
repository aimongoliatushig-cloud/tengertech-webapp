# -*- coding: utf-8 -*-

from odoo import api, fields, models


class MunicipalDashboardSnapshot(models.Model):
    _name = "municipal.dashboard.snapshot"
    _description = "Municipal Dashboard Snapshot"
    _order = "generated_at desc, id desc"

    name = fields.Char(string="Нэр", required=True, default="Dashboard snapshot")
    dashboard_type = fields.Selection(
        [
            ("garbage", "Хог тээвэрлэлтийн dashboard"),
            ("finance", "Санхүү / нярав dashboard"),
            ("complaint", "Иргэдийн санал гомдлын dashboard"),
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

    def _model_or_false(self, model_name):
        if model_name not in self.env.registry:
            return False
        return self.env[model_name]

    def _search_count_if_exists(self, model_name, domain):
        model = self._model_or_false(model_name)
        return model.search_count(domain) if model else 0

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

    @api.model
    def get_garbage_dashboard_data(self):
        today = fields.Date.context_today(self)
        return {
            "todayRoutes": self._search_count_if_exists("mfo.route.execution", [("date", "=", today)]),
            "inProgressRoutes": self._search_count_if_exists("mfo.route.execution", [("state", "=", "in_progress")]),
            "submittedRoutes": self._search_count_if_exists("mfo.route.execution", [("state", "=", "submitted")]),
            "verifiedRoutes": self._search_count_if_exists("mfo.route.execution", [("state", "=", "verified")]),
            "openIssues": self._search_count_if_exists("mfo.issue.report", [("state", "!=", "resolved")]),
            "missingProofStops": self._search_count_if_exists("mfo.stop.execution.line", [("proof_ids", "=", False)]),
        }

    @api.model
    def get_finance_dashboard_data(self):
        procurement_model = self._model_or_false("municipal.procurement.request")
        if not procurement_model:
            return {
                "draftRequests": 0,
                "quotationRequests": 0,
                "financeReview": 0,
                "directorApproval": 0,
                "paymentWaiting": 0,
                "warehouseReceived": 0,
                "overThreshold": 0,
                "amountTotal": 0,
            }

        return {
            "draftRequests": procurement_model.search_count([("state", "=", "draft")]),
            "quotationRequests": procurement_model.search_count([("state", "=", "quote")]),
            "financeReview": procurement_model.search_count([("state", "=", "finance_review")]),
            "directorApproval": procurement_model.search_count([("state", "=", "director_approval")]),
            "paymentWaiting": procurement_model.search_count([("state", "=", "payment")]),
            "warehouseReceived": procurement_model.search_count([("state", "=", "received")]),
            "overThreshold": procurement_model.search_count([("is_over_threshold", "=", True)]),
            "amountTotal": sum(procurement_model.search([]).mapped("amount_total")),
        }

    @api.model
    def get_complaint_dashboard_data(self):
        complaint_model = self.env["municipal.complaint"]
        return {
            "newComplaints": complaint_model.search_count([("state", "=", "new")]),
            "assignedComplaints": complaint_model.search_count([("state", "=", "assigned")]),
            "inProgressComplaints": complaint_model.search_count([("state", "=", "in_progress")]),
            "resolvedComplaints": complaint_model.search_count([("state", "=", "resolved")]),
            "rejectedComplaints": complaint_model.search_count([("state", "=", "rejected")]),
            "withWork": complaint_model.search_count([("work_id", "!=", False)]),
            "withPhoto": complaint_model.search_count([("photo_ids", "!=", False)]),
        }
