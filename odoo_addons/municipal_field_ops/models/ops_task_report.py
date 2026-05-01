# -*- coding: utf-8 -*-

from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError


class OpsTaskReport(models.Model):
    _name = "ops.task.report"
    _description = "Гар утасны ажлын тайлан"
    _order = "report_datetime desc, id desc"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    task_id = fields.Many2one("project.task", string="Ажил", required=True, ondelete="cascade", index=True)
    municipal_report_id = fields.Many2one("municipal.work.report", string="Хот тохижилтын тайлан", ondelete="set null")
    reporter_id = fields.Many2one("res.users", string="Тайлагнасан хэрэглэгч", default=lambda self: self.env.user, index=True)
    reporter_employee_id = fields.Many2one(
        "hr.employee",
        string="Тайлагнасан ажилтан",
        compute="_compute_reporter_employee_id",
        store=True,
        readonly=False,
        index=True,
    )
    user_id = fields.Many2one("res.users", string="Хэрэглэгч", default=lambda self: self.env.user, index=True)
    report_datetime = fields.Datetime(string="Тайлангийн огноо", default=fields.Datetime.now, required=True)
    report_summary = fields.Text(string="Тайлбар", required=True)
    reported_quantity = fields.Float(string="Гүйцэтгэсэн тоо хэмжээ")
    task_measurement_unit_id = fields.Many2one("uom.uom", string="Хэмжих нэгж")
    task_measurement_unit_code = fields.Char(string="Хэмжих нэгжийн код")
    image_attachment_ids = fields.Many2many(
        "ir.attachment",
        "ops_task_report_image_attachment_rel",
        "report_id",
        "attachment_id",
        string="Зураг",
    )
    audio_attachment_ids = fields.Many2many(
        "ir.attachment",
        "ops_task_report_audio_attachment_rel",
        "report_id",
        "attachment_id",
        string="Дуу бичлэг",
    )
    image_count = fields.Integer(string="Зургийн тоо", compute="_compute_attachment_counts")
    audio_count = fields.Integer(string="Дуу бичлэгийн тоо", compute="_compute_attachment_counts")
    state = fields.Selection(
        [
            ("draft", "Ноорог"),
            ("submitted", "Илгээсэн"),
            ("under_review", "Хяналтад"),
            ("returned", "Буцаагдсан"),
            ("approved", "Баталгаажсан"),
        ],
        string="Төлөв",
        default="draft",
        required=True,
        tracking=True,
    )
    reviewed_by = fields.Many2one("res.users", string="Хянасан хэрэглэгч", readonly=True)
    approved_by = fields.Many2one("res.users", string="Баталсан хэрэглэгч", readonly=True)
    rejected_by = fields.Many2one("res.users", string="Буцаасан хэрэглэгч", readonly=True)
    rejection_reason = fields.Text(string="Буцаасан шалтгаан")
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        default=lambda self: self.env.company,
        required=True,
    )

    @api.depends("image_attachment_ids", "audio_attachment_ids")
    def _compute_attachment_counts(self):
        for report in self:
            report.image_count = len(report.image_attachment_ids)
            report.audio_count = len(report.audio_attachment_ids)

    @api.depends("reporter_id")
    def _compute_reporter_employee_id(self):
        for report in self:
            report.reporter_employee_id = report.reporter_id.employee_id if report.reporter_id else False

    @api.constrains("state", "report_summary", "rejection_reason", "image_attachment_ids")
    def _check_report_requirements(self):
        for report in self:
            if report.state in ("submitted", "under_review", "approved") and not report.report_summary:
                raise ValidationError("Тайлан илгээхэд тайлбар заавал оруулна.")
            if report.state == "returned" and not report.rejection_reason:
                raise ValidationError("Буцаах үед шалтгаан заавал оруулна.")
            work = report.task_id.municipal_work_id
            if report.state in ("submitted", "approved") and work and work.requires_photo and not report.image_attachment_ids:
                raise ValidationError("Энэ ажилд зураг хавсаргах шаардлагатай.")

    def _sync_municipal_report(self):
        for report in self.filtered("municipal_report_id"):
            values = {
                "description": report.report_summary,
                "actual_quantity": report.reported_quantity,
            }
            if report.image_attachment_ids:
                values["attachment_ids"] = [(6, 0, report.image_attachment_ids.ids)]
            report.municipal_report_id.write(values)

    def write(self, values):
        result = super().write(values)
        if {"report_summary", "reported_quantity", "image_attachment_ids"}.intersection(values):
            self._sync_municipal_report()
        return result

    def action_submit(self):
        for report in self:
            if not report.report_summary:
                raise UserError("Тайлан илгээхэд тайлбар заавал оруулна.")
            work = report.task_id.municipal_work_id
            if work and work.requires_photo and not report.image_attachment_ids:
                raise UserError("Энэ ажилд зураг хавсаргах шаардлагатай.")
        self._sync_municipal_report()
        self.write({"state": "submitted"})
        self.mapped("municipal_report_id").action_submit()
        return True

    def action_review(self):
        self.write({"state": "under_review", "reviewed_by": self.env.user.id})
        self.mapped("municipal_report_id").action_review()
        return True

    def action_return(self):
        for report in self:
            if not report.rejection_reason:
                raise UserError("Буцаах шалтгаан оруулна уу.")
        self.write({"state": "returned", "rejected_by": self.env.user.id})
        for municipal_report in self.mapped("municipal_report_id"):
            municipal_report.rejection_reason = municipal_report.rejection_reason or "Тайлан буцаагдсан."
            municipal_report.action_return()
        return True

    def action_approve(self):
        self._sync_municipal_report()
        self.write({"state": "approved", "approved_by": self.env.user.id})
        self.mapped("municipal_report_id").action_review()
        self.mapped("municipal_report_id").action_approve()
        return True

    def action_reset_to_draft(self):
        self.write(
            {
                "state": "draft",
                "reviewed_by": False,
                "approved_by": False,
                "rejected_by": False,
                "rejection_reason": False,
            }
        )
        self.mapped("municipal_report_id").action_reset_to_draft()
        return True
