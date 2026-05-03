# -*- coding: utf-8 -*-

from odoo import fields, models


class MunicipalVehicleDriverHistory(models.Model):
    _name = "municipal.vehicle.driver.history"
    _description = "Municipal Vehicle Driver Assignment History"
    _order = "date_start desc, id desc"

    vehicle_id = fields.Many2one(
        "fleet.vehicle",
        string="Машин техник",
        required=True,
        ondelete="cascade",
        index=True,
    )
    driver_id = fields.Many2one("hr.employee", string="Хариуцсан жолооч", required=True, index=True)
    date_start = fields.Date(string="Хариуцаж эхэлсэн огноо", required=True, default=fields.Date.context_today)
    date_end = fields.Date(string="Хариуцаж дууссан огноо")
    changed_by_id = fields.Many2one(
        "res.users",
        string="Өөрчилсөн хэрэглэгч",
        default=lambda self: self.env.user,
        readonly=True,
    )
    changed_date = fields.Datetime(
        string="Өөрчилсөн огноо",
        default=fields.Datetime.now,
        readonly=True,
    )
    note = fields.Text(string="Тайлбар")
    active = fields.Boolean(string="Идэвхтэй", default=True)
