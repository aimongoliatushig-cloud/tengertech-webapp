# -*- coding: utf-8 -*-

from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError


IMPROVEMENT_ACTIVITY_STATES = [
    ("draft", "Ноорог"),
    ("planned", "Төлөвлөсөн"),
    ("assigned", "Оноогдсон"),
    ("in_progress", "Эхэлсэн"),
    ("submitted", "Тайлан илгээсэн"),
    ("under_review", "Хяналтад"),
    ("returned", "Буцаагдсан"),
    ("approved", "Баталгаажсан"),
    ("done", "Дууссан"),
    ("cancelled", "Цуцлагдсан"),
]


class MunicipalImprovementArea(models.Model):
    _name = "municipal.improvement.area"
    _description = "Тохижилтын талбай"
    _order = "department_id, name"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(string="Талбайн нэр", required=True, tracking=True)
    code = fields.Char(string="Код", index=True, tracking=True)
    area_type = fields.Selection(
        [
            ("square", "Талбай"),
            ("street", "Гудамж / зам талбай"),
            ("park", "Цэцэрлэгт хүрээлэн"),
            ("playground", "Тоглоомын талбай"),
            ("bus_stop", "Автобусны буудал"),
            ("other", "Бусад"),
        ],
        string="Талбайн төрөл",
        default="square",
        required=True,
        tracking=True,
    )
    department_id = fields.Many2one("hr.department", string="Хэлтэс", required=True, index=True, tracking=True)
    responsible_employee_id = fields.Many2one("hr.employee", string="Хариуцсан даамал / инженер", tracking=True)
    district = fields.Char(string="Дүүрэг")
    khoroo = fields.Char(string="Хороо")
    address = fields.Char(string="Хаяг")
    gps_latitude = fields.Float(string="Өргөрөг", digits=(10, 7))
    gps_longitude = fields.Float(string="Уртраг", digits=(10, 7))
    note = fields.Text(string="Тайлбар")
    object_ids = fields.One2many("municipal.improvement.object", "area_id", string="Объектууд")
    activity_ids = fields.One2many("municipal.improvement.activity", "area_id", string="Тохижилтын ажил")
    photo_ids = fields.Many2many(
        "ir.attachment",
        "municipal_improvement_area_attachment_rel",
        "area_id",
        "attachment_id",
        string="Зураг / хавсралт",
    )
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        required=True,
        default=lambda self: self.env.company,
        index=True,
    )
    active = fields.Boolean(string="Идэвхтэй", default=True)


class MunicipalImprovementObject(models.Model):
    _name = "municipal.improvement.object"
    _description = "Тохижилтын объект"
    _order = "area_id, object_type, name"
    _inherit = ["mail.thread"]

    name = fields.Char(string="Объектын нэр", required=True, tracking=True)
    code = fields.Char(string="Код", index=True)
    area_id = fields.Many2one(
        "municipal.improvement.area",
        string="Талбай",
        required=True,
        ondelete="restrict",
        index=True,
        tracking=True,
    )
    department_id = fields.Many2one(
        "hr.department",
        string="Хэлтэс",
        related="area_id.department_id",
        store=True,
        readonly=True,
        index=True,
    )
    object_type = fields.Selection(
        [
            ("bench", "Сандал"),
            ("fence", "Хашаа"),
            ("lighting", "Гэрэлтүүлэг"),
            ("metal_structure", "Төмөр хийц"),
            ("playground", "Тоглоомын төхөөрөмж"),
            ("trash_bin", "Хогийн сав"),
            ("sign", "Тэмдэг, самбар"),
            ("other", "Бусад"),
        ],
        string="Объектын төрөл",
        default="bench",
        required=True,
        tracking=True,
    )
    material = fields.Char(string="Материал")
    installed_date = fields.Date(string="Суурилуулсан огноо")
    condition = fields.Selection(
        [
            ("good", "Хэвийн"),
            ("needs_repair", "Засвар шаардлагатай"),
            ("damaged", "Гэмтсэн"),
            ("removed", "Буулгасан"),
        ],
        string="Төлөв байдал",
        default="good",
        required=True,
        tracking=True,
    )
    responsible_employee_id = fields.Many2one("hr.employee", string="Хариуцсан ажилтан", tracking=True)
    note = fields.Text(string="Тайлбар")
    activity_ids = fields.One2many("municipal.improvement.activity", "object_id", string="Ажлын түүх")
    photo_ids = fields.Many2many(
        "ir.attachment",
        "municipal_improvement_object_attachment_rel",
        "object_id",
        "attachment_id",
        string="Зураг / хавсралт",
    )
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        related="area_id.company_id",
        store=True,
        readonly=True,
    )
    active = fields.Boolean(string="Идэвхтэй", default=True)


