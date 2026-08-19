# -*- coding: utf-8 -*-

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class MunicipalMaterial(models.Model):
    _name = "municipal.calculation.material"
    _description = "Тооцооллын материалын сан"
    _order = "code, name"

    code = fields.Char(string="Материалын код", required=True, readonly=True, copy=False, index=True)
    name = fields.Char(string="Материалын нэр", required=True, index=True)
    category = fields.Char(string="Ангилал", required=True, index=True)
    unit = fields.Char(string="Нэгж", required=True)
    current_price = fields.Float(string="Одоогийн нэгж үнэ", default=0, required=True)
    price_source = fields.Char(string="Үнийн эх сурвалж")
    price_effective_date = fields.Date(string="Үнийн огноо")
    description = fields.Text(string="Тайлбар")
    active = fields.Boolean(string="Идэвхтэй", default=True)
    price_history_ids = fields.One2many("municipal.calculation.material.price", "material_id", string="Үнийн түүх")

    _code_unique = models.Constraint("UNIQUE(code)", "Материалын код давхцахгүй.")
    _price_non_negative = models.Constraint("CHECK(current_price >= 0)", "Нэгж үнэ сөрөг байж болохгүй.")

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if not vals.get("code"):
                vals["code"] = self.env["ir.sequence"].next_by_code("municipal.calculation.material") or _("Шинэ")
        records = super().create(vals_list)
        for record in records:
            record._append_price_history(0, record.current_price)
        return records

    def write(self, vals):
        old_prices = {record.id: record.current_price for record in self}
        result = super().write(vals)
        if "current_price" in vals:
            for record in self:
                old_price = old_prices[record.id]
                if old_price != record.current_price:
                    record._append_price_history(old_price, record.current_price)
        return result

    def _append_price_history(self, old_price, new_price):
        self.ensure_one()
        self.env["municipal.calculation.material.price"].create({
            "material_id": self.id,
            "old_price": old_price,
            "price": new_price,
            "effective_date": fields.Date.context_today(self),
            "changed_by": self.env.user.id,
            "source": self.price_source,
        })


class MunicipalMaterialPrice(models.Model):
    _name = "municipal.calculation.material.price"
    _description = "Материалын үнийн түүх"
    _order = "effective_date desc, id desc"

    material_id = fields.Many2one("municipal.calculation.material", required=True, ondelete="cascade", index=True)
    old_price = fields.Float(string="Хуучин үнэ", default=0)
    price = fields.Float(string="Шинэ үнэ", required=True)
    effective_date = fields.Date(string="Хүчин төгөлдөр огноо", required=True, default=fields.Date.context_today)
    changed_by = fields.Many2one("res.users", string="Өөрчилсөн", default=lambda self: self.env.user, readonly=True)
    source = fields.Char(string="Эх сурвалж")

    _price_non_negative = models.Constraint("CHECK(price >= 0 AND old_price >= 0)", "Үнэ сөрөг байж болохгүй.")


