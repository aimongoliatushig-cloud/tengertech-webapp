# -*- coding: utf-8 -*-

from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    repair_ceo_threshold_amount = fields.Float(
        string="Захирлын батлах дүнгийн босго",
        config_parameter="fleet_repair_workflow.repair_ceo_threshold_amount",
    )
    auto_base_insurance_reminder_days = fields.Integer(
        string="Даатгал дуусахаас өмнө сануулах хоног",
        default=30,
        config_parameter="municipal_repair_workflow.insurance_reminder_days",
    )
    auto_base_inspection_reminder_days = fields.Integer(
        string="Улсын үзлэг болохоос өмнө сануулах хоног",
        default=14,
        config_parameter="municipal_repair_workflow.inspection_reminder_days",
    )
    garbage_weight_sync_enabled = fields.Boolean(
        string="Жингийн мэдээлэл автоматаар татах",
        config_parameter="municipal_repair_workflow.garbage_weight_sync_enabled",
    )
    garbage_weight_sync_time = fields.Char(
        string="Жингийн мэдээлэл татах цаг",
        default="20:00",
        config_parameter="municipal_repair_workflow.garbage_weight_sync_time",
    )
    garbage_fuel_sync_enabled = fields.Boolean(
        string="Шатахууны мэдээлэл автоматаар татах",
        config_parameter="municipal_repair_workflow.garbage_fuel_sync_enabled",
    )
    garbage_fuel_sync_time = fields.Char(
        string="Шатахууны мэдээлэл татах цаг",
        default="20:30",
        config_parameter="municipal_repair_workflow.garbage_fuel_sync_time",
    )
