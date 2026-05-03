# -*- coding: utf-8 -*-

from odoo import api, fields, models


UNIT_CATEGORIES = [
    ("count", "Тоо ширхэг"),
    ("weight", "Жин"),
    ("distance", "Зай"),
    ("area", "Талбай"),
    ("volume", "Эзлэхүүн"),
    ("trip", "Давтамж / рейс"),
    ("point", "Цэг"),
    ("vehicle", "Машин"),
    ("tree", "Мод"),
    ("other", "Бусад"),
]


WORK_OPERATION_TYPES = [
    ("garbage", "Хог цуглуулалт"),
    ("street_cleaning", "Гудамж цэвэрлэгээ"),
    ("green_maintenance", "Ногоон байгууламж"),
    ("other", "Бусад"),
]


class OpsWorkUnit(models.Model):
    _name = "ops.work.unit"
    _description = "Ажлын хэмжих нэгж"
    _order = "sequence, name"

    name = fields.Char(string="Нэр", required=True)
    code = fields.Char(string="Код", required=True)
    category = fields.Selection(UNIT_CATEGORIES, string="Ангилал", required=True, default="other")
    sequence = fields.Integer(string="Дараалал", default=10)
    active = fields.Boolean(string="Идэвхтэй", default=True)

    _sql_constraints = [
        ("ops_work_unit_name_unique", "unique(name)", "Хэмжих нэгжийн нэр давхардахгүй байх ёстой."),
        ("ops_work_unit_code_unique", "unique(code)", "Хэмжих нэгжийн код давхардахгүй байх ёстой."),
    ]


class OpsWorkType(models.Model):
    _name = "ops.work.type"
    _description = "Ажлын төрлийн нэгжийн профайл"
    _order = "sequence, name"

    name = fields.Char(string="Нэр", required=True)
    operation_type = fields.Selection(WORK_OPERATION_TYPES, string="Ажлын төрөл", required=True, default="other")
    allowed_unit_ids = fields.Many2many(
        "ops.work.unit",
        "ops_work_type_allowed_unit_rel",
        "work_type_id",
        "unit_id",
        string="Зөвшөөрсөн нэгжүүд",
    )
    default_unit_id = fields.Many2one("ops.work.unit", string="Үндсэн нэгж", ondelete="set null")
    allowed_unit_summary = fields.Char(
        string="Зөвшөөрсөн нэгжийн жагсаалт",
        compute="_compute_allowed_unit_summary",
    )
    sequence = fields.Integer(string="Дараалал", default=10)
    active = fields.Boolean(string="Идэвхтэй", default=True)

    _sql_constraints = [
        (
            "ops_work_type_operation_type_unique",
            "unique(operation_type)",
            "Ажлын төрлийн нэгжийн тохиргоо давхардахгүй байх ёстой.",
        ),
    ]

    @api.depends("allowed_unit_ids.name", "allowed_unit_ids.code")
    def _compute_allowed_unit_summary(self):
        for record in self:
            record.allowed_unit_summary = ", ".join(record.allowed_unit_ids.mapped("name"))


class OpsWorkUnitReview(models.Model):
    _name = "ops.work.unit.review"
    _description = "Нэгжийн migration шалгах мөр"
    _order = "create_date desc, id desc"

    name = fields.Char(string="Нэр", compute="_compute_name", store=True)
    model_name = fields.Char(string="Model", required=True)
    res_id = fields.Integer(string="Бичлэгийн ID", required=True)
    field_name = fields.Char(string="Талбар", required=True)
    raw_value = fields.Char(string="Анхны утга", required=True)
    normalized_key = fields.Char(string="Харьцуулах түлхүүр")
    state = fields.Selection(
        [
            ("pending", "Хүлээгдэж буй"),
            ("mapped", "Холбосон"),
            ("ignored", "Алгассан"),
        ],
        string="Төлөв",
        required=True,
        default="pending",
    )
    note = fields.Text(string="Тэмдэглэл")

    _sql_constraints = [
        (
            "ops_work_unit_review_review_row_unique",
            "unique(model_name, res_id, field_name, raw_value)",
            "Шалгах мөр давхардахгүй байх ёстой.",
        ),
    ]

    @api.depends("model_name", "res_id", "field_name", "raw_value")
    def _compute_name(self):
        for record in self:
            record.name = "%s/%s %s: %s" % (
                record.model_name or "",
                record.res_id or "",
                record.field_name or "",
                record.raw_value or "",
            )
