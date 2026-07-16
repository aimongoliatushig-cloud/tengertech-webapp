# -*- coding: utf-8 -*-
"""Хянах самбарын өгөгдөл нийлүүлэгч.

Шинэ талбар/модел үүсгэхгүй — зөвхөн одоо байгаа моделуудаас (project.task,
hr.employee, hr.department, fleet.vehicle, mfo.collection.point,
mfo.route.execution) уншиж, OWL компонентод нэг дуудалтаар өгнө.
"""

from odoo import api, fields, models


class MfoDashboard(models.AbstractModel):
    _name = "mfo.dashboard"
    _description = "Хог тээвэрлэлтийн хянах самбар"

    # --- туслах ------------------------------------------------------------

    def _today(self):
        return fields.Date.context_today(self)

    def _safe_count(self, model, domain):
        """Эрх/модел байхгүй үед самбар бүхэлдээ унахаас сэргийлнэ."""
        try:
            return self.env[model].sudo().search_count(domain)
        except Exception:  # pragma: no cover - хамгаалалт
            return 0

    # --- KPI ---------------------------------------------------------------

    def _kpi(self):
        today = self._today()
        return {
            "tasks": self._safe_count("project.task", []),
            "employees": self._safe_count("hr.employee", [("active", "=", True)]),
            "vehicles": self._safe_count("fleet.vehicle", [("active", "=", True)]),
            "points": self._safe_count("mfo.collection.point", [("active", "=", True)]),
            "today_tasks": self._safe_count(
                "project.task",
                ["|", ("mfo_shift_date", "=", today), ("date_deadline", ">=", today)],
            ),
        }

    # --- Хэлтсийн бүтэц ----------------------------------------------------

    def _departments(self):
        try:
            Employee = self.env["hr.employee"].sudo()
            departments = self.env["hr.department"].sudo().search([])
            rows = []
            for dept in departments:
                employees = Employee.search([("department_id", "=", dept.id)])
                if not employees:
                    continue
                jobs = {}
                for emp in employees:
                    title = (emp.job_title or "").strip() or "Албан тушаал бүртгээгүй"
                    jobs[title] = jobs.get(title, 0) + 1
                rows.append({
                    "id": dept.id,
                    "name": dept.name or "",
                    "manager": dept.manager_id.name or "",
                    "total": len(employees),
                    "jobs": sorted(
                        [{"title": t, "count": c} for t, c in jobs.items()],
                        key=lambda j: -j["count"],
                    ),
                })
            return sorted(rows, key=lambda r: -r["total"])
        except Exception:  # pragma: no cover
            return []

    # --- Хогийн цэгүүд (газрын зураг) --------------------------------------

    def _points(self):
        try:
            points = self.env["mfo.collection.point"].sudo().search(
                [("active", "=", True)], limit=2000
            )
            rows = []
            for point in points:
                lat = point.gps_latitude or 0.0
                lng = point.gps_longitude or 0.0
                if not lat or not lng:
                    continue
                rows.append({
                    "id": point.id,
                    "name": point.name or "",
                    "address": point.address or point.location_text or "",
                    "khoroo": point.khoroo or (point.subdistrict_id.name or ""),
                    "district": point.district or (point.district_id.name or ""),
                    "operation_type": point.operation_type or "",
                    "lat": lat,
                    "lng": lng,
                })
            return rows
        except Exception:  # pragma: no cover
            return []

    # --- Өнөөдрийн маршрут -------------------------------------------------

    def _routes(self):
        try:
            executions = self.env["mfo.route.execution"].sudo().search(
                [("date", "=", self._today())], limit=100
            )
            return [{
                "id": ex.id,
                "route": ex.route_id.name or "",
                "vehicle": ex.vehicle_id.name or "",
                "driver": ex.driver_id.name or "",
                "state": ex.state or "",
            } for ex in executions]
        except Exception:  # pragma: no cover
            return []

    # --- Машины төлөв ------------------------------------------------------

    def _vehicles(self):
        try:
            vehicles = self.env["fleet.vehicle"].sudo().search(
                [("active", "=", True)], limit=200
            )
            rows = [{
                "id": v.id,
                "name": v.name or "",
                "plate": v.license_plate or "",
                "driver": v.driver_id.name or "",
                "state": v.state_id.name or "",
            } for v in vehicles]
            states = {}
            for row in rows:
                key = row["state"] or "Тодорхойгүй"
                states[key] = states.get(key, 0) + 1
            return {
                "rows": rows[:12],
                "total": len(rows),
                "by_state": sorted(
                    [{"state": s, "count": c} for s, c in states.items()],
                    key=lambda x: -x["count"],
                ),
            }
        except Exception:  # pragma: no cover
            return {"rows": [], "total": 0, "by_state": []}

    # --- Өнөөдрийн явц -----------------------------------------------------

    def _progress(self):
        today = self._today()
        try:
            Task = self.env["project.task"].sudo()
            domain = ["|", ("mfo_shift_date", "=", today), ("date_deadline", ">=", today)]
            tasks = Task.search(domain, limit=1000)
            total = len(tasks)
            done = len([t for t in tasks if t.stage_id and t.stage_id.fold])
            return {
                "total": total,
                "done": done,
                "open": total - done,
                "percent": round((done / total) * 100) if total else 0,
            }
        except Exception:  # pragma: no cover
            return {"total": 0, "done": 0, "open": 0, "percent": 0}

    # --- Нийтийн API -------------------------------------------------------

    @api.model
    def get_dashboard_data(self):
        user = self.env.user
        employee = self.env["hr.employee"].sudo().search(
            [("user_id", "=", user.id)], limit=1
        )
        department = employee.department_id.name if employee else ""
        return {
            "header": {
                "department": department or "Байгууллагын нэгдсэн",
                "date": fields.Date.to_string(self._today()),
                "user": user.name or "",
                "notifications": self._safe_count(
                    "mail.activity", [("user_id", "=", user.id)]
                ),
            },
            "kpi": self._kpi(),
            "departments": self._departments(),
            "points": self._points(),
            "routes": self._routes(),
            "vehicles": self._vehicles(),
            "progress": self._progress(),
        }
