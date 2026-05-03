# -*- coding: utf-8 -*-

from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError


REPAIR_STATES = [
    ("new", "Шинэ"),
    ("diagnosed", "Оношилсон"),
    ("waiting_parts", "Сэлбэг хүлээж байна"),
    ("waiting_approval", "Баталгаа хүлээж байна"),
    ("approved", "Батлагдсан"),
    ("in_repair", "Засварт байна"),
    ("done", "Засвар дууссан"),
    ("vehicle_returned", "Машин буцаасан"),
    ("cancelled", "Цуцлагдсан"),
]


class MunicipalRepairRequest(models.Model):
    _name = "municipal.repair.request"
    _description = "Municipal Repair Request"
    _order = "request_date desc, id desc"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(string="Хүсэлтийн дугаар", required=True, default="Шинэ", tracking=True)
    issue_summary = fields.Char(string="Асуудлын товч", tracking=True)
    vehicle_id = fields.Many2one("fleet.vehicle", string="Машин", required=True, tracking=True)
    driver_id = fields.Many2one("hr.employee", string="Жолооч", tracking=True)
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
    issue_description = fields.Text(string="Эвдрэлийн тайлбар", tracking=True)
    damage_type = fields.Char(string="Эвдрэлийн төрөл", tracking=True)
    description = fields.Text(string="Тайлбар")
    parts_note = fields.Text(string="Сэлбэгийн тэмдэглэл")
    photo_ids = fields.Many2many(
        "ir.attachment",
        "municipal_repair_photo_attachment_rel",
        "repair_id",
        "attachment_id",
        string="Зураг / хавсралт",
    )
    attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_repair_attachment_rel",
        "repair_id",
        "attachment_id",
        string="Хавсралт",
    )
    diagnosis = fields.Text(string="Оношилгоо", tracking=True)
    mechanic_id = fields.Many2one("hr.employee", string="Засварчин", tracking=True)
    supervisor_id = fields.Many2one("res.users", string="Хянагч", tracking=True)
    required_part_ids = fields.One2many(
        "municipal.repair.part.line",
        "repair_id",
        string="Шаардлагатай сэлбэг",
    )
    estimated_cost = fields.Float(string="Тооцоолсон зардал", tracking=True)
    actual_cost = fields.Float(string="Бодит зардал", tracking=True)
    amount_total = fields.Float(string="Нийт дүн", compute="_compute_amounts", store=True)
    selected_supplier_total = fields.Float(string="Сонгосон нийлүүлэгчийн дүн", compute="_compute_amounts", store=True)
    contract_required = fields.Boolean(string="Гэрээ шаардлагатай", compute="_compute_amounts", store=True)
    state = fields.Selection(
        REPAIR_STATES,
        string="Төлөв",
        default="new",
        required=True,
        tracking=True,
        index=True,
    )
    payment_state = fields.Selection(
        [("none", "Үүсээгүй"), ("pending", "Хүлээгдэж байна"), ("paid", "Төлсөн")],
        string="Төлбөрийн төлөв",
        default="none",
    )
    contract_state = fields.Selection(
        [("none", "Шаардлагагүй"), ("draft", "Ноорог"), ("signed", "Гарын үсэгтэй")],
        string="Гэрээний төлөв",
        default="none",
    )
    order_state = fields.Selection(
        [("none", "Үүсээгүй"), ("uploaded", "Тушаал хавсарсан")],
        string="Тушаалын төлөв",
        default="none",
    )
    repair_note = fields.Text(string="Засварын тэмдэглэл")
    repair_started_at = fields.Datetime(string="Засвар эхэлсэн огноо", readonly=True)
    repair_done_at = fields.Datetime(string="Засвар дууссан огноо", readonly=True)
    approved_by = fields.Many2one("res.users", string="Баталсан хэрэглэгч", readonly=True)
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        default=lambda self: self.env.company,
        required=True,
    )
    department_id = fields.Many2one("hr.department", string="Хэлтэс", tracking=True)
    priority = fields.Selection(
        [
            ("0", "Энгийн"),
            ("1", "Чухал"),
            ("2", "Яаралтай"),
            ("3", "Маш яаралтай"),
        ],
        string="Эрэмбэ",
        default="0",
        tracking=True,
    )
    active = fields.Boolean(string="Идэвхтэй", default=True)
    procurement_request_id = fields.Many2one(
        "municipal.procurement.request",
        string="Худалдан авалтын хүсэлт",
        readonly=True,
        copy=False,
    )
    quote_line_ids = fields.One2many(
        "municipal.procurement.quote",
        "repair_id",
        string="Үнийн саналууд",
    )
    supplier_quote_ids = fields.One2many(
        "municipal.procurement.quote",
        "repair_id",
        string="Нийлүүлэгчийн үнийн саналууд",
    )
    selected_supplier_id = fields.Many2one(
        "res.partner",
        string="Сонгосон нийлүүлэгч",
        related="procurement_request_id.selected_supplier_id",
        store=True,
        readonly=True,
    )

    @api.model_create_multi
    def create(self, vals_list):
        sequence = self.env["ir.sequence"].sudo()
        for vals in vals_list:
            if vals.get("name", "Шинэ") == "Шинэ":
                vals["name"] = sequence.next_by_code("municipal.repair.request") or "Шинэ"
            if vals.get("description") and not vals.get("issue_description"):
                vals["issue_description"] = vals["description"]
        return super().create(vals_list)

    @api.depends("estimated_cost", "actual_cost", "required_part_ids.requested_quantity", "required_part_ids.estimated_unit_cost")
    def _compute_amounts(self):
        for request in self:
            line_total = sum(
                line.requested_quantity * line.estimated_unit_cost
                for line in request.required_part_ids
            )
            amount = request.actual_cost or request.estimated_cost or line_total
            request.amount_total = amount
            request.selected_supplier_total = amount
            request.contract_required = amount >= 1000000

    @api.constrains("vehicle_id", "state")
    def _check_vehicle_not_already_in_repair(self):
        active_states = ["new", "diagnosed", "waiting_parts", "waiting_approval", "approved", "in_repair"]
        for request in self:
            if not request.vehicle_id or request.state not in active_states:
                continue
            duplicate = self.search_count(
                [
                    ("id", "!=", request.id),
                    ("vehicle_id", "=", request.vehicle_id.id),
                    ("state", "in", active_states),
                ]
            )
            if duplicate:
                raise ValidationError("Энэ машин дээр идэвхтэй засварын хүсэлт байна.")

    def _set_state(self, state, extra_values=None):
        values = {"state": state}
        if extra_values:
            values.update(extra_values)
        self.write(values)
        return True

    def _set_vehicle_status(self, status):
        for request in self:
            if request.vehicle_id and "x_municipal_operational_status" in request.vehicle_id._fields:
                request.vehicle_id.x_municipal_operational_status = status

    def action_diagnose(self):
        for request in self:
            if not request.diagnosis:
                raise UserError("Оношилгоо оруулна уу.")
        return self._set_state("diagnosed")

    def action_request_parts(self):
        for request in self:
            if not request.required_part_ids and not request.parts_note:
                raise UserError("Сэлбэгийн хэрэгцээ эсвэл тэмдэглэл оруулна уу.")
        self._set_state("waiting_parts")
        return self.action_create_procurement_request()

    def action_request_approval(self):
        return self._set_state("waiting_approval")

    def action_submit(self, payload=None):
        return self.action_request_approval()

    def action_approve(self):
        return self._set_state("approved", {"approved_by": self.env.user.id})

    def action_director_approve(self, payload=None):
        return self.action_approve()

    def action_start_repair(self):
        self._set_vehicle_status("in_repair")
        return self._set_state("in_repair", {"repair_started_at": fields.Datetime.now()})

    def action_done(self, payload=None):
        self._set_vehicle_status("available")
        self._set_state("done", {"repair_done_at": fields.Datetime.now()})
        return True

    def action_return_vehicle(self):
        self._set_vehicle_status("available")
        return self._set_state("vehicle_returned")

    def action_cancel(self):
        self._set_vehicle_status("available")
        return self._set_state("cancelled")

    def action_reset_to_new(self):
        return self._set_state("new", {"approved_by": False})

    def action_receive_parts(self, payload=None):
        for request in self:
            if request.procurement_request_id:
                request.procurement_request_id.action_issue_to_repair()
                continue
            for line in request.required_part_ids:
                line.write(
                    {
                        "state": "issued",
                        "issued_quantity": line.requested_quantity or line.quantity or 0,
                    }
                )
        return self._set_state("approved")

    def action_add_quotes(self, payload=None):
        note = ""
        if isinstance(payload, dict):
            note = payload.get("note") or payload.get("quotes") or ""
        for request in self:
            if note:
                request.parts_note = "%s\n%s" % (request.parts_note or "", note)
        return self.action_create_procurement_request()

    def action_select_supplier(self, payload=None):
        return self.action_request_approval()

    def action_make_payment(self, payload=None):
        return self.write({"payment_state": "paid"})

    def action_upload_contract_draft(self, payload=None):
        return self.write({"contract_state": "draft"})

    def action_upload_contract_final(self, payload=None):
        return self.write({"contract_state": "signed"})

    def action_upload_director_order(self, payload=None):
        return self.write({"order_state": "uploaded"})

    def action_create_procurement_request(self):
        procurement_model = self.env["municipal.procurement.request"]
        for request in self:
            if request.procurement_request_id:
                continue
            procurement = procurement_model.create(
                {
                    "name": "Сэлбэг - %s" % request.name,
                    "request_type": "repair_part",
                    "department_id": request.department_id.id or False,
                    "repair_id": request.id,
                    "vehicle_id": request.vehicle_id.id,
                    "amount_total": request.amount_total,
                    "company_id": request.company_id.id,
                }
            )
            for part in request.required_part_ids:
                self.env["municipal.procurement.line"].create(
                    {
                        "procurement_id": procurement.id,
                        "repair_part_line_id": part.id,
                        "product_id": part.product_id.id or False,
                        "description": part.description,
                        "requested_quantity": part.requested_quantity or part.quantity or 1.0,
                        "unit_of_measure": part.unit_of_measure,
                        "estimated_unit_cost": part.estimated_unit_cost,
                    }
                )
            request.procurement_request_id = procurement.id
        return True


