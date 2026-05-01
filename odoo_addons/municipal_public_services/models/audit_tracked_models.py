# -*- coding: utf-8 -*-

from odoo import models


class MunicipalAuditTrackedMixin:
    _municipal_audit_fields = {"state"}

    def write(self, vals):
        tracked = self._municipal_audit_fields.intersection(vals)
        before = {}
        if tracked and not self.env.context.get("skip_municipal_audit"):
            for record in self:
                before[record.id] = {field: record[field] for field in tracked}
        result = super().write(vals)
        if before:
            audit = self.env["municipal.audit.log"]
            for record in self:
                for field in tracked:
                    old_value = before.get(record.id, {}).get(field)
                    new_value = record[field]
                    if old_value != new_value:
                        audit.log_change(
                            record,
                            field,
                            str(old_value or ""),
                            str(new_value or ""),
                            self._municipal_change_type(field, new_value),
                        )
        return result

    def _municipal_change_type(self, field, new_value):
        if field == "state":
            if new_value in ("approved", "verified"):
                return "approve"
            if new_value in ("returned", "rejected"):
                return "return"
            if new_value in ("resolved", "done", "vehicle_returned"):
                return "resolve"
            if new_value == "cancelled":
                return "cancel"
            return "state"
        return "write"


class MunicipalWork(MunicipalAuditTrackedMixin, models.Model):
    _inherit = "municipal.work"


class MunicipalWorkReport(MunicipalAuditTrackedMixin, models.Model):
    _inherit = "municipal.work.report"


class MunicipalAttendanceIssue(MunicipalAuditTrackedMixin, models.Model):
    _inherit = "municipal.attendance.issue"


class MunicipalDiscipline(MunicipalAuditTrackedMixin, models.Model):
    _inherit = "municipal.discipline"


class MunicipalRepairRequest(MunicipalAuditTrackedMixin, models.Model):
    _inherit = "municipal.repair.request"


class MfoRouteExecution(MunicipalAuditTrackedMixin, models.Model):
    _inherit = "mfo.route.execution"
