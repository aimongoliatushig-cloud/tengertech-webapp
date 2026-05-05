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
    sent_count = fields.Integer(string="Илгээсэн тоо", default=0)
    failed_count = fields.Integer(string="Алдаатай тоо", default=0)
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        default=lambda self: self.env.company,
        required=True,
    )

    @api.model
    def log_event(self, values):
        return self.sudo().create(values).id