class MunicipalCalculation(models.Model):
    _name = "municipal.calculation"
    _description = "Тохижилтын ажлын тооцоолол"
    _order = "date desc, id desc"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    calculation_number = fields.Char(string="Тооцооллын №", required=True, readonly=True, copy=False, default=lambda self: _("Шинэ"), index=True)
    date = fields.Date(string="Огноо", required=True, default=fields.Date.context_today, tracking=True)
    work_name = fields.Char(string="Ажлын нэр", required=True, tracking=True, index=True)
    work_type = fields.Char(string="Ажлын төрөл", index=True)
    location = fields.Char(string="Байршил", required=True, tracking=True, index=True)
    description = fields.Text(string="Ажлын тайлбар")
    quantity = fields.Float(string="Тоо хэмжээ", default=1, required=True)
    unit = fields.Char(string="Хэмжих нэгж", required=True)
    status = fields.Selection([("draft", "Ноорог"), ("calculated", "Тооцоолсон"), ("approved", "Баталгаажсан")], string="Төлөв", default="draft", required=True, tracking=True, index=True)
    work_package_id = fields.Many2one("municipal.calculation.work.package", string="Эх ажлын багц", ondelete="set null", readonly=True)
    work_package_code = fields.Char(string="Багцын кодын snapshot", readonly=True)
    work_package_name = fields.Char(string="Багцын нэрийн snapshot", readonly=True)
    work_package_base_unit = fields.Char(string="Багцын суурь нэгжийн snapshot", readonly=True)
    material_line_ids = fields.One2many("municipal.calculation.line.material", "calculation_id", copy=True)
    labor_line_ids = fields.One2many("municipal.calculation.line.labor", "calculation_id", copy=True)
    equipment_line_ids = fields.One2many("municipal.calculation.line.equipment", "calculation_id", copy=True)
    transport_line_ids = fields.One2many("municipal.calculation.line.transport", "calculation_id", copy=True)
    other_line_ids = fields.One2many("municipal.calculation.line.other", "calculation_id", copy=True)
    material_total = fields.Float(compute="_compute_totals", store=True)
    labor_total = fields.Float(compute="_compute_totals", store=True)
    equipment_total = fields.Float(compute="_compute_totals", store=True)
    transportation_total = fields.Float(compute="_compute_totals", store=True)
    other_total = fields.Float(compute="_compute_totals", store=True)
    grand_total = fields.Float(compute="_compute_totals", store=True)
    created_by = fields.Many2one("res.users", default=lambda self: self.env.user, readonly=True)
    updated_by = fields.Many2one("res.users", readonly=True)

    _quantity_non_negative = models.Constraint("CHECK(quantity >= 0)", "Тоо хэмжээ сөрөг байж болохгүй.")

    @api.depends("material_line_ids.total", "labor_line_ids.total", "equipment_line_ids.total", "transport_line_ids.total", "other_line_ids.amount")
    def _compute_totals(self):
        for record in self:
            record.material_total = sum(record.material_line_ids.mapped("total"))
            record.labor_total = sum(record.labor_line_ids.mapped("total"))
            record.equipment_total = sum(record.equipment_line_ids.mapped("total"))
            record.transportation_total = sum(record.transport_line_ids.mapped("total"))
            record.other_total = sum(record.other_line_ids.mapped("amount"))
            record.grand_total = record.material_total + record.labor_total + record.equipment_total + record.transportation_total + record.other_total

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get("calculation_number", _("Шинэ")) == _("Шинэ"):
                vals["calculation_number"] = self.env["ir.sequence"].next_by_code("municipal.calculation") or _("Шинэ")
        return super().create(vals_list)

    def write(self, vals):
        vals = dict(vals, updated_by=self.env.user.id)
        return super().write(vals)

    def copy(self, default=None):
        default = dict(default or {})
        default.update({"calculation_number": _("Шинэ"), "date": fields.Date.context_today(self), "status": "draft"})
        return super().copy(default)


class CalculationLineMixin(models.AbstractModel):
    _name = "municipal.calculation.line.mixin"
    _description = "Тооцооллын мөрийн суурь"

    calculation_id = fields.Many2one("municipal.calculation", required=True, ondelete="cascade", index=True)


class CalculationMaterialLine(models.Model):
    _name = "municipal.calculation.line.material"
    _description = "Тооцооллын материал"
    _inherit = "municipal.calculation.line.mixin"

    material_id = fields.Many2one("municipal.calculation.material", required=True, ondelete="restrict")
    material_code = fields.Char(required=True)
    material_name = fields.Char(required=True)
    category = fields.Char(required=True)
    unit = fields.Char(required=True)
    quantity = fields.Float(default=1, required=True)
    unit_price = fields.Float(default=0, required=True)
    norm = fields.Float(string="Багцын нормын snapshot", default=0)
    total = fields.Float(compute="_compute_total", store=True)

    @api.onchange("material_id")
    def _onchange_material_id(self):
        for line in self.filtered("material_id"):
            line.material_code = line.material_id.code
            line.material_name = line.material_id.name
            line.category = line.material_id.category
            line.unit = line.material_id.unit
            line.unit_price = line.material_id.current_price

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            material = self.env["municipal.calculation.material"].browse(vals.get("material_id"))
            if material.exists():
                vals.setdefault("material_code", material.code)
                vals.setdefault("material_name", material.name)
                vals.setdefault("category", material.category)
                vals.setdefault("unit", material.unit)
                vals.setdefault("unit_price", material.current_price)
        return super().create(vals_list)

    @api.depends("quantity", "unit_price")
    def _compute_total(self):
        for line in self:
            line.total = line.quantity * line.unit_price

    @api.constrains("quantity", "unit_price")
    def _check_non_negative(self):
        if any(line.quantity < 0 or line.unit_price < 0 for line in self):
            raise ValidationError("Тоо хэмжээ болон нэгж үнэ сөрөг байж болохгүй.")


