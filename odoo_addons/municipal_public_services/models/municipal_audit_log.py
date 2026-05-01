# -*- coding: utf-8 -*-

from odoo import api, fields, models


class MunicipalAuditLog(models.Model):
    _name = "municipal.audit.log"
    _description = "Municipal Audit Log"
    _order = "changed_date desc, id desc"

    model_name = fields.Char(string="Model", required=True, index=True)
    record_id = fields.Integer(string="Бичлэгийн ID", required=True, index=True)
    record_display_name = fields.Char(string="Бичлэг")
    field_name = fields.Char(string="Талбар")
    old_value = fields.Char(string="Өмнөх утга")
    new_value = fields.Char(string="Шинэ утга")
    changed_by = fields.Many2one(
        "res.users",
        string="Өөрчилсөн хэрэглэгч",
        default=lambda self: self.env.user,
        required=True,
        index=True,
    )
    changed_date = fields.Datetime(
        string="Өөрчилсөн огноо",
        default=fields.Datetime.now,
        required=True,
        index=True,
    )
    change_type = fields.Selection(
        [
            ("create", "Үүсгэсэн"),
            ("write", "Зассан"),
            ("state", "Төлөв өөрчилсөн"),
            ("approve", "Баталсан"),
            ("return", "Буцаасан"),
            ("resolve", "Шийдвэрлэсэн"),
            ("cancel", "Цуцалсан"),
        ],
        string="Өөрчлөлтийн төрөл",
        default="write",
        required=True,
        index=True,
    )
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        default=lambda self: self.env.company,
        index=True,
    )

    @api.model
    def log_change(self, record, field_name, old_value, new_value, change_type="write"):
        if self.env.context.get("skip_municipal_audit"):
            return False
        company = getattr(record, "company_id", False)
        return self.sudo().with_context(skip_municipal_audit=True).create(
            {
                "model_name": record._name,
                "record_id": record.id,
                "record_display_name": record.display_name,
                "field_name": field_name,
                "old_value": old_value if old_value is not False else "",
                "new_value": new_value if new_value is not False else "",
                "change_type": change_type,
                "company_id": company.id if company else self.env.company.id,
            }
        )
