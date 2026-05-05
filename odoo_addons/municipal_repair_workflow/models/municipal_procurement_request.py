# -*- coding: utf-8 -*-

from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError


PROCUREMENT_STATES = [
    ("draft", "Ноорог"),
    ("quote", "3 үнийн санал"),
    ("finance_review", "Санхүүгийн хяналт"),
    ("director_approval", "Захирлын баталгаа"),
    ("contract_review", "Гэрээний хяналт"),
    ("payment", "Төлбөр"),
    ("received", "Агуулах хүлээн авсан"),
    ("done", "Дууссан"),
    ("cancelled", "Цуцлагдсан"),
]


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
    request_date = fields.Datetime(
        string="Хүсэлтийн огноо",
        default=fields.Datetime.now,
        required=True,
        tracking=True,
    )
    department_id = fields.Many2one("hr.department", string="Хэлтэс", tracking=True)
    repair_id = fields.Many2one("municipal.repair.request", string="Засварын хүсэлт", ondelete="set null")
    vehicle_id = fields.Many2one("fleet.vehicle", string="Машин техник", tracking=True)
    line_ids = fields.One2many(
        "municipal.procurement.line",
        "procurement_id",
        string="Материал / сэлбэгийн мөр",
    )
    quote_line_ids = fields.One2many(
        "municipal.procurement.quote",
        "procurement_id",
        string="Үнийн санал",
    )
    supplier_quote_ids = fields.One2many(
        "municipal.procurement.quote",
        "procurement_id",
        string="Нийлүүлэгчийн үнийн санал",
    )
    amount_total = fields.Float(string="Нийт дүн", tracking=True)
    selected_supplier_total = fields.Float(
        string="Сонгосон нийлүүлэгчийн дүн",
        compute="_compute_quote_summary",
        store=True,
    )
    selected_quote_id = fields.Many2one(
        "municipal.procurement.quote",
        string="Сонгосон үнийн санал",
        compute="_compute_quote_summary",
        store=True,
    )
    selected_supplier_id = fields.Many2one(
        "res.partner",
        string="Сонгосон нийлүүлэгч",
        compute="_compute_quote_summary",
        store=True,
    )
    quote_attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_procurement_quote_attachment_rel",
        "procurement_id",
        "attachment_id",
        string="3 үнийн саналын хавсралт",
    )
    state = fields.Selection(
        PROCUREMENT_STATES,
        string="Төлөв",
        default="draft",
        required=True,
        tracking=True,
    )
    finance_approved_by = fields.Many2one("res.users", string="Санхүү баталсан", readonly=True)
    director_approved_by = fields.Many2one("res.users", string="Захирал баталсан", readonly=True)
    paid_by = fields.Many2one("res.users", string="Төлбөр тэмдэглэсэн", readonly=True)
    received_by = fields.Many2one("res.users", string="Хүлээн авсан", readonly=True)
    date_quotation_submitted = fields.Datetime(string="Үнийн санал илгээсэн огноо", readonly=True)
    date_finance_approved = fields.Datetime(string="Санхүү баталсан огноо", readonly=True)
    date_director_decision = fields.Datetime(string="Захирлын шийдвэрийн огноо", readonly=True)
    date_paid = fields.Datetime(string="Төлбөрийн огноо", readonly=True)
    date_received = fields.Datetime(string="Агуулах хүлээн авсан огноо", readonly=True)
    payment_reference = fields.Char(string="Төлбөрийн баримтын дугаар")
    receipt_note = fields.Text(string="Хүлээн авалтын тэмдэглэл")
    warehouse_move_ids = fields.One2many(
        "municipal.warehouse.move",
        "procurement_id",
        string="Агуулахын орлого / зарлага",
    )
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

    @api.model_create_multi
    def create(self, vals_list):
        sequence = self.env["ir.sequence"].sudo()
        for vals in vals_list:
            if vals.get("name", "Шинэ") in ("Шинэ", "Ð¨Ð¸Ð½Ñ"):
                vals["name"] = sequence.next_by_code("municipal.procurement.request") or "Шинэ"
        return super().create(vals_list)

    @api.depends("quote_line_ids.is_selected", "quote_line_ids.amount_total", "quote_line_ids.supplier_id")
    def _compute_quote_summary(self):
        for request in self:
            selected = request.quote_line_ids.filtered("is_selected")[:1]
            request.selected_quote_id = selected.id if selected else False
            request.selected_supplier_id = selected.supplier_id.id if selected else False
            request.selected_supplier_total = selected.amount_total if selected else 0

    @api.depends("amount_total", "selected_supplier_total")
    def _compute_is_over_threshold(self):
        for request in self:
            request.is_over_threshold = max(request.amount_total, request.selected_supplier_total) >= 1000000

    @api.constrains("amount_total")
    def _check_amount_total(self):
        for request in self:
            if request.amount_total < 0:
                raise ValidationError("Нийт дүн сөрөг байж болохгүй.")

    def _valid_quote_lines(self):
        self.ensure_one()
        return self.quote_line_ids.filtered(lambda quote: quote.supplier_id and quote.amount_total > 0)

    def _ensure_three_quotes(self):
        for request in self:
            if len(request._valid_quote_lines()) < 3:
                raise UserError("Санхүүгийн хяналтад илгээхийн өмнө 3 нийлүүлэгчийн үнийн санал бүрэн оруулна уу.")

    def _ensure_quote_evidence(self):
        for request in self:
            supplier_ids = [quote.supplier_id.id for quote in request._valid_quote_lines()]
            if len(supplier_ids) != len(set(supplier_ids)):
                raise UserError("3 үнийн саналыг давхардаагүй 3 нийлүүлэгчээс авсан байх ёстой.")
            missing = request._valid_quote_lines().filtered(lambda quote: not quote.attachment_ids)
            if missing and not request.quote_attachment_ids:
                raise UserError("3 үнийн саналын хавсралт / баримтыг оруулна уу.")

    def _ensure_selected_quote(self):
        for request in self:
            selected = request.quote_line_ids.filtered("is_selected")
            if not selected:
                raise UserError("Сонгосон нийлүүлэгчийн үнийн саналыг тэмдэглэнэ үү.")
            if len(selected) > 1:
                raise UserError("Зөвхөн нэг үнийн саналыг сонгоно уу.")
            if selected.amount_total <= 0:
                raise UserError("Сонгосон үнийн саналын дүн 0-ээс их байх ёстой.")

    def _sync_amount_from_selected_quote(self):
        for request in self:
            if request.selected_supplier_total:
                request.amount_total = request.selected_supplier_total

    def _ensure_procurement_lines(self):
        for request in self:
            if not request.line_ids:
                raise UserError("Материал / сэлбэгийн мөр хоосон байна.")

    def _ensure_all_received(self):
        for request in self:
            missing = request.line_ids.filtered(lambda line: line.received_quantity < line.requested_quantity)
            if missing:
                raise UserError("Бүх материал / сэлбэгийг бүрэн хүлээн аваагүй байна.")

    def action_submit_quotes(self):
        self.write({"state": "quote", "date_quotation_submitted": fields.Datetime.now()})
        return True

    def action_finance_review(self):
        self._ensure_procurement_lines()
        self._ensure_three_quotes()
        self._ensure_quote_evidence()
        self._ensure_selected_quote()
        self._sync_amount_from_selected_quote()
        self.write({"state": "finance_review"})
        return True

    def action_finance_approve(self):
        for request in self:
            request._ensure_three_quotes()
            request._ensure_quote_evidence()
            request._ensure_selected_quote()
            request._sync_amount_from_selected_quote()
            approval_amount = max(request.amount_total, request.selected_supplier_total)
            next_state = "director_approval" if approval_amount >= 1000000 else "payment"
            request.write(
                {
                    "state": next_state,
                    "finance_approved_by": self.env.user.id,
                    "date_finance_approved": fields.Datetime.now(),
                }
            )
        return True

    def action_director_approve(self):
        for request in self:
            if max(request.amount_total, request.selected_supplier_total) < 1000000:
                raise UserError("1 саяас доош худалдан авалт захирлын баталгаанд очих шаардлагагүй.")
        self.write(
            {
                "state": "contract_review",
                "director_approved_by": self.env.user.id,
                "date_director_decision": fields.Datetime.now(),
            }
        )
        return True

    def action_mark_paid(self):
        for request in self:
            if request.state not in ("payment", "contract_review"):
                raise UserError("Төлбөрийг зөвхөн баталгаажсан худалдан авалт дээр тэмдэглэнэ.")
            if request.is_over_threshold and not request.director_approved_by:
                raise UserError("1 саяас дээш худалдан авалтад захирлын баталгаа шаардлагатай.")
            if not request.finance_approved_by:
                raise UserError("Санхүү батлаагүй худалдан авалтад төлбөр тэмдэглэх боломжгүй.")
            if not request.payment_reference:
                raise UserError("Төлбөрийн баримтын дугаарыг оруулна уу.")
        self.write({"state": "payment", "paid_by": self.env.user.id, "date_paid": fields.Datetime.now()})
        return True

    def action_receive(self):
        for request in self:
            if request.state not in ("payment", "contract_review"):
                raise UserError("Санхүүгийн баталгаа болон төлбөрийн шат дуусаагүй хүсэлтийг агуулахад хүлээн авах боломжгүй.")
            if request.is_over_threshold and not request.director_approved_by:
                raise UserError("1 саяас дээш худалдан авалтад захирлын баталгаа шаардлагатай.")
            if not request.finance_approved_by:
                raise UserError("Санхүү батлаагүй худалдан авалтыг агуулахад хүлээн авах боломжгүй.")
            if not request.receipt_note:
                raise UserError("Агуулахад хүлээн авсан тэмдэглэлийг оруулна уу.")
            request._ensure_procurement_lines()
            for line in request.line_ids:
                qty_to_receive = line.requested_quantity - line.received_quantity
                if qty_to_receive <= 0:
                    continue
                self.env["municipal.warehouse.move"].create(
                    {
                        "move_type": "in",
                        "procurement_id": request.id,
                        "repair_id": request.repair_id.id or False,
                        "procurement_line_id": line.id,
                        "repair_part_line_id": line.repair_part_line_id.id or False,
                        "product_id": line.product_id.id or False,
                        "description": line.description,
                        "quantity": qty_to_receive,
                        "unit_of_measure": line.unit_of_measure,
                        "user_id": self.env.user.id,
                        "company_id": request.company_id.id,
                    }
                )
                line.received_quantity += qty_to_receive
                line.state = "received"
            request.write(
                {
                    "state": "received",
                    "received_by": self.env.user.id,
                    "date_received": fields.Datetime.now(),
                }
            )
        return True

    def action_done(self):
        for request in self:
            if request.state != "received":
                raise UserError("Дуусгахын өмнө агуулахад хүлээн авсан байх ёстой.")
        self._ensure_all_received()
        self.write({"state": "done"})
        return True

    def action_cancel(self):
        self.write({"state": "cancelled"})
        return True

    def action_issue_to_repair(self):
        for request in self:
            if not request.repair_id:
                raise UserError("Засварын хүсэлттэй холбоогүй худалдан авалт байна.")
            if request.state not in ("received", "done"):
                raise UserError("Материал / сэлбэгийг агуулахад хүлээн авсны дараа засварт олгоно.")
            for line in request.line_ids:
                qty_to_issue = line.received_quantity - line.issued_quantity
                if qty_to_issue <= 0:
                    continue
                self.env["municipal.warehouse.move"].create(
                    {
                        "move_type": "out",
                        "procurement_id": request.id,
                        "repair_id": request.repair_id.id,
                        "procurement_line_id": line.id,
                        "repair_part_line_id": line.repair_part_line_id.id or False,
                        "product_id": line.product_id.id or False,
                        "description": line.description,
                        "quantity": qty_to_issue,
                        "unit_of_measure": line.unit_of_measure,
                        "user_id": self.env.user.id,
                        "company_id": request.company_id.id,
                    }
                )
                line.issued_quantity += qty_to_issue
                line.state = "issued"
                if line.repair_part_line_id:
                    line.repair_part_line_id.issued_quantity += qty_to_issue
                    line.repair_part_line_id.state = "issued"
        return True


