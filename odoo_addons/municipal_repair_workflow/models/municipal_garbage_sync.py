# -*- coding: utf-8 -*-

import os
from datetime import datetime
from zoneinfo import ZoneInfo

import requests

from odoo import api, fields, models


class MunicipalGarbageWeightReport(models.Model):
    _name = "municipal.garbage.weight.report"
    _description = "Municipal Garbage Truck Daily Weight Report"
    _order = "report_date desc, id desc"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(string="Нэр", compute="_compute_name", store=True)
    report_date = fields.Date(string="Огноо", required=True, index=True)
    vehicle_id = fields.Many2one("fleet.vehicle", string="Машин", index=True, ondelete="set null")
    vehicle_license_plate = fields.Char(string="Машины улсын дугаар", index=True)
    vehicle_type_id = fields.Many2one(
        "municipal.vehicle.type",
        string="Машины төрөл",
        related="vehicle_id.municipal_vehicle_type_id",
        store=True,
        readonly=True,
    )
    weight = fields.Float(string="Жин")
    unit = fields.Selection(
        [("kg", "кг"), ("ton", "тонн")],
        string="Нэгж",
        default="kg",
        required=True,
    )
    source = fields.Char(string="Эх сурвалж", default="Гадны систем")
    fetched_at = fields.Datetime(string="Татсан огноо", default=fields.Datetime.now, index=True)
    state = fields.Selection(
        [("success", "Амжилттай"), ("failed", "Алдаатай")],
        string="Төлөв",
        default="success",
        required=True,
        tracking=True,
    )
    error_message = fields.Text(string="Алдааны мэдээлэл")

    @api.depends("report_date", "vehicle_license_plate", "vehicle_id", "state")
    def _compute_name(self):
        for report in self:
            plate = report.vehicle_license_plate or report.vehicle_id.license_plate or report.vehicle_id.name or "Машин"
            report.name = "%s - %s - %s" % (plate, report.report_date or "", report.state or "")


class MunicipalGarbageFuelReport(models.Model):
    _name = "municipal.garbage.fuel.report"
    _description = "Municipal Garbage Truck Daily Fuel Report"
    _order = "report_date desc, id desc"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(string="Нэр", compute="_compute_name", store=True)
    report_date = fields.Date(string="Огноо", required=True, index=True)
    vehicle_id = fields.Many2one("fleet.vehicle", string="Машин", index=True, ondelete="set null")
    vehicle_license_plate = fields.Char(string="Машины улсын дугаар", index=True)
    vehicle_type_id = fields.Many2one(
        "municipal.vehicle.type",
        string="Машины төрөл",
        related="vehicle_id.municipal_vehicle_type_id",
        store=True,
        readonly=True,
    )
    fuel_liters = fields.Float(string="Зарцуулсан шатахуун")
    fuel_type = fields.Char(string="Түлшний төрөл")
    source = fields.Char(string="Эх сурвалж", default="Гадны систем")
    fetched_at = fields.Datetime(string="Татсан огноо", default=fields.Datetime.now, index=True)
    state = fields.Selection(
        [("success", "Амжилттай"), ("failed", "Алдаатай")],
        string="Төлөв",
        default="success",
        required=True,
        tracking=True,
    )
    error_message = fields.Text(string="Алдааны мэдээлэл")

    @api.depends("report_date", "vehicle_license_plate", "vehicle_id", "state")
    def _compute_name(self):
        for report in self:
            plate = report.vehicle_license_plate or report.vehicle_id.license_plate or report.vehicle_id.name or "Машин"
            report.name = "%s - %s - %s" % (plate, report.report_date or "", report.state or "")


