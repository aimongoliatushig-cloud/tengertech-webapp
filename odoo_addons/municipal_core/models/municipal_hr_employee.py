# -*- coding: utf-8 -*-

from odoo import api, fields, models


class HrEmployee(models.Model):
    _inherit = "hr.employee"

    municipal_assigned_work_count = fields.Integer(
        string="Оноосон ажил",
        compute="_compute_municipal_activity_metrics",
    )
    municipal_started_work_count = fields.Integer(
        string="Эхэлсэн ажил",
        compute="_compute_municipal_activity_metrics",
    )
    municipal_done_work_count = fields.Integer(
        string="Дууссан ажил",
        compute="_compute_municipal_activity_metrics",
    )
    municipal_approved_report_count = fields.Integer(
        string="Баталгаажсан тайлан",
        compute="_compute_municipal_activity_metrics",
    )
    municipal_returned_report_count = fields.Integer(
        string="Буцаагдсан тайлан",
        compute="_compute_municipal_activity_metrics",
    )
    municipal_overdue_work_count = fields.Integer(
        string="Хугацаа хэтэрсэн ажил",
        compute="_compute_municipal_activity_metrics",
    )
    municipal_absence_count = fields.Integer(
        string="Таслалт",
        compute="_compute_municipal_activity_metrics",
    )
    municipal_late_count = fields.Integer(
        string="Хоцролт",
        compute="_compute_municipal_activity_metrics",
    )
    municipal_discipline_count = fields.Integer(
        string="Сахилгын бүртгэл",
        compute="_compute_municipal_activity_metrics",
    )
    municipal_activity_score = fields.Float(
        string="Идэвхийн оноо",
        compute="_compute_municipal_activity_metrics",
    )
    municipal_activity_status = fields.Selection(
        [
            ("good", "Сайн"),
            ("normal", "Хэвийн"),
            ("attention", "Анхаарах"),
            ("risk", "Эрсдэлтэй"),
        ],
        string="Идэвхийн төлөв",
        compute="_compute_municipal_activity_metrics",
    )

    @api.depends_context("uid", "company")
    def _compute_municipal_activity_metrics(self):
        employee_ids = self.ids
        if not employee_ids:
            return
        today_end = fields.Datetime.now()
        work_model = self.env["municipal.work"]
        report_model = self.env["municipal.work.report"]
        attendance_model = self.env["municipal.attendance.issue"]
        discipline_model = self.env["municipal.discipline"]

        assigned = self._municipal_count_by_employee(
            work_model,
            [("responsible_employee_id", "in", employee_ids), ("state", "!=", "cancelled")],
            "responsible_employee_id",
        )
        started = self._municipal_count_by_employee(
            work_model,
            [("responsible_employee_id", "in", employee_ids), ("state", "in", ["started", "report_submitted", "under_review", "returned", "approved", "done"])],
            "responsible_employee_id",
        )
        done = self._municipal_count_by_employee(
            work_model,
            [("responsible_employee_id", "in", employee_ids), ("state", "=", "done")],
            "responsible_employee_id",
        )
        overdue = self._municipal_count_by_employee(
            work_model,
            [
                ("responsible_employee_id", "in", employee_ids),
                ("deadline_datetime", "!=", False),
                ("deadline_datetime", "<", today_end),
                ("state", "not in", ["done", "cancelled"]),
            ],
            "responsible_employee_id",
        )
        approved_reports = self._municipal_count_by_employee(
            report_model,
            [("employee_id", "in", employee_ids), ("state", "=", "approved")],
            "employee_id",
        )
        returned_reports = self._municipal_count_by_employee(
            report_model,
            [("employee_id", "in", employee_ids), ("state", "=", "returned")],
            "employee_id",
        )
        absences = self._municipal_count_by_employee(
            attendance_model,
            [("employee_id", "in", employee_ids), ("issue_type", "=", "absent"), ("state", "!=", "cancelled")],
            "employee_id",
        )
        lates = self._municipal_count_by_employee(
            attendance_model,
            [("employee_id", "in", employee_ids), ("issue_type", "=", "late"), ("state", "!=", "cancelled")],
            "employee_id",
        )
        disciplines = self._municipal_count_by_employee(
            discipline_model,
            [("employee_id", "in", employee_ids), ("state", "not in", ["cancelled", "archived"])],
            "employee_id",
        )

        for employee in self:
            assigned_count = assigned.get(employee.id, 0)
            started_count = started.get(employee.id, 0)
            done_count = done.get(employee.id, 0)
            approved_report_count = approved_reports.get(employee.id, 0)
            returned_report_count = returned_reports.get(employee.id, 0)
            overdue_count = overdue.get(employee.id, 0)
            absence_count = absences.get(employee.id, 0)
            late_count = lates.get(employee.id, 0)
            discipline_count = disciplines.get(employee.id, 0)
            risk_points = (
                returned_report_count
                + overdue_count
                + absence_count * 2
                + late_count
                + discipline_count * 2
            )
            positive_points = done_count * 2 + approved_report_count + started_count
            score = max(0, min(100, 70 + positive_points * 3 - risk_points * 5))
            employee.municipal_assigned_work_count = assigned_count
            employee.municipal_started_work_count = started_count
            employee.municipal_done_work_count = done_count
            employee.municipal_approved_report_count = approved_report_count
            employee.municipal_returned_report_count = returned_report_count
            employee.municipal_overdue_work_count = overdue_count
            employee.municipal_absence_count = absence_count
            employee.municipal_late_count = late_count
            employee.municipal_discipline_count = discipline_count
            employee.municipal_activity_score = score
            if risk_points >= 6 or score < 40:
                employee.municipal_activity_status = "risk"
            elif risk_points >= 3 or score < 60:
                employee.municipal_activity_status = "attention"
            elif score >= 85:
                employee.municipal_activity_status = "good"
            else:
                employee.municipal_activity_status = "normal"

    @api.model
    def _municipal_count_by_employee(self, model, domain, groupby_field):
        groups = model.read_group(domain, [groupby_field], [groupby_field])
        return {
            item[groupby_field][0]: item["%s_count" % groupby_field]
            for item in groups
            if item.get(groupby_field)
        }

    @api.model
    def get_municipal_hr_dashboard_data(self):
        today = fields.Date.context_today(self)
        attendance_model = self.env["municipal.attendance.issue"]
        discipline_model = self.env["municipal.discipline"]
        employees = self.search([("active", "=", True)])
        today_attendance = attendance_model.search([("date", "=", today)])
        present_count = len(today_attendance.filtered(lambda rec: rec.attendance_status == "present"))
        late_count = len(today_attendance.filtered(lambda rec: rec.issue_type == "late"))
        absent_count = len(today_attendance.filtered(lambda rec: rec.issue_type == "absent"))
        leave_count = len(today_attendance.filtered(lambda rec: rec.attendance_status in ("leave", "annual_leave")))
        sick_count = len(today_attendance.filtered(lambda rec: rec.attendance_status == "sick"))
        repeated_absence_count = len(attendance_model.search(
            [
                ("issue_type", "=", "absent"),
                ("state", "not in", ["cancelled", "archived"]),
            ]
        ).filtered(lambda record: record.repeated_issue_count >= 2))
        discipline_count = discipline_model.search_count(
            [("state", "not in", ["cancelled", "archived"])]
        )
        low_activity = employees.filtered(
            lambda employee: employee.municipal_activity_status in ("attention", "risk")
        )[:10]
        high_activity = employees.filtered(
            lambda employee: employee.municipal_activity_status == "good"
        )[:10]
        department_summary = []
        for department in self.env["hr.department"].search([]):
            department_employees = employees.filtered(lambda emp, dep=department: emp.department_id == dep)
            if not department_employees:
                continue
            department_attendance = today_attendance.filtered(
                lambda rec, dep=department: rec.department_id == dep
            )
            department_summary.append(
                {
                    "department": department.display_name,
                    "employeeCount": len(department_employees),
                    "present": len(department_attendance.filtered(lambda rec: rec.attendance_status == "present")),
                    "late": len(department_attendance.filtered(lambda rec: rec.issue_type == "late")),
                    "absent": len(department_attendance.filtered(lambda rec: rec.issue_type == "absent")),
                }
            )
        return {
            "today": str(today),
            "todayAttendance": len(today_attendance),
            "present": present_count,
            "late": late_count,
            "absent": absent_count,
            "leave": leave_count,
            "sick": sick_count,
            "repeatedAbsence": repeated_absence_count,
            "disciplineCases": discipline_count,
            "lowActivityEmployees": [
                {"id": emp.id, "name": emp.name, "status": emp.municipal_activity_status}
                for emp in low_activity
            ],
            "highActivityEmployees": [
                {"id": emp.id, "name": emp.name, "score": emp.municipal_activity_score}
                for emp in high_activity
            ],
            "departmentAttendanceSummary": department_summary,
        }
