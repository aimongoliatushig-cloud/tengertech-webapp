# -*- coding: utf-8 -*-

from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError


GREEN_ACTIVITY_STATES = [
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


class MunicipalGreenLocation(models.Model):
    _name = "municipal.green.location"
    _description = "Ногоон байгууламжийн байршил"
    _order = "department_id, name"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(string="Байршлын нэр", required=True, tracking=True)
    code = fields.Char(string="Код", index=True, tracking=True)
    location_type = fields.Selection(
        [
            ("park", "Цэцэрлэгт хүрээлэн"),
            ("street", "Зам дагуух ногоон зурвас"),
            ("square", "Талбай"),
            ("yard", "Байгууллагын орчин"),
            ("median", "Тусгаарлах зурвас"),
            ("other", "Бусад"),
        ],
        string="Байршлын төрөл",
        default="park",
        required=True,
        tracking=True,
    )
    department_id = fields.Many2one("hr.department", string="Хэлтэс", required=True, index=True, tracking=True)
    responsible_employee_id = fields.Many2one("hr.employee", string="Хариуцсан ажилтан", tracking=True)
    district = fields.Char(string="Дүүрэг")
    khoroo = fields.Char(string="Хороо")
    address = fields.Char(string="Хаяг")
    gps_latitude = fields.Float(string="Өргөрөг", digits=(10, 7))
    gps_longitude = fields.Float(string="Уртраг", digits=(10, 7))
    area_size = fields.Float(string="Талбайн хэмжээ")
    area_unit = fields.Char(string="Хэмжих нэгж", default="м2")
    note = fields.Text(string="Тайлбар")
    asset_ids = fields.One2many("municipal.green.asset", "location_id", string="Ургамлын бүртгэл")
    green_activity_ids = fields.One2many("municipal.green.activity", "location_id", string="Арчилгааны ажил")
    photo_ids = fields.Many2many(
        "ir.attachment",
        "municipal_green_location_attachment_rel",
        "location_id",
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


class MunicipalGreenAsset(models.Model):
    _name = "municipal.green.asset"
    _description = "Ногоон байгууламжийн ургамлын бүртгэл"
    _order = "location_id, asset_type, name"
    _inherit = ["mail.thread"]

    name = fields.Char(string="Нэр", required=True, tracking=True)
    location_id = fields.Many2one(
        "municipal.green.location",
        string="Байршил",
        required=True,
        ondelete="restrict",
        index=True,
        tracking=True,
    )
    department_id = fields.Many2one(
        "hr.department",
        string="Хэлтэс",
        related="location_id.department_id",
        store=True,
        readonly=True,
        index=True,
    )
    asset_type = fields.Selection(
        [
            ("tree", "Мод"),
            ("bush", "Бут"),
            ("grass", "Зүлэг"),
            ("flower", "Цэцэг"),
            ("other", "Бусад"),
        ],
        string="Төрөл",
        default="tree",
        required=True,
        tracking=True,
    )
    species = fields.Char(string="Сорт / төрөл зүйл")
    quantity = fields.Float(string="Тоо хэмжээ", default=1.0, tracking=True)
    unit = fields.Char(string="Хэмжих нэгж", default="ш")
    planted_date = fields.Date(string="Тарьсан огноо")
    condition = fields.Selection(
        [
            ("healthy", "Хэвийн"),
            ("needs_care", "Арчилгаа шаардлагатай"),
            ("damaged", "Гэмтсэн"),
            ("dead", "Үхсэн"),
            ("removed", "Устгасан"),
        ],
        string="Төлөв байдал",
        default="healthy",
        required=True,
        tracking=True,
    )
    responsible_employee_id = fields.Many2one("hr.employee", string="Хариуцсан ажилтан", tracking=True)
    note = fields.Text(string="Тайлбар")
    activity_ids = fields.One2many("municipal.green.activity", "asset_id", string="Арчилгааны түүх")
    photo_ids = fields.Many2many(
        "ir.attachment",
        "municipal_green_asset_attachment_rel",
        "asset_id",
        "attachment_id",
        string="Зураг / хавсралт",
    )
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        related="location_id.company_id",
        store=True,
        readonly=True,
    )
    active = fields.Boolean(string="Идэвхтэй", default=True)

    @api.constrains("quantity")
    def _check_quantity_positive(self):
        for asset in self:
            if asset.quantity <= 0:
                raise ValidationError("Тоо хэмжээ 0-ээс их байх ёстой.")


class MunicipalGreenActivity(models.Model):
    _name = "municipal.green.activity"
    _description = "Ногоон байгууламжийн арчилгааны ажил"
    _order = "planned_date desc, id desc"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(string="Ажлын нэр", required=True, tracking=True)
    activity_type = fields.Selection(
        [
            ("watering", "Усалгаа"),
            ("pruning", "Тайралт"),
            ("care", "Арчилгаа"),
            ("replanting", "Нөхөн тарилт"),
            ("street_cleaning", "Зам талбайн цэвэрлэгээ"),
            ("inspection", "Үзлэг"),
            ("other", "Бусад"),
        ],
        string="Ажлын төрөл",
        default="care",
        required=True,
        tracking=True,
    )
    location_id = fields.Many2one(
        "municipal.green.location",
        string="Байршил",
        required=True,
        ondelete="restrict",
        index=True,
        tracking=True,
    )
    asset_id = fields.Many2one("municipal.green.asset", string="Ургамал", ondelete="set null", tracking=True)
    department_id = fields.Many2one(
        "hr.department",
        string="Хэлтэс",
        related="location_id.department_id",
        store=True,
        readonly=True,
        index=True,
    )
    assigned_user_id = fields.Many2one("res.users", string="Оноосон хэрэглэгч", index=True, tracking=True)
    assigned_employee_id = fields.Many2one("hr.employee", string="Оноосон ажилтан", index=True, tracking=True)
    reviewer_id = fields.Many2one("res.users", string="Хянагч", tracking=True)
    planned_date = fields.Datetime(string="Төлөвлөсөн хугацаа", tracking=True)
    start_datetime = fields.Datetime(string="Эхэлсэн хугацаа", tracking=True)
    done_datetime = fields.Datetime(string="Дууссан хугацаа", tracking=True)
    planned_quantity = fields.Float(string="Төлөвлөсөн тоо хэмжээ")
    actual_quantity = fields.Float(string="Гүйцэтгэсэн тоо хэмжээ")
    unit = fields.Char(string="Хэмжих нэгж")
    description = fields.Text(string="Тайлбар")
    report_note = fields.Text(string="Гүйцэтгэлийн тайлан")
    requires_photo = fields.Boolean(string="Зураг шаардах", default=True, tracking=True)
    photo_ids = fields.Many2many(
        "ir.attachment",
        "municipal_green_activity_attachment_rel",
        "activity_id",
        "attachment_id",
        string="Зурагтай тайлан",
    )
    state = fields.Selection(
        GREEN_ACTIVITY_STATES,
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
        related="location_id.company_id",
        store=True,
        readonly=True,
    )

    @api.onchange("asset_id")
    def _onchange_asset_id(self):
        for activity in self:
            if activity.asset_id:
                activity.location_id = activity.asset_id.location_id
                activity.unit = activity.asset_id.unit

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