class MunicipalProcurementLine(models.Model):
    _name = "municipal.procurement.line"
    _description = "Municipal Procurement Line"
    _order = "procurement_id, id"

    procurement_id = fields.Many2one(
        "municipal.procurement.request",
        string="Худалдан авалтын хүсэлт",
        required=True,
        ondelete="cascade",
        index=True,
    )
    repair_id = fields.Many2one(
        "municipal.repair.request",
        string="Засварын хүсэлт",
        related="procurement_id.repair_id",
        store=True,
        readonly=True,
        index=True,
    )
    repair_part_line_id = fields.Many2one("municipal.repair.part.line", string="Засварын сэлбэгийн мөр")
    product_id = fields.Many2one("product.product", string="Бараа / сэлбэг")
    description = fields.Char(string="Тайлбар", required=True)
    requested_quantity = fields.Float(string="Хүссэн тоо", default=1.0, required=True)
    received_quantity = fields.Float(string="Хүлээн авсан тоо")
    issued_quantity = fields.Float(string="Олгосон тоо")
    unit_of_measure = fields.Char(string="Хэмжих нэгж")
    estimated_unit_cost = fields.Float(string="Нэгжийн төсөвт өртөг")
    subtotal = fields.Float(string="Дэд дүн", compute="_compute_subtotal", store=True)
    state = fields.Selection(
        [
            ("draft", "Ноорог"),
            ("requested", "Хүссэн"),
            ("received", "Хүлээн авсан"),
            ("issued", "Олгосон"),
            ("cancelled", "Цуцлагдсан"),
        ],
        string="Төлөв",
        default="requested",
    )
    department_id = fields.Many2one(
        "hr.department",
        string="Хэлтэс",
        related="procurement_id.department_id",
        store=True,
        readonly=True,
        index=True,
    )
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        related="procurement_id.company_id",
        store=True,
        readonly=True,
    )

    @api.depends("requested_quantity", "estimated_unit_cost")
    def _compute_subtotal(self):
        for line in self:
            line.subtotal = line.requested_quantity * line.estimated_unit_cost

    @api.constrains("requested_quantity", "received_quantity", "issued_quantity")
    def _check_quantities(self):
        for line in self:
            if line.requested_quantity <= 0:
                raise ValidationError("Хүссэн тоо 0-ээс их байх ёстой.")
            if line.received_quantity < 0 or line.issued_quantity < 0:
                raise ValidationError("Хүлээн авсан болон олгосон тоо сөрөг байж болохгүй.")
            if line.issued_quantity > line.received_quantity:
                raise ValidationError("Олгосон тоо хүлээн авсан тооноос их байж болохгүй.")


