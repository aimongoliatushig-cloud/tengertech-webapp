# -*- coding: utf-8 -*-

from odoo import fields, models


class MunicipalVehicleType(models.Model):
    _name = "municipal.vehicle.type"
    _description = "Municipal Vehicle Type"
    _order = "sequence, name"

    name = fields.Char(string="Машин техникийн төрөл", required=True, translate=True)
    code = fields.Char(string="Код")
    sequence = fields.Integer(string="Дараалал", default=10)
    is_garbage_truck = fields.Boolean(string="Хогны машин")
    description = fields.Text(string="Тайлбар")
    active = fields.Boolean(string="Идэвхтэй", default=True)

    _sql_constraints = [
        (
            "municipal_vehicle_type_name_unique",
            "unique(name)",
            "Машин техникийн төрөл давхардахгүй байна.",
        ),
    ]
