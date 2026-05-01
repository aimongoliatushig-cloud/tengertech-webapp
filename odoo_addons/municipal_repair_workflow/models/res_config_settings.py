# -*- coding: utf-8 -*-

from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    repair_ceo_threshold_amount = fields.Float(
        string="Захирлын батлах дүнгийн босго",
        config_parameter="fleet_repair_workflow.repair_ceo_threshold_amount",
    )
