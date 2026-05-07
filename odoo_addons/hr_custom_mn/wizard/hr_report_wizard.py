# -*- coding: utf-8 -*-
import base64

from odoo import fields, models

from ..models.hr_employee import REQUIRED_DOCUMENT_TYPES
from ..models.hr_report_archive import HR_REPORT_TYPES
from ..models.xlsx_export import build_xlsx


class HrCustomMnReportWizard(models.TransientModel):
    _name = "hr.custom.mn.report.wizard"
    _description = "HR Report Wizard"

    report_type = fields.Selection(HR_REPORT_TYPES, string="Тайлан", required=True, default="employee_list")
    output_format = fields.Selection([("pdf", "PDF"), ("xlsx", "Excel")], string="Формат", required=True, default="pdf")
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

    def _date_domain(self, field_name):
        domain = []
        if self.date_from:
            domain.append((field_name, ">=", self.date_from))
        if self.date_to:
            domain.append((field_name, "<=", self.date_to))
        return domain

    def _employees(self):
        return self.env["hr.employee"].with_context(active_test=False).search(self._employee_domain(), order="department_id, name")

    def _status_label(self, employee):
        field = employee._fields["x_mn_employment_status"]
        return dict(field.selection).get(employee.x_mn_employment_status, "")

    def _document_labels(self, employee):
        present = set(
            self.env["ir.attachment"].sudo().search(
                [("res_model", "=", "hr.employee"), ("res_id", "=", employee.id), ("x_mn_document_type", "!=", False)]
            ).mapped("x_mn_document_type")
        )
        labels = dict(self.env["hr.employee"].get_hr_custom_mn_document_types())
        missing = [labels[item] for item in REQUIRED_DOCUMENT_TYPES if item not in present]
        return ", ".join(missing)

    def _employee_list_rows(self):
        headers = ["Код", "Овог нэр", "Хэлтэс", "Албан тушаал", "Зэрэг", "Утас", "И-мэйл", "Төлөв"]
        rows = [
            [
                employee.x_mn_employee_code,
                employee.name,
                employee.department_id.display_name,
                employee.job_title or employee.job_id.display_name,
                employee.x_mn_grade_rank,
                employee.work_phone or employee.mobile_phone,
                employee.work_email,
                self._status_label(employee),
            ]
            for employee in self._employees()
        ]
        return headers, rows

    def _department_employee_rows(self):
        headers = ["Хэлтэс", "Ажилтан", "Албан тушаал", "Утас", "И-мэйл", "Төлөв"]
        rows = []
        departments = self.env["hr.department"].search(
            [("id", "child_of", self.department_id.id)] if self.department_id else [],
            order="name",
        )
        for department in departments:
            employees = self.env["hr.employee"].with_context(active_test=False).search([("department_id", "=", department.id)], order="name")
            if not employees:
                rows.append([department.display_name, "-", "-", "-", "-", "-"])
                continue
            for employee in employees:
                rows.append(
                    [
                        department.display_name,
                        employee.name,
                        employee.job_title or employee.job_id.display_name,
                        employee.work_phone or employee.mobile_phone,
                        employee.work_email,
                        self._status_label(employee),
                    ]
                )
        return headers, rows

    def _new_employee_rows(self):
        employees = self.env["hr.employee"].with_context(active_test=False).search(self._employee_domain(), order="contract_date_start desc, name")
        if self.date_from:
            employees = employees.filtered(lambda employee: (employee.contract_date_start or employee.x_mn_appointment_date) and (employee.contract_date_start or employee.x_mn_appointment_date) >= self.date_from)
        if self.date_to:
            employees = employees.filtered(lambda employee: (employee.contract_date_start or employee.x_mn_appointment_date) and (employee.contract_date_start or employee.x_mn_appointment_date) <= self.date_to)
        headers = ["Код", "Ажилтан", "Хэлтэс", "Албан тушаал", "Ажилд орсон огноо", "Төлөв"]
        rows = [
            [
                employee.x_mn_employee_code,
                employee.name,
                employee.department_id.display_name,
                employee.job_title or employee.job_id.display_name,
                employee.contract_date_start or employee.x_mn_appointment_date,
                self._status_label(employee),
            ]
            for employee in employees
        ]
        return headers, rows

    def _resigned_employee_rows(self):
        employees = self._employees().filtered(lambda employee: not employee.active or employee.x_mn_employment_status in ("resigned", "terminated"))
        headers = ["Код", "Ажилтан", "Хэлтэс", "Албан тушаал", "Гэрээ дуусах", "Төлөв"]
        rows = [
            [
                employee.x_mn_employee_code,
                employee.name,
                employee.department_id.display_name,
                employee.job_title or employee.job_id.display_name,
                employee.contract_date_end,
                self._status_label(employee),
            ]
            for employee in employees
        ]
        return headers, rows

    def _timeoff_rows(self, request_type):
        domain = [("request_type", "=", request_type)]
        if self.department_id:
            domain.append(("department_id", "child_of", self.department_id.id))
        if self.date_from:
            domain.append(("date_to", ">=", self.date_from))
        if self.date_to:
            domain.append(("date_from", "<=", self.date_to))
        requests = self.env["municipal.hr.timeoff.request"].search(domain, order="date_from desc, id desc")
        state_labels = dict(self.env["municipal.hr.timeoff.request"]._fields["state"].selection)
        headers = ["Ажилтан", "Хэлтэс", "Эхлэх", "Дуусах", "Нийт өдөр", "Төлөв", "Шалтгаан"]
        rows = [
            [
                request.employee_id.display_name,
                request.department_id.display_name,
                request.date_from,
                request.date_to,
                request.duration_days,
                state_labels.get(request.state, request.state),
                request.reason,
            ]
            for request in requests
        ]
        return headers, rows

    def _leave_rows(self):
        return self._timeoff_rows("time_off")

    def _sick_rows(self):
        return self._timeoff_rows("sick")

    def _business_trip_rows(self):
        employees = self._employees().filtered(lambda employee: employee.x_mn_employment_status == "business_trip")
        headers = ["Код", "Ажилтан", "Хэлтэс", "Албан тушаал", "Төлөв"]
        rows = [
            [employee.x_mn_employee_code, employee.name, employee.department_id.display_name, employee.job_title or employee.job_id.display_name, self._status_label(employee)]
            for employee in employees
        ]
        return headers, rows

    def _discipline_rows(self):
        domain = self._date_domain("violation_date")
        if self.department_id:
            domain.append(("department_id", "child_of", self.department_id.id))
        records = self.env["municipal.discipline"].search(domain, order="violation_date desc, id desc")
        violation_labels = dict(self.env["municipal.discipline"]._fields["violation_type"].selection)
        action_labels = dict(self.env["municipal.discipline"]._fields["action_type"].selection)
        state_labels = dict(self.env["municipal.discipline"]._fields["state"].selection)
        headers = ["Ажилтан", "Хэлтэс", "Огноо", "Зөрчлийн төрөл", "Арга хэмжээ", "Төлөв"]
        rows = [
            [
                record.employee_id.display_name,
                record.department_id.display_name,
                record.violation_date,
                violation_labels.get(record.violation_type, record.violation_type),
                action_labels.get(record.action_type, record.action_type),
                state_labels.get(record.state, record.state),
            ]
            for record in records
        ]
        return headers, rows

    def _transfer_rows(self):
        domain = [("action_type", "=", "transfer")]
        if self.date_from:
            domain.append(("date", ">=", "%s 00:00:00" % self.date_from))
        if self.date_to:
            domain.append(("date", "<=", "%s 23:59:59" % self.date_to))
        histories = self.env["hr.custom.mn.employee.history"].search(domain, order="date desc, id desc")
        if self.department_id:
            histories = histories.filtered(
                lambda history: history.old_department_id == self.department_id
                or history.new_department_id == self.department_id
                or history.employee_id.department_id == self.department_id
            )
        headers = ["Ажилтан", "Огноо", "Өмнөх хэлтэс", "Шинэ хэлтэс", "Өмнөх албан тушаал", "Шинэ албан тушаал", "Тайлбар"]
        rows = [
            [
                history.employee_id.display_name,
                fields.Datetime.to_string(history.date) if history.date else "",
                history.old_department_id.display_name,
                history.new_department_id.display_name,
                history.old_job_id.display_name,
                history.new_job_id.display_name,
                history.note,
            ]
            for history in histories
        ]
        return headers, rows

    def _order_contract_rows(self):
        domain = [("res_model", "=", "hr.employee")]
        if self.date_from:
            domain.append(("create_date", ">=", "%s 00:00:00" % self.date_from))
        if self.date_to:
            domain.append(("create_date", "<=", "%s 23:59:59" % self.date_to))
        attachments = self.env["ir.attachment"].sudo().search(domain, order="create_date desc, id desc")
        employees = self.env["hr.employee"].with_context(active_test=False).browse(attachments.mapped("res_id"))
        employees_by_id = {employee.id: employee for employee in employees}
        if self.department_id:
            attachments = attachments.filtered(lambda item: employees_by_id.get(item.res_id) and employees_by_id[item.res_id].department_id == self.department_id)
        headers = ["Ажилтан", "Хэлтэс", "Баримтын нэр", "Төрөл", "Оруулсан огноо"]
        rows = []
        for attachment in attachments:
            employee = employees_by_id.get(attachment.res_id)
            rows.append(
                [
                    employee.display_name if employee else "",
                    employee.department_id.display_name if employee else "",
                    attachment.name,
                    getattr(attachment, "x_mn_document_type", "") or "",
                    fields.Datetime.to_string(attachment.create_date) if attachment.create_date else "",
                ]
            )
        return headers, rows

    def _clearance_rows(self):
        domain = self._date_domain("saved_date")
        if self.department_id:
            domain.append(("department_id", "child_of", self.department_id.id))
        records = self.env["municipal.hr.clearance.sheet"].search(domain, order="saved_date desc, id desc")
        section_labels = dict(records._fields["section"].selection)
        state_labels = dict(records._fields["state"].selection)
        headers = ["Дугаар", "Ажилтан", "Хэлтэс", "Хэсэг", "Огноо", "Төлөв", "Тайлбар"]
        rows = [
            [
                record.name,
                record.employee_id.display_name,
                record.department_id.display_name,
                section_labels.get(record.section, record.section),
                record.saved_date,
                state_labels.get(record.state, record.state),
                record.note,
            ]
            for record in records
        ]
        return headers, rows

    def _archive_rows(self):
        employees = self._employees().filtered(lambda employee: not employee.active or employee.x_mn_employment_status == "archived")
        headers = ["Код", "Ажилтан", "Хэлтэс", "Албан тушаал", "Төлөв", "Гэрээ дуусах"]
        rows = [
            [
                employee.x_mn_employee_code,
                employee.name,
                employee.department_id.display_name,
                employee.job_title or employee.job_id.display_name,
                self._status_label(employee),
                employee.contract_date_end,
            ]
            for employee in employees
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
        return {"type": "ir.actions.act_url", "url": "/web/content/%s?download=true" % attachment.id, "target": "self"}
