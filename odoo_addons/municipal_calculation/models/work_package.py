# -*- coding: utf-8 -*-

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class MunicipalLaborRate(models.Model):
    _name = "municipal.calculation.labor.rate"
    _description = "Ажлын хөлсний үнэлгээ"
    _order = "code, name"

    code = fields.Char(required=True, readonly=True, copy=False, index=True, default=lambda self: _("Шинэ"))
    name = fields.Char(string="Ажлын төрөл", required=True, index=True)
    unit = fields.Char(string="Нэгж", required=True, default="хүн/өдөр")
    current_rate = fields.Float(string="Нэгж үнэлгээ", required=True, default=0)
    active = fields.Boolean(default=True)
    history_ids = fields.One2many("municipal.calculation.labor.rate.history", "labor_rate_id")

    _code_unique = models.Constraint("UNIQUE(code)", "Ажлын хөлсний код давхцахгүй.")
    _rate_non_negative = models.Constraint("CHECK(current_rate >= 0)", "Ажлын хөлсний үнэлгээ сөрөг байж болохгүй.")

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get("code", _("Шинэ")) == _("Шинэ"):
                vals["code"] = self.env["ir.sequence"].next_by_code("municipal.calculation.labor.rate") or _("Шинэ")
        records = super().create(vals_list)
        for record in records:
            record._append_history(0, record.current_rate)
        return records

    def write(self, vals):
        old = {record.id: record.current_rate for record in self}
        result = super().write(vals)
        if "current_rate" in vals:
            for record in self:
                if old[record.id] != record.current_rate:
                    record._append_history(old[record.id], record.current_rate)
        return result

    def _append_history(self, old_rate, new_rate):
        self.env["municipal.calculation.labor.rate.history"].create({
            "labor_rate_id": self.id, "old_rate": old_rate, "rate": new_rate,
            "effective_date": fields.Date.context_today(self), "changed_by": self.env.user.id,
        })


class MunicipalLaborRateHistory(models.Model):
    _name = "municipal.calculation.labor.rate.history"
    _description = "Ажлын хөлсний үнийн түүх"
    _order = "effective_date desc, id desc"

    labor_rate_id = fields.Many2one("municipal.calculation.labor.rate", required=True, ondelete="cascade", index=True)
    old_rate = fields.Float(default=0)
    rate = fields.Float(required=True)
    effective_date = fields.Date(required=True, default=fields.Date.context_today)
    changed_by = fields.Many2one("res.users", default=lambda self: self.env.user, readonly=True)


class MunicipalWorkPackage(models.Model):
    _name = "municipal.calculation.work.package"
    _description = "Ажлын багц / Норматив багц"
    _order = "code, name"
    _inherit = ["mail.thread"]

    code = fields.Char(required=True, readonly=True, copy=False, index=True, default=lambda self: _("Шинэ"))
    name = fields.Char(string="Багцын нэр", required=True, tracking=True, index=True)
    category = fields.Char(string="Ангилал", required=True, index=True)
    base_unit = fields.Char(string="Суурь нэгж", required=True)
    description = fields.Text(string="Тайлбар")
    active = fields.Boolean(default=True, tracking=True)
    material_line_ids = fields.One2many("municipal.calculation.work.package.material", "package_id", copy=True)
    labor_line_ids = fields.One2many("municipal.calculation.work.package.labor", "package_id", copy=True)
    equipment_line_ids = fields.One2many("municipal.calculation.work.package.equipment", "package_id", copy=True)
    transport_line_ids = fields.One2many("municipal.calculation.work.package.transport", "package_id", copy=True)
    other_line_ids = fields.One2many("municipal.calculation.work.package.other", "package_id", copy=True)
    component_count = fields.Integer(compute="_compute_component_count")
    created_by = fields.Many2one("res.users", default=lambda self: self.env.user, readonly=True)
    updated_by = fields.Many2one("res.users", readonly=True)

    _code_unique = models.Constraint("UNIQUE(code)", "Ажлын багцын код давхцахгүй.")

    @api.depends("material_line_ids", "labor_line_ids", "equipment_line_ids", "transport_line_ids", "other_line_ids")
    def _compute_component_count(self):
        for record in self:
            record.component_count = sum(map(len, [record.material_line_ids, record.labor_line_ids, record.equipment_line_ids, record.transport_line_ids, record.other_line_ids]))

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if not vals.get("labor_line_ids"):
                raise ValidationError("Ажлын багцад заавал ажлын хөлсний тооцоо оруулна уу.")
            if not vals.get("material_line_ids"):
                raise ValidationError("Ажлын багцад заавал материалын норм оруулна уу.")
            if vals.get("code", _("Шинэ")) == _("Шинэ"):
                vals["code"] = self.env["ir.sequence"].next_by_code("municipal.calculation.work.package") or _("Шинэ")
        return super().create(vals_list)

    def write(self, vals):
        vals = dict(vals, updated_by=self.env.user.id)
        result = super().write(vals)
        for record in self:
            if not record.labor_line_ids:
                raise ValidationError("Ажлын багцад заавал ажлын хөлсний тооцоо оруулна уу.")
            if not record.material_line_ids:
                raise ValidationError("Ажлын багцад заавал материалын норм оруулна уу.")
        return result

    def copy(self, default=None):
        default = dict(default or {}, code=_("Шинэ"), name=_("%s — хуулбар") % self.name)
        return super().copy(default)


class PackageLineMixin(models.AbstractModel):
    _name = "municipal.calculation.work.package.line.mixin"
    _description = "Ажлын багцын нормын мөр"
    package_id = fields.Many2one("municipal.calculation.work.package", required=True, ondelete="cascade", index=True)
    norm = fields.Float(string="Норм", required=True, default=1)
    unit = fields.Char(string="Нэгж", required=True)
    unit_price = fields.Float(string="Лавлах нэгж үнэ", required=True, default=0)

    @api.constrains("norm", "unit_price")
    def _validate_values(self):
        if any(line.norm <= 0 for line in self):
            raise ValidationError("Норм 0-ээс их байна.")
        if any(line.unit_price < 0 for line in self):
            raise ValidationError("Нэгж үнэ сөрөг байж болохгүй.")


class PackageMaterial(models.Model):
    _name = "municipal.calculation.work.package.material"
    _description = "Ажлын багцын материал"
    _inherit = "municipal.calculation.work.package.line.mixin"
    material_id = fields.Many2one("municipal.calculation.material", required=True, ondelete="restrict")


class PackageLabor(models.Model):
    _name = "municipal.calculation.work.package.labor"
    _description = "Ажлын багцын ажлын хөлс"
    _inherit = "municipal.calculation.work.package.line.mixin"
    labor_rate_id = fields.Many2one("municipal.calculation.labor.rate", required=True, ondelete="restrict")
    required = fields.Boolean(default=True, required=True)


class PackageEquipment(models.Model):
    _name = "municipal.calculation.work.package.equipment"
    _description = "Ажлын багцын техник"
    _inherit = "municipal.calculation.work.package.line.mixin"
    name = fields.Char(required=True)


class PackageTransport(models.Model):
    _name = "municipal.calculation.work.package.transport"
    _description = "Ажлын багцын тээвэр"
    _inherit = "municipal.calculation.work.package.line.mixin"
    name = fields.Char(required=True)


class PackageOther(models.Model):
    _name = "municipal.calculation.work.package.other"
    _description = "Ажлын багцын бусад зардал"
    _inherit = "municipal.calculation.work.package.line.mixin"
    name = fields.Char(required=True)
    description = fields.Char()
