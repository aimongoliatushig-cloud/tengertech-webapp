# -*- coding: utf-8 -*-

from datetime import datetime, time

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


CLEANING_DEFAULT_LINES = [
    "Явган зам цэвэрлэх",
    "Замын нуух цэвэрлэх",
    "Хогийн сав шалгах",
    "Жижиг хог / шарилж / зарын хуудас цэвэрлэх",
]


class MunicipalCleaningArea(models.Model):
    _name = "municipal.cleaning.area"
    _description = "Зам талбайн цэвэрлэх талбай"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "street_name, name"

    name = fields.Char(string="Цэвэрлэх талбайн нэр", required=True, tracking=True)
    street_name = fields.Char(string="Гудамж / замын нэр", tracking=True)
    start_point = fields.Char(string="Эхлэх цэг", tracking=True)
    end_point = fields.Char(string="Дуусах цэг", tracking=True)
    area_m2 = fields.Float(string="Талбай /мкв/", tracking=True)
    department_id = fields.Many2one(
        "hr.department",
        string="Хэлтэс",
        index=True,
        tracking=True,
    )
    master_id = fields.Many2one(
        "hr.employee",
        string="Хариуцсан мастер",
        index=True,
        tracking=True,
    )
    employee_id = fields.Many2one(
        "hr.employee",
        string="Хариуцсан ажилтан",
        index=True,
        tracking=True,
    )
    frequency = fields.Selection(
        [
            ("daily", "Өдөр бүр"),
            ("one_time", "Нэг удаа"),
        ],
        string="Давтамж",
        default="daily",
        required=True,
        tracking=True,
    )
    active = fields.Boolean(string="Идэвхтэй", default=True, tracking=True)
    note = fields.Text(string="Тайлбар")
    last_work_date = fields.Date(string="Сүүлд ажил үүссэн огноо", readonly=True)
    work_ids = fields.One2many(
        "municipal.work",
        "cleaning_area_id",
        string="Ажлууд",
        readonly=True,
    )
    work_count = fields.Integer(string="Нийт ажил", compute="_compute_work_counts")
    today_work_count = fields.Integer(string="Өнөөдрийн ажил", compute="_compute_work_counts")

    @api.depends("work_ids.work_date")
    def _compute_work_counts(self):
        today = fields.Date.context_today(self)
        for area in self:
            area.work_count = len(area.work_ids)
            area.today_work_count = len(area.work_ids.filtered(lambda work: work.work_date == today))

    @api.model_create_multi
    def create(self, vals_list):
        areas = super().create(vals_list)
        areas._ensure_today_work()
        return areas

    def write(self, vals):
        result = super().write(vals)
        if {"employee_id", "master_id", "department_id", "area_m2", "active", "frequency", "name"} & set(vals):
            self._ensure_today_work()
        return result

    def action_view_works(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": "Цэвэрлэгээний ажлууд",
            "res_model": "municipal.work",
            "view_mode": "list,form",
            "domain": [("cleaning_area_id", "=", self.id)],
            "context": {"default_cleaning_area_id": self.id},
        }

    def action_view_today_work(self):
        self.ensure_one()
        today = fields.Date.context_today(self)
        return {
            "type": "ir.actions.act_window",
            "name": "Өнөөдрийн ажил",
            "res_model": "municipal.work",
            "view_mode": "list,form",
            "domain": [("cleaning_area_id", "=", self.id), ("work_date", "=", today)],
            "context": {"default_cleaning_area_id": self.id, "default_work_date": today},
        }

    def _ensure_today_work(self):
        today = fields.Date.context_today(self)
        work_model = self.env["municipal.work"].sudo()
        work_type = self._get_cleaning_work_type()
        for area in self.filtered(lambda item: item.active and item.employee_id):
            if not area.department_id:
                raise ValidationError("Өнөөдрийн ажил үүсгэхийн тулд хэлтэс сонгоно уу.")

            existing = work_model.search(
                [
                    ("cleaning_area_id", "=", area.id),
                    ("work_date", "=", today),
                    ("active", "=", True),
                ],
                limit=1,
            )
            if existing:
                area.sudo().last_work_date = today
                continue

            work = work_model.create(area._prepare_today_work_values(today, work_type))
            work._create_default_cleaning_lines()
            area.sudo().last_work_date = today

    def _get_cleaning_work_type(self):
        work_type = self.env["municipal.work.type"].sudo().search(
            [("code", "=", "road_area_cleaning")],
            limit=1,
        )
        if work_type:
            return work_type

        return self.env["municipal.work.type"].sudo().create(
            {
                "name": "Зам талбайн цэвэрлэгээ",
                "code": "road_area_cleaning",
                "default_requires_photo": True,
                "default_requires_approval": True,
                "default_unit_of_measure": "мкв",
            }
        )

    def _prepare_today_work_values(self, work_date, work_type):
        self.ensure_one()
        employee_user = self.employee_id.user_id
        master_user = self.master_id.user_id
        start_dt = datetime.combine(work_date, time.min)
        end_dt = datetime.combine(work_date, time.max)
        route_text = " → ".join(part for part in [self.start_point, self.end_point] if part)
        location_parts = [self.street_name, route_text]
        location_text = " · ".join(part for part in location_parts if part)
        description_parts = [
            self.note or "",
            f"Гудамж / зам: {self.street_name}" if self.street_name else "",
            f"Чиглэл: {route_text}" if route_text else "",
        ]

        return {
            "name": f"{self.name} - {self.employee_id.name} - {work_date}",
            "department_id": self.department_id.id,
            "work_type_id": work_type.id,
            "cleaning_area_id": self.id,
            "responsible_employee_id": self.employee_id.id,
            "responsible_user_id": employee_user.id if employee_user else False,
            "manager_id": master_user.id if master_user else False,
            "master_id": self.master_id.id,
            "work_date": work_date,
            "start_datetime": fields.Datetime.to_string(start_dt),
            "deadline_datetime": fields.Datetime.to_string(end_dt),
            "planned_quantity": self.area_m2,
            "unit_of_measure": "мкв",
            "location_text": location_text,
            "description": "\n".join(part for part in description_parts if part),
            "requires_photo": True,
            "requires_approval": True,
            "state": "draft",
        }


class MunicipalWorkLine(models.Model):
    _name = "municipal.work.line"
    _description = "Ажлын даалгавар"
    _order = "sequence, id"

    work_id = fields.Many2one(
        "municipal.work",
        string="Ажил",
        required=True,
        ondelete="cascade",
        index=True,
    )
    name = fields.Char(string="Даалгавар", required=True)
    is_done = fields.Boolean(string="Хийгдсэн")
    sequence = fields.Integer(string="Дараалал", default=10)
    note = fields.Text(string="Тайлбар")
    employee_id = fields.Many2one(
        "hr.employee",
        related="work_id.responsible_employee_id",
        string="Хариуцсан ажилтан",
        store=True,
        readonly=True,
    )
    state = fields.Selection(
        related="work_id.state",
        string="Төлөв",
        store=True,
        readonly=True,
    )
