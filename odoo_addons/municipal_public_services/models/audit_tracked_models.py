# -*- coding: utf-8 -*-

from odoo import models


MUNICIPAL_AUDIT_FIELDS = {"state"}


def _municipal_change_type(field, new_value):
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


def _write_with_municipal_audit(records, vals, write_func):
    tracked = MUNICIPAL_AUDIT_FIELDS.intersection(vals)
    before = {}
    if tracked and not records.env.context.get("skip_municipal_audit"):
        for record in records:
            before[record.id] = {field: record[field] for field in tracked}

    result = write_func(vals)

    if before:
        audit = records.env["municipal.audit.log"]
        for record in records:
            for field in tracked:
                old_value = before.get(record.id, {}).get(field)
                new_value = record[field]
                if old_value != new_value:
                    audit.log_change(
                        record,
                        field,
                        str(old_value or ""),
                        str(new_value or ""),
                        _municipal_change_type(field, new_value),
                    )
    return result


class MunicipalWork(models.Model):
    _inherit = "municipal.work"

    def write(self, vals):
        return _write_with_municipal_audit(self, vals, super().write)


class MunicipalWorkReport(models.Model):
    _inherit = "municipal.work.report"

    def write(self, vals):
        return _write_with_municipal_audit(self, vals, super().write)


class MunicipalAttendanceIssue(models.Model):
    _inherit = "municipal.attendance.issue"

    def write(self, vals):
        return _write_with_municipal_audit(self, vals, super().write)


class MunicipalDiscipline(models.Model):
    _inherit = "municipal.discipline"

    def write(self, vals):
        return _write_with_municipal_audit(self, vals, super().write)


class MunicipalRepairRequest(models.Model):
    _inherit = "municipal.repair.request"

    def write(self, vals):
        return _write_with_municipal_audit(self, vals, super().write)


class MfoRouteExecution(models.Model):
    _inherit = "mfo.route.execution"

    def write(self, vals):
        return _write_with_municipal_audit(self, vals, super().write)
