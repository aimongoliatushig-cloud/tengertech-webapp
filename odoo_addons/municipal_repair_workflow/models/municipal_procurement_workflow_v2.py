# -*- coding: utf-8 -*-

from datetime import date

from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError


AMOUNT_THRESHOLD = 1000000


def _is_high_value_amount(amount):
    return (amount or 0) > AMOUNT_THRESHOLD


ROLE_PREFERRED_LOGINS = {
    "administration_user": ("95406816",),
    "finance_user": ("99032458",),
}
ROLE_PREFERRED_NAMES = {
    "storekeeper": ("Сумъяадорж", "Sumyaadorj", "Sumiyadorj"),
    "repair_storekeeper": ("Сүхнаран", "Сухнаран", "Sukhnaran", "Sukh-Naran"),
}

PROCUREMENT_STATES_V2 = [
    ("draft", "Ноорог"),
    ("submitted", "Хүсэлт илгээгдсэн"),
    ("quote", "Үнийн санал бүртгэгдсэн"),
    ("quote_collection", "Үнийн санал бүртгэгдсэн"),
    ("finance_review", "Төлбөрийн хяналтанд"),
    ("finance_selected_supplier", "Төлбөрийн хяналтанд"),
    ("admin_review", "Хуулийн мэргэжилтэнд илгээсэн"),
    ("ceo_decision", "Тушаал батлуулах шатанд"),
    ("ceo_order_uploaded", "Тушаал гарсан"),
    ("legal_contract_draft", "Хуулийн мэргэжилтэнд илгээсэн"),
    ("contract_draft_started", "Гэрээний төсөл эхэлсэн"),
    ("order_draft_started", "Тушаалын төсөл эхэлсэн"),
    ("order_draft_uploaded", "Тушаалын төсөл гарсан"),
    ("legal_final_contract", "Гэрээний төсөл батлагдсан"),
    ("payment_pending", "Төлбөрийн хяналтанд"),
    ("payment_recorded", "Төлбөр төлөгдсөн"),
    ("receiving", "Хүлээн авалт хүлээгдэж байна"),
    ("received", "Хүлээн авалт хүлээгдэж байна"),
    ("done", "Дууссан"),
    ("returned", "Буцаагдсан"),
    ("cancelled", "Цуцлагдсан"),
]

PACKAGE_ROUTE_STATES = [
    ("draft", "Ноорог"),
    ("quote_collection", "Үнийн санал бүртгэгдсэн"),
    ("finance_review", "Төлбөрийн хяналтанд"),
    ("admin_review", "Хуулийн мэргэжилтэнд илгээсэн"),
    ("legal_contract_draft", "Хуулийн мэргэжилтэнд илгээсэн"),
    ("contract_draft_started", "Гэрээний төсөл эхэлсэн"),
    ("order_draft_started", "Тушаалын төсөл эхэлсэн"),
    ("order_draft_uploaded", "Тушаалын төсөл гарсан"),
    ("order_approval", "Тушаал батлуулах шатанд"),
    ("ceo_order_uploaded", "Тушаал гарсан"),
    ("legal_final_contract", "Гэрээний төсөл батлагдсан"),
    ("payment_pending", "Төлбөрийн хяналтанд"),
    ("payment_recorded", "Төлбөр төлөгдсөн"),
    ("received", "Хүлээн авалт хүлээгдэж байна"),
    ("done", "Дууссан"),
    ("cancelled", "Цуцлагдсан"),
]

PROCUREMENT_ACTION_LABELS = {
    "create": "Худалдан авах хүсэлт үүсгэх",
    "submit_for_quotation": "Хүсэлт илгээх",
    "submit_quotations": "Үнийн санал бүртгэх",
    "move_to_finance_review": "Дараагийн шат руу илгээх",
    "start_contract_draft": "Гэрээний төсөл эхлүүлэх",
    "start_order_draft": "Тушаалын төсөл эхлүүлэх",
    "upload_order_draft": "Тушаалын төсөл оруулах",
    "prepare_order": "Тушаалын төсөл хүлээн авах",
    "director_decision": "Тушаалын шийдвэр бүртгэх",
    "attach_final_order": "Тушаал батлагдлаа гэж тэмдэглэх",
    "record_package_ceo_order": "Батлагдсан тушаал хавсаргах",
    "mark_contract_signed": "Гэрээ оруулах",
    "mark_paid": "Төлбөр төлөгдсөнийг баталгаажуулах",
    "mark_received": "Хүлээн авалтыг баталгаажуулах",
    "mark_done": "Дуусгасан",
    "cancel": "Цуцлах",
}

PROCUREMENT_AUDIT_NOTE_LABELS = {
    "Request created": "Хүсэлт үүсгэсэн",
    "Final contract uploaded": "Эцсийн гэрээ хавсаргасан",
}

GROUPS = {
    "department_head": "municipal_core.group_municipal_department_head",
    "purchase_manager": "municipal_repair_workflow.group_procurement_purchase_manager",
    "storekeeper": "municipal_repair_workflow.group_procurement_storekeeper",
    "repair_storekeeper": "municipal_repair_workflow.group_repair_storekeeper",
    "finance_user": "municipal_repair_workflow.group_procurement_finance_user",
    "administration_user": "municipal_repair_workflow.group_procurement_administration_user",
    "legal_user": "municipal_repair_workflow.group_procurement_legal_user",
    "ceo": "municipal_repair_workflow.group_procurement_ceo",
    "general_manager": "municipal_repair_workflow.group_procurement_general_manager",
    "admin": "municipal_core.group_municipal_admin",
}

JOB_TITLE_ROLE_PATTERNS = {
    "department_head": ("хэлтсийн дарга", "хэлтэсийн дарга", "албаны дарга"),
    "finance_user": ("ерөнхий ня-бо", "ерөнхий нябо", "ерөнхий ня бо", "ерөнхий нягтлан"),
    "legal_user": ("хуулийн мэргэжилтэн", "хуульч"),
}

PROCUREMENT_ROLE_LABELS = {
    "department_head": "Хэлтсийн дарга",
    "purchase_manager": "Нярав",
    "storekeeper": "Нярав",
    "repair_storekeeper": "Нярав",
    "legal_user": "Хуулийн мэргэжилтэн",
    "administration_user": "Архив бичиг хэргийн ажилтан",
    "finance_user": "Ерөнхий ня-бо",
    "ceo": "Захирал",
    "general_manager": "Ерөнхий менежер",
    "admin": "Админ",
}


def _normalize_job_title(value):
    return " ".join((value or "").casefold().split())


def _job_title_matches_role(value, role_key):
    normalized = _normalize_job_title(value)
    return bool(normalized and any(pattern in normalized for pattern in JOB_TITLE_ROLE_PATTERNS.get(role_key, ())))


def _relation_payload(record):
    if not record:
        return None
    record = record.sudo()
    return {"id": record.id, "name": record.display_name}


def _code_label(code, selection):
    labels = dict(selection)
    return {"code": code or "", "label": labels.get(code, code or "")}


