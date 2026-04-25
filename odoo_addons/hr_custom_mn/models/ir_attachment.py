# -*- coding: utf-8 -*-
from odoo import api, fields, models


DOCUMENT_TYPES = [
    ("id_card", "Иргэний үнэмлэх"),
    ("diploma", "Диплом"),
    ("certificate", "Сертификат"),
    ("employment_contract", "Хөдөлмөрийн гэрээ"),
    ("appointment_order", "Томилгооны тушаал"),
    ("other", "Бусад баримт"),
]


class IrAttachment(models.Model):
    _inherit = "ir.attachment"

    x_mn_document_type = fields.Selection(
        DOCUMENT_TYPES,
        string="HR баримтын төрөл",
        index=True,
    )
    x_mn_document_date = fields.Date(string="Баримтын огноо")
    x_mn_expiry_date = fields.Date(string="Дуусах огноо")
    x_mn_employee_id = fields.Many2one(
        "hr.employee",
        string="Ажилтан",
        compute="_compute_x_mn_employee_id",
        store=True,
        index=True,
    )

    @api.depends("res_model", "res_id")
    def _compute_x_mn_employee_id(self):
        for attachment in self:
            attachment.x_mn_employee_id = (
                attachment.res_id if attachment.res_model == "hr.employee" else False
            )