class MunicipalImprovementActivity(models.Model):
    _name = "municipal.improvement.activity"
    _description = "Тохижилтын ажил"
    _order = "planned_date desc, id desc"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(string="Ажлын нэр", required=True, tracking=True)
    activity_type = fields.Selection(
        [
            ("welding", "Гагнуур"),
            ("repair", "Засвар"),
            ("installation", "Угсралт"),
            ("painting", "Будалт"),
            ("cleaning", "Цэвэрлэгээ"),
            ("inspection", "Үзлэг"),
            ("other", "Бусад"),
        ],
        string="Ажлын төрөл",
        default="repair",
        required=True,
        tracking=True,
    )
    area_id = fields.Many2one(
        "municipal.improvement.area",
        string="Талбай",
        required=True,
        ondelete="restrict",
        index=True,
        tracking=True,
    )
    object_id = fields.Many2one("municipal.improvement.object", string="Объект", ondelete="set null", tracking=True)
    department_id = fields.Many2one(
        "hr.department",
        string="Хэлтэс",
        related="area_id.department_id",
        store=True,
        readonly=True,
        index=True,
    )
    assigned_user_id = fields.Many2one("res.users", string="Оноосон хэрэглэгч", index=True, tracking=True)
    assigned_employee_id = fields.Many2one("hr.employee", string="Оноосон ажилтан", index=True, tracking=True)
    field_engineer_id = fields.Many2one("hr.employee", string="Даамал / талбайн инженер", tracking=True)
    reviewer_id = fields.Many2one("res.users", string="Хэлтсийн баталгаажуулагч", tracking=True)
    planned_date = fields.Datetime(string="Төлөвлөсөн хугацаа", tracking=True)
    start_datetime = fields.Datetime(string="Эхэлсэн хугацаа", tracking=True)
    done_datetime = fields.Datetime(string="Дууссан хугацаа", tracking=True)
    planned_quantity = fields.Float(string="Төлөвлөсөн тоо хэмжээ")
    actual_quantity = fields.Float(string="Гүйцэтгэсэн тоо хэмжээ")
    unit = fields.Char(string="Хэмжих нэгж")
    description = fields.Text(string="Тайлбар")
    report_note = fields.Text(string="Гүйцэтгэлийн тайлан")
    requires_photo = fields.Boolean(string="Зураг шаардах", default=True, tracking=True)
    material_line_ids = fields.One2many(
        "municipal.improvement.material.line",
        "activity_id",
        string="Материалын хэрэгцээ",
    )
    photo_ids = fields.Many2many(
        "ir.attachment",
        "municipal_improvement_activity_attachment_rel",
        "activity_id",
        "attachment_id",
        string="Зурагтай тайлан",
    )
    state = fields.Selection(
        IMPROVEMENT_ACTIVITY_STATES,
        string="Төлөв",
        default="draft",
        required=True,
        tracking=True,
        index=True,
    )
    approved_by = fields.Many2one("res.users", string="Баталсан хэрэглэгч", readonly=True)
    rejected_by = fields.Many2one("res.users", string="Буцаасан хэрэглэгч", readonly=True)
    rejection_reason = fields.Text(string="Буцаасан шалтгаан", tracking=True)
    work_id = fields.Many2one("municipal.work", string="Холбогдох ажил", ondelete="set null")
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        related="area_id.company_id",
        store=True,
        readonly=True,
    )

    @api.onchange("object_id")
    def _onchange_object_id(self):
        for activity in self:
            if activity.object_id:
                activity.area_id = activity.object_id.area_id

    @api.constrains("planned_date", "done_datetime")
    def _check_done_after_planned(self):
        for activity in self:
            if activity.planned_date and activity.done_datetime and activity.done_datetime < activity.planned_date:
                raise ValidationError("Дууссан хугацаа төлөвлөсөн хугацаанаас өмнө байж болохгүй.")

    @api.constrains("state", "rejection_reason")
    def _check_return_reason(self):
        for activity in self:
            if activity.state == "returned" and not activity.rejection_reason:
                raise ValidationError("Буцаах үед шалтгаан заавал оруулна.")

    @api.constrains("state", "photo_ids", "requires_photo")
    def _check_required_photo(self):
        for activity in self:
            if activity.requires_photo and activity.state in ("submitted", "under_review", "approved", "done") and not activity.photo_ids:
                raise ValidationError("Тайлан илгээхээс өмнө зураг хавсаргана уу.")

    def _set_state(self, state, extra_values=None):
        values = {"state": state}
        if extra_values:
            values.update(extra_values)
        self.write(values)
        return True

    def action_plan(self):
        return self._set_state("planned")

    def action_assign(self):
        for activity in self:
            if not activity.assigned_user_id and not activity.assigned_employee_id:
                raise UserError("Хариуцсан хэрэглэгч эсвэл ажилтан сонгоно уу.")
        return self._set_state("assigned")

    def action_start(self):
        return self._set_state("in_progress", {"start_datetime": fields.Datetime.now()})

    def action_submit(self):
        for activity in self:
            if activity.requires_photo and not activity.photo_ids:
                raise UserError("Тайлан илгээхээс өмнө зураг хавсаргана уу.")
        return self._set_state("submitted", {"done_datetime": fields.Datetime.now()})

    def action_review(self):
        return self._set_state("under_review")

    def action_return(self):
        for activity in self:
            if not activity.rejection_reason:
                raise UserError("Буцаах шалтгаан оруулна уу.")
        return self._set_state("returned", {"rejected_by": self.env.user.id})

    def action_approve(self):
        return self._set_state("approved", {"approved_by": self.env.user.id})

    def action_done(self):
        return self._set_state("done")

    def action_cancel(self):
        return self._set_state("cancelled")

    def action_reset_to_draft(self):
        return self._set_state(
            "draft",
            {
                "approved_by": False,
                "rejected_by": False,
                "rejection_reason": False,
            },
        )


class MunicipalImprovementMaterialLine(models.Model):
    _name = "municipal.improvement.material.line"
    _description = "Тохижилтын материалын хэрэгцээ"
    _order = "activity_id, id"

    activity_id = fields.Many2one(
        "municipal.improvement.activity",
        string="Тохижилтын ажил",
        required=True,
        ondelete="cascade",
        index=True,
    )
    name = fields.Char(string="Материал", required=True)
    quantity = fields.Float(string="Тоо хэмжээ", required=True, default=1.0)
    unit = fields.Char(string="Хэмжих нэгж", default="ш")
    estimated_unit_cost = fields.Float(string="Нэгжийн төсөвт өртөг")
    note = fields.Char(string="Тайлбар")
    department_id = fields.Many2one(
        "hr.department",
        string="Хэлтэс",
        related="activity_id.department_id",
        store=True,
        readonly=True,
        index=True,
    )
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        related="activity_id.company_id",
        store=True,
        readonly=True,
    )

    @api.constrains("quantity")
    def _check_quantity_positive(self):
        for line in self:
            if line.quantity <= 0:
                raise ValidationError("Материалын тоо хэмжээ 0-ээс их байх ёстой.")
