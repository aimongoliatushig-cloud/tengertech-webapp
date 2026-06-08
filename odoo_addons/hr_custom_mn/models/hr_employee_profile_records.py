# -*- coding: utf-8 -*-

from odoo import fields, models


class HrCustomMnEmployeeEmergencyContact(models.Model):
    _name = "hr.custom.mn.employee.emergency.contact"
    _description = "HR MN Employee Emergency Contact"
    _order = "sequence, id"

    employee_id = fields.Many2one(
        "hr.employee",
        string="Ажилтан",
        required=True,
        ondelete="cascade",
        index=True,
    )
    sequence = fields.Integer(default=10)
    name = fields.Char(string="Нэр", required=True)
    relation = fields.Char(string="Хамаарал")
    phone = fields.Char(string="Утас", required=True)
    address = fields.Char(string="Хаяг")
    note = fields.Text(string="Тайлбар")
    active = fields.Boolean(default=True)
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        related="employee_id.company_id",
        store=True,
        readonly=True,
    )


class HrCustomMnEmployeeTalentSkill(models.Model):
    _name = "hr.custom.mn.employee.talent.skill"
    _description = "HR MN Employee Talent and Skill"
    _order = "sequence, id"

    employee_id = fields.Many2one(
        "hr.employee",
        string="Ажилтан",
        required=True,
        ondelete="cascade",
        index=True,
    )
    sequence = fields.Integer(default=10)
    name = fields.Char(string="Авьяас, чадвар", required=True)
    skill_type = fields.Char(string="Төрөл")
    level = fields.Char(string="Түвшин")
    acquired_date = fields.Date(string="Бүртгэсэн огноо")
    note = fields.Text(string="Тодорхойлолт")
    active = fields.Boolean(default=True)
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        related="employee_id.company_id",
        store=True,
        readonly=True,
    )