class CalculationLaborLine(models.Model):
    _name = "municipal.calculation.line.labor"
    _description = "Тооцооллын ажлын хөлс"
    _inherit = "municipal.calculation.line.mixin"
    work_type = fields.Char(required=True)
    employee_count = fields.Integer(default=1, required=True)
    duration = fields.Float(default=1, required=True)
    unit = fields.Char(default="хоног", required=True)
    unit_price = fields.Float(default=0, required=True)
    norm = fields.Float(string="Багцын нормын snapshot", default=0)
    total = fields.Float(compute="_compute_total", store=True)
    @api.depends("employee_count", "duration", "unit_price")
    def _compute_total(self):
        for line in self: line.total = line.employee_count * line.duration * line.unit_price
    @api.constrains("employee_count", "duration", "unit_price")
    def _check_non_negative(self):
        if any(line.employee_count < 0 or line.duration < 0 or line.unit_price < 0 for line in self): raise ValidationError("Ажлын хөлсний утга сөрөг байж болохгүй.")


class CalculationEquipmentLine(models.Model):
    _name = "municipal.calculation.line.equipment"
    _description = "Тооцооллын техник"
    _inherit = "municipal.calculation.line.mixin"
    equipment_name = fields.Char(required=True)
    hours = fields.Float(default=1, required=True)
    hourly_rate = fields.Float(default=0, required=True)
    norm = fields.Float(string="Багцын нормын snapshot", default=0)
    total = fields.Float(compute="_compute_total", store=True)
    @api.depends("hours", "hourly_rate")
    def _compute_total(self):
        for line in self: line.total = line.hours * line.hourly_rate
    @api.constrains("hours", "hourly_rate")
    def _check_non_negative(self):
        if any(line.hours < 0 or line.hourly_rate < 0 for line in self): raise ValidationError("Техникийн утга сөрөг байж болохгүй.")


class CalculationTransportLine(models.Model):
    _name = "municipal.calculation.line.transport"
    _description = "Тооцооллын тээвэр"
    _inherit = "municipal.calculation.line.mixin"
    transport_type = fields.Char(required=True)
    quantity = fields.Float(default=1, required=True)
    unit_price = fields.Float(default=0, required=True)
    norm = fields.Float(string="Багцын нормын snapshot", default=0)
    total = fields.Float(compute="_compute_total", store=True)
    @api.depends("quantity", "unit_price")
    def _compute_total(self):
        for line in self: line.total = line.quantity * line.unit_price
    @api.constrains("quantity", "unit_price")
    def _check_non_negative(self):
        if any(line.quantity < 0 or line.unit_price < 0 for line in self): raise ValidationError("Тээврийн утга сөрөг байж болохгүй.")


class CalculationOtherLine(models.Model):
    _name = "municipal.calculation.line.other"
    _description = "Тооцооллын бусад зардал"
    _inherit = "municipal.calculation.line.mixin"
    name = fields.Char(required=True)
    description = fields.Char()
    amount = fields.Float(default=0, required=True)
    norm = fields.Float(string="Багцын нормын snapshot", default=0)
    _amount_non_negative = models.Constraint("CHECK(amount >= 0)", "Бусад зардал сөрөг байж болохгүй.")
