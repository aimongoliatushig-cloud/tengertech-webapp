# -*- coding: utf-8 -*-

from odoo import fields, models


class MunicipalProcurementRequest(models.Model):
    _name = "municipal.procurement.request"
    _description = "Municipal Procurement Request"
    _order = "request_date desc, id desc"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(string="Хүсэлтийн дугаар", required=True, default="Шинэ", tracking=True)
    request_type = fields.Selection(
        [
            ("repair_part", "Засварын сэлбэг"),
            ("material", "Материал"),
            ("service", "Үйлчилгээ"),
            ("other", "Бусад"),
        ],
        string="Хүсэлтийн төрөл",
        default="repair_part",
        required=True,
        tracking=True,
    )
    requested_by = fields.Many2one(
        "res.users",
        string="Хүсэлт гаргасан",
        default=lambda self: self.env.user,
        required=True,
        tracking=True,
    )
    department_id = fields.Many2one("hr.department", string="Хэлтэс", tracking=True)
    repair_id = fields.Many2one("municipal.repair.request", string="Засварын хүсэлт", ondelete="set null")
    amount_total = fields.Float(string="Нийт дүн", tracking=True)
    quote_attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_procurement_quote_attachment_rel",
        "procurement_id",
        "attachment_id",
        string="3 үнийн санал",
    )
    state = fields.Selection(
        [
            ("draft", "Ноорог"),
            ("quote", "3 үнийн санал"),
            ("finance_review", "Санхүүгийн хяналт"),
            ("director_approval", "Захирлын баталгаа"),
            ("contract_review", "Гэрээний хяналт"),
            ("payment", "Төлбөр"),
            ("received", "Агуулах хүлээн авсан"),
            ("done", "Дууссан"),
            ("cancelled", "Цуцлагдсан"),
        ],
        string="Төлөв",
        default="draft",
        required=True,
        tracking=True,
    )
    finance_approved_by = fields.Many2one("res.users", string="Санхүү баталсан", readonly=True)
    director_approved_by = fields.Many2one("res.users", string="Захирал баталсан", readonly=True)
    received_by = fields.Many2one("res.users", string="Хүлээн авсан", readonly=True)
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        default=lambda self: self.env.company,
        required=True,
    )
    is_over_threshold = fields.Boolean(
        string="1 саяас дээш",
        compute="_compute_is_over_threshold",
        store=True,
        index=True,
    )

    def _compute_is_over_threshold(self):
        for request in self:
            request.is_over_threshold = request.amount_total >= 1000000

    def action_submit_quotes(self):
        self.write({"state": "quote"})
        return True

    def action_finance_review(self):
        self.write({"state": "finance_review"})
        return True

    def action_finance_approve(self):
        for request in self:
            next_state = "director_approval" if request.amount_total >= 1000000 else "payment"
            request.write({"state": next_state, "finance_approved_by": self.env.user.id})
        return True

    def action_director_approve(self):
        self.write({"state": "contract_review", "director_approved_by": self.env.user.id})
        return True

    def action_mark_paid(self):
        self.write({"state": "payment"})
        return True

    def action_receive(self):
        self.write({"state": "received", "received_by": self.env.user.id})
        return True

    def action_done(self):
        self.write({"state": "done"})
        return True

    def action_cancel(self):
        self.write({"state": "cancelled"})
        return True
