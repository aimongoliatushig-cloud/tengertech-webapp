# -*- coding: utf-8 -*-
from odoo import api, fields, models
from odoo.exceptions import ValidationError


class HrCustomMnPerformance(models.Model):
    _name = "hr.custom.mn.performance"
    _description = "HR Performance Evaluation"
    _order = "evaluation_month desc, id desc"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(string="Дүгнэлтийн нэр", compute="_compute_name", store=True)
    employee_id = fields.Many2one(
        "hr.employee",
        string="Ажилтан",
        required=True,
        index=True,
        ondelete="cascade",
        tracking=True,
    )
    department_id = fields.Many2one(
        related="employee_id.department_id",
        string="Хэлтэс",
        store=True,
        readonly=True,
    )
    evaluation_month = fields.Date(
        string="Үнэлгээний сар",
        required=True,
        default=fields.Date.context_today,
        tracking=True,
    )
    kpi_score = fields.Float(string="KPI оноо", tracking=True)
    task_completion_percent = fields.Float(string="Даалгаврын биелэлт %", tracking=True)
    discipline_score = fields.Float(string="Сахилгын оноо", tracking=True)
    monthly_evaluation = fields.Text(string="Сарын үнэлгээ")
    promotion_recommendation = fields.Selection(
        [
            ("none", "Зөвлөмжгүй"),
            ("watch", "Ажиглах"),
            ("recommend", "Дэвшүүлэх саналтай"),
            ("strong", "Яаралтай дэвшүүлэх"),
        ],
        string="Дэвшүүлэх санал",
        default="none",
        tracking=True,
    )
    reward_ids = fields.One2many(
        "hr.custom.mn.reward",
        "performance_id",
        string="Шагналын түүх",
    )
    warning_ids = fields.One2many(
        "hr.custom.mn.warning",
        "performance_id",
        string="Сануулгын түүх",
    )

    @api.depends("employee_id", "evaluation_month")
    def _compute_name(self):
        for record in self:
            month = record.evaluation_month or fields.Date.context_today(record)
            employee_name = record.employee_id.name or "Ажилтан"
            record.name = "%s - %s" % (employee_name, month.strftime("%Y-%m"))

    @api.constrains("kpi_score", "task_completion_percent", "discipline_score")
    def _check_score_ranges(self):
        for record in self:
            for value in [
                record.kpi_score,
                record.task_completion_percent,
                record.discipline_score,
            ]:
                if value < 0 or value > 100:
                    raise ValidationError("Үнэлгээний оноо 0-100 хооронд байна.")


class HrCustomMnReward(models.Model):
    _name = "hr.custom.mn.reward"
    _description = "HR Reward History"
    _order = "date desc, id desc"
    _inherit = ["mail.thread"]

    employee_id = fields.Many2one(
        "hr.employee",
        string="Ажилтан",
        required=True,
        index=True,
        ondelete="cascade",
        tracking=True,
    )
    performance_id = fields.Many2one(
        "hr.custom.mn.performance",
        string="Үнэлгээ",
        ondelete="set null",
    )
    date = fields.Date(string="Огноо", required=True, default=fields.Date.context_today)
    name = fields.Char(string="Шагнал", required=True, tracking=True)
    order_no = fields.Char(string="Тушаалын дугаар")
    note = fields.Text(string="Тайлбар")


class HrCustomMnWarning(models.Model):
    _name = "hr.custom.mn.warning"
    _description = "HR Warning History"
    _order = "date desc, id desc"
    _inherit = ["mail.thread"]

    employee_id = fields.Many2one(
        "hr.employee",
        string="Ажилтан",
        required=True,
        index=True,
        ondelete="cascade",
        tracking=True,
    )
    performance_id = fields.Many2one(
        "hr.custom.mn.performance",
        string="Үнэлгээ",
        ondelete="set null",
    )
    date = fields.Date(string="Огноо", required=True, default=fields.Date.context_today)
    name = fields.Char(string="Сануулга", required=True, tracking=True)
    severity = fields.Selection(
        [
            ("low", "Хөнгөн"),
            ("medium", "Дунд"),
            ("high", "Ноцтой"),
        ],
        string="Түвшин",
        default="medium",
        tracking=True,
    )
    order_no = fields.Char(string="Тушаалын дугаар")
    note = fields.Text(string="Тайлбар")