class MunicipalProcurementQuote(models.Model):
    _name = "municipal.procurement.quote"
    _description = "Municipal Procurement Supplier Quote"
    _order = "procurement_id, sequence, id"

    procurement_id = fields.Many2one(
        "municipal.procurement.request",
        string="Худалдан авалтын хүсэлт",
        required=True,
        ondelete="cascade",
        index=True,
    )
    repair_id = fields.Many2one(
        "municipal.repair.request",
        string="Засварын хүсэлт",
        related="procurement_id.repair_id",
        store=True,
        readonly=True,
        index=True,
    )
    sequence = fields.Integer(string="Дараалал", default=10)
    supplier_id = fields.Many2one("res.partner", string="Нийлүүлэгч", required=True)
    supplier_name = fields.Char(string="Нийлүүлэгчийн нэр", related="supplier_id.name", store=True, readonly=True)
    quotation_ref = fields.Char(string="Үнийн саналын дугаар")
    quotation_date = fields.Date(string="Үнийн саналын огноо")
    amount_total = fields.Float(string="Нийт дүн", required=True)
    contract_required = fields.Boolean(string="Гэрээ шаардлагатай", compute="_compute_contract_required", store=True)
    is_selected = fields.Boolean(string="Сонгосон санал")
    notes = fields.Text(string="Тэмдэглэл")
    attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_procurement_quote_ir_attachment_rel",
        "quote_id",
        "attachment_id",
        string="Хавсралт",
    )
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        related="procurement_id.company_id",
        store=True,
        readonly=True,
    )

    @api.depends("amount_total")
    def _compute_contract_required(self):
        for quote in self:
            quote.contract_required = quote.amount_total >= 1000000

    @api.constrains("amount_total")
    def _check_amount_total(self):
        for quote in self:
            if quote.amount_total <= 0:
                raise ValidationError("Үнийн саналын дүн 0-ээс их байх ёстой.")

    @api.constrains("is_selected", "procurement_id")
    def _check_single_selected_quote(self):
        for quote in self.filtered("is_selected"):
            duplicate = self.search_count(
                [
                    ("id", "!=", quote.id),
                    ("procurement_id", "=", quote.procurement_id.id),
                    ("is_selected", "=", True),
                ]
            )
            if duplicate:
                raise ValidationError("Нэг худалдан авалт дээр зөвхөн нэг үнийн санал сонгоно.")