class MunicipalProcurementRequest(models.Model):
    _inherit = "municipal.procurement.request"

    title = fields.Char(string="Request title", tracking=True)
    related_project_id = fields.Many2one("project.project", string="Related project", ondelete="set null", index=True)
    related_task_id = fields.Many2one("project.task", string="Related task", ondelete="set null", index=True)
    requested_employee_id = fields.Many2one("hr.employee", string="Requested employee", compute="_compute_requested_employee", store=True)
    description = fields.Text(string="Description")
    priority = fields.Selection(
        [("low", "Low"), ("medium", "Medium"), ("high", "High"), ("critical", "Critical")],
        string="Priority",
        default="medium",
        tracking=True,
    )
    urgency = fields.Selection(
        [("low", "Low"), ("medium", "Medium"), ("high", "High"), ("critical", "Critical")],
        string="Urgency",
        default="medium",
        tracking=True,
    )
    required_date = fields.Date(string="Required date")
    state = fields.Selection(PROCUREMENT_STATES_V2, string="State", default="draft", required=True, tracking=True)
    flow_type = fields.Selection([("low", "Below threshold"), ("high", "High value")], compute="_compute_flow_type", store=True)
    requires_high_value_approval = fields.Boolean(
        string="Requires high-value approval",
        compute="_compute_flow_type",
        store=True,
        index=True,
    )
    ceo_selected_quote_id = fields.Many2one("municipal.procurement.quote", string="CEO selected quote")
    ceo_decision_date = fields.Datetime(string="CEO decision date")
    ceo_decision_recorded_by = fields.Many2one("res.users", string="CEO decision recorded by", readonly=True)
    ceo_order_attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_procurement_ceo_order_attachment_rel",
        "request_id",
        "attachment_id",
        string="CEO order attachments",
    )
    ceo_order_note = fields.Text(string="CEO order note")
    order_draft_attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_procurement_order_draft_attachment_rel",
        "request_id",
        "attachment_id",
        string="Order draft attachments",
    )
    order_draft_uploaded_by = fields.Many2one("res.users", string="Order draft uploaded by", readonly=True)
    order_draft_uploaded_date = fields.Datetime(string="Order draft uploaded date", readonly=True)
    contract_required = fields.Boolean(string="Contract required", compute="_compute_flow_type", store=True)
    contract_draft_attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_procurement_contract_draft_attachment_rel",
        "request_id",
        "attachment_id",
        string="Contract draft attachments",
    )
    contract_draft_uploaded_by = fields.Many2one("res.users", string="Contract draft uploaded by", readonly=True)
    contract_draft_uploaded_date = fields.Datetime(string="Contract draft uploaded date", readonly=True)
    final_contract_attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_procurement_final_contract_attachment_rel",
        "request_id",
        "attachment_id",
        string="Final contract attachments",
    )
    final_contract_uploaded_by = fields.Many2one("res.users", string="Final contract uploaded by", readonly=True)
    final_contract_uploaded_date = fields.Datetime(string="Final contract uploaded date", readonly=True)
    legal_user_id = fields.Many2one("res.users", string="Legal user")
    finance_user_id = fields.Many2one("res.users", string="Finance user")
    administration_user_id = fields.Many2one("res.users", string="Administration user")
    purchase_manager_id = fields.Many2one("res.users", string="Purchase manager")
    legal_state = fields.Selection(
        [
            ("not_required", "Not required"),
            ("draft_needed", "Draft needed"),
            ("draft_uploaded", "Draft uploaded"),
            ("final_pending", "Final pending"),
            ("final_uploaded", "Final uploaded"),
            ("completed", "Completed"),
        ],
        string="Legal state",
        default="not_required",
        tracking=True,
    )
    paid_amount = fields.Float(string="Paid amount", tracking=True)
    paid_date = fields.Date(string="Paid date")
    payment_note = fields.Text(string="Payment note")
    payment_attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_procurement_payment_attachment_rel",
        "request_id",
        "attachment_id",
        string="Payment attachments",
    )
    payment_status = fields.Selection(
        [("not_paid", "Not paid"), ("payment_recorded", "Payment recorded"), ("cancelled", "Cancelled")],
        string="Payment status",
        default="not_paid",
        tracking=True,
    )
    receipt_attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_procurement_receipt_attachment_rel",
        "request_id",
        "attachment_id",
        string="Receipt attachments",
    )
    received_date = fields.Date(string="Received date")
    received_note = fields.Text(string="Received note")
    is_service_finalized = fields.Boolean(string="Service finalized")
    receipt_status = fields.Selection(
        [("not_received", "Not received"), ("partially_received", "Partially received"), ("received", "Received")],
        string="Receipt status",
        default="not_received",
        tracking=True,
    )
    rejection_reason = fields.Text(string="Return / rejection reason")
    document_ids = fields.One2many("municipal.procurement.document", "request_id", string="Documents")
    audit_ids = fields.One2many("municipal.procurement.audit", "request_id", string="Audit")
    package_ids = fields.One2many("municipal.procurement.package", "request_id", string="Packages")
    receipt_ids = fields.One2many("municipal.procurement.receipt", "request_id", string="Receipts")
    purchase_order_id = fields.Many2one("purchase.order", string="Purchase order", ondelete="set null")
    vendor_bill_id = fields.Many2one("account.move", string="Vendor bill", ondelete="set null")
    active = fields.Boolean(default=True)

    @api.depends("requested_by")
    def _compute_requested_employee(self):
        employees = self.env["hr.employee"].sudo()
        for request in self:
            request.requested_employee_id = employees.search([("user_id", "=", request.requested_by.id)], limit=1)

    @api.depends(
        "selected_supplier_total",
        "selected_quote_id.amount_total",
        "quote_line_ids.is_selected",
        "quote_line_ids.amount_total",
        "package_ids.amount_total",
    )
    def _compute_flow_type(self):
        for request in self:
            amount = request._threshold_quote_amount()
            high = _is_high_value_amount(amount)
            request.requires_high_value_approval = high
            request.contract_required = high
            request.flow_type = "high" if high else ("low" if (amount or request.selected_supplier_total) else False)
            request.is_over_threshold = high

    @api.depends("quote_line_ids.is_selected", "quote_line_ids.amount_total", "quote_line_ids.supplier_id")
    def _compute_quote_summary(self):
        for request in self:
            selected_quotes = request.quote_line_ids.filtered("is_selected")
            selected = selected_quotes[:1]
            request.selected_quote_id = selected.id if selected else False
            request.selected_supplier_id = selected.supplier_id.id if selected else False
            request.selected_supplier_total = sum(selected_quotes.mapped("amount_total")) if selected_quotes else 0

    @api.depends(
        "amount_total",
        "selected_supplier_total",
        "selected_quote_id.amount_total",
        "quote_line_ids.is_selected",
        "quote_line_ids.amount_total",
        "package_ids.amount_total",
    )
    def _compute_is_over_threshold(self):
        for request in self:
            request.is_over_threshold = _is_high_value_amount(request._threshold_quote_amount())

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get("title") and not vals.get("description"):
                vals["description"] = vals.get("description") or ""
        records = super().create(vals_list)
        for record in records:
            record._record_audit("create", False, record.state, "Request created")
        return records

    def _user_job_title_text(self, user):
        employees = self.env["hr.employee"].sudo().search([("user_id", "=", user.id)], limit=1)
        if not employees:
            return ""
        employee = employees[0]
        parts = [employee.job_id.name if employee.job_id else ""]
        if "job_title" in employee._fields:
            parts.append(employee.job_title or "")
        return " ".join(part for part in parts if part)

    def _user_has_job_title_role(self, user, key):
        return _job_title_matches_role(self._user_job_title_text(user), key)

    def _user_group_field_name(self, user):
        user_fields = user.sudo()._fields
        if "groups_id" in user_fields:
            return "groups_id"
        if "group_ids" in user_fields:
            return "group_ids"
        return False

    def _user_group_ids(self, user):
        field_name = self._user_group_field_name(user)
        return set(user.sudo()[field_name].ids) if field_name else set()

    def _add_user_to_group(self, user, group_id):
        field_name = self._user_group_field_name(user)
        if field_name:
            user.sudo().write({field_name: [(4, group_id)]})

    def _ensure_user_group_for_role(self, user, role_key):
        group = self.env.ref(GROUPS[role_key], raise_if_not_found=False)
        if group and group.id not in self._user_group_ids(user):
            self._add_user_to_group(user, group.id)

    def _user_has_group_key(self, user, key):
        if key == "storekeeper":
            return user.has_group(GROUPS["storekeeper"]) or user.has_group(GROUPS["repair_storekeeper"])
        xml_id = GROUPS[key]
        has_title_role = self._user_has_job_title_role(user, key)
        if has_title_role:
            self._ensure_user_group_for_role(user, key)
        return user.has_group(xml_id) or has_title_role

    def _has_group_key(self, key):
        return self._user_has_group_key(self.env.user, key)

    def _has_any_group(self, keys):
        return any(self._has_group_key(key) for key in keys)

    def _ensure_role(self, keys, message):
        if not self._has_any_group(keys):
            raise AccessError(message)

    def _department_head_allowed_department_ids(self):
        employee_departments = self.env["hr.employee"].sudo().search(
            [("user_id", "=", self.env.user.id)]
        ).mapped("department_id")
        managed_departments = self.env["hr.department"].sudo().search(
            [("manager_id.user_id", "=", self.env.user.id)]
        )
        return set((employee_departments | managed_departments).ids)

    def _ensure_department_head_can_create_for_department(self, department_id):
        if self._has_group_key("admin"):
            return
        allowed_department_ids = self._department_head_allowed_department_ids()
        if department_id and department_id not in allowed_department_ids:
            raise AccessError("Department heads can create procurement requests only for their own department.")

    def _ensure_user_job_title_groups(self, user):
        if not user or not user.id:
            return
        commands = []
        current_group_ids = self._user_group_ids(user)
        for role_key in ("department_head", "finance_user", "legal_user"):
            if not self._user_has_job_title_role(user, role_key):
                continue
            group = self.env.ref(GROUPS[role_key], raise_if_not_found=False)
            if group and group.id not in current_group_ids:
                commands.append((4, group.id))
        field_name = self._user_group_field_name(user)
        if commands and field_name:
            user.sudo().write({field_name: commands})

    def _role_label_for_user(self, user):
        role_order = (
            "department_head",
            "storekeeper",
            "repair_storekeeper",
            "purchase_manager",
            "legal_user",
            "administration_user",
            "finance_user",
            "ceo",
            "general_manager",
            "admin",
        )
        for role_key in role_order:
            if self._user_has_group_key(user, role_key):
                return PROCUREMENT_ROLE_LABELS.get(role_key, role_key)
        return user.name or ""

    def _record_audit(self, action_code, old_state=False, new_state=False, note=False, attachment_ids=None):
        Audit = self.env["municipal.procurement.audit"].sudo()
        attachment_ids = attachment_ids or []
        for request in self:
            action_user = self.env.user
            Audit.create(
                {
                    "request_id": request.id,
                    "action_code": action_code,
                    "action_label": PROCUREMENT_ACTION_LABELS.get(action_code, action_code),
                    "old_state": old_state or False,
                    "new_state": new_state or False,
                    "user_id": action_user.id,
                    "note": note or False,
                    "previous_status": old_state or False,
                    "new_status": new_state or False,
                    "action_by_user_id": action_user.id,
                    "action_by_role": request._role_label_for_user(action_user),
                    "action_date": fields.Datetime.now(),
                    "comment": note or False,
                    "attached_file_ids": [(6, 0, [int(attachment_id) for attachment_id in attachment_ids])],
                }
            )

    def _change_state(self, new_state, action_code, note=False):
        for request in self:
            old_state = request.state
            request.write({"state": new_state})
            request._record_audit(action_code, old_state, new_state, note)

    def _valid_quote_lines(self):
        self.ensure_one()
        return self.quote_line_ids.filtered(lambda quote: quote.supplier_id)

    def _complete_packages(self):
        self.ensure_one()
        return self.package_ids.filtered("is_complete")

    def _ensure_all_lines_packaged(self):
        for request in self:
            missing = request.line_ids.filtered(lambda line: not line.package_id)
            if missing:
                raise UserError("All purchase items must be assigned to a package before sending to the next stage.")

    def _ensure_complete_packages(self):
        for request in self:
            if not request.package_ids:
                raise UserError("At least one package is required before sending to the next stage.")
            request._ensure_all_lines_packaged()
            incomplete = request.package_ids.filtered(lambda package: not package.is_complete)
            if incomplete:
                raise UserError("Every package must have one supplier invoice with an attachment.")

    def _ensure_procurement_lines(self):
        for request in self:
            if not request.line_ids:
                raise UserError("At least one purchase item is required.")

    def _ensure_three_quotes(self):
        for request in self:
            if request.package_ids:
                request._ensure_complete_packages()
                continue
            if len(request._valid_quote_lines()) < 1:
                raise UserError("At least one supplier invoice is required before supplier selection.")

    def _ensure_quote_evidence(self):
        for request in self:
            if request.package_ids:
                for package in request.package_ids:
                    package._ensure_three_quotes()
                    package._ensure_quote_evidence()
                continue
            missing = request._valid_quote_lines().filtered(lambda quote: not quote.attachment_ids)
            if missing:
                raise UserError("Invoice attachment or evidence is required.")

    def _ensure_selected_quote(self):
        for request in self:
            if request.package_ids:
                request._ensure_complete_packages()
                continue
            selected = request.quote_line_ids.filtered("is_selected")
            if not selected:
                raise UserError("A selected supplier quote is required.")
            if len(selected) > 1:
                raise UserError("Only one supplier quote can be selected.")

    def _ensure_high_value_payment_ready(self):
        for request in self:
            high_value_packages = request._high_value_packages()
            if request.package_ids and not high_value_packages:
                continue
            if not request.package_ids and not request.requires_high_value_approval:
                continue
            if request.package_ids:
                missing_packages = request._missing_ceo_order_packages()
                if missing_packages:
                    package_names = ", ".join(missing_packages.mapped("name"))
                    raise UserError("Батлагдсан тушаал дутуу байна: %s" % package_names)
            elif not request.ceo_selected_quote_id:
                raise UserError("Сонгосон нийлүүлэгчийн үнийн санал төлбөрөөс өмнө шаардлагатай.")
            if not request.ceo_order_attachment_ids:
                raise UserError("Батлагдсан тушаалын хавсралт төлбөрөөс өмнө шаардлагатай.")
            if not request.final_contract_attachment_ids:
                raise UserError("Гэрээний файл төлбөрөөс өмнө шаардлагатай.")

    def _package_threshold_amount(self, package):
        self.ensure_one()
        if package.lowest_quote_id:
            return package.lowest_quote_id.amount_total
        valid_quotes = package.quotation_ids.filtered(lambda quote: quote.supplier_id)
        if valid_quotes:
            return min(valid_quotes.mapped("amount_total") or [0])
        return package.amount_total or 0

    def _threshold_quote_amount(self):
        self.ensure_one()
        selected_quotes = self.quote_line_ids.filtered("is_selected")
        if selected_quotes:
            return max(selected_quotes.mapped("amount_total") or [0])
        if self.package_ids:
            return max([self._package_threshold_amount(package) for package in self.package_ids] or [0])
        return self.selected_quote_id.amount_total or self.selected_supplier_total or self.amount_total or 0

    def _high_value_packages(self):
        self.ensure_one()
        return self.package_ids.filtered(lambda package: _is_high_value_amount(self._package_threshold_amount(package)))

    def _low_value_packages(self):
        self.ensure_one()
        return self.package_ids.filtered(lambda package: not _is_high_value_amount(self._package_threshold_amount(package)))

    def _missing_ceo_order_packages(self):
        self.ensure_one()
        return self._high_value_packages().filtered(
            lambda package: self._effective_package_route_state(package) in ("order_draft_uploaded", "order_approval", "ceo_order_uploaded")
            and not package._ceo_order_ready()
        )

    def _effective_package_route_state(self, package):
        self.ensure_one()
        if package.receipt_status == "received":
            return "done"
        if package.payment_status == "payment_recorded" or self.payment_status == "payment_recorded":
            return "payment_recorded"
        if package.route_state and package.route_state != "draft":
            return package.route_state
        if not package.is_complete:
            return package.route_state or "draft"
        if _is_high_value_amount(self._package_threshold_amount(package)):
            if package._ceo_order_ready() and self.final_contract_attachment_ids:
                return "payment_pending"
            if package._ceo_order_ready():
                return "ceo_order_uploaded"
            if package.order_draft_attachment_ids:
                return "order_draft_uploaded"
            return "legal_contract_draft"
        return "finance_review"

    def _packages_in_route_states(self, states):
        self.ensure_one()
        states = set(states)
        return self.package_ids.filtered(lambda package: self._effective_package_route_state(package) in states)

    def _sync_request_from_package_routes(self):
        for request in self:
            if not request.package_ids:
                continue
            packages = request.package_ids
            active_packages = packages.filtered(lambda package: package.route_state != "cancelled")
            if active_packages and all(package.route_state == "done" for package in active_packages):
                request.write({"state": "done", "payment_status": "payment_recorded", "receipt_status": "received"})
                continue
            if active_packages and all(package.payment_status == "payment_recorded" for package in active_packages):
                request.payment_status = "payment_recorded"
            if active_packages and all(package.receipt_status == "received" for package in active_packages):
                request.receipt_status = "received"
                request.write({"state": "done", "payment_status": "payment_recorded", "receipt_status": "received"})
                continue
            if active_packages and all(package.payment_status == "payment_recorded" for package in active_packages):
                request.state = "payment_recorded"
                continue

            if packages.filtered(lambda package: package.route_state in ("admin_review",)):
                request.state = "admin_review"
            elif packages.filtered(lambda package: package.route_state == "contract_draft_started"):
                request.state = "contract_draft_started"
            elif packages.filtered(lambda package: package.route_state == "order_draft_started"):
                request.state = "order_draft_started"
            elif packages.filtered(lambda package: package.route_state == "order_draft_uploaded"):
                request.state = "order_draft_uploaded"
            elif packages.filtered(lambda package: package.route_state == "order_approval"):
                request.state = "ceo_decision"
            elif packages.filtered(lambda package: package.route_state == "ceo_order_uploaded"):
                request.state = "ceo_order_uploaded"
            elif packages.filtered(lambda package: package.route_state == "legal_contract_draft"):
                request.state = "legal_contract_draft"
            elif packages.filtered(lambda package: package.route_state == "legal_final_contract"):
                request.state = "legal_final_contract"
            elif packages.filtered(lambda package: package.route_state == "payment_pending"):
                request.state = "payment_pending"
            elif packages.filtered(lambda package: package.route_state == "finance_review"):
                request.state = "finance_review"
            elif packages.filtered(lambda package: package.route_state == "payment_recorded"):
                request.state = "payment_recorded"
            elif packages.filtered(lambda package: package.route_state == "received"):
                request.state = "received"

    def _default_role_user(self, group_key):
        group_keys = [group_key]
        if group_key == "purchase_manager":
            group_keys = ["purchase_manager", "storekeeper", "repair_storekeeper"]
        groups = self.env["res.groups"]
        for key in group_keys:
            group = self.env.ref(GROUPS[key], raise_if_not_found=False)
            if group:
                groups |= group
        if not groups:
            return self.env["res.users"]
        users = groups.sudo().mapped("all_user_ids").filtered(lambda user: user.active and not user.share)
        title_users = self._job_title_role_users(group_key)
        if title_users:
            users |= title_users
        preferred_logins = ROLE_PREFERRED_LOGINS.get(group_key, ())
        if preferred_logins:
            preferred_users = users.filtered(lambda user: user.login in preferred_logins)
            if preferred_users:
                return preferred_users.sorted(lambda user: preferred_logins.index(user.login))[:1]
        for preferred_name in ROLE_PREFERRED_NAMES.get(group_key, ()):
            preferred_name_normalized = preferred_name.casefold()
            preferred_users = users.filtered(
                lambda user: preferred_name_normalized in (user.name or "").casefold()
                or preferred_name_normalized in (user.login or "").casefold()
            )
            if preferred_users:
                return preferred_users.sorted(lambda user: user.id)[:1]
        non_smoke_users = users.filtered(lambda user: not (user.name or "").upper().startswith("SMOKE "))
        return (non_smoke_users or users).sorted(lambda user: user.id)[:1]

    def _job_title_role_users(self, group_key):
        if group_key not in JOB_TITLE_ROLE_PATTERNS:
            return self.env["res.users"]
        employees = self.env["hr.employee"].sudo().search([("user_id", "!=", False)])
        user_ids = []
        for employee in employees:
            parts = [employee.job_id.name if employee.job_id else ""]
            if "job_title" in employee._fields:
                parts.append(employee.job_title or "")
            if _job_title_matches_role(" ".join(part for part in parts if part), group_key):
                user_ids.append(employee.user_id.id)
        return self.env["res.users"].sudo().browse(user_ids).filtered(lambda user: user.active and not user.share)

    def _default_storekeeper_user_for_request(self, request_type=False, vehicle_id=False):
        role_key = "repair_storekeeper" if request_type == "repair_part" or vehicle_id else "storekeeper"
        default_user = self._default_role_user(role_key)
        if default_user:
            return default_user
        if role_key == "storekeeper":
            return self._default_role_user("purchase_manager")
        return self.env["res.users"]

    def _normalize_storekeeper_assignment(self, vals):
        selected_user = self.env["res.users"].sudo()
        if vals.get("purchase_manager_id"):
            selected_user = selected_user.browse(vals["purchase_manager_id"]).exists()
        is_repair_request = vals.get("request_type") == "repair_part" or bool(vals.get("vehicle_id"))
        default_user = self._default_storekeeper_user_for_request(vals.get("request_type"), vals.get("vehicle_id"))
        if default_user:
            vals["purchase_manager_id"] = default_user.id
            return vals
        if is_repair_request:
            if not selected_user or not selected_user.has_group(GROUPS["repair_storekeeper"]):
                vals["purchase_manager_id"] = False
            return vals

        is_repair_only_user = (
            selected_user
            and selected_user.has_group(GROUPS["repair_storekeeper"])
            and not selected_user.has_group(GROUPS["storekeeper"])
            and not selected_user.has_group(GROUPS["purchase_manager"])
        )
        if not selected_user or is_repair_only_user:
            vals["purchase_manager_id"] = False
        return vals

    def _ensure_stage_assignees(self, *role_keys):
        role_fields = {
            "purchase_manager": "purchase_manager_id",
            "finance_user": "finance_user_id",
            "administration_user": "administration_user_id",
            "legal_user": "legal_user_id",
        }
        role_labels = {
            "purchase_manager": "purchase manager",
            "finance_user": "finance user",
            "administration_user": "administration / office clerk user",
            "legal_user": "legal user",
        }
        for request in self:
            vals = {}
            for role_key in role_keys:
                field_name = role_fields[role_key]
                current_user = request[field_name]
                if current_user and current_user.active:
                    continue
                default_user = request._default_role_user(role_key)
                if not default_user:
                    raise UserError("No active %s is configured for procurement routing." % role_labels[role_key])
                vals[field_name] = default_user.id
            if vals:
                request.write(vals)

    def action_submit(self):
        self._ensure_role(["department_head", "admin"], "Only department head can submit procurement requests.")
        self._ensure_procurement_lines()
        self._change_state("submitted", "submit_for_quotation")
        return True

    def action_submit_quotes(self):
        self._ensure_role(["purchase_manager", "storekeeper", "admin"], "Only purchase manager can start quote collection.")
        self._change_state("quote_collection", "submit_for_quotation")
        return True

    def action_finance_review(self):
        self._ensure_role(["purchase_manager", "storekeeper", "admin"], "Only purchase manager can send to finance review.")
        self._ensure_procurement_lines()
        self._ensure_three_quotes()
        self._ensure_quote_evidence()
        self._ensure_selected_quote()
        for request in self:
            if request.package_ids:
                request._sync_package_quote_selection()
                low_packages = request._low_value_packages()
                high_packages = request._high_value_packages()
                if low_packages:
                    request._ensure_stage_assignees("finance_user")
                    low_packages.write({"route_state": "finance_review", "payment_status": "not_paid"})
                if high_packages:
                    request._ensure_stage_assignees("legal_user")
                    high_packages.write({"route_state": "legal_contract_draft", "payment_status": "not_paid"})
                    request.legal_state = "draft_needed"
                request.write({"amount_total": sum(request.package_ids.mapped("amount_total"))})
                request._sync_request_from_package_routes()
                request._record_audit("move_to_finance_review", "quote_collection", request.state, "Үнийн санал бүртгэгдэж, өндөр дүнтэй багцыг Хуулийн мэргэжилтэнд илгээсэн")
                continue
            selected_total = sum(request.quote_line_ids.filtered("is_selected").mapped("amount_total"))
            request.write({"amount_total": selected_total or request.selected_supplier_total})
            if _is_high_value_amount(request._threshold_quote_amount()):
                request._ensure_stage_assignees("legal_user")
                request.legal_state = "draft_needed"
                request._change_state("legal_contract_draft", "move_to_finance_review")
            else:
                request._ensure_stage_assignees("finance_user")
                request._change_state("finance_review", "move_to_finance_review")
        return True

    def action_finance_approve(self):
        self._ensure_role(["finance_user", "admin"], "Only finance can select supplier/payment flow.")
        self._ensure_selected_quote()
        for request in self:
            if request._high_value_packages() or (
                not request.package_ids and _is_high_value_amount(request._threshold_quote_amount())
            ):
                raise UserError("High-value packages must go through administration before payment.")
            request.finance_approved_by = self.env.user.id
            request.date_finance_approved = fields.Datetime.now()
            request._change_state("payment_pending", "finance_selected_supplier")
        return True

    def action_start_contract_draft(self, package_id=False, note=False):
        self._ensure_role(["legal_user", "admin"], "Зөвхөн Хуулийн мэргэжилтэн гэрээний төсөл эхлүүлнэ.")
        for request in self:
            packages = (
                request.package_ids.filtered(lambda package: package.id == int(package_id or 0))
                if package_id
                else request._high_value_packages().filtered(
                    lambda package: request._effective_package_route_state(package) == "legal_contract_draft"
                )
            )
            if request.package_ids and not packages:
                raise UserError("Гэрээний төсөл эхлүүлэх хүлээгдэж буй өндөр дүнтэй багц алга.")
            if packages:
                packages.write({"route_state": "contract_draft_started"})
                request.write({"legal_state": "draft_needed"})
                request._sync_request_from_package_routes()
                request._record_audit("start_contract_draft", "legal_contract_draft", request.state, note or "Гэрээний төсөл эхэлсэн")
                continue
            request._change_state("contract_draft_started", "start_contract_draft", note or "Гэрээний төсөл эхэлсэн")
        return True

    def action_start_order_draft(self, package_id=False, note=False):
        self._ensure_role(["legal_user", "admin"], "Зөвхөн Хуулийн мэргэжилтэн тушаалын төсөл эхлүүлнэ.")
        for request in self:
            packages = (
                request.package_ids.filtered(lambda package: package.id == int(package_id or 0))
                if package_id
                else request._high_value_packages().filtered(
                    lambda package: request._effective_package_route_state(package) == "contract_draft_started"
                )
            )
            if request.package_ids and not packages:
                raise UserError("Эхлээд гэрээний төслийг эхлүүлнэ үү.")
            if packages:
                packages.write({"route_state": "order_draft_started"})
                request._sync_request_from_package_routes()
                request._record_audit("start_order_draft", "contract_draft_started", request.state, note or "Тушаалын төсөл эхэлсэн")
                continue
            if request.state != "contract_draft_started":
                raise UserError("Эхлээд гэрээний төслийг эхлүүлнэ үү.")
            request._change_state("order_draft_started", "start_order_draft", note or "Тушаалын төсөл эхэлсэн")
        return True

    def action_upload_order_draft(self, note=False, package_id=False):
        self._ensure_role(["legal_user", "admin"], "Зөвхөн Хуулийн мэргэжилтэн тушаалын төсөл upload хийнэ.")
        for request in self:
            packages = (
                request.package_ids.filtered(lambda package: package.id == int(package_id or 0))
                if package_id
                else request._high_value_packages().filtered(
                    lambda package: request._effective_package_route_state(package) == "order_draft_started"
                )
            )
            if request.package_ids and not packages:
                raise UserError("Тушаалын төсөл upload хийх багц олдсонгүй.")
            if packages:
                missing_drafts = packages.filtered(lambda package: not package.order_draft_attachment_ids)
                if missing_drafts:
                    raise UserError("Тушаалын төсөл docx эсвэл pdf файлаар хавсаргана уу.")
                request.order_draft_attachment_ids = [(4, attachment.id) for attachment in packages.mapped("order_draft_attachment_ids")]
                packages.write({"route_state": "order_draft_uploaded"})
                request.write(
                    {
                        "order_draft_uploaded_by": self.env.user.id,
                        "order_draft_uploaded_date": fields.Datetime.now(),
                    }
                )
                request._ensure_stage_assignees("administration_user")
                request._sync_request_from_package_routes()
                request._record_audit("upload_order_draft", "order_draft_started", request.state, note or "Тушаалын төсөл гарсан", packages.mapped("order_draft_attachment_ids").ids)
                continue
            if not request.order_draft_attachment_ids:
                raise UserError("Тушаалын төсөл docx эсвэл pdf файлаар хавсаргана уу.")
            request.write(
                {
                    "order_draft_uploaded_by": self.env.user.id,
                    "order_draft_uploaded_date": fields.Datetime.now(),
                }
            )
            request._ensure_stage_assignees("administration_user")
            request._change_state("order_draft_uploaded", "upload_order_draft", note or "Тушаалын төсөл гарсан")
        return True

    def action_prepare_order(self):
        self._ensure_role(["administration_user", "admin"], "Only archive/office clerk can receive order paperwork.")
        self._ensure_selected_quote()
        for request in self:
            if not request._high_value_packages() and not (
                not request.package_ids and _is_high_value_amount(request._threshold_quote_amount())
            ):
                raise UserError("Order paperwork is only required for high-value purchases.")
            request._change_state("ceo_decision", "prepare_order")
        return True

    def action_record_ceo_decision(self, selected_quotation_id=False, note=False):
        self._ensure_role(["administration_user", "admin"], "Зөвхөн Архив бичиг хэргийн ажилтан тушаалын шийдвэр бүртгэнэ.")
        for request in self:
            high_value_packages = request._high_value_packages()
            if high_value_packages:
                package = high_value_packages.filtered(lambda item: not item._ceo_order_ready())[:1] or high_value_packages[:1]
                if not package:
                    raise UserError("A high-value package is required.")
                return request.action_record_package_ceo_order(
                    package.id,
                    selected_quotation_id,
                    note=note,
                    require_order_fields=False,
                )
            quote = self.env["municipal.procurement.quote"].browse(selected_quotation_id).exists() if selected_quotation_id else request.selected_quote_id
            if not quote or quote.procurement_id != request:
                raise UserError("Сонгосон нийлүүлэгчийн үнийн санал шаардлагатай.")
            request.quote_line_ids.write({"is_selected": False})
            quote.is_selected = True
            request.write(
                {
                    "administration_user_id": self.env.user.id,
                    "ceo_selected_quote_id": quote.id,
                    "ceo_decision_date": fields.Datetime.now(),
                    "ceo_decision_recorded_by": self.env.user.id,
                    "date_director_decision": fields.Datetime.now(),
                    "director_approved_by": self.env.user.id,
                }
            )
            request._change_state("ceo_order_uploaded" if request.ceo_order_attachment_ids else "ceo_decision", "director_decision", note)
        return True

    def action_upload_ceo_order(self, note=False):
        self._ensure_role(["administration_user", "admin"], "Зөвхөн Архив бичиг хэргийн ажилтан батлагдсан тушаал upload хийнэ.")
        for request in self:
            missing_packages = request._missing_ceo_order_packages()
            if missing_packages:
                if len(missing_packages) == 1:
                    return request.action_record_package_ceo_order(
                        missing_packages.id,
                        missing_packages.ceo_selected_quote_id.id or False,
                        note=note,
                    )
                package_names = ", ".join(missing_packages.mapped("name"))
                raise UserError("Батлагдсан тушаал дутуу байна: %s" % package_names)
            if (
                (not request.package_ids and request.requires_high_value_approval)
                or bool(request._missing_ceo_order_packages())
            ) and not request.ceo_selected_quote_id:
                raise UserError("Тушаал upload хийхээс өмнө нийлүүлэгчийн үнийн саналыг сонгоно уу.")
            request.ceo_order_note = note or request.ceo_order_note
            request._ensure_stage_assignees("legal_user")
            request._change_state("ceo_order_uploaded", "attach_final_order", note)
            request.legal_state = "final_pending"
        return True

    def action_record_package_ceo_order(
        self,
        package_id=False,
        selected_quotation_id=False,
        order_number=False,
        order_date=False,
        note=False,
        attachment_ids=None,
        require_order_fields=True,
    ):
        self._ensure_role(
            ["administration_user", "admin"],
            "Only archive/office clerk can register the approved order.",
        )
        attachment_ids = attachment_ids or []
        for request in self:
            package = request.package_ids.filtered(lambda item: item.id == int(package_id or 0))[:1]
            if not package:
                raise UserError("A valid high-value package is required.")
            if not _is_high_value_amount(request._package_threshold_amount(package)):
                raise UserError("Тушаал батлуулах шат зөвхөн 1,000,000 MNT-ээс дээш багцад шаардлагатай.")
            if package.route_state not in ("order_draft_uploaded", "order_approval", "ceo_order_uploaded", "legal_final_contract"):
                package.route_state = "order_draft_uploaded"
            if require_order_fields and not package.order_draft_attachment_ids:
                raise UserError("Тушаалын төслийг хавсаргасны дараа батлагдсан тушаал бүртгэнэ.")
            quote = package.quotation_ids.filtered(lambda item: item.id == int(selected_quotation_id or 0))[:1]
            if not quote:
                quote = package.lowest_quote_id
            if not quote or quote.package_id != package:
                raise UserError("Энэ багцад хүчинтэй сонгосон нийлүүлэгчийн үнийн санал шаардлагатай.")
            vals = {
                "ceo_selected_quote_id": quote.id,
                "ceo_decision_note": note or package.ceo_decision_note,
                "ceo_order_note": note or package.ceo_order_note,
                "ceo_decision_recorded_by": self.env.user.id,
                "ceo_decision_date": fields.Datetime.now(),
            }
            if order_number:
                vals["ceo_order_number"] = order_number
            if order_date:
                vals["ceo_order_date"] = order_date
            if attachment_ids:
                vals["ceo_order_attachment_ids"] = [(4, int(attachment_id)) for attachment_id in attachment_ids]
            package.write(vals)
            package.quotation_ids.write({"is_selected": False})
            quote.is_selected = True
            request.write(
                {
                    "ceo_selected_quote_id": quote.id,
                    "ceo_decision_date": fields.Datetime.now(),
                    "ceo_decision_recorded_by": self.env.user.id,
                    "date_director_decision": fields.Datetime.now(),
                    "director_approved_by": self.env.user.id,
                    "ceo_order_note": note or request.ceo_order_note,
                }
            )
            if package.ceo_order_attachment_ids:
                request.ceo_order_attachment_ids = [(4, attachment.id) for attachment in package.ceo_order_attachment_ids]
            if require_order_fields and not package._ceo_order_ready():
                raise UserError("Supplier, order date, and order attachment are required for this package.")
            missing_packages = request._missing_ceo_order_packages()
            if missing_packages:
                package.route_state = "ceo_order_uploaded"
                request._sync_request_from_package_routes()
                request._record_audit("record_package_ceo_order", "ceo_decision", request.state, note or package.name, attachment_ids)
            else:
                request._ensure_stage_assignees("legal_user")
                request.legal_state = "final_pending"
                request._high_value_packages().filtered(lambda item: item._ceo_order_ready()).write({"route_state": "ceo_order_uploaded"})
                request._sync_request_from_package_routes()
                request._record_audit("record_package_ceo_order", "ceo_decision", request.state, note or package.name, attachment_ids)
        return True

    def action_upload_contract_draft(self, note=False, package_id=False):
        self._ensure_role(["legal_user", "admin"], "Only legal can upload contract draft.")
        for request in self:
            if request.package_ids:
                packages = (
                    request.package_ids.filtered(lambda package: package.id == int(package_id or 0))
                    if package_id
                    else request._high_value_packages().filtered(
                        lambda package: request._effective_package_route_state(package) in ("ceo_order_uploaded", "legal_final_contract")
                    )
                )
                if not packages:
                    raise UserError("No high-value package is waiting for legal action.")
                final_packages = packages
                missing_orders = final_packages.filtered(lambda package: not package._ceo_order_ready())
                if missing_orders:
                    raise UserError("Approved order must be uploaded before final contract.")
                if not request.final_contract_attachment_ids:
                    raise UserError("Upload a final contract attachment first.")
                final_packages.write({"route_state": "payment_pending"})
                request.write(
                    {
                        "final_contract_uploaded_by": self.env.user.id,
                        "final_contract_uploaded_date": fields.Datetime.now(),
                        "legal_state": "completed",
                    }
                )
                request._ensure_stage_assignees("finance_user")
                request._sync_request_from_package_routes()
                request._record_audit("mark_contract_signed", "legal_final_contract", request.state, note or "Гэрээний төсөл батлагдсан", request.final_contract_attachment_ids.ids)
                continue
            if request.requires_high_value_approval and not request.ceo_order_attachment_ids:
                    raise UserError("Гэрээний төсөл боловсруулахын өмнө батлагдсан тушаал upload хийгдсэн байх шаардлагатай.")
            if not request.final_contract_attachment_ids:
                raise UserError("Upload a contract attachment first.")
            request.write(
                {
                    "final_contract_uploaded_by": self.env.user.id,
                    "final_contract_uploaded_date": fields.Datetime.now(),
                    "legal_state": "completed",
                }
            )
            request._ensure_stage_assignees("finance_user")
            request._change_state("payment_pending", "mark_contract_signed", note)
        return True

    def action_upload_final_contract(self, note=False):
        self._ensure_role(["legal_user", "admin"], "Only legal can upload final contract.")
        for request in self:
            if not request.final_contract_attachment_ids:
                raise UserError("Upload a final contract attachment first.")
            request.write(
                {
                    "final_contract_uploaded_by": self.env.user.id,
                    "final_contract_uploaded_date": fields.Datetime.now(),
                    "legal_state": "final_uploaded",
                }
            )
            request._record_audit("mark_contract_signed", request.state, request.state, note or "Final contract uploaded")
        return True

    def action_mark_paid(self, package_id=False):
        self._ensure_role(["finance_user", "admin"], "Only finance can record payment.")
        for request in self:
            if request.package_ids and package_id:
                package = request.package_ids.filtered(lambda item: item.id == int(package_id or 0))[:1]
                if not package:
                    raise UserError("A valid package is required for payment.")
                if package.payment_status == "payment_recorded":
                    raise UserError("This package payment is already recorded.")
                if request._effective_package_route_state(package) not in ("finance_review", "payment_pending"):
                    raise UserError("This package is not ready for finance payment.")
                if _is_high_value_amount(request._package_threshold_amount(package)) and not package._ceo_order_ready():
                    raise UserError("High-value package must complete administration approval before payment.")
                if _is_high_value_amount(request._package_threshold_amount(package)) and not request.final_contract_attachment_ids:
                    raise UserError("Final contract must be uploaded before payment.")
                if request.paid_amount <= 0:
                    raise UserError("Paid amount is required.")
                selected_quote = package.ceo_selected_quote_id or package.quotation_ids.filtered("is_selected")[:1] or package.lowest_quote_id
                if not selected_quote:
                    raise UserError("A selected supplier quote is required.")
                if not selected_quote.bank_account_text and not request.payment_note:
                    raise UserError("Supplier bank account is required unless an exception note is entered.")
                package.write(
                    {
                        "route_state": "payment_recorded",
                        "payment_status": "payment_recorded",
                        "paid_amount": request.paid_amount,
                        "payment_reference": request.payment_reference,
                        "payment_note": request.payment_note,
                        "paid_by": self.env.user.id,
                        "date_paid": fields.Datetime.now(),
                        "paid_date": request.paid_date or fields.Date.context_today(request),
                    }
                )
                request._ensure_stage_assignees("purchase_manager")
                request._sync_request_from_package_routes()
                request._record_audit("mark_paid", "payment_pending", request.state, package.name, request.payment_attachment_ids.ids)
                continue
            request._ensure_selected_quote()
            request._ensure_high_value_payment_ready()
            if request.paid_amount <= 0:
                raise UserError("Paid amount is required.")
            selected_quote = request.selected_quote_id or request.ceo_selected_quote_id
            if not selected_quote.bank_account_text and not request.payment_note:
                raise UserError("Supplier bank account is required unless an exception note is entered.")
            request.write(
                {
                    "state": "payment_recorded",
                    "payment_status": "payment_recorded",
                    "paid_by": self.env.user.id,
                    "date_paid": fields.Datetime.now(),
                    "paid_date": request.paid_date or fields.Date.context_today(request),
                }
            )
            request._ensure_stage_assignees("purchase_manager")
            request._record_audit("mark_paid", "payment_pending", "payment_recorded", request.payment_note, request.payment_attachment_ids.ids)
        return True

    def action_receive(self, package_id=False):
        self._ensure_role(["purchase_manager", "storekeeper", "admin"], "Only purchase manager can mark receiving.")
        for request in self:
            if request.package_ids and package_id:
                package = request.package_ids.filtered(lambda item: item.id == int(package_id or 0))[:1]
                if not package:
                    raise UserError("A valid package is required for receiving.")
                if package.payment_status != "payment_recorded":
                    raise UserError("Payment must be recorded before receiving/finalization.")
                if not request.received_note and not request.is_service_finalized:
                    raise UserError("Receiving or service finalization note is required.")
                package.write(
                    {
                        "route_state": "done",
                        "receipt_status": "received",
                        "received_by": self.env.user.id,
                        "date_received": fields.Datetime.now(),
                        "received_date": request.received_date or fields.Date.context_today(request),
                        "received_note": request.received_note,
                    }
                )
                for line in package.line_ids:
                    if line.received_quantity <= 0:
                        line.received_quantity = line.requested_quantity
                    line.state = "received"
                request._sync_request_from_package_routes()
                request._record_audit("mark_received", "payment_recorded", request.state, package.name, request.receipt_attachment_ids.ids)
                continue
            old_state = request.state
            if request.payment_status != "payment_recorded":
                raise UserError("Payment must be recorded before receiving/finalization.")
            if not request.received_note and not request.is_service_finalized:
                raise UserError("Receiving or service finalization note is required.")
            request._ensure_procurement_lines()
            all_received = True
            for line in request.line_ids:
                if line.received_quantity <= 0:
                    line.received_quantity = line.requested_quantity
                if line.received_quantity < line.requested_quantity:
                    all_received = False
                    if not request.received_note:
                        raise UserError("Partial receiving requires a note.")
                line.state = "received" if line.received_quantity >= line.requested_quantity else "requested"
            request.write(
                {
                    "state": "done",
                    "receipt_status": "received" if all_received or request.is_service_finalized else "partially_received",
                    "received_by": self.env.user.id,
                    "date_received": fields.Datetime.now(),
                    "received_date": request.received_date or fields.Date.context_today(request),
                }
            )
            request._record_audit("mark_received", old_state, "done", request.received_note, request.receipt_attachment_ids.ids)
        return True

    def action_done(self):
        for request in self:
            if request.package_ids:
                unfinished = request.package_ids.filtered(lambda package: request._effective_package_route_state(package) not in ("done", "cancelled"))
                if unfinished:
                    raise UserError("All packages must be paid and received before completion.")
                request._change_state("done", "mark_done")
                continue
            if request.payment_status != "payment_recorded":
                raise UserError("Payment must be recorded before completion.")
            if request.receipt_status not in ("received", "partially_received") and not request.is_service_finalized:
                raise UserError("Goods must be received or service finalized before completion.")
            request._change_state("done", "mark_done")
        return True

    def action_cancel(self):
        if any(request.state == "done" for request in self):
            raise UserError("Completed requests cannot be cancelled.")
        self.write({"payment_status": "cancelled"})
        self._change_state("cancelled", "cancel")
        return True

    def _api_check_read(self):
        self.check_access_rights("read")
        self.check_access_rule("read")

    def _api_check_write(self):
        self.check_access_rights("write")
        self.check_access_rule("write")

    def _state_payload(self, field_name, value):
        return _code_label(value, self._fields[field_name].selection)

    def _api_available_actions(self):
        self.ensure_one()
        flags = self._api_current_user_payload(self.env.user)["flags"]
        actions = []

        def add(code):
            if not any(action["code"] == code for action in actions):
                actions.append({"code": code, "label": PROCUREMENT_ACTION_LABELS[code]})

        if self.state == "draft" and (flags["requester"] or flags["admin"]):
            add("submit_for_quotation")
        if self.state in ("submitted", "quote", "quote_collection") and (flags["storekeeper"] or flags["admin"]):
            add("submit_quotations")
            if (self.package_ids and not self.package_ids.filtered(lambda package: not package.is_complete)) or (
                not self.package_ids and len(self._valid_quote_lines()) >= 1 and self.selected_quote_id
            ):
                add("move_to_finance_review")
        if self.package_ids:
            payable_packages = self.package_ids.filtered(
                lambda package: self._effective_package_route_state(package) in ("finance_review", "payment_pending")
                and package.payment_status != "payment_recorded"
            )
            receivable_packages = self.package_ids.filtered(lambda package: package.payment_status == "payment_recorded" and package.receipt_status != "received")
            if self._missing_ceo_order_packages() and (flags["office_clerk"] or flags["admin"]):
                add("record_package_ceo_order")
            if self._packages_in_route_states(("legal_contract_draft",)) and (flags["contract_officer"] or flags["admin"]):
                add("start_contract_draft")
            if self._packages_in_route_states(("contract_draft_started",)) and (flags["contract_officer"] or flags["admin"]):
                add("start_order_draft")
            if self._packages_in_route_states(("order_draft_started",)) and (flags["contract_officer"] or flags["admin"]):
                add("upload_order_draft")
            if self._packages_in_route_states(("ceo_order_uploaded", "legal_final_contract")) and (flags["contract_officer"] or flags["admin"]):
                add("mark_contract_signed")
            if payable_packages and (flags["finance"] or flags["admin"]):
                add("mark_paid")
            if receivable_packages and (flags["storekeeper"] or flags["admin"]):
                add("mark_received")
            if (
                self.state != "done"
                and self.package_ids
                and not self.package_ids.filtered(lambda package: self._effective_package_route_state(package) not in ("done", "cancelled"))
            ):
                add("mark_done")
            return actions
        high_value_required = bool(self._high_value_packages()) or (
            not self.package_ids and _is_high_value_amount(self._threshold_quote_amount())
        )
        high_value_waiting_admin = high_value_required and not (
            self.ceo_order_attachment_ids and self.final_contract_attachment_ids
        )
        if self.state == "legal_contract_draft" and high_value_waiting_admin and (flags["contract_officer"] or flags["admin"]):
            add("start_contract_draft")
        if self.state == "contract_draft_started" and high_value_waiting_admin and (flags["contract_officer"] or flags["admin"]):
            add("start_order_draft")
        if self.state == "order_draft_started" and high_value_waiting_admin and (flags["contract_officer"] or flags["admin"]):
            add("upload_order_draft")
        if self.state == "finance_review" and not high_value_waiting_admin and (flags["finance"] or flags["admin"]):
            add("mark_paid")
        if self.state == "admin_review" and (flags["office_clerk"] or flags["admin"]):
            add("prepare_order")
            add("record_package_ceo_order")
        if self.state == "ceo_decision" and (flags["office_clerk"] or flags["director"] or flags["general_manager"] or flags["admin"]):
            add("director_decision")
            add("record_package_ceo_order")
        if self.state in ("order_draft_uploaded", "ceo_decision", "ceo_order_uploaded") and (flags["office_clerk"] or flags["admin"]):
            add("attach_final_order")
        if self.state in ("ceo_order_uploaded", "legal_final_contract") and (flags["contract_officer"] or flags["admin"]):
            add("mark_contract_signed")
        if self.state == "payment_pending" and (flags["finance"] or flags["admin"]):
            add("mark_paid")
        if self.state == "payment_recorded" and (flags["storekeeper"] or flags["admin"]):
            add("mark_received")
        if self.state == "received":
            add("mark_done")
        if self.state not in ("done", "cancelled"):
            add("cancel")
        return actions

    @api.model
    def _api_current_user_payload(self, user):
        self._ensure_user_job_title_groups(user)

        def has(key):
            return self._user_has_group_key(user, key)

        return {
            "id": user.id,
            "name": user.name,
            "login": user.login,
            "company": user.company_id.sudo().display_name,
            "flags": {
                "requester": has("department_head") or has("admin"),
                "storekeeper": has("purchase_manager") or has("storekeeper") or user.has_group("municipal_repair_workflow.group_repair_storekeeper"),
                "finance": has("finance_user") or user.has_group("municipal_repair_workflow.group_repair_finance"),
                "office_clerk": has("administration_user"),
                "contract_officer": has("legal_user"),
                "director": has("ceo") or user.has_group("municipal_core.group_municipal_director"),
                "general_manager": has("general_manager"),
                "admin": has("admin"),
            },
        }

    def _api_summary_payload(self):
        self.ensure_one()
        selected = self.selected_quote_id or self.ceo_selected_quote_id
        package_amount = sum(self.package_ids.mapped("amount_total")) if self.package_ids else 0
        amount = package_amount or self.selected_supplier_total or selected.amount_total or self.amount_total or 0
        threshold_amount = self._threshold_quote_amount()
        is_high_value = _is_high_value_amount(threshold_amount)
        flow_type = "high" if is_high_value else ("low" if (threshold_amount or amount) else self.flow_type)
        paid = self.payment_status == "payment_recorded"
        received = self.receipt_status in ("received", "partially_received") or self.is_service_finalized
        today = fields.Date.context_today(self)
        delay_days = 0
        if self.required_date and self.state not in ("done", "cancelled"):
            delay_days = max((today - self.required_date).days, 0)
        return {
            "id": self.id,
            "name": self.name,
            "title": self.title or self.description or self.name,
            "create_date": self.create_date.isoformat() if self.create_date else None,
            "write_date": self.write_date.isoformat() if self.write_date else None,
            "project": _relation_payload(self.related_project_id),
            "task": _relation_payload(self.related_task_id),
            "vehicle": _relation_payload(self.vehicle_id),
            "department": _relation_payload(self.department_id),
            "requester": _relation_payload(self.requested_by),
            "storekeeper": _relation_payload(self.purchase_manager_id),
            "procurement_type": self._state_payload("request_type", self.request_type),
            "urgency": self._state_payload("urgency", self.urgency),
            "description": self.description,
            "required_date": self.required_date.isoformat() if self.required_date else None,
            "state": self._state_payload("state", self.state),
            "flow_type": self._state_payload("flow_type", flow_type),
            "selected_supplier": {
                "id": selected.supplier_id.id,
                "name": selected.supplier_id.sudo().display_name,
                "total": selected.amount_total,
            } if selected else None,
            "selected_quotation_id": selected.id if selected else None,
            "selected_supplier_total": amount,
            "amount_approx_total": sum(self.line_ids.mapped("subtotal")) or self.amount_total or 0,
            "package_count": len(self.package_ids),
            "packages_complete": bool(self.package_ids) and not self.package_ids.filtered(lambda package: not package.is_complete),
            "packages": [
                package._api_payload(index + 1)
                for index, package in enumerate(self.package_ids)
            ],
            "high_value_packages": [
                package._api_payload(index + 1)
                for index, package in enumerate(self._high_value_packages())
            ],
            "low_value_packages": [
                package._api_payload(index + 1)
                for index, package in enumerate(self._low_value_packages())
            ],
            "payment_status": self._state_payload("payment_status", self.payment_status),
            "receipt_status": self._state_payload("receipt_status", self.receipt_status),
            "is_over_threshold": is_high_value,
            "payment_reference": self.payment_reference,
            "payment_date": self.paid_date.isoformat() if self.paid_date else None,
            "date_quotation_submitted": self.date_quotation_submitted,
            "date_director_decision": self.date_director_decision or self.ceo_decision_date,
            "date_order_issued": self.ceo_decision_date,
            "date_contract_signed": self.contract_draft_uploaded_date,
            "date_paid": self.date_paid,
            "date_received": self.date_received,
            "current_responsible": _relation_payload(self._api_current_responsible()),
            "current_stage_age_days": self._api_stage_age_days(),
            "delay_days": delay_days,
            "is_delayed": delay_days > 0,
            "paid": paid,
            "received": received,
            "purchase_order_id": self.purchase_order_id.id or None,
            "vendor_bill_id": self.vendor_bill_id.id or None,
            "stock_receipt_required": self.request_type != "service",
            "service_confirmation_only": self.request_type == "service",
            "available_actions": self._api_available_actions(),
        }

    def _api_detail_payload(self):
        self.ensure_one()
        payload = self._api_summary_payload()
        packaged_line_ids = set(self.package_ids.mapped("line_ids").ids)
        payload.update(
            {
                "lines": [line._api_payload(index + 1) for index, line in enumerate(self.line_ids)],
                "quotations": [quote._api_payload() for quote in self.quote_line_ids],
                "packages": [package._api_payload(index + 1) for index, package in enumerate(self.package_ids)],
                "unassigned_lines": [
                    line._api_payload(index + 1)
                    for index, line in enumerate(self.line_ids.filtered(lambda item: item.id not in packaged_line_ids))
                ],
                "documents": [document._api_payload() for document in self.document_ids],
                "audit": [audit._api_payload() for audit in self.audit_ids.sorted("changed_at", reverse=True)],
                "attachments": [self._api_attachment_payload(attachment) for attachment in self.quote_attachment_ids],
                "paid_amount": self.paid_amount,
                "payment_note": self.payment_note,
                "legal_state": self._state_payload("legal_state", self.legal_state),
            }
        )
        return payload

    def _sync_package_quote_selection(self):
        for request in self:
            request.quote_line_ids.write({"is_selected": False})
            for package in request.package_ids:
                package._select_lowest_quote()
            request.amount_total = sum(request.package_ids.mapped("amount_total"))

    def _api_attachment_payload(self, attachment):
        return {"id": attachment.id, "name": attachment.name, "mimetype": attachment.mimetype or ""}

    def _api_current_responsible(self):
        self.ensure_one()
        if self.state in ("submitted", "quote", "quote_collection", "payment_recorded", "receiving"):
            return self.purchase_manager_id or self._default_role_user("purchase_manager")
        if self.state in ("finance_review", "payment_pending"):
            return self.finance_user_id or self._default_role_user("finance_user")
        if self.state in ("admin_review", "ceo_decision", "order_draft_uploaded"):
            return self.administration_user_id or self._default_role_user("administration_user")
        if self.state in ("legal_contract_draft", "contract_draft_started", "order_draft_started", "ceo_order_uploaded", "legal_final_contract"):
            return self.legal_user_id or self._default_role_user("legal_user")
        return False

    def _api_stage_age_days(self):
        self.ensure_one()
        basis = self.write_date or self.create_date
        if not basis:
            return 0
        return max((fields.Datetime.now() - basis).days, 0)

    @api.model
    def _api_domain_for_filters(self, filters):
        domain = []
        scope = filters.get("scope")
        search = filters.get("search")
        state = filters.get("state")
        relation = filters.get("relation")
        flow = filters.get("flow_type") or filters.get("flow")
        def filter_int(key):
            try:
                return int(filters.get(key) or 0)
            except (TypeError, ValueError):
                return 0

        project_id = filter_int("project_id")
        task_id = filter_int("task_id")
        vehicle_id = filter_int("vehicle_id")
        department_id = filter_int("department_id")
        user = self.env.user
        flags = self._api_current_user_payload(user)["flags"]
        if scope == "mine":
            if flags["admin"] or flags["director"] or flags["general_manager"]:
                pass
            else:
                domain += ["|", ("requested_by", "=", user.id), ("department_id.manager_id.user_id", "=", user.id)]
        elif scope == "assigned":
            assigned_domain = [
                "|",
                "|",
                "|",
                ("purchase_manager_id", "=", user.id),
                ("finance_user_id", "=", user.id),
                ("administration_user_id", "=", user.id),
                ("legal_user_id", "=", user.id),
            ]
            has_procurement_storekeeper = user.has_group(GROUPS["storekeeper"]) or user.has_group(GROUPS["purchase_manager"])
            has_repair_storekeeper = user.has_group(GROUPS["repair_storekeeper"])
            if flags["storekeeper"]:
                storekeeper_stage_domain = [
                    "|",
                    ("state", "in", ["draft", "submitted", "quote", "quote_collection"]),
                    "&",
                    ("payment_status", "=", "payment_recorded"),
                    ("receipt_status", "!=", "received"),
                ]
                unassigned_storekeeper_stage_domain = [
                    "&",
                    ("purchase_manager_id", "=", False),
                ] + storekeeper_stage_domain
                if has_repair_storekeeper and not has_procurement_storekeeper:
                    storekeeper_type_domain = ["|", ("vehicle_id", "!=", False), ("request_type", "=", "repair_part")]
                    typed_storekeeper_stage_domain = ["&"] + storekeeper_stage_domain + storekeeper_type_domain
                    domain += ["|", "|"] + assigned_domain + typed_storekeeper_stage_domain + unassigned_storekeeper_stage_domain
                elif has_procurement_storekeeper and not has_repair_storekeeper:
                    storekeeper_type_domain = ["&", ("vehicle_id", "=", False), ("request_type", "!=", "repair_part")]
                    typed_storekeeper_stage_domain = ["&"] + storekeeper_stage_domain + storekeeper_type_domain
                    domain += ["|", "|"] + assigned_domain + typed_storekeeper_stage_domain + unassigned_storekeeper_stage_domain
                else:
                    domain += ["|"] + assigned_domain + storekeeper_stage_domain
            elif flags["office_clerk"]:
                office_clerk_stage_domain = [
                    "|",
                    ("state", "in", ["order_draft_uploaded"]),
                    "&",
                    ("package_ids.route_state", "in", ["order_draft_uploaded", "order_approval"]),
                    ("package_ids.amount_total", ">", AMOUNT_THRESHOLD),
                ]
                domain += ["|"] + assigned_domain + office_clerk_stage_domain
            elif flags["finance"]:
                package_finance_stage_domain = [
                    "&",
                    ("package_ids.route_state", "in", ["finance_review", "payment_pending"]),
                    ("package_ids.payment_status", "!=", "payment_recorded"),
                ]
                request_finance_stage_domain = [
                    "&",
                    ("package_ids", "=", False),
                    ("state", "in", ["finance_review", "payment_pending"]),
                ]
                finance_stage_domain = ["|"] + package_finance_stage_domain + request_finance_stage_domain
                domain += ["|"] + assigned_domain + finance_stage_domain
            elif flags["contract_officer"]:
                legal_stage_domain = [
                    "|",
                    ("state", "in", ["legal_contract_draft", "contract_draft_started", "order_draft_started", "ceo_order_uploaded", "legal_final_contract"]),
                    ("package_ids.route_state", "in", ["legal_contract_draft", "contract_draft_started", "order_draft_started", "ceo_order_uploaded", "legal_final_contract"]),
                ]
                domain += ["|"] + assigned_domain + legal_stage_domain
            else:
                domain += assigned_domain
        if state:
            state_groups = {
                "quotation_waiting": ["submitted", "quote", "quote_collection"],
                "quotations_ready": ["finance_review", "legal_contract_draft", "contract_draft_started", "order_draft_started", "order_draft_uploaded", "ceo_decision", "ceo_order_uploaded"],
                "decision_waiting": ["ceo_decision", "order_draft_uploaded"],
                "contract_waiting": ["legal_contract_draft", "contract_draft_started", "order_draft_started", "ceo_order_uploaded", "legal_final_contract"],
                "order_waiting": ["order_draft_started", "order_draft_uploaded", "ceo_decision"],
                "payment_waiting": ["payment_pending"],
                "receiving_waiting": ["payment_recorded", "receiving", "received"],
            }
            if state in state_groups:
                domain.append(("state", "in", state_groups[state]))
            elif state == "finance_review" and flags["office_clerk"]:
                domain.append(("state", "in", ["ceo_decision"]))
            elif scope == "assigned" and flags["storekeeper"] and state in ("submitted", "quote", "quote_collection"):
                domain.append(("state", "in", ["draft", "submitted", "quote", "quote_collection"]))
            else:
                domain.append(("state", "=", state))
        if relation == "vehicle":
            domain += ["|", ("vehicle_id", "!=", False), ("request_type", "=", "repair_part")]
        elif relation == "project":
            domain += ["&", ("vehicle_id", "=", False), ("request_type", "!=", "repair_part")]
        if flow:
            domain.append(("flow_type", "=", flow))
        if project_id:
            domain.append(("related_project_id", "=", project_id))
        if task_id:
            domain.append(("related_task_id", "=", task_id))
        if vehicle_id:
            domain.append(("vehicle_id", "=", vehicle_id))
        if department_id:
            domain.append(("department_id", "=", department_id))
        if search:
            domain += [
                "|",
                "|",
                "|",
                ("name", "ilike", search),
                ("title", "ilike", search),
                ("quote_line_ids.supplier_id.name", "ilike", search),
                ("line_ids.description", "ilike", search),
            ]
        return domain

    @api.model
    def _api_list_payload(self, filters):
        limit = int(filters.get("limit") or 20)
        page = max(int(filters.get("page") or 1), 1)
        domain = self._api_domain_for_filters(filters)
        total = self.search_count(domain)
        records = self.search(domain, limit=limit, offset=(page - 1) * limit, order="create_date desc, id desc")
        return {
            "ok": True,
            "items": [record._api_summary_payload() for record in records],
            "pagination": {"page": page, "limit": limit, "total": total, "pages": max((total + limit - 1) // limit, 1)},
        }

    @api.model
    def _api_dashboard_payload(self, filters):
        domain = self._api_domain_for_filters(filters)
        records = self.search(domain, order="create_date desc, id desc")
        total = len(records)
        payment_pending = len(records.filtered(lambda r: r.payment_status != "payment_recorded" and r.state not in ("done", "cancelled")))
        receipt_pending = len(records.filtered(lambda r: r.payment_status == "payment_recorded" and r.receipt_status == "not_received"))
        delayed = len(records.filtered(lambda r: r._api_summary_payload()["is_delayed"]))
        done_records = records.filtered(lambda r: r.state == "done" and r.create_date and r.write_date)
        avg_days = 0
        if done_records:
            avg_days = round(sum((r.write_date - r.create_date).days for r in done_records) / len(done_records), 1)
        return {
            "ok": True,
            "metrics": {
                "total": total,
                "low_flow": len(records.filtered(lambda r: r.flow_type == "low")),
                "high_flow": len(records.filtered(lambda r: r.flow_type == "high")),
                "payment_pending": payment_pending,
                "receipt_pending": receipt_pending,
                "delayed": delayed,
                "average_resolution_days": avg_days,
                "generated_on": fields.Datetime.now(),
            },
            "storekeeper_load": self._api_group_counts(records, "purchase_manager_id"),
            "department_counts": self._api_group_counts(records, "department_id"),
            "project_progress": self._api_group_counts(records, "related_project_id"),
            "supplier_counts": self._api_supplier_counts(records),
            "items": [record._api_summary_payload() for record in records],
        }

    @api.model
    def _api_group_counts(self, records, field_name):
        counts = {}
        for record in records:
            related = record[field_name]
            if related:
                related_sudo = related.sudo()
                counts.setdefault(related_sudo.id, {"id": related_sudo.id, "name": related_sudo.display_name, "count": 0})
                counts[related.id]["count"] += 1
        return sorted(counts.values(), key=lambda item: item["count"], reverse=True)[:10]

    @api.model
    def _api_supplier_counts(self, records):
        counts = {}
        for record in records:
            supplier = record.selected_supplier_id
            if supplier:
                supplier_sudo = supplier.sudo()
                counts.setdefault(supplier_sudo.id, {"id": supplier_sudo.id, "name": supplier_sudo.display_name, "count": 0})
                counts[supplier.id]["count"] += 1
        return sorted(counts.values(), key=lambda item: item["count"], reverse=True)[:10]

    @api.model
    def _api_meta_payload(self):
        Project = self.env["project.project"].sudo()
        Task = self.env["project.task"].sudo()
        Department = self.env["hr.department"].sudo()
        Vehicle = self.env["fleet.vehicle"].sudo()
        Partner = self.env["res.partner"].sudo()
        Uom = self.env["uom.uom"].sudo()
        Users = self.env["res.users"].sudo()
        storekeeper_group_ids = []
        for group_key in ("purchase_manager", "storekeeper", "repair_storekeeper"):
            group = self.env.ref(GROUPS[group_key], raise_if_not_found=False)
            if group:
                storekeeper_group_ids.append(group.id)
        user_group_field_name = "groups_id" if "groups_id" in Users._fields else "group_ids" if "group_ids" in Users._fields else ""
        storekeeper_domain = (
            [(user_group_field_name, "in", storekeeper_group_ids)]
            if storekeeper_group_ids and user_group_field_name
            else []
        )
        tasks = Task.search([], limit=200, order="write_date desc")
        return {
            "ok": True,
            "projects": [_relation_payload(project) for project in Project.search([], limit=100, order="name")],
            "tasks": [
                {"id": task.id, "name": task.display_name, "project_id": task.project_id.id or 0}
                for task in tasks
            ],
            "vehicles": [_relation_payload(vehicle) for vehicle in Vehicle.search([], limit=200, order="license_plate, name")],
            "departments": [_relation_payload(dept) for dept in Department.search([], limit=100, order="name")],
            "storekeepers": [_relation_payload(user) for user in Users.search(storekeeper_domain, limit=100, order="name")],
            "suppliers": [self._api_supplier_payload(partner) for partner in Partner.search([("supplier_rank", ">", 0)], limit=200, order="name")],
            "uoms": [_relation_payload(uom) for uom in Uom.search([], limit=100, order="name")],
        }

    @api.model
    def _api_create_request(self, payload):
        self._ensure_role(["department_head", "admin"], "Only department head can create procurement requests.")
        line_payloads = payload.get("lines") or []
        if not line_payloads:
            raise UserError("At least one purchase item is required.")
        def payload_int(key):
            try:
                return int(payload.get(key) or 0) or False
            except (TypeError, ValueError):
                return False

        vals = {
            "title": payload.get("title"),
            "description": payload.get("description"),
            "request_type": payload.get("procurement_type") or "material",
            "urgency": payload.get("urgency") or "medium",
            "priority": payload.get("urgency") or "medium",
            "required_date": payload.get("required_date") or False,
            "related_project_id": payload_int("project_id"),
            "related_task_id": payload_int("task_id"),
            "vehicle_id": payload_int("vehicle_id"),
            "department_id": payload_int("department_id"),
            "purchase_manager_id": payload_int("responsible_storekeeper_user_id"),
            "line_ids": [],
        }
        if vals["request_type"] == "goods":
            vals["request_type"] = "material"
        if vals["vehicle_id"] and vals["request_type"] == "material":
            vals["request_type"] = "repair_part"
        self._normalize_storekeeper_assignment(vals)
        if vals["related_task_id"] and not vals["related_project_id"]:
            task = self.env["project.task"].sudo().browse(vals["related_task_id"]).exists()
            vals["related_project_id"] = task.project_id.id or False
        if vals["related_project_id"] and not vals["department_id"]:
            project = self.env["project.project"].sudo().browse(vals["related_project_id"]).exists()
            if project and "ops_department_id" in project._fields:
                vals["department_id"] = project.ops_department_id.id or False
        if not vals["department_id"]:
            employee = self.env["hr.employee"].sudo().search([("user_id", "=", self.env.user.id)], limit=1)
            vals["department_id"] = employee.department_id.id or False
        self._ensure_department_head_can_create_for_department(vals["department_id"])
        for line in line_payloads:
            vals["line_ids"].append(
                (
                    0,
                    0,
                    {
                        "description": line.get("product_name") or line.get("name"),
                        "specification_text": line.get("specification"),
                        "requested_quantity": float(line.get("quantity") or 0),
                        "uom_id": int(line.get("uom_id") or 0) or False,
                        "unit_of_measure": line.get("unit_of_measure") or False,
                        "estimated_unit_cost": float(line.get("approx_unit_price") or 0),
                    },
                )
            )
        request = self.create(vals)
        if len(request.line_ids) == 1 and not request.package_ids:
            package = self.env["municipal.procurement.package"].sudo().create(
                {
                    "request_id": request.id,
                    "name": request.line_ids[0].description or request.name or "Нэг багц",
                    "note": "Нэг бараатай хүсэлтээс автоматаар үүссэн багц",
                }
            )
            request.line_ids.write({"package_id": package.id})
        return request

    def _api_submit_quotations(self, payload):
        self._ensure_role(["purchase_manager", "storekeeper", "admin"], "Only purchase manager can save supplier quotes.")
        package_id = int(payload.get("package_id") or 0)
        if package_id:
            package = self.env["municipal.procurement.package"].browse(package_id).exists()
            if not package or package.request_id not in self:
                raise UserError("A valid package is required.")
            package._api_submit_quotations(payload)
            for request in self:
                request._sync_package_quote_selection()
                if request.state in ("draft", "submitted", "quote"):
                    request._change_state("quote_collection", "submit_for_quotation")
                unassigned_lines = request.line_ids.filtered(lambda line: not line.package_id)
                incomplete_packages = request.package_ids.filtered(lambda package: not package.is_complete)
                if request.package_ids and not unassigned_lines and not incomplete_packages:
                    request.action_finance_review()
            return True

        quotations = payload.get("quotations") or []
        if len(quotations) < 1:
            raise UserError("Supplier invoice is required.")
        for request in self:
            request.quote_line_ids.unlink()
            for index, quote_payload in enumerate(quotations, start=1):
                supplier_id = int(quote_payload.get("supplier_id") or 0)
                if not supplier_id:
                    raise UserError("Supplier is required for the invoice.")
                amount_total = float(quote_payload.get("amount_total") or 0)
                if amount_total <= 0:
                    raise UserError("Нэхэмжлэхийн дүн 0-ээс их байх ёстой.")
                attachment_ids = quote_payload.get("attachment_ids") or []
                if not attachment_ids:
                    raise UserError("Invoice attachment is required.")
                self.env["municipal.procurement.quote"].create(
                    {
                        "procurement_id": request.id,
                        "sequence": index,
                        "supplier_id": supplier_id,
                        "amount_total": amount_total,
                        "is_selected": bool(quote_payload.get("is_selected")),
                        "attachment_ids": [(6, 0, attachment_ids)],
                    }
                )
            request._ensure_three_quotes()
            request._ensure_selected_quote()
            request._ensure_quote_evidence()
            request.write({"date_quotation_submitted": fields.Datetime.now(), "amount_total": request.selected_supplier_total})
            request._change_state("quote_collection", "submit_quotations")
            request.action_finance_review()
        return True

    def _api_save_package(self, payload):
        self.ensure_one()
        self._api_check_write()
        self._ensure_role(["purchase_manager", "storekeeper", "admin"], "Only purchase manager can save packages.")
        name = (payload.get("name") or "").strip()
        if not name:
            raise UserError("Package name is required.")
        line_ids = [int(line_id) for line_id in (payload.get("line_ids") or []) if int(line_id or 0)]
        if not line_ids:
            raise UserError("Select at least one item for the package.")
        lines = self.line_ids.filtered(lambda line: line.id in line_ids)
        if len(lines) != len(set(line_ids)):
            raise UserError("Selected package items must belong to this request.")
        package_id = int(payload.get("package_id") or 0)
        package = self.env["municipal.procurement.package"].browse(package_id).exists() if package_id else False
        if package and package.request_id != self:
            raise UserError("A valid package is required.")
        vals = {
            "request_id": self.id,
            "name": name,
            "note": payload.get("note") or False,
        }
        package = package or self.env["municipal.procurement.package"].create(vals)
        if package and package.id:
            package.write(vals)
        package.line_ids.filtered(lambda line: line.id not in line_ids).write({"package_id": False})
        lines.write({"package_id": package.id})
        if self.state in ("draft", "submitted", "quote"):
            self._change_state("quote_collection", "submit_for_quotation")
        return package

    def _api_delete_package(self, payload):
        self.ensure_one()
        self._api_check_write()
        self._ensure_role(["purchase_manager", "storekeeper", "admin"], "Only purchase manager can delete packages.")
        package_id = int(payload.get("package_id") or 0)
        package = self.package_ids.filtered(lambda item: item.id == package_id)[:1]
        if not package:
            raise UserError("A valid package is required.")
        package.line_ids.write({"package_id": False})
        package.unlink()
        self._sync_package_quote_selection()
        return True

    @api.model
    def _api_supplier_payload(self, partner):
        phone = partner.phone or ""
        if not phone and "mobile" in partner._fields:
            phone = partner.mobile or ""
        return {
            "id": partner.id,
            "name": partner.sudo().display_name,
            "vat": partner.vat or "",
            "phone": phone,
            "email": partner.email or "",
            "street": partner.street or "",
            "active": bool(partner.active),
        }

    @api.model
    def _api_list_suppliers(self, filters=None):
        self._ensure_role(["purchase_manager", "storekeeper", "admin"], "Only purchase manager can view suppliers.")
        filters = filters or {}
        domain = [("supplier_rank", ">", 0)]
        search = filters.get("search")
        if search:
            domain += [
                "|",
                "|",
                "|",
                ("name", "ilike", search),
                ("vat", "ilike", search),
                ("phone", "ilike", search),
                ("email", "ilike", search),
            ]
        partners = self.env["res.partner"].sudo().search(domain, limit=300, order="name")
        return {"ok": True, "suppliers": [self._api_supplier_payload(partner) for partner in partners]}

    @api.model
    def _api_create_supplier(self, payload):
        self._ensure_role(["purchase_manager", "storekeeper", "admin"], "Only purchase manager can create suppliers.")
        name = (payload.get("name") or "").strip()
        if not name:
            raise UserError("Supplier name is required.")
        partner = self.env["res.partner"].sudo().create(
            {
                "name": name,
                "company_type": "company",
                "supplier_rank": 1,
                "vat": payload.get("vat") or False,
                "phone": payload.get("phone") or False,
                "email": payload.get("email") or False,
                "street": payload.get("street") or False,
            }
        )
        return self._api_supplier_payload(partner)

    @api.model
    def _api_update_supplier(self, supplier_id, payload):
        self._ensure_role(["purchase_manager", "storekeeper", "admin"], "Only purchase manager can update suppliers.")
        partner = self.env["res.partner"].sudo().browse(int(supplier_id or 0)).exists()
        if not partner or partner.supplier_rank <= 0:
            raise UserError("A valid supplier is required.")
        name = (payload.get("name") or "").strip()
        if not name:
            raise UserError("Supplier name is required.")
        partner.write(
            {
                "name": name,
                "vat": payload.get("vat") or False,
                "phone": payload.get("phone") or False,
                "email": payload.get("email") or False,
                "street": payload.get("street") or False,
                "supplier_rank": max(partner.supplier_rank, 1),
            }
        )
        return self._api_supplier_payload(partner)

    @api.model
    def _api_delete_supplier(self, supplier_id):
        self._ensure_role(["purchase_manager", "storekeeper", "admin"], "Only purchase manager can delete suppliers.")
        partner = self.env["res.partner"].sudo().browse(int(supplier_id or 0)).exists()
        if not partner or partner.supplier_rank <= 0:
            raise UserError("A valid supplier is required.")
        partner.write({"active": False})
        return self._api_supplier_payload(partner)

    def _api_run_action(self, action, payload):
        self._api_check_write()
        if action == "save_package":
            return self._api_save_package(payload)
        if action == "delete_package":
            return self._api_delete_package(payload)
        if action == "submit":
            return self.action_submit()
        if action == "move_to_finance_review":
            return self.action_finance_review()
        if action == "start_contract_draft":
            return self.action_start_contract_draft(payload.get("package_id"), payload.get("note"))
        if action == "start_order_draft":
            return self.action_start_order_draft(payload.get("package_id"), payload.get("note"))
        if action == "upload_order_draft":
            return self.action_upload_order_draft(payload.get("note"), payload.get("package_id"))
        if action == "prepare_order":
            return self.action_prepare_order()
        if action == "record_package_ceo_order":
            return self.action_record_package_ceo_order(
                payload.get("package_id"),
                payload.get("selected_quotation_id"),
                order_number=payload.get("order_number"),
                order_date=payload.get("order_date"),
                note=payload.get("note"),
                attachment_ids=payload.get("attachment_ids") or [],
            )
        if action == "director_decision":
            return self.action_record_ceo_decision(payload.get("selected_quotation_id"), payload.get("note"))
        if action == "attach_final_order":
            return self.action_upload_ceo_order(payload.get("note"))
        if action == "mark_contract_signed":
            if not self.package_ids and self.contract_draft_attachment_ids and self.final_contract_attachment_ids:
                return self.action_upload_final_contract(payload.get("note"))
            return self.action_upload_contract_draft(payload.get("note"), payload.get("package_id"))
        if action == "mark_paid":
            vals = {
                "paid_amount": float(payload.get("paid_amount") or payload.get("amount") or 0),
                "payment_reference": payload.get("payment_reference"),
                "payment_note": payload.get("note"),
                "paid_date": payload.get("payment_date") or fields.Date.context_today(self),
            }
            package_id = payload.get("package_id")
            if payload.get("selected_quotation_id"):
                quote = self.env["municipal.procurement.quote"].browse(int(payload["selected_quotation_id"]))
                if package_id:
                    package = self.package_ids.filtered(lambda item: item.id == int(package_id or 0))[:1]
                    if quote.exists() and package and quote.package_id == package:
                        package.quotation_ids.write({"is_selected": False})
                        quote.is_selected = True
                elif quote.exists() and quote.procurement_id == self:
                    self.quote_line_ids.write({"is_selected": False})
                    quote.is_selected = True
            self.write(vals)
            return self.action_mark_paid(package_id)
        if action == "mark_received":
            self.write(
                {
                    "received_note": payload.get("note") or "Хүлээлгэн өгсөн төлөв баталгаажуулав.",
                    "is_service_finalized": self.request_type == "service",
                }
            )
            return self.action_receive(payload.get("package_id"))
        if action == "mark_done":
            return self.action_done()
        if action == "cancel":
            return self.action_cancel()
        raise UserError("Unknown procurement action.")

    def _api_upload_attachment(self, payload):
        self._api_check_write()
        data = payload.get("data")
        if not data:
            raise UserError("Attachment data is missing.")
        name = payload.get("name") or "attachment"
        attachment = self.env["ir.attachment"].create(
            {
                "name": name,
                "datas": data,
                "mimetype": payload.get("mimetype") or "application/octet-stream",
                "res_model": "municipal.procurement.request",
                "res_id": self.id,
            }
        )
        target = payload.get("target")
        document_type = payload.get("document_type") or "other"
        note = payload.get("note")
        if document_type == "order_draft":
            allowed_mimetypes = {
                "application/pdf",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "application/msword",
            }
            extension = (name or "").rsplit(".", 1)[-1].casefold() if "." in (name or "") else ""
            if attachment.mimetype not in allowed_mimetypes and extension not in {"pdf", "docx", "doc"}:
                raise UserError("Тушаалын төсөл docx эсвэл pdf файл байх ёстой.")
            package = self.package_ids.filtered(lambda item: item.id == int(payload.get("package_id") or 0))[:1]
            if package:
                attachment.write({"res_model": "municipal.procurement.package", "res_id": package.id})
                package.order_draft_attachment_ids = [(4, attachment.id)]
            self.order_draft_attachment_ids = [(4, attachment.id)]
        elif document_type == "director_order_final":
            package = self.package_ids.filtered(lambda item: item.id == int(payload.get("package_id") or 0))[:1]
            if package:
                attachment.write({"res_model": "municipal.procurement.package", "res_id": package.id})
                package.ceo_order_attachment_ids = [(4, attachment.id)]
            self.ceo_order_attachment_ids = [(4, attachment.id)]
        elif target == "line":
            line = self.line_ids.filtered(lambda item: item.id == int(payload.get("line_id") or 0))[:1]
            if not line:
                raise UserError("A valid purchase item line is required for product image upload.")
            attachment.write({"res_model": "municipal.procurement.line", "res_id": line.id})
            line.image_ids = [(4, attachment.id)]
        elif document_type == "contract_final":
            self.final_contract_attachment_ids = [(4, attachment.id)]
        elif document_type == "payment_proof":
            self.payment_attachment_ids = [(4, attachment.id)]
        elif document_type == "receipt_proof":
            self.receipt_attachment_ids = [(4, attachment.id)]
        elif target == "quotation":
            self.quote_attachment_ids = [(4, attachment.id)]
        else:
            self.quote_attachment_ids = [(4, attachment.id)]
        self.env["municipal.procurement.document"].create(
            {
                "request_id": self.id,
                "document_type": document_type,
                "note": note,
                "attachment_ids": [(6, 0, [attachment.id])],
                "is_required": document_type in ("order_draft", "director_order_final", "contract_final", "payment_proof", "receipt_proof"),
            }
        )
        return self._api_attachment_payload(attachment)


class MunicipalProcurementPackage(models.Model):
    _name = "municipal.procurement.package"
    _description = "Municipal Procurement Package"
    _order = "request_id, sequence, id"
    _inherit = ["mail.thread"]

    request_id = fields.Many2one(
        "municipal.procurement.request",
        string="Request",
        required=True,
        ondelete="cascade",
        index=True,
    )
    sequence = fields.Integer(default=10)
    name = fields.Char(required=True, tracking=True)
    note = fields.Text()
    line_ids = fields.One2many("municipal.procurement.line", "package_id", string="Items")
    quotation_ids = fields.One2many("municipal.procurement.quote", "package_id", string="Supplier quotes")
    quote_count = fields.Integer(compute="_compute_package_totals", store=True)
    total_quantity = fields.Float(compute="_compute_package_totals", store=True)
    amount_total = fields.Float(compute="_compute_package_totals", store=True)
    lowest_quote_id = fields.Many2one(
        "municipal.procurement.quote",
        string="Lowest quote",
        compute="_compute_package_totals",
        store=True,
    )
    ceo_selected_quote_id = fields.Many2one("municipal.procurement.quote", string="CEO selected quote")
    ceo_decision_note = fields.Text(string="CEO decision note")
    ceo_order_number = fields.Char(string="CEO order number")
    ceo_order_date = fields.Date(string="CEO order date")
    ceo_order_note = fields.Text(string="CEO order note")
    ceo_order_attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_procurement_package_ceo_order_attachment_rel",
        "package_id",
        "attachment_id",
        string="CEO order attachments",
    )
    order_draft_attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_procurement_package_order_draft_attachment_rel",
        "package_id",
        "attachment_id",
        string="Order draft attachments",
    )
    ceo_decision_recorded_by = fields.Many2one("res.users", string="CEO decision recorded by", readonly=True)
    ceo_decision_date = fields.Datetime(string="CEO decision date", readonly=True)
    route_state = fields.Selection(PACKAGE_ROUTE_STATES, string="Package route state", default="draft", tracking=True, index=True)
    payment_status = fields.Selection(
        [("not_paid", "Not paid"), ("payment_recorded", "Payment recorded"), ("cancelled", "Cancelled")],
        string="Package payment status",
        default="not_paid",
        tracking=True,
    )
    receipt_status = fields.Selection(
        [("not_received", "Not received"), ("received", "Received")],
        string="Package receipt status",
        default="not_received",
        tracking=True,
    )
    paid_amount = fields.Float(string="Package paid amount")
    paid_date = fields.Date(string="Package paid date")
    payment_reference = fields.Char(string="Package payment reference")
    payment_note = fields.Text(string="Package payment note")
    paid_by = fields.Many2one("res.users", string="Package paid by", readonly=True)
    date_paid = fields.Datetime(string="Package payment datetime", readonly=True)
    received_note = fields.Text(string="Package received note")
    received_date = fields.Date(string="Package received date")
    received_by = fields.Many2one("res.users", string="Package received by", readonly=True)
    date_received = fields.Datetime(string="Package received datetime", readonly=True)
    is_complete = fields.Boolean(compute="_compute_package_totals", store=True)
    company_id = fields.Many2one(
        "res.company",
        related="request_id.company_id",
        store=True,
        readonly=True,
    )
    department_id = fields.Many2one(
        "hr.department",
        related="request_id.department_id",
        store=True,
        readonly=True,
        index=True,
    )

    @api.depends(
        "line_ids.requested_quantity",
        "quotation_ids.supplier_id",
        "quotation_ids.amount_total",
        "quotation_ids.attachment_ids",
    )
    def _compute_package_totals(self):
        for package in self:
            valid_quotes = package.quotation_ids.filtered(lambda quote: quote.supplier_id)
            lowest = valid_quotes.sorted(lambda quote: (quote.amount_total, quote.id))[:1]
            package.quote_count = len(valid_quotes)
            package.total_quantity = sum(package.line_ids.mapped("requested_quantity"))
            package.lowest_quote_id = lowest.id if lowest else False
            package.amount_total = lowest.amount_total if lowest else 0
            package.is_complete = (
                bool(package.line_ids)
                and bool(valid_quotes)
                and not valid_quotes.filtered(lambda quote: not quote.attachment_ids)
            )

    def _ensure_three_quotes(self):
        for package in self:
            valid_quotes = package.quotation_ids.filtered(lambda quote: quote.supplier_id)
            if len(valid_quotes) < 1:
                raise UserError("Every package must have a supplier invoice.")

    def _ensure_quote_evidence(self):
        for package in self:
            missing = package.quotation_ids.filtered(lambda quote: quote.supplier_id and not quote.attachment_ids)
            if missing:
                raise UserError("Every supplier invoice must include an attachment.")

    def _select_lowest_quote(self):
        for package in self:
            package.quotation_ids.write({"is_selected": False})
            if package.lowest_quote_id:
                package.lowest_quote_id.is_selected = True

    def _ceo_order_ready(self):
        self.ensure_one()
        return bool(
            self.ceo_selected_quote_id
            and self.ceo_order_date
            and self.ceo_order_attachment_ids
        )

    def _api_submit_quotations(self, payload):
        self.ensure_one()
        quotations = payload.get("quotations") or []
        if len(quotations) < 1:
            raise UserError("Supplier invoice is required.")
        self.quotation_ids.unlink()
        for index, quote_payload in enumerate(quotations, start=1):
            supplier_id = int(quote_payload.get("supplier_id") or 0)
            if not supplier_id:
                raise UserError("Supplier is required for the invoice.")
            amount_total = float(quote_payload.get("amount_total") or 0)
            if amount_total <= 0:
                raise UserError("Нэхэмжлэхийн дүн 0-ээс их байх ёстой.")
            attachment_ids = quote_payload.get("attachment_ids") or []
            if not attachment_ids:
                raise UserError("Invoice attachment is required.")
            self.env["municipal.procurement.quote"].create(
                {
                    "procurement_id": self.request_id.id,
                    "package_id": self.id,
                    "sequence": index,
                    "supplier_id": supplier_id,
                    "amount_total": amount_total,
                    "is_selected": index == 1,
                    "attachment_ids": [(6, 0, attachment_ids)],
                }
            )
        self._ensure_three_quotes()
        self._ensure_quote_evidence()
        self._select_lowest_quote()
        self.request_id.write(
            {
                "date_quotation_submitted": fields.Datetime.now(),
                "amount_total": sum(self.request_id.package_ids.mapped("amount_total")),
            }
        )
        self.request_id._record_audit("submit_quotations", self.request_id.state, self.request_id.state, self.name)
        return True

    def _api_payload(self, sequence):
        self.ensure_one()
        return {
            "id": self.id,
            "sequence": sequence,
            "name": self.name,
            "note": self.note,
            "lines": [line._api_payload(index + 1) for index, line in enumerate(self.line_ids)],
            "quotations": [quote._api_payload() for quote in self.quotation_ids],
            "quote_count": self.quote_count,
            "total_quantity": self.total_quantity,
            "amount_total": self.amount_total,
            "lowest_quotation": self.lowest_quote_id._api_payload() if self.lowest_quote_id else None,
            "is_complete": self.is_complete,
            "is_over_threshold": _is_high_value_amount(self.request_id._package_threshold_amount(self)),
            "route_state": _code_label(self.request_id._effective_package_route_state(self), self._fields["route_state"].selection),
            "payment_status": _code_label(self.payment_status, self._fields["payment_status"].selection),
            "receipt_status": _code_label(self.receipt_status, self._fields["receipt_status"].selection),
            "paid_amount": self.paid_amount,
            "payment_reference": self.payment_reference,
            "payment_note": self.payment_note,
            "payment_date": self.paid_date.isoformat() if self.paid_date else None,
            "paid_by": _relation_payload(self.paid_by),
            "date_paid": self.date_paid,
            "received_note": self.received_note,
            "received_date": self.received_date.isoformat() if self.received_date else None,
            "received_by": _relation_payload(self.received_by),
            "date_received": self.date_received,
            "ceo_selected_quotation_id": self.ceo_selected_quote_id.id or None,
            "ceo_selected_quotation": self.ceo_selected_quote_id._api_payload() if self.ceo_selected_quote_id else None,
            "ceo_decision_note": self.ceo_decision_note,
            "ceo_order_number": self.ceo_order_number,
            "ceo_order_date": self.ceo_order_date.isoformat() if self.ceo_order_date else None,
            "ceo_order_note": self.ceo_order_note,
            "order_draft_attachments": [self.request_id._api_attachment_payload(attachment) for attachment in self.order_draft_attachment_ids],
            "ceo_order_attachments": [self.request_id._api_attachment_payload(attachment) for attachment in self.ceo_order_attachment_ids],
            "ceo_decision_recorded_by": _relation_payload(self.ceo_decision_recorded_by),
            "ceo_decision_date": self.ceo_decision_date,
            "ceo_order_ready": self._ceo_order_ready(),
        }


