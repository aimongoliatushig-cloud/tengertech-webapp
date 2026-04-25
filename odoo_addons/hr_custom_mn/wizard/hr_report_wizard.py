# -*- coding: utf-8 -*-
import base64

from odoo import fields, models

from ..models.hr_employee import REQUIRED_DOCUMENT_TYPES
from ..models.xlsx_export import build_xlsx


class HrCustomMnReportWizard(models.TransientModel):
    _name = "hr.custom.mn.report.wizard"
    _description = "HR Report Wizard"

    report_type = fields.Selection(
        [
            ("employee_master", "Ажилтны мастер жагсаалт"),
            ("department_structure", "Хэлтсийн бүтэц"),
            ("age", "Насны тайлан"),
            ("seniority", "Ажилласан жилийн тайлан"),
            ("leave", "Чөлөөний тайлан"),
            ("education", "Боловсролын тайлан"),
            ("retirement", "Тэтгэврийн урьдчилсан тооцоо"),
            ("missing_document", "Дутуу баримтын тайлан"),
        ],
        string="Тайлан",
        required=True,
        default="employee_master",
    )
    output_format = fields.Selection(
        [("pdf", "PDF"), ("xlsx", "Excel")],
        string="Формат",
        required=True,
        default="pdf",
    )
    department_id = fields.Many2one("hr.department", string="Хэлтэс")
    date_from = fields.Date(string="Эхлэх огноо")
    date_to = fields.Date(string="Дуусах огноо")

    def _report_title(self):
        return dict(self._fields["report_type"].selection).get(self.report_type, "HR тайлан")

    def _employee_domain(self):
        domain = []
        if self.department_id:
            domain.append(("department_id", "child_of", self.department_id.id))
        return domain

    def _employees(self):
        return self.env["hr.employee"].with_context(active_test=False).search(
            self._employee_domain(),
            order="department_id, name",
        )

    def _status_label(self, employee):
        field = employee._fields["x_mn_employment_status"]
        return dict(field.selection).get(employee.x_mn_employment_status, "")

    def _document_labels(self, employee):
        present = set(
            self.env["ir.attachment"].sudo().search(
                [
                    ("res_model", "=", "hr.employee"),
                    ("res_id", "=", employee.id),
                    ("x_mn_document_type", "!=", False),
                ]
            ).mapped("x_mn_document_type")
        )
        labels = dict(self.env["hr.employee"].get_hr_custom_mn_document_types())
        missing = [labels[item] for item in REQUIRED_DOCUMENT_TYPES if item not in present]
        return ", ".join(missing)

    def _employee_master_rows(self):
        headers = ["Код", "Овог нэр", "Хэлтэс", "Албан тушаал", "Зэрэг", "Утас", "И-мэйл", "Төлөв"]
        rows = [
            [
                employee.x_mn_employee_code,
                employee.name,
                employee.department_id.display_name,
                employee.job_title,
                employee.x_mn_grade_rank,
                employee.work_phone or employee.mobile_phone,
                employee.work_email,
                self._status_label(employee),
            ]
            for employee in self._employees()
        ]
        return headers, rows

    def _department_structure_rows(self):
        headers = ["Хэлтэс", "Удирдлага", "Ажилтны тоо", "Албан тушаал"]
        rows = []
        departments = self.env["hr.department"].search([], order="name")
        for department in departments:
            employees = self.env["hr.employee"].search([("department_id", "child_of", department.id)])
            rows.append(
                [
                    department.display_name,
                    department.manager_id.name,
                    len(employees),
                    ", ".join(sorted(set(employees.mapped("job_title")))),
                ]
            )
        return headers, rows

    def _age_rows(self):
        headers = ["Код", "Овог нэр", "Хэлтэс", "Төрсөн огноо", "Нас"]
        rows = [
            [
                employee.x_mn_employee_code,
                employee.name,
                employee.department_id.display_name,
                employee.birthday,
                employee.x_mn_age,
            ]
            for employee in self._employees()
        ]
        return headers, rows

    def _seniority_rows(self):
        headers = ["Код", "Овог нэр", "Хэлтэс", "Эхэлсэн огноо", "Ажилласан жил"]
        rows = [
            [
                employee.x_mn_employee_code,
                employee.name,
                employee.department_id.display_name,
                employee.contract_date_start or employee.x_mn_appointment_date,
                employee.x_mn_service_years,
            ]
            for employee in self._employees()
        ]
        return headers, rows

    def _leave_rows(self):
        domain = [("state", "!=", "cancel")]
        if self.department_id:
            domain.append(("employee_id.department_id", "child_of", self.department_id.id))
        if self.date_from:
            domain.append(("request_date_to", ">=", self.date_from))
        if self.date_to:
            domain.append(("request_date_from", "<=", self.date_to))
        leaves = self.env["hr.leave"].search(domain, order="request_date_from desc")
        headers = ["Ажилтан", "Хэлтэс", "Чөлөөний төрөл", "Эхлэх", "Дуусах", "Өдөр", "Төлөв"]
        rows = [
            [
                leave.employee_id.name,
                leave.department_id.display_name,
                leave.holiday_status_id.display_name,
                leave.request_date_from,
                leave.request_date_to,
                leave.number_of_days,
                leave.state,
            ]
            for leave in leaves
        ]
        return headers, rows

    def _education_rows(self):
        headers = ["Код", "Овог нэр", "Боловсрол", "Сургууль", "Мэргэжил", "Төгссөн он"]
        rows = [
            [
                employee.x_mn_employee_code,
                employee.name,
                employee.certificate,
                employee.study_school,
                employee.study_field,
                employee.x_mn_graduation_year,
            ]
            for employee in self._employees()
        ]
        return headers, rows

    def _retirement_rows(self):
        headers = ["Код", "Овог нэр", "Хэлтэс", "Төрсөн огноо", "Нас", "Төлөв"]
        employees = self._employees().filtered(lambda employee: employee.x_mn_age >= 55)
        rows = [
            [
                employee.x_mn_employee_code,
                employee.name,
                employee.department_id.display_name,
                employee.birthday,
                employee.x_mn_age,
                "6 сарын дотор" if employee.x_mn_retirement_soon else "Хяналтад",
            ]
            for employee in employees
        ]
        return headers, rows

    def _missing_document_rows(self):
        headers = ["Код", "Овог нэр", "Хэлтэс", "Дутуу баримт"]
        rows = [
            [
                employee.x_mn_employee_code,
                employee.name,
                employee.department_id.display_name,
                self._document_labels(employee),
            ]
            for employee in self._employees().filtered("x_mn_has_missing_documents")
        ]
        return headers, rows

    def _get_headers_rows(self):
        return getattr(self, "_%s_rows" % self.report_type)()

    def get_report_lines(self):
        self.ensure_one()
        headers, rows = self._get_headers_rows()
        return [{"values": row} for row in rows], headers

    def action_generate_report(self):
        self.ensure_one()
        if self.output_format == "pdf":
            return self.env.ref("hr_custom_mn.action_report_hr_custom_mn_generic").report_action(self)
        headers, rows = self._get_headers_rows()
        data = build_xlsx(headers, rows, sheet_name=self._report_title())
        attachment = self.env["ir.attachment"].sudo().create(
            {
                "name": "%s.xlsx" % self._report_title(),
                "type": "binary",
                "datas": base64.b64encode(data).decode(),
                "mimetype": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "res_model": self._name,
                "res_id": self.id,
            }
        )
        return {
            "type": "ir.actions.act_url",
            "url": "/web/content/%s?download=true" % attachment.id,
            "target": "self",
        }
