# -*- coding: utf-8 -*-
from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError


STATE_LABELS = {
    "draft": "Ноорог",
    "submitted": "Илгээсэн",
    "pending": "Хүлээгдэж байна",
    "approved": "Баталгаажсан",
    "incomplete": "Дутуу",
    "done": "Дууссан",
}

SECTION_LABELS = {
    "warehouse": "Нярав",
    "it": "IT",
    "finance": "Санхүү",
    "manager": "Шууд удирдлага",
    "hr": "HR",
}


class MunicipalHrClearanceSheet(models.Model):
    _name = "municipal.hr.clearance.sheet"
    _description = "Municipal HR Employee Clearance Sheet"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "saved_date desc, id desc"

    name = fields.Char(string="Дугаар", default="Шинэ", copy=False, readonly=True)
    employee_id = fields.Many2one("hr.employee", string="Ажилтан", required=True, tracking=True)
    department_id = fields.Many2one("hr.department", string="Хэлтэс", related="employee_id.department_id", store=True, readonly=True)
    job_id = fields.Many2one("hr.job", string="Албан тушаал", related="employee_id.job_id", store=True, readonly=True)
    saved_date = fields.Date(string="Хадгалсан огноо", default=fields.Date.context_today, required=True, tracking=True)
    section = fields.Selection(
        [
            ("warehouse", "Нярав"),
            ("it", "IT"),
            ("finance", "Санхүү"),
            ("manager", "Шууд удирдлага"),
            ("hr", "HR"),
        ],
        string="Шалгах хэсэг",
        default="hr",
        required=True,
        tracking=True,
    )
    responsible_user_id = fields.Many2one("res.users", string="Хариуцсан хүн", default=lambda self: self.env.user)
    state = fields.Selection(
        [
            ("draft", "Ноорог"),
            ("submitted", "Илгээсэн"),
            ("pending", "Хүлээгдэж байна"),
            ("approved", "Баталгаажсан"),
            ("incomplete", "Дутуу"),
            ("done", "Дууссан"),
        ],
        string="Төлөв",
        default="draft",
        required=True,
        tracking=True,
    )
    note = fields.Text(string="Тэмдэглэл")
    attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_hr_clearance_sheet_ir_attachments_rel",
        "clearance_id",
        "attachment_id",
        string="Хавсралт",
        copy=False,
    )
    company_id = fields.Many2one("res.company", string="Компани", default=lambda self: self.env.company, required=True)
    active = fields.Boolean(default=True)

    @api.model_create_multi
    def create(self, vals_list):
        self._require_hr_reviewer()
        for vals in vals_list:
            employee = self.env["hr.employee"].sudo().browse(vals.get("employee_id")).exists()
            if not employee:
                raise UserError("Ажилтны бүртгэл олдсонгүй.")
        records = super().create(vals_list)
        for record in records:
            if record.name == "Шинэ":
                record.sudo().write({"name": "HRC-%05d" % record.id})
        return records

    def write(self, vals):
        self._require_hr_reviewer()
        return super().write(vals)

    def unlink(self):
        self._require_hr_reviewer()
        return super().unlink()

    @api.model
    def _current_user_is_hr_reviewer(self):
        return any(
            self.env.user.has_group(group)
            for group in [
                "hr.group_hr_manager",
                "hr_custom_mn.group_hr_custom_mn_officer",
                "hr_custom_mn.group_hr_custom_mn_admin",
            ]
        )

    @api.model
    def _require_hr_reviewer(self):
        if not self._current_user_is_hr_reviewer():
            raise AccessError("Тойрох хуудас үүсгэх HR эрх хүрэлцэхгүй байна.")

    def _serialize(self):
        self.ensure_one()
        return {
            "id": self.id,
            "name": self.name,
            "employeeId": self.employee_id.id,
            "employeeName": self.employee_id.display_name or "",
            "departmentId": self.department_id.id,
            "departmentName": self.department_id.display_name or "",
            "jobTitle": self.job_id.display_name or self.employee_id.job_title or "",
            "savedDate": str(self.saved_date or ""),
            "section": self.section,
            "sectionLabel": SECTION_LABELS.get(self.section, self.section),
            "state": self.state,
            "stateLabel": STATE_LABELS.get(self.state, self.state),
            "note": self.note or "",
            "hasAttachment": bool(self.attachment_ids),
            "attachmentIds": self.attachment_ids.ids,
        }

    @api.model
    def get_hr_clearance_sheet_directory(self, filters=None):
        filters = filters or {}
        domain = []
        if filters.get("employeeId"):
            domain.append(("employee_id", "=", int(filters["employeeId"])))
        if filters.get("state"):
            domain.append(("state", "=", filters["state"]))
        records = self.search(domain, limit=int(filters.get("limit") or 300))
        return [record._serialize() for record in records]

    @api.model
    def create_hr_clearance_sheet(self, payload):
        self._require_hr_reviewer()
        payload = payload or {}
        employee_id = int(payload.get("employeeId") or 0)
        employee = self.env["hr.employee"].sudo().browse(employee_id).exists()
        if not employee:
            raise UserError("Ажилтан заавал сонгоно уу.")
        record = self.create(
            {
                "employee_id": employee.id,
                "saved_date": payload.get("savedDate") or fields.Date.context_today(self),
                "section": payload.get("section") or "hr",
                "state": payload.get("state") or "draft",
                "note": payload.get("note") or "",
                "responsible_user_id": self.env.user.id,
            }
        )
        record._create_payload_attachments(payload.get("attachments") or [])
        return record._serialize()

    def _create_payload_attachments(self, attachments):
        attachment_model = self.env["ir.attachment"].sudo()
        for record in self:
            created_ids = []
            for attachment in attachments:
                datas = attachment.get("datas")
                if not datas:
                    continue
                created = attachment_model.create(
                    {
                        "name": attachment.get("name") or "Тойрох хуудасны хавсралт",
                        "type": "binary",
                        "datas": datas,
                        "res_model": self._name,
                        "res_id": record.id,
                        "mimetype": attachment.get("mimetype") or "application/octet-stream",
                    }
                )
                created_ids.append(created.id)
            if created_ids:
                record.write({"attachment_ids": [(4, attachment_id) for attachment_id in created_ids]})