class MunicipalProcurementLine(models.Model):
    _inherit = "municipal.procurement.line"

    package_id = fields.Many2one("municipal.procurement.package", string="Package", ondelete="set null", index=True)
    name = fields.Char(string="Item name")
    specification_text = fields.Text(string="Specification")
    uom_id = fields.Many2one("uom.uom", string="Unit of measure")
    image_ids = fields.Many2many(
        "ir.attachment",
        "municipal_procurement_line_image_rel",
        "line_id",
        "attachment_id",
        string="Product images",
    )
    suggested_supplier_id = fields.Many2one("res.partner", string="Suggested supplier")
    note = fields.Text(string="Note")

    @api.onchange("uom_id")
    def _onchange_uom_id(self):
        for line in self:
            if line.uom_id:
                line.unit_of_measure = line.uom_id.display_name

    def _api_payload(self, sequence):
        self.ensure_one()
        return {
            "id": self.id,
            "sequence": sequence,
            "product_id": self.product_id.id or None,
            "package_id": self.package_id.id or None,
            "product_name": self.name or self.product_id.sudo().display_name or self.description,
            "specification": self.specification_text,
            "quantity": self.requested_quantity,
            "uom": _relation_payload(self.uom_id) or ({"id": 0, "name": self.unit_of_measure} if self.unit_of_measure else None),
            "approx_unit_price": self.estimated_unit_cost,
            "approx_subtotal": self.subtotal,
            "final_unit_price": self.estimated_unit_cost,
            "final_subtotal": self.subtotal,
            "remark": self.note,
            "images": [self.procurement_id._api_attachment_payload(attachment) for attachment in self.image_ids],
        }


