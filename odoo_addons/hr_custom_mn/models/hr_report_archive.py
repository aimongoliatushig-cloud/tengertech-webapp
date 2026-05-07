# -*- coding: utf-8 -*-
import base64

from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError


HR_REPORT_TYPES = [
    ("employee_list", "Ажилтны жагсаалт"),
    ("department_employee", "Хэлтэс тус бүрийн ажилтны тайлан"),
    ("new_employee", "Шинээр орсон ажилтны тайлан"),
    ("resigned_employee", "Ажлаас гарсан ажилтны тайлан"),
    ("leave", "Чөлөөний тайлан"),
    ("sick", "Өвчтэй ажилтны тайлан"),
    ("business_trip", "Томилолтын тайлан"),
    ("discipline", "Сахилгын тайлан"),
    ("transfer", "Шилжилт хөдөлгөөний тайлан"),
    ("order_contract", "Тушаал, гэрээний тайлан"),
    ("clearance", "Тойрох хуудасны тайлан"),
    ("archive", "Архивын тайлан"),
]


class MunicipalHrReportArchive(models.Model):
    _name = "municipal.hr.report.archive"
    _description = "Municipal HR Generated Report Archive"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "generated_date desc, id desc"

    name = fields.Char(string="Тайлангийн нэр", required=True, tracking=True)
    report_type = fields.Selection(HR_REPORT_TYPES, string="Тайлангийн төрөл", required=True, index=True, tracking=True)
    date_from = fields.Date(string="Эхлэх огноо", required=True, tracking=True)
    date_to = fields.Date(string="Дуусах огноо", required=True, tracking=True)
    generated_date = fields.Datetime(string="Гаргасан огноо", default=fields.Datetime.now, required=True, tracking=True)
    generated_by = fields.Many2one("res.users", string="Гаргасан хэрэглэгч", default=lambda self: self.env.user, required=True)
    department_id = fields.Many2one("hr.department", string="Хэлтэс")
    attachment_id = fields.Many2one("ir.attachment", string="PDF файл", readonly=True, ondelete="set null")
    company_id = fields.Many2one("res.company", string="Компани", default=lambda self: self.env.company, required=True)

    @api.constrains("date_from", "date_to")
    def _check_date_range(self):
        for record in self:
            if record.date_from and record.date_to and record.date_to < record.date_from:
                raise ValidationError("Дуусах огноо эхлэх огнооноос өмнө байж болохгүй.")

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
            raise AccessError("HR тайлан гаргах эрх хүрэлцэхгүй байна.")

    @api.model_create_multi
    def create(self, vals_list):
        self._require_hr_reviewer()
        return super().create(vals_list)

    def unlink(self):
        self._require_hr_reviewer()
        attachments = self.mapped("attachment_id")
        result = super().unlink()
        attachments.sudo().unlink()
        return result

    def _serialize(self):
        self.ensure_one()
        return {
            "id": self.id,
            "name": self.name,
            "reportType": self.report_type,
            "reportTypeLabel": dict(HR_REPORT_TYPES).get(self.report_type, self.report_type),
            "dateFrom": str(self.date_from or ""),
            "dateTo": str(self.date_to or ""),
            "generatedDate": fields.Datetime.to_string(self.generated_date) if self.generated_date else "",
            "generatedBy": self.generated_by.display_name or "",
            "departmentName": self.department_id.display_name or "",
            "attachmentId": self.attachment_id.id or None,
            "downloadUrl": "/api/hr/reports/%s/download" % self.id,
        }

    @api.model
    def get_hr_report_archive_directory(self, filters=None):
        self._require_hr_reviewer()
        filters = filters or {}
        domain = []
        if filters.get("reportType"):
            domain.append(("report_type", "=", filters["reportType"]))
        if filters.get("dateFrom"):
            domain.append(("date_to", ">=", filters["dateFrom"]))
        if filters.get("dateTo"):
            domain.append(("date_from", "<=", filters["dateTo"]))
        records = self.search(domain, limit=int(filters.get("limit") or 500))
        return [record._serialize() for record in records]

    @api.model
    def generate_hr_report_archive(self, payload):
        self._require_hr_reviewer()
        payload = payload or {}
        report_type = payload.get("reportType") or "employee_list"
        labels = dict(HR_REPORT_TYPES)
        if report_type not in labels:
            raise UserError("Тайлангийн төрөл буруу байна.")
        date_from = payload.get("dateFrom")
        date_to = payload.get("dateTo")
        if not date_from or not date_to:
            raise UserError("Эхлэх болон дуусах огноо заавал оруулна уу.")
        if date_to < date_from:
            raise UserError("Дуусах огноо эхлэх огнооноос өмнө байж болохгүй.")

        wizard = self.env["hr.custom.mn.report.wizard"].create(
            {
                "report_type": report_type,
                "output_format": "pdf",
                "date_from": date_from,
                "date_to": date_to,
                "department_id": int(payload.get("departmentId") or 0) or False,
            }
        )
        report = self.env.ref("hr_custom_mn.action_report_hr_custom_mn_generic")
        pdf_content, _content_type = report._render_qweb_pdf(report.report_name, [wizard.id])
        title = "%s %s - %s" % (labels[report_type], date_from, date_to)
        archive = self.create(
            {
                "name": title,
                "report_type": report_type,
                "date_from": date_from,
                "date_to": date_to,
                "department_id": int(payload.get("departmentId") or 0) or False,
            }
        )
        attachment = self.env["ir.attachment"].sudo().create(
            {
                "name": "%s.pdf" % title,
                "type": "binary",
                "datas": base64.b64encode(pdf_content).decode(),
                "mimetype": "application/pdf",
                "res_model": self._name,
                "res_id": archive.id,
            }
        )
        archive.write({"attachment_id": attachment.id})
        return archive._serialize()

    def get_pdf_payload(self):
        self.ensure_one()
        self._require_hr_reviewer()
        if not self.attachment_id or not self.attachment_id.datas:
            raise UserError("PDF файл олдсонгүй.")
        return {
            "name": self.attachment_id.name or ("%s.pdf" % self.name),
            "mimetype": self.attachment_id.mimetype or "application/pdf",
            "datas": self.attachment_id.datas,
        }
