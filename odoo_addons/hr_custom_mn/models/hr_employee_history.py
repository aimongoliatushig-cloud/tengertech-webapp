# -*- coding: utf-8 -*-
from odoo import fields, models


class HrCustomMnEmployeeHistory(models.Model):
    _name = "hr.custom.mn.employee.history"
    _description = "HR Employee Action History"
    _order = "date desc, id desc"
    _inherit = ["mail.thread"]

    employee_id = fields.Many2one(
        "hr.employee",
        string="Ажилтан",
        required=True,
        index=True,
        ondelete="cascade",
    )
    action_type = fields.Selection(
        [
            ("create", "Шинэ ажилтан"),
            ("edit", "Өөрчлөлт"),
            ("transfer", "Хэлтэс шилжүүлсэн"),
            ("promote", "Дэвшүүлсэн"),
            ("suspend", "Түр түдгэлзүүлсэн"),
            ("terminate", "Ажлаас чөлөөлсөн"),
            ("rehire", "Дахин ажилд авсан"),
            ("archive", "Архивласан"),
            ("document", "Баримт бичиг"),
            ("other", "Бусад"),
        ],
        string="Үйлдэл",
        required=True,
        default="other",
        tracking=True,
    )
    date = fields.Datetime(
        string="Огноо",
        required=True,
        default=fields.Datetime.now,
        tracking=True,
    )
    user_id = fields.Many2one(
        "res.users",
        string="Гүйцэтгэсэн хэрэглэгч",
        required=True,
        default=lambda self: self.env.user,
        tracking=True,
    )
    old_department_id = fields.Many2one("hr.department", string="Өмнөх хэлтэс")
    new_department_id = fields.Many2one("hr.department", string="Шинэ хэлтэс")
    old_job_id = fields.Many2one("hr.job", string="Өмнөх албан тушаал")
    new_job_id = fields.Many2one("hr.job", string="Шинэ албан тушаал")
    old_manager_id = fields.Many2one("hr.employee", string="Өмнөх удирдлага")
    new_manager_id = fields.Many2one("hr.employee", string="Шинэ удирдлага")
    old_grade_rank = fields.Char(string="Өмнөх зэрэглэл")
    new_grade_rank = fields.Char(string="Шинэ зэрэглэл")
    note = fields.Text(string="Тайлбар")