class MunicipalProcurementQuote(models.Model):
    _inherit = "municipal.procurement.quote"

    package_id = fields.Many2one("municipal.procurement.package", string="Package", ondelete="cascade", index=True)
    currency_id = fields.Many2one("res.currency", string="Currency", default=lambda self: self.env.company.currency_id)
    bank_account_text = fields.Char(string="Supplier bank account")
    payment_terms_text = fields.Char(string="Payment terms")
    delivery_terms_text = fields.Char(string="Delivery terms")
    expected_delivery_date = fields.Date(string="Expected delivery date")
    selected_by = fields.Many2one("res.users", string="Selected by", readonly=True)
    selected_date = fields.Datetime(string="Selected date", readonly=True)
    line_ids = fields.One2many("municipal.procurement.quote.line", "quote_id", string="Quote lines")

    def write(self, vals):
        if vals.get("is_selected"):
            vals.setdefault("selected_by", self.env.user.id)
            vals.setdefault("selected_date", fields.Datetime.now())
        return super().write(vals)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get("is_selected"):
                vals.setdefault("selected_by", self.env.user.id)
                vals.setdefault("selected_date", fields.Datetime.now())
        return super().create(vals_list)

    @api.depends("amount_total")
    def _compute_contract_required(self):
        for quote in self:
            quote.contract_required = _is_high_value_amount(quote.amount_total)

    @api.constrains("is_selected", "procurement_id", "package_id")
    def _check_single_selected_quote(self):
        for quote in self.filtered("is_selected"):
            domain = [
                ("id", "!=", quote.id),
                ("procurement_id", "=", quote.procurement_id.id),
                ("is_selected", "=", True),
            ]
            if quote.package_id:
                domain.append(("package_id", "=", quote.package_id.id))
            else:
                domain.append(("package_id", "=", False))
            if self.search_count(domain):
                raise ValidationError("Only one supplier quote can be selected for the same package.")

    def _api_payload(self):
        self.ensure_one()
        return {
            "id": self.id,
            "sequence": self.sequence,
            "package_id": self.package_id.id or None,
            "supplier": _relation_payload(self.supplier_id),
            "amount_total": self.amount_total,
            "currency": _relation_payload(self.currency_id),
            "is_selected": self.is_selected,
            "attachments": [self.procurement_id._api_attachment_payload(attachment) for attachment in self.attachment_ids],
            "bank_account_text": self.bank_account_text,
        }


