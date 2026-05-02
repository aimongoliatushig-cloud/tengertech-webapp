# -*- coding: utf-8 -*-

from odoo import api, fields, models


class ProjectProject(models.Model):
    _inherit = "project.project"

    ops_track_quantity = fields.Boolean(string="Тоо хэмжээ хянах")
    ops_planned_quantity = fields.Float(string="Төлөвлөсөн тоо")
    ops_measurement_unit_id = fields.Many2one("ops.work.unit", string="Хэмжих нэгж", ondelete="set null")
    ops_measurement_unit = fields.Char(string="Хэмжих нэгж")
    ops_measurement_unit_code = fields.Char(
        string="Хэмжих нэгжийн код",
        compute="_compute_ops_measurement_unit_code",
        store=True,
        readonly=False,
    )
    ops_default_unit_id = fields.Many2one("ops.work.unit", string="Анхдагч нэгж", ondelete="set null")
    ops_allowed_unit_ids = fields.Many2many(
        "ops.work.unit",
        "project_project_allowed_unit_rel",
        "project_id",
        "unit_id",
        string="Зөвшөөрсөн нэгжүүд",
    )
    ops_profile_allowed_unit_ids = fields.Many2many(
        "ops.work.unit",
        string="Профайлын зөвшөөрсөн нэгжүүд",
        compute="_compute_ops_profile_units",
    )
    ops_profile_default_unit_id = fields.Many2one(
        "ops.work.unit",
        string="Профайлын анхдагч нэгж",
        compute="_compute_ops_profile_units",
    )
    ops_allowed_unit_summary = fields.Char(
        string="Зөвшөөрсөн нэгжийн жагсаалт",
        compute="_compute_ops_allowed_unit_summary",
    )
    ops_work_type_id = fields.Many2one(
        "ops.work.type",
        string="Ажлын төрлийн нэгж",
        compute="_compute_ops_work_type_id",
    )

    @api.depends("ops_measurement_unit_id.code")
    def _compute_ops_measurement_unit_code(self):
        for project in self:
            if project.ops_measurement_unit_id:
                project.ops_measurement_unit_code = project.ops_measurement_unit_id.code

    @api.depends("ops_allowed_unit_ids.name")
    def _compute_ops_allowed_unit_summary(self):
        for project in self:
            project.ops_allowed_unit_summary = ", ".join(project.ops_allowed_unit_ids.mapped("name"))

    @api.depends("mfo_operation_type")
    def _compute_ops_profile_units(self):
        for project in self:
            work_type = project.ops_work_type_id
            project.ops_profile_allowed_unit_ids = work_type.allowed_unit_ids
            project.ops_profile_default_unit_id = work_type.default_unit_id

    @api.depends("mfo_operation_type")
    def _compute_ops_work_type_id(self):
        WorkType = self.env["ops.work.type"].sudo()
        for project in self:
            operation_type = project.mfo_operation_type or "garbage"
            project.ops_work_type_id = WorkType.search([("operation_type", "=", operation_type)], limit=1)


class ProjectTask(models.Model):
    _inherit = "project.task"

    ops_measurement_unit_id = fields.Many2one("ops.work.unit", string="Хэмжих нэгж", ondelete="set null")
    ops_allowed_unit_ids = fields.Many2many(
        "ops.work.unit",
        string="Зөвшөөрсөн нэгжүүд",
        compute="_compute_ops_unit_helpers",
    )
    ops_default_unit_id = fields.Many2one(
        "ops.work.unit",
        string="Анхдагч нэгж",
        compute="_compute_ops_unit_helpers",
    )
    ops_allowed_unit_summary = fields.Char(
        string="Зөвшөөрсөн нэгжийн жагсаалт",
        compute="_compute_ops_unit_helpers",
    )
    ops_reports_locked = fields.Boolean(string="Тайлан түгжигдсэн", compute="_compute_ops_report_actions")
    ops_can_submit_for_review = fields.Boolean(string="Хяналтад илгээж болно", compute="_compute_ops_report_actions")
    ops_can_return_for_changes = fields.Boolean(string="Буцааж болно", compute="_compute_ops_report_actions")
    ops_can_mark_done = fields.Boolean(string="Дуусгаж болно", compute="_compute_ops_report_actions")

    @api.depends(
        "project_id.ops_allowed_unit_ids",
        "project_id.ops_default_unit_id",
        "project_id.ops_allowed_unit_summary",
    )
    def _compute_ops_unit_helpers(self):
        for task in self:
            project = task.project_id
            task.ops_allowed_unit_ids = project.ops_allowed_unit_ids
            task.ops_default_unit_id = project.ops_default_unit_id
            task.ops_allowed_unit_summary = project.ops_allowed_unit_summary

    @api.depends("stage_id", "mfo_state")
    def _compute_ops_report_actions(self):
        for task in self:
            task.ops_reports_locked = task.mfo_state in ("verified", "cancelled")
            task.ops_can_submit_for_review = task.mfo_state in (False, "draft", "dispatched", "in_progress", "returned")
            task.ops_can_return_for_changes = task.mfo_state == "submitted"
            task.ops_can_mark_done = task.mfo_state in ("submitted", "verified")
