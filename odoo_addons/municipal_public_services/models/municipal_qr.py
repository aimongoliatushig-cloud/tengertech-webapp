# -*- coding: utf-8 -*-

from uuid import uuid4

from odoo import api, fields, models


class MunicipalQrMixin(models.AbstractModel):
    _name = "municipal.qr.mixin"
    _description = "Municipal QR Mixin"

    qr_code = fields.Char(string="QR код", copy=False, index=True)
    qr_token = fields.Char(string="QR token", copy=False, index=True)
    qr_url = fields.Char(string="QR холбоос", compute="_compute_qr_url", store=True)

    def _municipal_qr_slug(self):
        return self._name.replace(".", "-")

    @api.depends("qr_token")
    def _compute_qr_url(self):
        for record in self:
            record.qr_url = (
                "/mobile/qr/%s/%s" % (record._municipal_qr_slug(), record.qr_token)
                if record.qr_token
                else False
            )

    def action_generate_qr_token(self):
        for record in self:
            if not record.qr_token:
                token = uuid4().hex
                record.write({"qr_token": token, "qr_code": token})
        return True


class MunicipalWork(models.Model):
    _name = "municipal.work"
    _inherit = ["municipal.work", "municipal.qr.mixin"]


class FleetVehicle(models.Model):
    _name = "fleet.vehicle"
    _inherit = ["fleet.vehicle", "municipal.qr.mixin"]


class MfoRoute(models.Model):
    _name = "mfo.route"
    _inherit = ["mfo.route", "municipal.qr.mixin"]


class MunicipalRepairRequest(models.Model):
    _name = "municipal.repair.request"
    _inherit = ["municipal.repair.request", "municipal.qr.mixin"]