class MunicipalRepairPartLine(models.Model):
    _name = "municipal.repair.part.line"
    _description = "Municipal Repair Part Line"
    _order = "repair_id, id"

    repair_id = fields.Many2one(
        "municipal.repair.request",
        string="Засварын хүсэлт",
        required=True,
        ondelete="cascade",
    )
    product_id = fields.Many2one("product.product", string="Бараа / сэлбэг")
    description = fields.Char(string="Тайлбар", required=True)
    quantity = fields.Float(string="Тоо хэмжээ", default=1.0)
    unit_of_measure = fields.Char(string="Хэмжих нэгж")
    available_quantity = fields.Float(string="Бэлэн үлдэгдэл", compute="_compute_available_quantity")
    requested_quantity = fields.Float(string="Хүссэн тоо", default=1.0)
    issued_quantity = fields.Float(string="Олгосон тоо")
    estimated_unit_cost = fields.Float(string="Нэгж өртөг")
    state = fields.Selection(
        [
            ("draft", "Ноорог"),
            ("requested", "Хүссэн"),
            ("issued", "Олгосон"),
            ("missing", "Дутуу"),
            ("cancelled", "Цуцлагдсан"),
        ],
        string="Төлөв",
        default="draft",
    )

    @api.constrains("quantity", "requested_quantity", "issued_quantity")
    def _check_quantities(self):
        for line in self:
            if line.quantity < 0 or line.requested_quantity < 0 or line.issued_quantity < 0:
                raise ValidationError("Сэлбэгийн тоо хэмжээ сөрөг байж болохгүй.")

    def _compute_available_quantity(self):
        quant_model = self.env.registry.get("stock.quant") and self.env["stock.quant"]
        for line in self:
            if not quant_model or not line.product_id:
                line.available_quantity = 0
                continue
            line.available_quantity = sum(
                quant_model.search([("product_id", "=", line.product_id.id)]).mapped("quantity")
            )
