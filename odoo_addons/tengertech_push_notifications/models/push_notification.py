# -*- coding: utf-8 -*-

import json

from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError


class TengertechPushSubscription(models.Model):
    _name = "tengertech.push.subscription"
    _description = "PWA Push Subscription"
    _order = "write_date desc, id desc"
    _inherit = ["mail.thread"]

    name = fields.Char(string="Нэр", compute="_compute_name", store=True)
    user_id = fields.Many2one(
        "res.users",
        string="Хэрэглэгч",
        required=True,
        index=True,
        default=lambda self: self.env.user,
        tracking=True,
    )
    endpoint = fields.Char(string="Endpoint", required=True, index=True, tracking=True)
    p256dh = fields.Char(string="P256DH түлхүүр", required=True)
    auth = fields.Char(string="Auth түлхүүр", required=True)
    expiration_time = fields.Float(string="Дуусах хугацаа")
    user_agent = fields.Char(string="Төхөөрөмж")
    active = fields.Boolean(string="Идэвхтэй", default=True, index=True, tracking=True)
    last_seen_at = fields.Datetime(
        string="Сүүлд бүртгэгдсэн",
        default=fields.Datetime.now,
        tracking=True,
    )
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        default=lambda self: self.env.company,
        required=True,
    )

    _sql_constraints = [
        ("endpoint_unique", "unique(endpoint)", "Push endpoint давхар бүртгэгдэхгүй."),
    ]

    @api.depends("user_id", "active")
    def _compute_name(self):
        for record in self:
            status = "идэвхтэй" if record.active else "идэвхгүй"
            record.name = "%s - %s" % (record.user_id.name or "Хэрэглэгч", status)

    @api.constrains("endpoint", "p256dh", "auth")
    def _check_required_push_values(self):
        for record in self:
            if not record.endpoint or not record.p256dh or not record.auth:
                raise ValidationError("Push subscription endpoint болон түлхүүрүүд заавал шаардлагатай.")

    @api.model
    def _parse_subscription(self, subscription):
        if isinstance(subscription, str):
            try:
                subscription = json.loads(subscription)
            except json.JSONDecodeError as error:
                raise UserError("Push subscription JSON буруу байна.") from error

        if not isinstance(subscription, dict):
            raise UserError("Push subscription мэдээлэл буруу байна.")

        keys = subscription.get("keys") or {}
        endpoint = subscription.get("endpoint")
        p256dh = keys.get("p256dh")
        auth = keys.get("auth")
        if not endpoint or not p256dh or not auth:
            raise UserError("Push subscription endpoint болон түлхүүрүүд дутуу байна.")

        expiration_time = subscription.get("expirationTime")
        return {
            "endpoint": endpoint,
            "p256dh": p256dh,
            "auth": auth,
            "expiration_time": expiration_time or 0,
        }

    @api.model
    def upsert_for_current_user(self, subscription, user_agent=None):
        values = self._parse_subscription(subscription)
        values.update(
            {
                "user_id": self.env.user.id,
                "active": True,
                "last_seen_at": fields.Datetime.now(),
                "user_agent": user_agent or False,
                "company_id": self.env.company.id,
            }
        )
        existing = self.sudo().search([("endpoint", "=", values["endpoint"])], limit=1)
        if existing:
            existing.write(values)
            return existing.id
        return self.create(values).id

    @api.model
    def deactivate_for_current_user(self, endpoint):
        if not endpoint:
            return False
        records = self.search([("endpoint", "=", endpoint), ("user_id", "=", self.env.user.id)])
        records.write({"active": False})
        return True

    @api.model
    def active_payloads_for_users(self, user_ids=None):
        domain = [("active", "=", True)]
        if user_ids:
            domain.append(("user_id", "in", user_ids))
        return [
            {
                "id": record.id,
                "user_id": record.user_id.id,
                "endpoint": record.endpoint,
                "keys": {
                    "p256dh": record.p256dh,
                    "auth": record.auth,
                },
            }
            for record in self.sudo().search(domain)
        ]


class TengertechPushEvent(models.Model):
    _name = "tengertech.push.event"
    _description = "PWA Push Event"
    _order = "create_date desc, id desc"
    _inherit = ["mail.thread"]

    name = fields.Char(string="Гарчиг", required=True, tracking=True)
    event_type = fields.Selection(
        [
            ("new_work_assigned", "Шинэ ажил оноогдсон"),
            ("work_changed", "Ажил өөрчлөгдсөн"),
            ("report_under_review", "Тайлан хяналтад ирсэн"),
            ("work_returned", "Ажил буцаагдсан"),
            ("work_approved", "Ажил баталгаажсан"),
            ("deadline_near", "Хугацаа дөхсөн"),
            ("deadline_overdue", "Хугацаа хэтэрсэн"),
            ("route_changed", "Маршрут өөрчлөгдсөн"),
            ("vehicle_broken", "Машин эвдэрсэн"),
            ("attendance_issue", "Ирцийн асуудал"),
            ("discipline_issue", "Сахилгын асуудал"),
            ("test", "Туршилтын мэдэгдэл"),
        ],
        string="Төрөл",
        required=True,
        default="test",
        index=True,
        tracking=True,
    )
    body = fields.Text(string="Мэдэгдлийн текст")
    target_url = fields.Char(string="Нээх холбоос")
    target_user_ids = fields.Many2many("res.users", string="Хүлээн авагчид")
    target_user_count = fields.Integer(string="Зорьсон хэрэглэгч", default=0)
    sent_count = fields.Integer(string="Илгээсэн тоо", default=0)
    failed_count = fields.Integer(string="Алдаатай тоо", default=0)
    skipped_count = fields.Integer(string="Алгассан тоо", default=0)
    failure_reason = fields.Char(string="Тайлбар")
    delivery_ids = fields.One2many(
        "tengertech.push.delivery",
        "event_id",
        string="Төхөөрөмжийн аудит",
    )
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        default=lambda self: self.env.company,
        required=True,
    )

    @api.model
    def log_event(self, values):
        return self.sudo().create(values).id


