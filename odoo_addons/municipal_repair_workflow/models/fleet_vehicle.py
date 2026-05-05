# -*- coding: utf-8 -*-

from odoo import api, fields, models


class FleetVehicle(models.Model):
    _inherit = "fleet.vehicle"

    municipal_vehicle_type_id = fields.Many2one(
        "municipal.vehicle.type",
        string="Машин техникийн төрөл",
        tracking=True,
    )
    municipal_department_id = fields.Many2one("hr.department", string="Хэлтэс", tracking=True)
    municipal_responsible_driver_id = fields.Many2one(
        "hr.employee",
        string="Хариуцсан жолооч",
        tracking=True,
    )
    municipal_loader_1_id = fields.Many2one(
        "hr.employee",
        string="Ачигч 1",
        tracking=True,
    )
    municipal_loader_2_id = fields.Many2one(
        "hr.employee",
        string="Ачигч 2",
        tracking=True,
    )
    municipal_driver_history_ids = fields.One2many(
        "municipal.vehicle.driver.history",
        "vehicle_id",
        string="Жолоочийн хариуцалтын түүх",
    )
    x_municipal_operational_status = fields.Selection(
        [
            ("available", "Ашиглах боломжтой"),
            ("assigned", "Оноогдсон"),
            ("in_repair", "Засварт байгаа"),
            ("broken", "Эвдэрсэн"),
            ("retired", "Ашиглалтаас гарсан"),
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
    municipal_insurance_company = fields.Char(string="Даатгалын компани", tracking=True)
    municipal_insurance_policy_number = fields.Char(string="Даатгалын гэрээний дугаар", tracking=True)
    municipal_insurance_date_start = fields.Date(string="Даатгал эхлэх огноо", tracking=True)
    municipal_insurance_date_end = fields.Date(string="Даатгал дуусах огноо", tracking=True)
    municipal_insurance_attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_vehicle_insurance_attachment_rel",
        "vehicle_id",
        "attachment_id",
        string="Даатгалын баримт",
    )
    municipal_insurance_note = fields.Text(string="Даатгалын тайлбар")
    municipal_insurance_days_remaining = fields.Integer(
        string="Даатгалын үлдсэн хоног",
        compute="_compute_municipal_deadline_status",
    )
    municipal_insurance_reminder_due = fields.Boolean(
        string="Даатгалын сануулга",
        compute="_compute_municipal_deadline_status",
        search="_search_municipal_insurance_reminder_due",
    )
    municipal_inspection_date = fields.Date(string="Улсын үзлэгт орсон огноо", tracking=True)
    municipal_next_inspection_date = fields.Date(string="Дараагийн үзлэгт орох огноо", tracking=True)
    municipal_inspection_attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_vehicle_inspection_attachment_rel",
        "vehicle_id",
        "attachment_id",
        string="Үзлэгийн баримт",
    )
    municipal_inspection_note = fields.Text(string="Улсын үзлэгийн тайлбар")
    municipal_photo_front_attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_vehicle_photo_front_attachment_rel",
        "vehicle_id",
        "attachment_id",
        string="Урд талаас авсан зураг",
    )
    municipal_photo_left_attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_vehicle_photo_left_attachment_rel",
        "vehicle_id",
        "attachment_id",
        string="Зүүн талаас авсан зураг",
    )
    municipal_photo_right_attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_vehicle_photo_right_attachment_rel",
        "vehicle_id",
        "attachment_id",
        string="Баруун талаас авсан зураг",
    )
    municipal_certificate_attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_vehicle_certificate_attachment_rel",
        "vehicle_id",
        "attachment_id",
        string="Гэрчилгээний баримт",
    )
    municipal_other_document_attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_vehicle_other_document_attachment_rel",
        "vehicle_id",
        "attachment_id",
        string="Бусад бичиг баримт",
    )
    municipal_inspection_days_remaining = fields.Integer(
        string="Үзлэгийн үлдсэн хоног",
        compute="_compute_municipal_deadline_status",
    )
    municipal_inspection_reminder_due = fields.Boolean(
        string="Үзлэгийн сануулга",
        compute="_compute_municipal_deadline_status",
        search="_search_municipal_inspection_reminder_due",
    )
    municipal_garbage_weight_report_ids = fields.One2many(
        "municipal.garbage.weight.report",
        "vehicle_id",
        string="Хог ачалтын жингийн тайлан",
    )
    municipal_garbage_fuel_report_ids = fields.One2many(
        "municipal.garbage.fuel.report",
        "vehicle_id",
        string="Шатахууны мэдээлэл",
    )
    municipal_procurement_request_ids = fields.One2many(
        "municipal.procurement.request",
        "vehicle_id",
        string="Худалдан авалтын холбоос",
    )

    @api.model_create_multi
    def create(self, vals_list):
        vehicles = super().create(vals_list)
        today = fields.Date.context_today(self)
        for vehicle, vals in zip(vehicles, vals_list):
            driver_id = vals.get("municipal_responsible_driver_id")
            if driver_id:
                self.env["municipal.vehicle.driver.history"].create(
                    {
                        "vehicle_id": vehicle.id,
                        "driver_id": driver_id,
                        "date_start": today,
                        "changed_by_id": self.env.user.id,
                    }
                )
        return vehicles

    def write(self, vals):
        tracked_driver = "municipal_responsible_driver_id" in vals
        previous_driver_by_vehicle = {
            vehicle.id: vehicle.municipal_responsible_driver_id.id
            for vehicle in self
        } if tracked_driver else {}
        result = super().write(vals)
        if tracked_driver:
            self._sync_driver_assignment_history(previous_driver_by_vehicle)
        return result

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

    def _sync_driver_assignment_history(self, previous_driver_by_vehicle):
        today = fields.Date.context_today(self)
        history_model = self.env["municipal.vehicle.driver.history"]
        for vehicle in self:
            previous_driver_id = previous_driver_by_vehicle.get(vehicle.id)
            current_driver_id = vehicle.municipal_responsible_driver_id.id
            if previous_driver_id == current_driver_id:
                continue

            open_history = history_model.search(
                [
                    ("vehicle_id", "=", vehicle.id),
                    ("date_end", "=", False),
                ]
            )
            open_history.write({"date_end": today})

            if current_driver_id:
                history_model.create(
                    {
                        "vehicle_id": vehicle.id,
                        "driver_id": current_driver_id,
                        "date_start": today,
                        "changed_by_id": self.env.user.id,
                    }
                )

    def _deadline_days(self, target_date):
        if not target_date:
            return 0
        return (target_date - fields.Date.context_today(self)).days

    def _deadline_due_domain(self, field_name, parameter_name, operator, value):
        reminder_days = int(
            self.env["ir.config_parameter"].sudo().get_param(parameter_name, "0") or 0
        )
        target_date = fields.Date.context_today(self)
        max_date = fields.Date.add(target_date, days=max(reminder_days, 0))
        due_domain = [(field_name, "!=", False), (field_name, "<=", max_date)]
        if (operator == "=" and value) or (operator == "!=" and not value):
            return due_domain
        return ["|", (field_name, "=", False), (field_name, ">", max_date)]

    def _search_municipal_insurance_reminder_due(self, operator, value):
        return self._deadline_due_domain(
            "municipal_insurance_date_end",
            "municipal_repair_workflow.insurance_reminder_days",
            operator,
            value,
        )

    def _search_municipal_inspection_reminder_due(self, operator, value):
        return self._deadline_due_domain(
            "municipal_next_inspection_date",
            "municipal_repair_workflow.inspection_reminder_days",
            operator,
            value,
        )

    @api.depends("municipal_insurance_date_end", "municipal_next_inspection_date")
    def _compute_municipal_deadline_status(self):
        params = self.env["ir.config_parameter"].sudo()
        insurance_days = int(params.get_param("municipal_repair_workflow.insurance_reminder_days", "30") or 30)
        inspection_days = int(params.get_param("municipal_repair_workflow.inspection_reminder_days", "14") or 14)
        today = fields.Date.context_today(self)
        for vehicle in self:
            insurance_remaining = (
                (vehicle.municipal_insurance_date_end - today).days
                if vehicle.municipal_insurance_date_end
                else 0
            )
            inspection_remaining = (
                (vehicle.municipal_next_inspection_date - today).days
                if vehicle.municipal_next_inspection_date
                else 0
            )
            vehicle.municipal_insurance_days_remaining = insurance_remaining
            vehicle.municipal_insurance_reminder_due = bool(
                vehicle.municipal_insurance_date_end and insurance_remaining <= insurance_days
            )
            vehicle.municipal_inspection_days_remaining = inspection_remaining
            vehicle.municipal_inspection_reminder_due = bool(
                vehicle.municipal_next_inspection_date and inspection_remaining <= inspection_days
            )

    def action_send_deadline_reminder_activity(self):
        for vehicle in self:
            manager_user = vehicle.municipal_department_id.manager_id.user_id
            if not manager_user:
                continue
            parts = []
            if vehicle.municipal_insurance_reminder_due:
                parts.append(
                    "Даатгал %s өдөр дуусна. Үлдсэн хоног: %s."
                    % (vehicle.municipal_insurance_date_end, vehicle.municipal_insurance_days_remaining)
                )
            if vehicle.municipal_inspection_reminder_due:
                parts.append(
                    "Улсын үзлэг %s өдөр болно. Үлдсэн хоног: %s."
                    % (vehicle.municipal_next_inspection_date, vehicle.municipal_inspection_days_remaining)
                )
            if not parts:
                continue
            vehicle.activity_schedule(
                "mail.mail_activity_data_warning",
                user_id=manager_user.id,
                note="%s улсын дугаартай %s. %s" % (
                    vehicle.license_plate or vehicle.name,
                    vehicle.municipal_vehicle_type_id.name or "машин",
                    " ".join(parts),
                ),
            )
        return True

    @api.model
    def _cron_send_deadline_reminders(self):
        vehicles = self.search(
            [
                "|",
                ("municipal_insurance_reminder_due", "=", True),
                ("municipal_inspection_reminder_due", "=", True),
            ]
        )
        return vehicles.action_send_deadline_reminder_activity()