class MunicipalProcurementQuoteLine(models.Model):
    _name = "municipal.procurement.quote.line"
    _description = "Municipal Procurement Quote Line"
    _order = "quote_id, id"

    quote_id = fields.Many2one("municipal.procurement.quote", required=True, ondelete="cascade")
    request_line_id = fields.Many2one("municipal.procurement.line", string="Request line")
    name = fields.Char(required=True)
    quantity = fields.Float(default=1.0)
    unit_price = fields.Float()
    subtotal = fields.Float(compute="_compute_subtotal", store=True)
    note = fields.Text()

    @api.depends("quantity", "unit_price")
    def _compute_subtotal(self):
        for line in self:
            line.subtotal = line.quantity * line.unit_price


class MunicipalProcurementDocument(models.Model):
    _name = "municipal.procurement.document"
    _description = "Municipal Procurement Document"
    _order = "create_date desc, id desc"

    request_id = fields.Many2one("municipal.procurement.request", required=True, ondelete="cascade")
    document_type = fields.Selection(
        [
            ("request_attachment", "Request attachment"),
            ("product_image", "Product image"),
            ("quote", "Supplier quote"),
            ("order_draft", "Тушаалын төсөл"),
            ("director_order_final", "Батлагдсан тушаал"),
            ("contract_final", "Гэрээний файл"),
            ("payment_proof", "Payment proof"),
            ("receipt_proof", "Receipt proof"),
            ("other", "Other"),
        ],
        required=True,
        default="other",
    )
    note = fields.Text()
    is_required = fields.Boolean()
    attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_procurement_document_attachment_rel",
        "document_id",
        "attachment_id",
        string="Attachments",
    )

    def _api_payload(self):
        self.ensure_one()
        return {
            "id": self.id,
            "document_type": _code_label(self.document_type, self._fields["document_type"].selection),
            "note": self.note,
            "is_required": self.is_required,
            "attachments": [self.request_id._api_attachment_payload(attachment) for attachment in self.attachment_ids],
        }