class TengertechPushDelivery(models.Model):
    _name = "tengertech.push.delivery"
    _description = "PWA Push Delivery Audit"
    _order = "create_date desc, id desc"

    event_id = fields.Many2one(
        "tengertech.push.event",
        string="Push бүртгэл",
        required=True,
        index=True,
        ondelete="cascade",
    )
    user_id = fields.Many2one("res.users", string="Хүлээн авагч", index=True)
    subscription_id = fields.Many2one("tengertech.push.subscription", string="Төхөөрөмж")
    endpoint_tail = fields.Char(string="Endpoint сүүлийн хэсэг")
    status = fields.Selection(
        [
            ("sent", "Илгээгдсэн"),
            ("failed", "Алдаатай"),
            ("skipped", "Алгассан"),
        ],
        string="Төлөв",
        required=True,
        default="sent",
        index=True,
    )
    error_message = fields.Char(string="Алдааны мессеж")
    target_url = fields.Char(string="Нээх холбоос")
    delivered_at = fields.Datetime(string="Илгээсэн цаг", default=fields.Datetime.now)
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        default=lambda self: self.env.company,
        required=True,
    )

    @api.model
    def log_delivery_batch(self, event_id, deliveries):
        if not event_id or not deliveries:
            return 0

        values_list = []
        for delivery in deliveries:
            if not isinstance(delivery, dict):
                continue

            values_list.append(
                {
                    "event_id": event_id,
                    "user_id": delivery.get("user_id") or False,
                    "subscription_id": delivery.get("subscription_id") or False,
                    "endpoint_tail": delivery.get("endpoint_tail") or False,
                    "status": delivery.get("status") or "sent",
                    "error_message": delivery.get("error_message") or False,
                    "target_url": delivery.get("target_url") or False,
                    "company_id": self.env.company.id,
                }
            )

        if values_list:
            self.sudo().create(values_list)
        return len(values_list)


class TengertechNotificationState(models.Model):
    _name = "tengertech.notification.state"
    _description = "PWA Notification Read State"
    _order = "write_date desc, id desc"

    name = fields.Char(string="Нэр", compute="_compute_name", store=True)
    user_id = fields.Many2one(
        "res.users",
        string="Хэрэглэгч",
        required=True,
        index=True,
        default=lambda self: self.env.user,
    )
    notification_key = fields.Char(string="Мэдэгдлийн түлхүүр", required=True, index=True)
    read_at = fields.Datetime(string="Уншсан цаг")
    last_seen_at = fields.Datetime(string="Сүүлд харсан", default=fields.Datetime.now)
    active = fields.Boolean(string="Идэвхтэй", default=True)
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        default=lambda self: self.env.company,
        required=True,
    )

    _sql_constraints = [
        (
            "notification_user_key_unique",
            "unique(user_id, notification_key)",
            "Нэг хэрэглэгчийн мэдэгдлийн төлөв давхардахгүй.",
        ),
    ]

    @api.depends("user_id", "notification_key")
    def _compute_name(self):
        for record in self:
            record.name = "%s - %s" % (
                record.user_id.name or "Хэрэглэгч",
                record.notification_key or "Мэдэгдэл",
            )

    @api.model
    def _normalize_keys(self, keys):
        if isinstance(keys, str):
            keys = [keys]
        if not isinstance(keys, list):
            return []

        normalized = []
        seen = set()
        for key in keys:
            if not isinstance(key, str):
                continue
            value = key.strip()
            if value and value not in seen:
                seen.add(value)
                normalized.append(value)
        return normalized

    @api.model
    def read_keys_for_current_user(self, keys=None):
        normalized_keys = self._normalize_keys(keys or [])
        if not normalized_keys:
            return []

        records = self.sudo().search(
            [
                ("user_id", "=", self.env.user.id),
                ("notification_key", "in", normalized_keys),
                ("read_at", "!=", False),
                ("active", "=", True),
            ]
        )
        return records.mapped("notification_key")

    @api.model
    def mark_read_for_current_user(self, keys):
        normalized_keys = self._normalize_keys(keys)
        if not normalized_keys:
            return True

        now = fields.Datetime.now()
        records = self.sudo().search(
            [
                ("user_id", "=", self.env.user.id),
                ("notification_key", "in", normalized_keys),
            ]
        )
        existing_by_key = {record.notification_key: record for record in records}

        for key in normalized_keys:
            values = {
                "read_at": now,
                "last_seen_at": now,
                "active": True,
                "company_id": self.env.company.id,
            }
            existing = existing_by_key.get(key)
            if existing:
                existing.write(values)
            else:
                values.update(
                    {
                        "user_id": self.env.user.id,
                        "notification_key": key,
                    }
                )
                self.sudo().create(values)
        return True
