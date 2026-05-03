# -*- coding: utf-8 -*-
import base64

from odoo import api, fields, models, _
from odoo.exceptions import AccessError, UserError, ValidationError


FINAL_STATES = ("approved", "rejected", "cancelled")
REQUEST_TYPE_LABELS = {
    "time_off": "Чөлөө",
    "sick": "Өвчтэй",
}
STATE_LABELS = {
    "draft": "Ноорог",
    "submitted": "Илгээсэн",
    "hr_review": "HR шалгаж байна",
    "approved": "Батлагдсан",
    "rejected": "Татгалзсан",
    "cancelled": "Цуцлагдсан",
}
STATUS_LABELS = {
    "active": "Идэвхтэй",
    "time_off": "Чөлөөтэй",
    "sick": "Өвчтэй",
    "inactive": "Идэвхгүй",
    "archived": "Архивласан",
}


class MunicipalHrTimeoffRequest(models.Model):
    _name = "municipal.hr.timeoff.request"
    _description = "Municipal HR Time Off / Sick Leave Request"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "submitted_date desc, id desc"

    name = fields.Char(string="Дугаар", default="Шинэ", copy=False, readonly=True)
    employee_id = fields.Many2one("hr.employee", string="Ажилтан", required=True, tracking=True)
    department_id = fields.Many2one("hr.department", string="Хэлтэс", required=True, tracking=True)
    request_type = fields.Selection(
        [("time_off", "Чөлөө"), ("sick", "Өвчтэй")],
        string="Төрөл",
        required=True,
        default="time_off",
        tracking=True,
    )
    date_from = fields.Date(string="Эхлэх огноо", required=True, tracking=True)
    date_to = fields.Date(string="Дуусах огноо", required=True, tracking=True)
    reason = fields.Text(string="Шалтгаан", required=True)
    attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_hr_timeoff_request_ir_attachments_rel",
        "request_id",
        "attachment_id",
        string="Хавсралтын зураг",
        copy=False,
    )
    note = fields.Text(string="Тайлбар")
    submitted_by = fields.Many2one("res.users", string="Илгээсэн хүн", readonly=True, tracking=True)
    submitted_date = fields.Datetime(string="Илгээсэн огноо", readonly=True)
    reviewed_by = fields.Many2one("res.users", string="Шалгасан хүн", readonly=True)
    reviewed_date = fields.Datetime(string="Шалгасан огноо", readonly=True)
    approved_by = fields.Many2one("res.users", string="Баталсан хүн", readonly=True)
    approved_date = fields.Datetime(string="Баталсан огноо", readonly=True)
    rejected_by = fields.Many2one("res.users", string="Татгалзсан хүн", readonly=True)
    rejected_date = fields.Datetime(string="Татгалзсан огноо", readonly=True)
    hr_note = fields.Text(string="HR тэмдэглэл")
    rejection_reason = fields.Text(string="Татгалзсан шалтгаан")
    state = fields.Selection(
        [
            ("draft", "Ноорог"),
            ("submitted", "Илгээсэн"),
            ("hr_review", "HR шалгаж байна"),
            ("approved", "Батлагдсан"),
            ("rejected", "Татгалзсан"),
            ("cancelled", "Цуцлагдсан"),
        ],
        string="Төлөв",
        default="draft",
        required=True,
        tracking=True,
    )
    company_id = fields.Many2one(
        "res.company",
        string="Компани",
        default=lambda self: self.env.company,
        required=True,
    )
    active = fields.Boolean(default=True)
    duration_days = fields.Integer(string="Нийт өдөр", compute="_compute_duration_days", store=True)
    is_current = fields.Boolean(string="Өнөөдөр хүчинтэй", compute="_compute_current_flags")
    current_status_effect = fields.Selection(
        [("none", "Нөлөөгүй"), ("time_off", "Чөлөөтэй"), ("sick", "Өвчтэй")],
        string="Одоогийн төлөвт үзүүлэх нөлөө",
        compute="_compute_current_flags",
    )
    can_current_user_edit = fields.Boolean(compute="_compute_current_user_permissions")
    can_current_user_approve = fields.Boolean(compute="_compute_current_user_permissions")

    @api.onchange("employee_id")
    def _onchange_employee_id(self):
        for request in self:
            if request.employee_id.department_id:
                request.department_id = request.employee_id.department_id

    @api.depends("date_from", "date_to")
    def _compute_duration_days(self):
        for request in self:
            if request.date_from and request.date_to and request.date_to >= request.date_from:
                request.duration_days = (request.date_to - request.date_from).days + 1
            else:
                request.duration_days = 0

    @api.depends("state", "request_type", "date_from", "date_to")
    def _compute_current_flags(self):
        today = fields.Date.context_today(self)
        for request in self:
            is_current = bool(
                request.state == "approved"
                and request.date_from
                and request.date_to
                and request.date_from <= today <= request.date_to
            )
            request.is_current = is_current
            request.current_status_effect = request.request_type if is_current else "none"

    @api.depends_context("uid")
    def _compute_current_user_permissions(self):
        can_approve = self._current_user_is_hr_reviewer()
        for request in self:
            request.can_current_user_approve = can_approve
            request.can_current_user_edit = request.state not in FINAL_STATES and (
                can_approve or request.submitted_by == self.env.user or self._employee_in_current_department(request.employee_id)
            )

    @api.constrains("date_from", "date_to")
    def _check_date_order(self):
        for request in self:
            if request.date_from and request.date_to and request.date_to < request.date_from:
                raise ValidationError("Дуусах огноо эхлэх огнооноос өмнө байж болохгүй.")

    @api.constrains("employee_id", "department_id")
    def _check_employee_department(self):
        for request in self:
            if request.employee_id and request.department_id and request.employee_id.department_id != request.department_id:
                raise ValidationError("Ажилтны хэлтэс хүсэлтийн хэлтэстэй таарахгүй байна.")

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            employee_id = vals.get("employee_id")
            if employee_id:
                employee = self.env["hr.employee"].sudo().browse(employee_id).exists()
                if employee and not vals.get("department_id"):
                    vals["department_id"] = employee.department_id.id
                self._check_employee_scope(employee)
            if vals.get("state") and vals.get("state") != "draft":
                self._validate_required_payload(vals)
        requests = super().create(vals_list)
        for request in requests:
            if request.name == "Шинэ":
                request.sudo().write({"name": "HRR-%05d" % request.id})
            if request.state != "draft":
                request._require_attachments()
        return requests

    def write(self, vals):
        for request in self:
            if request.state in FINAL_STATES and not self._current_user_is_hr_reviewer():
                if request.state == "approved":
                    raise UserError("Батлагдсан хүсэлтийг засах боломжгүй.")
                if request.state == "rejected":
                    raise UserError("Татгалзсан хүсэлтийг засах боломжгүй.")
                raise UserError("Цуцлагдсан хүсэлтийг засах боломжгүй.")
            employee = request.employee_id
            if vals.get("employee_id"):
                employee = self.env["hr.employee"].sudo().browse(vals["employee_id"]).exists()
            self._check_employee_scope(employee)
        result = super().write(vals)
        if vals.get("state") and vals.get("state") != "draft":
            self._require_attachments()
        return result

    def action_submit(self):
        for request in self:
            request._check_employee_scope(request.employee_id)
            request._validate_ready_for_submit()
            request.write(
                {
                    "state": "submitted",
                    "submitted_by": self.env.user.id,
                    "submitted_date": fields.Datetime.now(),
                }
            )
            request.message_post(body="Шинэ чөлөө / өвчтэй хүсэлт ирлээ.")
        return True

    def action_hr_review(self):
        self._require_hr_reviewer()
        return self.write(
            {
                "state": "hr_review",
                "reviewed_by": self.env.user.id,
                "reviewed_date": fields.Datetime.now(),
            }
        )

    def action_approve(self):
        self._require_hr_reviewer()
        for request in self:
            request._validate_ready_for_submit()
        return self.write(
            {
                "state": "approved",
                "approved_by": self.env.user.id,
                "approved_date": fields.Datetime.now(),
            }
        )

    def action_reject(self):
        self._require_hr_reviewer()
        return self.write(
            {
                "state": "rejected",
                "rejected_by": self.env.user.id,
                "rejected_date": fields.Datetime.now(),
            }
        )

    def action_cancel(self):
        for request in self:
            if request.state in FINAL_STATES:
                raise UserError("Эцэслэгдсэн хүсэлтийг цуцлах боломжгүй.")
            if not self._current_user_is_hr_reviewer() and request.submitted_by != self.env.user:
                raise AccessError("Зөвхөн өөрийн илгээсэн хүсэлтийг цуцлах боломжтой.")
        return self.write({"state": "cancelled"})

    def _validate_ready_for_submit(self):
        for request in self:
            if not request.employee_id:
                raise UserError("Ажилтан заавал сонгоно уу.")
            if not request.request_type:
                raise UserError("Хүсэлтийн төрөл заавал сонгоно уу.")
            if not request.date_from or not request.date_to:
                raise UserError("Эхлэх болон дуусах огноо заавал оруулна уу.")
            if request.date_to < request.date_from:
                raise UserError("Дуусах огноо эхлэх огнооноос өмнө байж болохгүй.")
            if not (request.reason or "").strip():
                raise UserError("Шалтгаан заавал оруулна уу.")
            request._require_attachments()

    @api.model
    def _validate_required_payload(self, vals):
        if not vals.get("employee_id"):
            raise UserError("Ажилтан заавал сонгоно уу.")
        if not vals.get("request_type"):
            raise UserError("Хүсэлтийн төрөл заавал сонгоно уу.")
        if not vals.get("date_from") or not vals.get("date_to"):
            raise UserError("Эхлэх болон дуусах огноо заавал оруулна уу.")
        if vals.get("date_to") < vals.get("date_from"):
            raise UserError("Дуусах огноо эхлэх огнооноос өмнө байж болохгүй.")
        if not (vals.get("reason") or "").strip():
            raise UserError("Шалтгаан заавал оруулна уу.")

    def _require_attachments(self):
        for request in self:
            if not request.attachment_ids:
                raise UserError("Хүсэлт илгээхийн тулд хавсралтын зураг заавал оруулна уу.")

    @api.model
    def _current_user_is_hr_reviewer(self):
        return any(
            self.env.user.has_group(group)
            for group in [
                "hr.group_hr_user",
                "hr.group_hr_manager",
                "hr_custom_mn.group_hr_custom_mn_officer",
                "hr_custom_mn.group_hr_custom_mn_admin",
            ]
        )

    def _require_hr_reviewer(self):
        if not self._current_user_is_hr_reviewer():
            raise AccessError("HR батлах / татгалзах эрх хүрэлцэхгүй байна.")

    @api.model
    def _current_user_department(self):
        return self.env.user.employee_id.department_id

    @api.model
    def _employee_in_current_department(self, employee):
        department = self._current_user_department()
        return bool(department and employee and employee.department_id == department)

    @api.model
    def _check_employee_scope(self, employee):
        if self._current_user_is_hr_reviewer():
            return True
        if not self._employee_in_current_department(employee):
            raise AccessError("Зөвхөн өөрийн хэлтсийн ажилтанд хүсэлт үүсгэх боломжтой.")
        return True

    @api.model
    def _scope_domain(self):
        if self._current_user_is_hr_reviewer():
            return []
        department = self._current_user_department()
        if not department:
            return [("submitted_by", "=", self.env.user.id)]
        return ["|", ("submitted_by", "=", self.env.user.id), ("department_id", "=", department.id)]

    @api.model
    def _employee_scope_domain(self):
        if self._current_user_is_hr_reviewer():
            return []
        department = self._current_user_department()
        if not department:
            return [("user_id", "=", self.env.user.id)]
        return [("department_id", "=", department.id)]

    def _serialize(self):
        self.ensure_one()
        return {
            "id": self.id,
            "name": self.name,
            "employeeId": self.employee_id.id,
            "employeeName": self.employee_id.display_name or "",
            "departmentId": self.department_id.id,
            "departmentName": self.department_id.display_name or "",
            "requestType": self.request_type,
            "requestTypeLabel": REQUEST_TYPE_LABELS.get(self.request_type, self.request_type),
            "dateFrom": str(self.date_from or ""),
            "dateTo": str(self.date_to or ""),
            "durationDays": self.duration_days,
            "reason": self.reason or "",
            "note": self.note or "",
            "hrNote": self.hr_note or "",
            "rejectionReason": self.rejection_reason or "",
            "state": self.state,
            "stateLabel": STATE_LABELS.get(self.state, self.state),
            "submittedBy": self.submitted_by.display_name or "",
            "submittedDate": fields.Datetime.to_string(self.submitted_date) if self.submitted_date else "",
            "reviewedBy": self.reviewed_by.display_name or "",
            "approvedBy": self.approved_by.display_name or "",
            "rejectedBy": self.rejected_by.display_name or "",
            "hasAttachment": bool(self.attachment_ids),
            "attachmentIds": self.attachment_ids.ids,
            "canEdit": self.can_current_user_edit,
            "canApprove": self.can_current_user_approve,
        }

    @api.model
    def get_hr_timeoff_request_directory(self, filters=None):
        filters = filters or {}
        domain = self._scope_domain()
        if filters.get("state"):
            domain.append(("state", "=", filters["state"]))
        if filters.get("requestType"):
            domain.append(("request_type", "=", filters["requestType"]))
        if filters.get("employeeId"):
            domain.append(("employee_id", "=", int(filters["employeeId"])))
        if filters.get("departmentId") and self._current_user_is_hr_reviewer():
            domain.append(("department_id", "=", int(filters["departmentId"])))
        requests = self.search(domain, limit=int(filters.get("limit") or 300))
        return [request._serialize() for request in requests]

    @api.model
    def create_hr_timeoff_request(self, payload):
        payload = payload or {}
        employee_id = int(payload.get("employeeId") or 0)
        employee = self.env["hr.employee"].sudo().browse(employee_id).exists()
        if not employee:
            raise UserError("Ажилтны бүртгэл олдсонгүй.")
        self._check_employee_scope(employee)
        request = self.create(
            {
                "employee_id": employee.id,
                "department_id": employee.department_id.id,
                "request_type": payload.get("requestType") or "time_off",
                "date_from": payload.get("dateFrom"),
                "date_to": payload.get("dateTo"),
                "reason": payload.get("reason") or "",
                "note": payload.get("note") or "",
                "state": "draft",
            }
        )
        request._create_payload_attachments(payload.get("attachments") or [])
        if payload.get("submit"):
            request.action_submit()
        return request._serialize()

    def update_hr_timeoff_request(self, payload):
        self.ensure_one()
        payload = payload or {}
        values = {}
        if "requestType" in payload:
            values["request_type"] = payload.get("requestType")
        if "dateFrom" in payload:
            values["date_from"] = payload.get("dateFrom")
        if "dateTo" in payload:
            values["date_to"] = payload.get("dateTo")
        if "reason" in payload:
            values["reason"] = payload.get("reason")
        if "note" in payload:
            values["note"] = payload.get("note")
        if "hrNote" in payload:
            values["hr_note"] = payload.get("hrNote")
        if "rejectionReason" in payload:
            values["rejection_reason"] = payload.get("rejectionReason")
        if values:
            self.write(values)
        self._create_payload_attachments(payload.get("attachments") or [])
        if payload.get("submit"):
            self.action_submit()
        return self._serialize()

    def _create_payload_attachments(self, attachments):
        attachment_model = self.env["ir.attachment"].sudo()
        for request in self:
            created_ids = []
            for attachment in attachments:
                datas = attachment.get("datas")
                if not datas:
                    continue
                created = attachment_model.create(
                    {
                        "name": attachment.get("name") or "Хавсралтын зураг",
                        "type": "binary",
                        "datas": datas,
                        "res_model": self._name,
                        "res_id": request.id,
                        "mimetype": attachment.get("mimetype") or "application/octet-stream",
                    }
                )
                created_ids.append(created.id)
            if created_ids:
                request.write({"attachment_ids": [(4, attachment_id) for attachment_id in created_ids]})

    @api.model
    def action_hr_timeoff_request(self, request_id, action, payload=None):
        request = self.browse(int(request_id)).exists()
        if not request:
            raise UserError("Хүсэлт олдсонгүй.")
        payload = payload or {}
        if "hrNote" in payload or "rejectionReason" in payload:
            request.write(
                {
                    "hr_note": payload.get("hrNote", request.hr_note),
                    "rejection_reason": payload.get("rejectionReason", request.rejection_reason),
                }
            )
        if action == "hr_review":
            request.action_hr_review()
        elif action == "approve":
            request.action_approve()
        elif action == "reject":
            request.action_reject()
        elif action == "cancel":
            request.action_cancel()
        else:
            raise UserError("Тодорхойгүй үйлдэл.")
        return request._serialize()

    @api.model
    def get_hr_timeoff_dashboard_data(self):
        employee_model = self.env["hr.employee"].sudo().with_context(active_test=False)
        employees = employee_model.search(self._employee_scope_domain())
        requests = self.search(self._scope_domain())
        today = fields.Date.context_today(self)
        current_by_employee = self._current_status_by_employee(employees.ids, today)
        active_count = 0
        time_off_count = 0
        sick_count = 0
        archived_count = 0
        for employee in employees:
            status = current_by_employee.get(employee.id) or self._base_employee_status(employee)
            if status == "sick":
                sick_count += 1
            elif status == "time_off":
                time_off_count += 1
            elif status in ("archived", "inactive"):
                archived_count += 1
            else:
                active_count += 1

        return {
            "scope": "hr" if self._current_user_is_hr_reviewer() else "department",
            "departmentName": self._current_user_department().display_name or "",
            "cards": {
                "totalEmployees": len(employees),
                "activeEmployees": active_count,
                "timeOffEmployees": time_off_count,
                "sickEmployees": sick_count,
                "archivedEmployees": archived_count,
                "pendingRequests": len(requests.filtered(lambda item: item.state in ("submitted", "hr_review"))),
                "approvedRequests": len(requests.filtered(lambda item: item.state == "approved")),
                "rejectedRequests": len(requests.filtered(lambda item: item.state == "rejected")),
            },
            "statusPie": [
                {"label": "Идэвхтэй", "value": active_count},
                {"label": "Чөлөөтэй", "value": time_off_count},
                {"label": "Өвчтэй", "value": sick_count},
            ],
            "departmentBreakdown": self._department_breakdown(employees, requests, today),
            "latestRequests": [request._serialize() for request in requests[:10]],
        }

    @api.model
    def _base_employee_status(self, employee):
        if not employee.active:
            return "archived"
        status = getattr(employee, "x_mn_employment_status", False) or "active"
        if status in ("archived", "terminated", "resigned"):
            return "inactive"
        return "active"

    @api.model
    def _current_status_by_employee(self, employee_ids, today):
        result = {}
        if not employee_ids:
            return result
        current_requests = self.sudo().search(
            [
                ("employee_id", "in", employee_ids),
                ("state", "=", "approved"),
                ("date_from", "<=", today),
                ("date_to", ">=", today),
            ]
        )
        for request in current_requests:
            if request.request_type == "sick":
                result[request.employee_id.id] = "sick"
            elif result.get(request.employee_id.id) != "sick":
                result[request.employee_id.id] = "time_off"
        return result

    @api.model
    def _department_breakdown(self, employees, requests, today):
        status_by_employee = self._current_status_by_employee(employees.ids, today)
        rows = {}
        for employee in employees:
            department = employee.department_id
            key = department.id or 0
            if key not in rows:
                rows[key] = {
                    "departmentId": key,
                    "departmentName": department.display_name or "Хэлтэсгүй",
                    "totalEmployees": 0,
                    "activeEmployees": 0,
                    "timeOffEmployees": 0,
                    "sickEmployees": 0,
                    "pendingRequests": 0,
                }
            rows[key]["totalEmployees"] += 1
            status = status_by_employee.get(employee.id) or self._base_employee_status(employee)
            if status == "sick":
                rows[key]["sickEmployees"] += 1
            elif status == "time_off":
                rows[key]["timeOffEmployees"] += 1
            elif status == "active":
                rows[key]["activeEmployees"] += 1
        for request in requests.filtered(lambda item: item.state in ("submitted", "hr_review")):
            key = request.department_id.id or 0
            if key in rows:
                rows[key]["pendingRequests"] += 1
        return sorted(rows.values(), key=lambda item: item["departmentName"])
