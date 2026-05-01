# -*- coding: utf-8 -*-

from odoo import fields, models


class MunicipalWorkType(models.Model):
    _name = "municipal.work.type"
    _description = "Municipal Work Type"
    _order = "department_id, name"
    _inherit = ["mail.thread"]

    name = fields.Char(string="Нэр", required=True, tracking=True)
    code = fields.Char(string="Код", required=True, index=True, tracking=True)
    department_id = fields.Many2one(
        "hr.department",
        string="Хэлтэс",
        index=True,
        tracking=True,
    )
    default_requires_photo = fields.Boolean(string="Зураг шаардах", default=True)
    default_requires_approval = fields.Boolean(string="Батлах шаардах", default=True)
    default_unit_of_measure = fields.Char(string="Анхдагч хэмжих нэгж")
    active = fields.Boolean(string="Идэвхтэй", default=True)

    _sql_constraints = [
        (
            "municipal_work_type_code_uniq",
            "unique(code)",
            "Ажлын төрлийн код давхардахгүй байх ёстой.",
        ),
    ]