class MunicipalProcurementAudit(models.Model):
    _name = "municipal.procurement.audit"
    _description = "Municipal Procurement Audit"
    _order = "changed_at desc, id desc"

    request_id = fields.Many2one("municipal.procurement.request", required=True, ondelete="cascade")
    action_code = fields.Char(required=True)
    action_label = fields.Char(required=True)
    old_state = fields.Selection(PROCUREMENT_STATES_V2)
    new_state = fields.Selection(PROCUREMENT_STATES_V2)
    user_id = fields.Many2one("res.users", required=True, default=lambda self: self.env.user)
    changed_at = fields.Datetime(default=fields.Datetime.now, required=True)
    note = fields.Text()
    previous_status = fields.Char()
    new_status = fields.Char()
    action_by_user_id = fields.Many2one("res.users", string="Action by user")
    action_by_role = fields.Char(string="Action by role")
    action_date = fields.Datetime(string="Action date")
    comment = fields.Text()
    attached_file_ids = fields.Many2many(
        "ir.attachment",
        "municipal_procurement_audit_attachment_rel",
        "audit_id",
        "attachment_id",
        string="Attached files",
    )

    def _api_payload(self):
        self.ensure_one()
        request = self.request_id
        return {
            "id": self.id,
            "action_code": self.action_code,
            "action_label": PROCUREMENT_ACTION_LABELS.get(self.action_code, self.action_label),
            "old_state": _code_label(self.old_state, request._fields["state"].selection) if self.old_state else None,
            "new_state": _code_label(self.new_state, request._fields["state"].selection) if self.new_state else None,
            "user": _relation_payload(self.user_id),
            "action_by_role": self.action_by_role,
            "changed_at": self.changed_at,
            "note": PROCUREMENT_AUDIT_NOTE_LABELS.get(self.comment or self.note, self.comment or self.note),
            "attached_files": [request._api_attachment_payload(attachment) for attachment in self.attached_file_ids],
        }