class MunicipalGarbageSyncLog(models.Model):
    _name = "municipal.garbage.sync.log"
    _description = "Municipal Garbage External Sync Log"
    _order = "run_at desc, id desc"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(string="Нэр", compute="_compute_name", store=True)
    sync_type = fields.Selection(
        [("weight", "Жингийн мэдээлэл"), ("fuel", "Шатахууны мэдээлэл")],
        string="Таталтын төрөл",
        required=True,
        index=True,
    )
    run_at = fields.Datetime(string="Татсан огноо", default=fields.Datetime.now, required=True, index=True)
    state = fields.Selection(
        [("success", "Амжилттай"), ("failed", "Алдаатай")],
        string="Төлөв",
        default="success",
        required=True,
        tracking=True,
    )
    record_count = fields.Integer(string="Амжилттай мөр")
    error_message = fields.Text(string="Алдааны мэдээлэл")

    @api.depends("sync_type", "run_at", "state")
    def _compute_name(self):
        labels = dict(self._fields["sync_type"].selection)
        for log in self:
            log.name = "%s - %s - %s" % (
                labels.get(log.sync_type, log.sync_type),
                log.run_at or "",
                log.state or "",
            )

    @api.model
    def _cron_fetch_weight_reports(self):
        if not self._config_bool("municipal_repair_workflow.garbage_weight_sync_enabled"):
            return False
        if not self._configured_time_due("weight"):
            return False
        return self._fetch_external_reports("weight")

    @api.model
    def _cron_fetch_fuel_reports(self):
        if not self._config_bool("municipal_repair_workflow.garbage_fuel_sync_enabled"):
            return False
        if not self._configured_time_due("fuel"):
            return False
        return self._fetch_external_reports("fuel")

    @api.model
    def _config_bool(self, key):
        return self.env["ir.config_parameter"].sudo().get_param(key, "False") in ("1", "True", "true")

    @api.model
    def _configured_time_due(self, sync_type):
        params = self.env["ir.config_parameter"].sudo()
        time_key = "municipal_repair_workflow.garbage_%s_sync_time" % sync_type
        configured_time = params.get_param(time_key, "20:00" if sync_type == "weight" else "20:30")
        try:
            hour, minute = [int(part) for part in configured_time.split(":", 1)]
        except Exception:
            hour, minute = (20, 0) if sync_type == "weight" else (20, 30)

        now = datetime.now(ZoneInfo(os.getenv("APP_TIME_ZONE", "Asia/Ulaanbaatar")))
        configured_minutes = hour * 60 + minute
        current_minutes = now.hour * 60 + now.minute
        if current_minutes < configured_minutes:
            return False

        last_success = params.get_param(
            "municipal_repair_workflow.garbage_%s_last_success_at" % sync_type,
            "",
        )
        return not last_success.startswith(now.date().isoformat())

    @api.model
    def _fetch_external_reports(self, sync_type):
        url_key = "GARBAGE_WEIGHT_API_URL" if sync_type == "weight" else "GARBAGE_FUEL_API_URL"
        url = os.getenv(url_key)
        username = os.getenv("GARBAGE_API_USERNAME")
        password = os.getenv("GARBAGE_API_PASSWORD")

        if not url:
            return self._create_failure(sync_type, "%s тохируулаагүй байна." % url_key)

        try:
            response = requests.get(
                url,
                auth=(username, password) if username or password else None,
                timeout=30,
            )
            response.raise_for_status()
            payload = response.json()
            rows = self._payload_rows(payload)
            count = self._upsert_report_rows(sync_type, rows)
            self.env["ir.config_parameter"].sudo().set_param(
                "municipal_repair_workflow.garbage_%s_last_success_at" % sync_type,
                fields.Datetime.to_string(fields.Datetime.now()),
            )
            self.create({"sync_type": sync_type, "state": "success", "record_count": count})
            return True
        except Exception as error:  # pragma: no cover - external integration guard
            self._create_failure(sync_type, str(error))
            return False

    @api.model
    def _create_failure(self, sync_type, message):
        log = self.create(
            {
                "sync_type": sync_type,
                "state": "failed",
                "error_message": message,
            }
        )
        log.message_post(body="Гадны системээс мэдээлэл татахад алдаа гарлаа: %s" % message)
        return False

    @api.model
    def _payload_rows(self, payload):
        if isinstance(payload, list):
            return payload
        if not isinstance(payload, dict):
            return []
        for key in ("records", "data", "items", "results", "rows"):
            value = payload.get(key)
            if isinstance(value, list):
                return value
        return []

    @api.model
    def _text_value(self, row, keys):
        for key in keys:
            value = row.get(key)
            if value not in (None, False, ""):
                return str(value).strip()
        return ""

    @api.model
    def _float_value(self, row, keys):
        for key in keys:
            value = row.get(key)
            if value in (None, False, ""):
                continue
            try:
                return float(value)
            except (TypeError, ValueError):
                continue
        return 0.0

    @api.model
    def _unit_value(self, row):
        value = self._text_value(row, ["unit", "uom"]).lower()
        if value in ("ton", "tons", "tonne", "тн", "тонн"):
            return "ton"
        return "kg"

    @api.model
    def _date_value(self, row):
        value = self._text_value(row, ["date", "report_date", "ognoo"])
        return value[:10] if value else fields.Date.context_today(self)

    @api.model
    def _garbage_vehicle_by_plate(self, plate):
        if not plate:
            return self.env["fleet.vehicle"]
        return self.env["fleet.vehicle"].search(
            [
                ("license_plate", "=", plate),
                "|",
                ("municipal_vehicle_type_id.is_garbage_truck", "=", True),
                ("category_id.name", "ilike", "хог"),
            ],
            limit=1,
        )

    @api.model
    def _upsert_report_rows(self, sync_type, rows):
        report_model = self.env[
            "municipal.garbage.weight.report"
            if sync_type == "weight"
            else "municipal.garbage.fuel.report"
        ]
        success_count = 0
        for row in rows:
            if not isinstance(row, dict):
                continue

            plate = self._text_value(row, ["license_plate", "plate", "vehicle_plate", "car_number", "ulsiin_dugaar"])
            vehicle = self._garbage_vehicle_by_plate(plate)
            report_date = self._date_value(row)
            source = self._text_value(row, ["source", "system", "provider"]) or "Гадны систем"
            values = {
                "report_date": report_date,
                "vehicle_id": vehicle.id or False,
                "vehicle_license_plate": plate,
                "source": source,
                "fetched_at": fields.Datetime.now(),
                "state": "success" if vehicle else "failed",
                "error_message": "" if vehicle else "Хогны машин олдсонгүй.",
            }
            if sync_type == "weight":
                values.update(
                    {
                        "weight": self._float_value(row, ["weight", "kg", "ton", "net_weight", "net_weight_total"]),
                        "unit": self._unit_value(row),
                    }
                )
            else:
                values.update(
                    {
                        "fuel_liters": self._float_value(row, ["fuel_liters", "liters", "fuel", "zarcuulsan_shatahuun"]),
                        "fuel_type": self._text_value(row, ["fuel_type", "type"]) or "",
                    }
                )

            existing = report_model.search(
                [
                    ("report_date", "=", report_date),
                    ("vehicle_license_plate", "=", plate),
                    ("source", "=", source),
                ],
                limit=1,
            )
            if existing:
                existing.write(values)
            else:
                existing = report_model.create(values)
            if values["state"] == "failed":
                self._notify_department_head(vehicle, values["error_message"])
            else:
                success_count += 1
        return success_count

    @api.model
    def _notify_department_head(self, vehicle, note):
        if not vehicle or not vehicle.exists() or not vehicle.municipal_department_id.manager_id.user_id:
            return
        vehicle.activity_schedule(
            "mail.mail_activity_data_warning",
            user_id=vehicle.municipal_department_id.manager_id.user_id.id,
            note=note,
        )