class MunicipalWarehouseMove(models.Model):
    _name = "municipal.warehouse.move"
    _description = "Municipal Warehouse In/Out Move"
    _order = "move_date desc, id desc"
    _inherit = ["mail.thread"]

    name = fields.Char(string="Гүйлгээний нэр", compute="_compute_name", store=True)
    move_type = fields.Selection(
        [("in", "Агуулахын орлого"), ("out", "Агуулахын зарлага")],
        string="Гүйлгээний төрөл",
        required=True,
        tracking=True,
    )
    procurement_id = fields.Many2one("municipal.procurement.request", string="Худалдан авалт", ondelete="set null")
    procurement_line_id = fields.Many2one("municipal.procurement.line", string="Худалдан авалтын мөр", ondelete="set null")
    repair_id = fields.Many2one("municipal.repair.request", string="Засварын хүсэлт", ondelete="set null")
    repair_part_line_id = fields.Many2one("municipal.repair.part.line", string="Засварын сэлбэгийн мөр", ondelete="set null")
    product_id = fields.Many2one("product.product", string="Бараа / сэлбэг")
    description = fields.Char(string="Тайлбар", required=True)
    quantity = fields.Float(string="Тоо хэмжээ", required=True)
    unit_of_measure = fields.Char(string="Хэмжих нэгж")
    user_id = fields.Many2one("res.users", string="Бүртгэсэн хэрэглэгч", default=lambda self: self.env.user, required=True)
    move_date = fields.Datetime(string="Гүйлгээний огноо", default=fields.Datetime.now, required=True)
    note = fields.Text(string="Тэмдэглэл")
    department_id = fields.Many2one(
        "hr.department",
        string="Хэлтэс",
        related="procurement_id.department_id",
        store=True,
        readonly=True,
        index=True,
    )
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        default=lambda self: self.env.company,
        required=True,
    )

    @api.depends("move_type", "description", "quantity")
    def _compute_name(self):
        labels = dict(self._fields["move_type"].selection)
        for move in self:
            move.name = "%s - %s (%s)" % (labels.get(move.move_type, ""), move.description or "", move.quantity or 0)

    @api.constrains("quantity")
    def _check_quantity(self):
        for move in self:
            if move.quantity <= 0:
                raise ValidationError("Агуулахын гүйлгээний тоо хэмжээ 0-ээс их байх ёстой.")