class MunicipalProcurementReceipt(models.Model):
    _name = "municipal.procurement.receipt"
    _description = "Municipal Procurement Receipt"
    _order = "received_date desc, id desc"

    request_id = fields.Many2one("municipal.procurement.request", required=True, ondelete="cascade")
    received_by = fields.Many2one("res.users", default=lambda self: self.env.user)
    received_date = fields.Datetime(default=fields.Datetime.now)
    line_ids = fields.One2many("municipal.procurement.receipt.line", "receipt_id")
    attachment_ids = fields.Many2many(
        "ir.attachment",
        "municipal_procurement_receipt_attachment_rel2",
        "receipt_id",
        "attachment_id",
    )
    note = fields.Text()
    is_service_finalized = fields.Boolean()
    state = fields.Selection([("draft", "Draft"), ("done", "Done"), ("cancelled", "Cancelled")], default="draft")


class MunicipalProcurementReceiptLine(models.Model):
    _name = "municipal.procurement.receipt.line"
    _description = "Municipal Procurement Receipt Line"

    receipt_id = fields.Many2one("municipal.procurement.receipt", required=True, ondelete="cascade")
    request_line_id = fields.Many2one("municipal.procurement.line")
    product_id = fields.Many2one("product.product")
    ordered_quantity = fields.Float()
    received_quantity = fields.Float()
    difference_quantity = fields.Float(compute="_compute_difference", store=True)
    note = fields.Text()

    @api.depends("ordered_quantity", "received_quantity")
    def _compute_difference(self):
        for line in self:
            line.difference_quantity = line.ordered_quantity - line.received_quantity
