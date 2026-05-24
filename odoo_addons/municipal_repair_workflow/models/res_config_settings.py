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
        default="00:00",
        config_parameter="municipal_repair_workflow.garbage_weight_sync_time",
    )
    garbage_weight_api_url = fields.Char(
        string="Жингийн мэдээлэл татах API URL",
        config_parameter="municipal_repair_workflow.garbage_weight_api_url",
    )
    wrs_import_app_base_url = fields.Char(
        string="WRS таталт хийх web app URL",
        config_parameter="municipal_repair_workflow.wrs_import_app_base_url",
    )
    wrs_sync_token = fields.Char(
        string="WRS таталтын token",
        config_parameter="municipal_repair_workflow.wrs_sync_token",
    )
    gaiham_sync_token = fields.Char(
        string="Гайхам таталтын token",
        config_parameter="municipal_repair_workflow.gaiham_sync_token",
    )
    garbage_fuel_sync_enabled = fields.Boolean(
        string="Шатахууны мэдээлэл автоматаар татах",
        config_parameter="municipal_repair_workflow.garbage_fuel_sync_enabled",
    )
    garbage_fuel_sync_time = fields.Char(
        string="Шатахууны мэдээлэл татах цаг",
        default="12:00",
        config_parameter="municipal_repair_workflow.garbage_fuel_sync_time",
    )
    garbage_fuel_api_url = fields.Char(
        string="Шатахууны мэдээлэл татах API URL",
        config_parameter="municipal_repair_workflow.garbage_fuel_api_url",
    )
