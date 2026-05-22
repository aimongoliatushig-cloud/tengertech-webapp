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
    report_summary = fields.Text(string="Тайлбар")
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

    def _weight_external_reference(self):
        self.ensure_one()
        return "ops-report:%s" % self.id

    def _weight_unit_text(self):
        self.ensure_one()
        task = self.task_id
        values = [
            self.task_measurement_unit_code,
        ]
        if self.task_measurement_unit_id:
            values.extend([self.task_measurement_unit_id.name, self.task_measurement_unit_id.display_name])
        if task:
            for field_name in ("ops_measurement_unit_code", "ops_measurement_unit"):
                if field_name in task._fields:
                    values.append(task[field_name])
            if "ops_measurement_unit_id" in task._fields and task.ops_measurement_unit_id:
                values.extend(
                    [
                        task.ops_measurement_unit_id.name,
                        task.ops_measurement_unit_id.code,
                        task.ops_measurement_unit_id.category,
                    ]
                )
            if task.municipal_work_id:
                values.append(task.municipal_work_id.unit_of_measure)
        return " ".join(str(value or "") for value in values).lower()

    def _reported_quantity_as_kg(self):
        self.ensure_one()
        quantity = self.reported_quantity or 0.0
        if quantity <= 0:
            return 0.0

        task = self.task_id
        if not task or task.mfo_operation_type not in ("garbage", "garbage_seasonal"):
            return 0.0

        unit_text = self._weight_unit_text()
        compact_unit = "".join(unit_text.split())
        if any(token in compact_unit for token in ("тонн", "тон", "тн", "ton", "tn")):
            return quantity * 1000
        if any(token in compact_unit for token in ("кг", "kg", "килограмм", "kilogram")):
            return quantity
        return 0.0

    def _sync_daily_weight_totals(self):
        weight_model = self.env["mfo.daily.weight.total"].sudo()
        for report in self:
            external_reference = report._weight_external_reference()
            existing = weight_model.search([("external_reference", "=", external_reference)], limit=1)
            net_weight_total = report._reported_quantity_as_kg()
            if not net_weight_total or report.state == "returned":
                if existing:
                    existing.unlink()
                continue

            values = {
                "task_id": report.task_id.id,
                "net_weight_total": net_weight_total,
                "source": "manual",
                "external_reference": external_reference,
                "note": (report.report_summary or "")[:500],
            }
            if existing:
                existing.write(values)
            else:
                weight_model.create(values)

    @api.constrains("state", "report_summary", "rejection_reason", "image_attachment_ids")
    def _check_report_requirements(self):
        for report in self:
            if (
                report.state in ("submitted", "under_review", "approved")
                and not report.report_summary
                and report._requires_report_summary()
            ):
                raise ValidationError("Тайлан илгээхэд тайлбар заавал оруулна.")
            if report.state == "returned" and not report.rejection_reason:
                raise ValidationError("Буцаах үед шалтгаан заавал оруулна.")
            work = report.task_id.municipal_work_id
            if report.state in ("submitted", "approved") and work and work.requires_photo and not report.image_attachment_ids:
                raise ValidationError("Энэ ажилд зураг хавсаргах шаардлагатай.")

    def _requires_report_summary(self):
        self.ensure_one()
        return self.task_id.mfo_operation_type not in ("garbage", "garbage_seasonal")

    def _sync_municipal_report(self):
        for report in self.filtered("municipal_report_id"):
            values = {
                "description": report.report_summary,
                "actual_quantity": report.reported_quantity,
            }
            if report.image_attachment_ids:
                values["attachment_ids"] = [(6, 0, report.image_attachment_ids.ids)]
            report.municipal_report_id.write(values)

    @api.model_create_multi
    def create(self, vals_list):
        reports = super().create(vals_list)
        reports._sync_daily_weight_totals()
        return reports

    def write(self, values):
        result = super().write(values)
        if {"report_summary", "reported_quantity", "image_attachment_ids"}.intersection(values):
            self._sync_municipal_report()
        if {
            "report_summary",
            "reported_quantity",
            "task_id",
            "state",
            "task_measurement_unit_code",
            "task_measurement_unit_id",
        }.intersection(values):
            self._sync_daily_weight_totals()
        return result

    def unlink(self):
        references = ["ops-report:%s" % report_id for report_id in self.ids]
        if references:
            self.env["mfo.daily.weight.total"].sudo().search(
                [("external_reference", "in", references)]
            ).unlink()
        return super().unlink()

    def action_submit(self):
        for report in self:
            if not report.report_summary and report._requires_report_summary():
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
