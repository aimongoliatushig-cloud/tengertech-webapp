# -*- coding: utf-8 -*-

from odoo import fields, models


class FleetVehicle(models.Model):
    _inherit = "fleet.vehicle"

    x_municipal_operational_status = fields.Selection(
        [
            ("available", "Ашиглах боломжтой"),
            ("assigned", "Оноогдсон"),
            ("in_repair", "Засварт байгаа"),
            ("inactive", "Идэвхгүй"),
        ],
        string="Ашиглалтын төлөв",
        default="available",
        tracking=True,
    )
    municipal_repair_request_ids = fields.One2many(
        "municipal.repair.request",
        "vehicle_id",
        string="Засварын хүсэлт",
    )
    municipal_active_repair_count = fields.Integer(
        string="Идэвхтэй засвар",
        compute="_compute_municipal_repair_counts",
    )

    def _compute_municipal_repair_counts(self):
        repair_model = self.env["municipal.repair.request"]
        groups = repair_model.read_group(
            [
                ("vehicle_id", "in", self.ids),
                ("state", "in", ["new", "diagnosed", "waiting_parts", "waiting_approval", "approved", "in_repair"]),
            ],
            ["vehicle_id"],
            ["vehicle_id"],
        )
        counts = {
            item["vehicle_id"][0]: item["vehicle_id_count"]
            for item in groups
            if item.get("vehicle_id")
        }
        for vehicle in self:
            vehicle.municipal_active_repair_count = counts.get(vehicle.id, 0)
