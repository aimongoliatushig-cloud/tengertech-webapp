# -*- coding: utf-8 -*-

import json
import os
from datetime import datetime, timedelta
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
    department_id = fields.Many2one("hr.department", string="Хэлтэс", index=True, ondelete="set null")
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
    department_id = fields.Many2one("hr.department", string="Хэлтэс", index=True, ondelete="set null")
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
        default_value = "True" if key in (
            "municipal_repair_workflow.garbage_weight_sync_enabled",
            "municipal_repair_workflow.garbage_fuel_sync_enabled",
        ) else "False"
        return self.env["ir.config_parameter"].sudo().get_param(key, default_value) in ("1", "True", "true")

    @api.model
    def _configured_time_due(self, sync_type):
        params = self.env["ir.config_parameter"].sudo()
        time_key = "municipal_repair_workflow.garbage_%s_sync_time" % sync_type
        default_time = "23:00"
        legacy_default_time = "20:00" if sync_type == "weight" else "20:30"
        configured_time = params.get_param(time_key, default_time)
        if (
            configured_time == legacy_default_time
            or configured_time == "11:00"
            or configured_time == "12:00"
            or (sync_type == "fuel" and configured_time == "00:15")
            or (sync_type == "weight" and configured_time == "00:00")
        ):
            configured_time = default_time
        try:
            hour, minute = [int(part) for part in configured_time.split(":", 1)]
        except Exception:
            hour, minute = (23, 0)

        now = self._local_now()
        configured_minutes = hour * 60 + minute
        current_minutes = now.hour * 60 + now.minute
        if current_minutes < configured_minutes:
            return False

        return bool(self._pending_report_dates(sync_type))

    @api.model
    def _local_now(self):
        return datetime.now(ZoneInfo(os.getenv("APP_TIME_ZONE", "Asia/Ulaanbaatar")))

    @api.model
    def _target_report_date(self):
        return self._local_now().date().isoformat()

    @api.model
    def _date_from_iso(self, value):
        try:
            return datetime.strptime(value or "", "%Y-%m-%d").date()
        except Exception:
            return None

    @api.model
    def _max_backfill_days(self):
        try:
            max_backfill_days = int(os.getenv("GARBAGE_SYNC_MAX_BACKFILL_DAYS", "14") or "14")
        except Exception:
            max_backfill_days = 14
        return max(1, min(max_backfill_days, 31))

    @api.model
    def _success_dates_param_key(self, sync_type):
        return "municipal_repair_workflow.garbage_%s_success_target_dates" % sync_type

    @api.model
    def _successful_report_dates(self, sync_type):
        raw_value = (
            self.env["ir.config_parameter"].sudo().get_param(
                self._success_dates_param_key(sync_type),
                "[]",
            )
            or "[]"
        )
        try:
            values = json.loads(raw_value)
        except Exception:
            values = [value.strip() for value in raw_value.split(",") if value.strip()]
        return {
            value
            for value in values
            if isinstance(value, str) and self._date_from_iso(value)
        }

    @api.model
    def _mark_report_date_success(self, sync_type, target_date):
        params = self.env["ir.config_parameter"].sudo()
        success_dates = self._successful_report_dates(sync_type)
        success_dates.add(target_date)

        target = self._date_from_iso(self._target_report_date())
        if target:
            keep_from = target - timedelta(days=max(self._max_backfill_days(), 45))
            success_dates = {
                value
                for value in success_dates
                if self._date_from_iso(value) and self._date_from_iso(value) >= keep_from
            }

        ordered_dates = sorted(success_dates)
        params.set_param(self._success_dates_param_key(sync_type), json.dumps(ordered_dates))
        if ordered_dates:
            params.set_param(
                "municipal_repair_workflow.garbage_%s_last_success_target_date" % sync_type,
                ordered_dates[-1],
            )

    @api.model
    def _pending_report_dates(self, sync_type):
        target_date = self._date_from_iso(self._target_report_date())
        if not target_date:
            return []

        params = self.env["ir.config_parameter"].sudo()
        max_backfill_days = self._max_backfill_days()
        window_start_date = target_date - timedelta(days=max_backfill_days - 1)
        success_dates = self._successful_report_dates(sync_type)
        last_target_date = self._date_from_iso(
            params.get_param(
                "municipal_repair_workflow.garbage_%s_last_success_target_date" % sync_type,
                "",
            )
        )
        latest_success_date = None
        for success_date in success_dates:
            parsed_success_date = self._date_from_iso(success_date)
            if parsed_success_date and (not latest_success_date or parsed_success_date > latest_success_date):
                latest_success_date = parsed_success_date

        latest_known_success_date = max(
            [date_value for date_value in (last_target_date, latest_success_date) if date_value],
            default=None,
        )
        if latest_known_success_date and latest_known_success_date >= target_date:
            return []
        if latest_known_success_date and latest_known_success_date < target_date:
            start_date = max(latest_known_success_date + timedelta(days=1), window_start_date)
        else:
            start_date = target_date

        dates = []
        current_date = start_date
        while current_date <= target_date:
            current_date_key = current_date.isoformat()
            if current_date_key not in success_dates:
                dates.append(current_date_key)
            current_date += timedelta(days=1)
        return dates

    @api.model
    def _external_request_timeout(self, delegated_wrs_import=False):
        default_timeout = "240" if delegated_wrs_import else "90"
        try:
            return max(30, int(os.getenv("GARBAGE_API_TIMEOUT_SECONDS", default_timeout) or default_timeout))
        except Exception:
            return int(default_timeout)

    @api.model
    def _delegated_payload_unmatched_count(self, payload, total_rows=0, imported_count=0):
        if not isinstance(payload, dict):
            return 0

        unmatched_count = 0
        for key in (
            "unmatched",
            "unmatchedVehicles",
            "unmatched_vehicles",
            "failedVehicles",
            "failed_vehicles",
            "failedDates",
            "failed_dates",
        ):
            value = payload.get(key)
            if isinstance(value, (list, tuple)):
                unmatched_count += len(value)
            elif isinstance(value, dict):
                unmatched_count += len(value)
            elif isinstance(value, int):
                unmatched_count += max(0, value)

        for key in (
            "unmatchedCount",
            "unmatched_count",
            "failedVehicleCount",
            "failed_vehicle_count",
            "failedDateCount",
            "failed_date_count",
        ):
            try:
                unmatched_count += max(0, int(payload.get(key) or 0))
            except Exception:
                pass

        if total_rows and imported_count >= 0 and total_rows > imported_count:
            unmatched_count = max(unmatched_count, total_rows - imported_count)

        message_text = " ".join(
            str(payload.get(key) or "")
            for key in ("error", "errorMessage", "message", "warning", "warningMessage")
        ).lower()
        if unmatched_count <= 0 and (
            "таарсангүй" in message_text
            or "unmatched" in message_text
            or "олдсонгүй" in message_text
            or "failed" in message_text
        ):
            return -1

        return unmatched_count

    @api.model
    def _config_or_env(self, param_key, env_key):
        value = os.getenv(env_key)
        if value:
            return value.strip()
        return (
            self.env["ir.config_parameter"].sudo().get_param(param_key, "")
            or ""
        ).strip()

    @api.model
    def _wrs_sync_token(self):
        return self._config_or_env(
            "municipal_repair_workflow.wrs_sync_token",
            "WRS_SYNC_TOKEN",
        )

    @api.model
    def _app_sync_token(self, sync_type):
        if sync_type == "fuel":
            return self._config_or_env(
                "municipal_repair_workflow.gaiham_sync_token",
                "GAIHAM_SYNC_TOKEN",
            ) or self._wrs_sync_token()
        return self._wrs_sync_token()

    @api.model
    def _sync_lock_key(self, sync_type):
        return "municipal_repair_workflow.garbage_%s_cron_lock_at" % sync_type

    @api.model
    def _sync_lock_ttl_minutes(self):
        try:
            return max(10, int(os.getenv("GARBAGE_SYNC_LOCK_TTL_MINUTES", "55") or "55"))
        except Exception:
            return 55

    @api.model
    def _acquire_sync_lock(self, sync_type):
        params = self.env["ir.config_parameter"].sudo()
        key = self._sync_lock_key(sync_type)
        now = fields.Datetime.now()
        raw_lock_at = params.get_param(key, "")
        try:
            lock_at = fields.Datetime.from_string(raw_lock_at) if raw_lock_at else None
        except Exception:
            lock_at = None
        if lock_at and now - lock_at < timedelta(minutes=self._sync_lock_ttl_minutes()):
            return False
        params.set_param(key, fields.Datetime.to_string(now))
        return True

    @api.model
    def _release_sync_lock(self, sync_type):
        self.env["ir.config_parameter"].sudo().set_param(self._sync_lock_key(sync_type), "")

    @api.model
    def _fetch_external_report_date(
        self,
        sync_type,
        url,
        target_date,
        delegated_app_import=False,
        delegated_source_label="",
        app_sync_token="",
        username="",
        password="",
    ):
        headers = {}
        if delegated_app_import:
            headers["Authorization"] = "Bearer %s" % app_sync_token
        response = requests.get(
            url,
            auth=(username, password) if (username or password) and not delegated_app_import else None,
            params={"date": target_date},
            headers=headers,
            timeout=self._external_request_timeout(delegated_app_import),
        )
        if delegated_app_import:
            try:
                payload = response.json()
            except ValueError:
                payload = {}
            try:
                delegated_imported_count = int(
                    payload.get("imported")
                    or payload.get("recordCount")
                    or payload.get("record_count")
                    or payload.get("count")
                    or 0
                ) if isinstance(payload, dict) else 0
            except Exception:
                delegated_imported_count = 0
            partial_success_status = response.status_code == 409 and delegated_imported_count > 0
            if response.status_code >= 400 and not partial_success_status:
                raise ValueError(
                    payload.get("error")
                    if isinstance(payload, dict) and payload.get("error")
                    else "%s тайлан %s өдөр апп import HTTP %s алдаатай буцлаа. Дараагийн cron дахин татна."
                    % (delegated_source_label, target_date, response.status_code)
                )
        else:
            response.raise_for_status()
            payload = response.json()

        if delegated_app_import:
            if not isinstance(payload, dict):
                raise ValueError(
                    "%s тайлан %s өдөр апп import амжилтгүй буцлаа. Дараагийн cron дахин татна."
                    % (delegated_source_label, target_date)
                )
            try:
                total_rows = int(
                    payload.get("totalRows")
                    or payload.get("total_rows")
                    or payload.get("rows")
                    or 0
                )
            except Exception:
                total_rows = 0
            try:
                count = int(
                    payload.get("imported")
                    or payload.get("recordCount")
                    or payload.get("record_count")
                    or payload.get("count")
                    or 0
                )
            except Exception:
                count = 0
            if not payload.get("ok") and count <= 0:
                raise ValueError(
                    payload.get("error")
                    or "%s тайлан %s өдөр апп import амжилтгүй буцлаа. Дараагийн cron дахин татна."
                    % (delegated_source_label, target_date)
                )
            if total_rows <= 0:
                raise ValueError(
                    "%s тайлан %s өдөр 0 мөр буцаалаа. Дараагийн cron дахин татна."
                    % (delegated_source_label, target_date)
                )
            if count <= 0:
                raise ValueError(
                    "%s тайлан %s өдөр авто баазтай таарсан мөргүй байна. Дараагийн cron дахин татна."
                    % (delegated_source_label, target_date)
                )
            unmatched_count = self._delegated_payload_unmatched_count(payload, total_rows, count)
            if unmatched_count and count <= 0:
                count_label = str(unmatched_count) if unmatched_count > 0 else "зарим"
                raise ValueError(
                    "%s тайлан %s өдөр %s мөр авто баазтай таарсангүй. Дугаарыг засаад дараагийн cron дахин татна."
                    % (delegated_source_label, target_date, count_label)
                )
            return count

        rows = self._payload_rows(payload)
        return self._upsert_report_rows(sync_type, rows, target_date)

    @api.model
    def _fetch_external_reports(self, sync_type):
        url_key = "GARBAGE_WEIGHT_API_URL" if sync_type == "weight" else "GARBAGE_FUEL_API_URL"
        url = self._config_or_env(
            "municipal_repair_workflow.garbage_weight_api_url"
            if sync_type == "weight"
            else "municipal_repair_workflow.garbage_fuel_api_url",
            url_key,
        )
        username = os.getenv("GARBAGE_API_USERNAME")
        password = os.getenv("GARBAGE_API_PASSWORD")
        delegated_app_import = False
        delegated_source_label = "WRS" if sync_type == "weight" else "Gaiham"

        if sync_type in ("weight", "fuel") and not url:
            app_base_url = (
                os.getenv("APP_BASE_URL")
                or os.getenv("NEXT_PUBLIC_APP_URL")
                or os.getenv("NEXT_PUBLIC_SITE_URL")
                or self.env["ir.config_parameter"].sudo().get_param(
                    "municipal_repair_workflow.wrs_import_app_base_url",
                    "",
                )
            )
            if app_base_url:
                endpoint = "/api/wrs-report/import" if sync_type == "weight" else "/api/gaiham-fuel/import"
                url = "%s%s" % (app_base_url.rstrip("/"), endpoint)
                delegated_app_import = True

        if not url:
            return self._create_failure(sync_type, "%s тохируулаагүй байна." % url_key)
        app_sync_token = self._app_sync_token(sync_type)
        if delegated_app_import and not app_sync_token:
            return self._create_failure(
                sync_type,
                "%s sync token тохируулаагүй байна." % delegated_source_label,
            )

        pending_dates = self._pending_report_dates(sync_type)
        if not pending_dates:
            return True
        if not self._acquire_sync_lock(sync_type):
            return True

        try:
            total_count = 0
            imported_dates = []
            failed_dates = []
            for target_date in pending_dates:
                try:
                    count = self._fetch_external_report_date(
                        sync_type,
                        url,
                        target_date,
                        delegated_app_import=delegated_app_import,
                        delegated_source_label=delegated_source_label,
                        app_sync_token=app_sync_token,
                        username=username,
                        password=password,
                    )
                    total_count += count
                    imported_dates.append(target_date)
                    self._mark_report_date_success(sync_type, target_date)
                except Exception as error:  # pragma: no cover - external integration guard
                    failed_dates.append(target_date)
                    self._create_failure(sync_type, "%s: %s" % (target_date, error))

            if not imported_dates:
                return False

            params = self.env["ir.config_parameter"].sudo()
            params.set_param(
                "municipal_repair_workflow.garbage_%s_last_success_at" % sync_type,
                fields.Datetime.to_string(fields.Datetime.now()),
            )
            params.set_param(
                "municipal_repair_workflow.garbage_%s_last_success_date" % sync_type,
                self._local_now().date().isoformat(),
            )
            self.create(
                {
                    "sync_type": sync_type,
                    "state": "success",
                    "record_count": total_count,
                    "error_message": "Амжилттай өдөр: %s%s"
                    % (
                        ", ".join(imported_dates),
                        "; алдаатай өдөр: %s" % ", ".join(failed_dates) if failed_dates else "",
                    ),
                }
            )
            return not failed_dates
        except Exception as error:  # pragma: no cover - external integration guard
            self._create_failure(sync_type, str(error))
            return False
        finally:
            self._release_sync_lock(sync_type)

    @api.model
    def _fetch_external_reports_legacy(self, sync_type):
        url_key = "GARBAGE_WEIGHT_API_URL" if sync_type == "weight" else "GARBAGE_FUEL_API_URL"
        url = self._config_or_env(
            "municipal_repair_workflow.garbage_weight_api_url"
            if sync_type == "weight"
            else "municipal_repair_workflow.garbage_fuel_api_url",
            url_key,
        )
        username = os.getenv("GARBAGE_API_USERNAME")
        password = os.getenv("GARBAGE_API_PASSWORD")
        delegated_app_import = False
        delegated_source_label = "WRS" if sync_type == "weight" else "Gaiham"

        if sync_type in ("weight", "fuel") and not url:
            app_base_url = (
                os.getenv("APP_BASE_URL")
                or os.getenv("NEXT_PUBLIC_APP_URL")
                or os.getenv("NEXT_PUBLIC_SITE_URL")
                or self.env["ir.config_parameter"].sudo().get_param(
                    "municipal_repair_workflow.wrs_import_app_base_url",
                    "",
                )
            )
            if app_base_url:
                endpoint = "/api/wrs-report/import" if sync_type == "weight" else "/api/gaiham-fuel/import"
                url = "%s%s" % (app_base_url.rstrip("/"), endpoint)
                delegated_app_import = True

        if not url:
            return self._create_failure(sync_type, "%s тохируулаагүй байна." % url_key)
        app_sync_token = self._app_sync_token(sync_type)
        if delegated_app_import and not app_sync_token:
            return self._create_failure(
                sync_type,
                "%s sync token тохируулаагүй байна." % delegated_source_label,
            )

        pending_dates = self._pending_report_dates(sync_type)
        if not pending_dates:
            return True

        try:
            total_count = 0
            last_imported_date = ""
            for target_date in pending_dates:
                headers = {}
                if delegated_app_import:
                    headers["Authorization"] = "Bearer %s" % app_sync_token
                response = requests.get(
                    url,
                    auth=(username, password) if (username or password) and not delegated_app_import else None,
                    params={"date": target_date},
                    headers=headers,
                    timeout=self._external_request_timeout(delegated_app_import),
                )
                if delegated_app_import:
                    try:
                        payload = response.json()
                    except ValueError:
                        payload = {}
                    if response.status_code >= 400:
                        raise ValueError(
                            payload.get("error")
                            if isinstance(payload, dict) and payload.get("error")
                            else "%s тайлан %s өдөр апп import HTTP %s алдаатай буцлаа. Дараагийн cron дахин татна." % (delegated_source_label, target_date, response.status_code)
                        )
                else:
                    response.raise_for_status()
                    payload = response.json()
                if delegated_app_import:
                    if not isinstance(payload, dict) or not payload.get("ok"):
                        raise ValueError(
                            payload.get("error")
                            if isinstance(payload, dict) and payload.get("error")
                            else "%s тайлан %s өдөр апп import амжилтгүй буцлаа. Дараагийн cron дахин татна." % (delegated_source_label, target_date)
                        )
                    try:
                        total_rows = int(
                            payload.get("totalRows")
                            or payload.get("total_rows")
                            or payload.get("rows")
                            or 0
                        )
                    except Exception:
                        total_rows = 0
                    try:
                        count = int(
                            payload.get("imported")
                            or payload.get("recordCount")
                            or payload.get("record_count")
                            or payload.get("count")
                            or 0
                        )
                    except Exception:
                        count = 0
                    if total_rows <= 0:
                        raise ValueError(
                            "%s тайлан %s өдөр 0 мөр буцаалаа. Дараагийн cron дахин татна." % (delegated_source_label, target_date)
                        )
                    if count <= 0:
                        raise ValueError(
                            "%s тайлан %s өдөр авто баазтай таарсан мөргүй байна. Дараагийн cron дахин татна." % (delegated_source_label, target_date)
                        )
                    unmatched_count = self._delegated_payload_unmatched_count(payload, total_rows, count)
                    if unmatched_count and count <= 0:
                        count_label = str(unmatched_count) if unmatched_count > 0 else "зарим"
                        raise ValueError(
                            "%s тайлан %s өдөр %s мөр авто баазтай таарсангүй. Дугаарыг засаад дараагийн cron дахин татна." % (delegated_source_label, target_date, count_label)
                        )
                else:
                    rows = self._payload_rows(payload)
                    count = self._upsert_report_rows(sync_type, rows, target_date)
                total_count += count
                last_imported_date = target_date
                self.env["ir.config_parameter"].sudo().set_param(
                    "municipal_repair_workflow.garbage_%s_last_success_target_date" % sync_type,
                    target_date,
                )
            self.env["ir.config_parameter"].sudo().set_param(
                "municipal_repair_workflow.garbage_%s_last_success_at" % sync_type,
                fields.Datetime.to_string(fields.Datetime.now()),
            )
            self.env["ir.config_parameter"].sudo().set_param(
                "municipal_repair_workflow.garbage_%s_last_success_date" % sync_type,
                self._local_now().date().isoformat(),
            )
            self.create(
                {
                    "sync_type": sync_type,
                    "state": "success",
                    "record_count": total_count,
                    "error_message": "Сүүлд татсан тайлангийн огноо: %s" % (last_imported_date or "-"),
                }
            )
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
    def get_garbage_sync_cron_health(self):
        params = self.env["ir.config_parameter"].sudo()
        health = {}
        for sync_type in ("weight", "fuel"):
            latest_log = self.search([("sync_type", "=", sync_type)], order="run_at desc, id desc", limit=1)
            health[sync_type] = {
                "enabled": self._config_bool("municipal_repair_workflow.garbage_%s_sync_enabled" % sync_type),
                "due": self._configured_time_due(sync_type),
                "pending_dates": self._pending_report_dates(sync_type),
                "successful_dates": sorted(self._successful_report_dates(sync_type)),
                "last_success_target_date": params.get_param(
                    "municipal_repair_workflow.garbage_%s_last_success_target_date" % sync_type,
                    "",
                ),
                "last_success_at": params.get_param(
                    "municipal_repair_workflow.garbage_%s_last_success_at" % sync_type,
                    "",
                ),
                "lock_at": params.get_param(self._sync_lock_key(sync_type), "") or "",
                "latest_log_state": latest_log.state if latest_log else "",
                "latest_log_run_at": fields.Datetime.to_string(latest_log.run_at) if latest_log else "",
                "latest_log_message": latest_log.error_message if latest_log else "",
            }
        return health

    @api.model
    def _payload_rows(self, payload):
        if isinstance(payload, list):
            return payload
        if not isinstance(payload, dict):
            return []
        for key in ("records", "data", "items", "results", "rows", "totals"):
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
    def _date_value(self, row, fallback_date=None):
        value = self._text_value(row, ["date", "report_date", "requestedDate", "requested_date", "shift_date", "ognoo"])
        return value[:10] if value else (fallback_date or fields.Date.context_today(self))

    @api.model
    def _normalized_vehicle_code(self, value):
        return "".join(character for character in str(value or "").upper() if character.isalnum())

    @api.model
    def _garbage_department(self):
        department_model = self.env["hr.department"].sudo()
        for name in (
            "Авто бааз, хог тээвэрлэлтийн хэлтэс",
            "Авто бааз",
            "Хог тээвэрлэлт",
        ):
            department = department_model.search([("name", "=", name)], limit=1)
            if department:
                return department

        return department_model.search(
            ["|", ("name", "ilike", "авто"), ("name", "ilike", "хог")],
            limit=1,
        )

    @api.model
    def _garbage_vehicle_by_plate(self, plate):
        if not plate:
            return self.env["fleet.vehicle"]

        garbage_vehicle_domain = [
            "|",
            ("municipal_vehicle_type_id.is_garbage_truck", "=", True),
            ("category_id.name", "ilike", "хог"),
        ]
        exact = self.env["fleet.vehicle"].search(
            [("license_plate", "=", plate)] + garbage_vehicle_domain,
            limit=1,
        )
        if exact:
            return exact

        normalized_plate = self._normalized_vehicle_code(plate)
        candidates = self.env["fleet.vehicle"].search(
            garbage_vehicle_domain,
            limit=300,
        )
        for vehicle in candidates:
            if normalized_plate in (
                self._normalized_vehicle_code(vehicle.license_plate),
                self._normalized_vehicle_code(vehicle.name),
            ):
                return vehicle
        return self.env["fleet.vehicle"]

    @api.model
    def _upsert_report_rows(self, sync_type, rows, fallback_date=None):
        report_model = self.env[
            "municipal.garbage.weight.report"
            if sync_type == "weight"
            else "municipal.garbage.fuel.report"
        ]
        success_count = 0
        for row in rows:
            if not isinstance(row, dict):
                continue

            plate = self._text_value(
                row,
                ["license_plate", "plate", "vehicle_plate", "vehicleCode", "vehicle_code", "car_number", "ulsiin_dugaar"],
            )
            vehicle = self._garbage_vehicle_by_plate(plate)
            department = vehicle.municipal_department_id or self._garbage_department()
            report_date = self._date_value(row, fallback_date)
            source = self._text_value(row, ["source", "system", "provider"]) or "Гадны систем"
            values = {
                "report_date": report_date,
                "vehicle_id": vehicle.id or False,
                "department_id": department.id or False,
                "vehicle_license_plate": plate,
                "source": source,
                "fetched_at": fields.Datetime.now(),
                "state": "success" if vehicle else "failed",
                "error_message": "" if vehicle else "Хогны машин олдсонгүй.",
            }
            if sync_type == "weight":
                values.update(
                    {
                        "weight": self._float_value(row, ["weight", "kg", "ton", "net_weight", "net_weight_total", "netWeightTotal"]),
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
                    ("source", "=", source),
                ],
                limit=5000,
            )
            normalized_plate = self._normalized_vehicle_code(plate)
            existing = existing.filtered(
                lambda report: self._normalized_vehicle_code(report.vehicle_license_plate) == normalized_plate
            )[:1]
            if existing:
                values.pop("fetched_at", None)
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
