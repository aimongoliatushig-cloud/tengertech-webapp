# -*- coding: utf-8 -*-
from odoo import fields, models


class HrCustomMnEmployeeActionWizard(models.TransientModel):
    _name = "hr.custom.mn.employee.action.wizard"
    _description = "HR Employee Action Wizard"

    employee_id = fields.Many2one("hr.employee", string="Ажилтан", required=True)
    action_type = fields.Selection(
        [
            ("transfer", "Хэлтэс шилжүүлэх"),
            ("promote", "Дэвшүүлэх"),
            ("terminate", "Ажлаас чөлөөлөх"),
        ],
        string="Үйлдэл",
        required=True,
    )
    effective_date = fields.Date(
        string="Хүчинтэй огноо",
        default=fields.Date.context_today,
        required=True,
    )
    new_department_id = fields.Many2one("hr.department", string="Шинэ хэлтэс")
    new_job_id = fields.Many2one("hr.job", string="Шинэ албан тушаал")
    new_manager_id = fields.Many2one("hr.employee", string="Шинэ удирдлага")
    new_grade_rank = fields.Char(string="Шинэ зэрэг / дэв")
    appointment_order_no = fields.Char(string="Тушаалын дугаар")
    note = fields.Text(string="Тайлбар")

    def action_apply(self):
        self.ensure_one()
        employee = self.employee_id
        old_department_id = employee.department_id.id
        old_job_id = employee.job_id.id
        old_manager_id = employee.parent_id.id
        old_grade_rank = employee.x_mn_grade_rank

        values = {}
        action_type = self.action_type
        if action_type == "transfer":
            if self.new_department_id:
                values["department_id"] = self.new_department_id.id
            if self.new_manager_id:
                values["parent_id"] = self.new_manager_id.id
            log_type = "transfer"
        elif action_type == "promote":
            if self.new_job_id:
                values["job_id"] = self.new_job_id.id
            if self.new_grade_rank:
                values["x_mn_grade_rank"] = self.new_grade_rank
            if self.appointment_order_no:
                values["x_mn_appointment_order_no"] = self.appointment_order_no
            if self.effective_date:
                values["x_mn_appointment_date"] = self.effective_date
            log_type = "promote"
        else:
            values.update(
                {
                    "active": False,
                    "x_mn_employment_status": "terminated",
                    "contract_date_end": self.effective_date,
                }
            )
            if self.appointment_order_no:
                values["x_mn_appointment_order_no"] = self.appointment_order_no
            log_type = "terminate"

        if values:
            employee.write(values)

        employee._x_mn_log_history(
            log_type,
            old_department_id=old_department_id,
            new_department_id=employee.department_id.id,
            old_job_id=old_job_id,
            new_job_id=employee.job_id.id,
            old_manager_id=old_manager_id,
            new_manager_id=employee.parent_id.id,
            old_grade_rank=old_grade_rank,
            new_grade_rank=employee.x_mn_grade_rank,
            note=self.note or self.appointment_order_no or False,
        )
        return {"type": "ir.actions.act_window_close"}
