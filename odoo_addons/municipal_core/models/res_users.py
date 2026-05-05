# -*- coding: utf-8 -*-

from odoo import api, fields, models


class ResUsers(models.Model):
    _inherit = "res.users"

    ops_user_type = fields.Selection(
        selection=[
            ("system_admin", "Системийн админ"),
            ("director", "Захирал"),
            ("general_manager", "Үйл ажиллагаа хариуцсан менежер"),
            ("project_manager", "Хэлтсийн дарга"),
            ("senior_master", "Ахлах мастер"),
            ("team_leader", "Мастер"),
            ("worker", "Ажилтан"),
        ],
        string="ERP үүрэг",
        default="worker",
    )
    ops_department_id = fields.Many2one(
        "hr.department",
        string="Алба хэлтэс",
        compute="_compute_ops_department_id",
        store=True,
        readonly=False,
    )

    @api.depends("employee_ids.department_id")
    def _compute_ops_department_id(self):
        for user in self:
            employee = user.employee_ids[:1]
            user.ops_department_id = employee.department_id if employee else False


class ResUsersMunicipalRoleCoverage(models.Model):
    _inherit = "res.users"

    ops_user_type = fields.Selection(
        selection_add=[
            ("hse_officer", "ХАБЭА хяналтын ажилтан"),
            ("public_relations", "Олон нийттэй харилцах ажилтан"),
        ],
        ondelete={
            "hse_officer": "set default",
            "public_relations": "set default",
        },
    )
