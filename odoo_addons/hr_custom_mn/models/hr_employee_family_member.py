# -*- coding: utf-8 -*-

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class HrCustomMnEmployeeFamilyMember(models.Model):
    _name = "hr.custom.mn.employee.family.member"
    _description = "HR MN Employee Family Member"
    _order = "employee_id, relation, name, related_employee_id"

    employee_id = fields.Many2one(
        "hr.employee",
        string="Ажилтан",
        required=True,
        ondelete="cascade",
        index=True,
    )
    related_employee_id = fields.Many2one(
        "hr.employee",
        string="Гэр бүлийн гишүүн",
        ondelete="cascade",
        index=True,
    )
    name = fields.Char(string="Нэр")
    phone = fields.Char(string="Утас")
    relation = fields.Selection(
        [
            ("spouse", "Эхнэр / нөхөр"),
            ("child", "Хүүхэд"),
            ("father", "Аав"),
            ("mother", "Ээж"),
            ("parent", "Эцэг / эх"),
            ("sibling", "Ах / эгч / дүү"),
            ("other", "Бусад"),
        ],
        string="Хамаарал",
        required=True,
        default="other",
    )
    note = fields.Text(string="Тайлбар")
    active = fields.Boolean(default=True)
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        related="employee_id.company_id",
        store=True,
        readonly=True,
    )

    _sql_constraints = [
        (
            "employee_related_relation_unique",
            "unique(employee_id, related_employee_id, relation)",
            "Энэ гэр бүлийн гишүүн ижил хамаарлаар аль хэдийн бүртгэгдсэн байна.",
        ),
    ]

    @api.constrains("employee_id", "related_employee_id")
    def _check_not_self(self):
        for record in self:
            if record.employee_id and record.employee_id == record.related_employee_id:
                raise ValidationError(_("Ажилтныг өөрийг нь гэр бүлийн гишүүнээр бүртгэх боломжгүй."))

    @api.constrains("related_employee_id", "name")
    def _check_has_member_identity(self):
        for record in self:
            if not record.related_employee_id and not (record.name or "").strip():
                raise ValidationError(_("Гэр бүлийн гишүүний нэрийг оруулна уу."))
