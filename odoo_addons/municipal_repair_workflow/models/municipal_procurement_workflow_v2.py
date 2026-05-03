# -*- coding: utf-8 -*-

from datetime import date

from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError


AMOUNT_THRESHOLD = 1000000

PROCUREMENT_STATES_V2 = [
    ("draft", "Draft"),
    ("submitted", "Submitted"),
    ("quote_collection", "Collecting Quotes"),
    ("finance_review", "Finance Review"),
    ("finance_selected_supplier", "Supplier Selected"),
    ("admin_review", "Administration Review"),
    ("ceo_decision", "CEO Decision"),
    ("ceo_order_uploaded", "CEO Order Uploaded"),
    ("legal_contract_draft", "Legal Contract Draft"),
    ("payment_pending", "Payment Pending"),
    ("payment_recorded", "Payment Recorded"),
    ("receiving", "Receiving"),
    ("received", "Received"),
    ("legal_final_contract", "Final Contract Pending"),
    ("done", "Done"),
    ("returned", "Returned"),
    ("cancelled", "Cancelled"),
]

PROCUREMENT_ACTION_LABELS = {
    "submit_for_quotation": "Submit for quotation",
    "submit_quotations": "Save supplier quotes",
    "move_to_finance_review": "Send to finance review",
    "prepare_order": "Send to administration / CEO",
    "director_decision": "Record CEO decision",
    "attach_final_order": "Upload CEO order",
    "mark_contract_signed": "Upload contract draft/final",
    "mark_paid": "Record payment",
    "mark_received": "Record receiving",
    "mark_done": "Complete request",
    "cancel": "Cancel",
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


def _relation_payload(record):
    return {"id": record.id, "name": record.display_name} if record else None


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
    receipt_ids = fields.One2many("municipal.procurement.receipt", "request_id", string="Receipts")
    purchase_order_id = fields.Many2one("purchase.order", string="Purchase order", ondelete="set null")
    vendor_bill_id = fields.Many2one("account.move", string="Vendor bill", ondelete="set null")
    active = fields.Boolean(default=True)

    @api.depends("requested_by")
    def _compute_requested_employee(self):
        employees = self.env["hr.employee"].sudo()
        for request in self:
            request.requested_employee_id = employees.search([("user_id", "=", request.requested_by.id)], limit=1)

    @api.depends("selected_supplier_total", "selected_quote_id.amount_total")
    def _compute_flow_type(self):
        for request in self:
            amount = request.selected_supplier_total or request.selected_quote_id.amount_total or 0
            high = amount > AMOUNT_THRESHOLD
            request.requires_high_value_approval = high
            request.contract_required = high
            request.flow_type = "high" if high else ("low" if amount else False)
            request.is_over_threshold = high

    @api.depends("quote_line_ids.is_selected", "quote_line_ids.amount_total", "quote_line_ids.supplier_id")
    def _compute_quote_summary(self):
        for request in self:
            selected = request.quote_line_ids.filtered("is_selected")[:1]
            request.selected_quote_id = selected.id if selected else False
            request.selected_supplier_id = selected.supplier_id.id if selected else False
            request.selected_supplier_total = selected.amount_total if selected else 0

    @api.depends("amount_total", "selected_supplier_total")
    def _compute_is_over_threshold(self):
        for request in self:
            request.is_over_threshold = (request.selected_supplier_total or request.amount_total or 0) > AMOUNT_THRESHOLD

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get("title") and not vals.get("description"):
                vals["description"] = vals.get("description") or ""
        records = super().create(vals_list)
        for record in records:
            record._record_audit("create", False, record.state, "Request created")
        return records

    def _has_group_key(self, key):
        xml_id = GROUPS[key]
        return self.env.user.has_group(xml_id)

    def _has_any_group(self, keys):
        return any(self._has_group_key(key) for key in keys)

    def _ensure_role(self, keys, message):
        if not self._has_any_group(keys):
            raise AccessError(message)

    def _record_audit(self, action_code, old_state=False, new_state=False, note=False):
        Audit = self.env["municipal.procurement.audit"].sudo()
        for request in self:
            Audit.create(
                {
                    "request_id": request.id,
                    "action_code": action_code,
                    "action_label": PROCUREMENT_ACTION_LABELS.get(action_code, action_code),
                    "old_state": old_state or False,
                    "new_state": new_state or False,
                    "user_id": self.env.user.id,
                    "note": note or False,
                }
            )

    def _change_state(self, new_state, action_code, note=False):
        for request in self:
            old_state = request.state
            request.write({"state": new_state})
            request._record_audit(action_code, old_state, new_state, note)

    def _valid_quote_lines(self):
        self.ensure_one()
        return self.quote_line_ids.filtered(lambda quote: quote.supplier_id and quote.amount_total > 0)

    def _ensure_procurement_lines(self):
        for request in self:
            if not request.line_ids:
                raise UserError("At least one purchase item is required.")

    def _ensure_three_quotes(self):
        for request in self:
            if len(request._valid_quote_lines()) < 3:
                raise UserError("At least three supplier quotes are required before supplier selection.")

    def _ensure_quote_evidence(self):
        for request in self:
            supplier_ids = [quote.supplier_id.id for quote in request._valid_quote_lines()]
            if len(supplier_ids) != len(set(supplier_ids)):
                raise UserError("Supplier quotes must be from three different suppliers.")
            missing = request._valid_quote_lines().filtered(lambda quote: not quote.attachment_ids)
            if missing and not request.quote_attachment_ids:
                raise UserError("Quote attachments or evidence are required.")

    def _ensure_selected_quote(self):
        for request in self:
            selected = request.quote_line_ids.filtered("is_selected")
            if not selected:
                raise UserError("A selected supplier quote is required.")
            if len(selected) > 1:
                raise UserError("Only one supplier quote can be selected.")
            if selected.amount_total <= 0:
                raise UserError("Selected quote amount must be greater than zero.")

    def _ensure_high_value_payment_ready(self):
        for request in self:
            if not request.requires_high_value_approval:
                continue
            if not request.ceo_selected_quote_id:
                raise UserError("CEO-selected supplier quote is required before high-value payment.")
            if not request.ceo_order_attachment_ids:
                raise UserError("CEO approval/order attachment is required before high-value payment.")
            if not request.contract_draft_attachment_ids:
                raise UserError("Contract draft is required before high-value payment.")

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
        self.write({"amount_total": self.selected_supplier_total})
        for request in self:
            if request.requires_high_value_approval:
                request._change_state("admin_review", "move_to_finance_review")
            else:
                request._change_state("finance_review", "move_to_finance_review")
        return True

    def action_finance_approve(self):
        self._ensure_role(["finance_user", "admin"], "Only finance can select supplier/payment flow.")
        self._ensure_selected_quote()
        for request in self:
            request.finance_approved_by = self.env.user.id
            request.date_finance_approved = fields.Datetime.now()
            request._change_state("payment_pending", "finance_selected_supplier")
        return True

    def action_prepare_order(self):
        self._ensure_role(["administration_user", "admin"], "Only administration can prepare CEO paperwork.")
        self._ensure_selected_quote()
        for request in self:
            if not request.requires_high_value_approval:
                raise UserError("CEO paperwork is only required for high-value purchases.")
            request._change_state("ceo_decision", "prepare_order")
        return True

    def action_record_ceo_decision(self, selected_quotation_id=False, note=False):
        self._ensure_role(["administration_user", "ceo", "general_manager", "admin"], "Only administration or CEO can record CEO decision.")
        for request in self:
            quote = self.env["municipal.procurement.quote"].browse(selected_quotation_id).exists() if selected_quotation_id else request.selected_quote_id
            if not quote or quote.procurement_id != request:
                raise UserError("A valid CEO-selected quote is required.")
            request.quote_line_ids.write({"is_selected": False})
            quote.is_selected = True
            request.write(
                {
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
        self._ensure_role(["administration_user", "admin"], "Only administration can upload CEO order.")
        for request in self:
            if request.requires_high_value_approval and not request.ceo_selected_quote_id:
                raise UserError("Record CEO-selected quote before uploading order.")
            request.ceo_order_note = note or request.ceo_order_note
            request._change_state("legal_contract_draft", "attach_final_order", note)
            request.legal_state = "draft_needed"
        return True

    def action_upload_contract_draft(self, note=False):
        self._ensure_role(["legal_user", "admin"], "Only legal can upload contract draft.")
        for request in self:
            if request.requires_high_value_approval and not request.ceo_order_attachment_ids:
                raise UserError("CEO order must be uploaded before contract draft.")
            if not request.contract_draft_attachment_ids:
                raise UserError("Upload a contract draft attachment first.")
            request.write(
                {
                    "contract_draft_uploaded_by": self.env.user.id,
                    "contract_draft_uploaded_date": fields.Datetime.now(),
                    "legal_state": "draft_uploaded",
                }
            )
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

    def action_mark_paid(self):
        self._ensure_role(["finance_user", "admin"], "Only finance can record payment.")
        for request in self:
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
            request._record_audit("mark_paid", "payment_pending", "payment_recorded", request.payment_note)
        return True

    def action_receive(self):
        self._ensure_role(["purchase_manager", "storekeeper", "admin"], "Only purchase manager can mark receiving.")
        for request in self:
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
                    "state": "received",
                    "receipt_status": "received" if all_received or request.is_service_finalized else "partially_received",
                    "received_by": self.env.user.id,
                    "date_received": fields.Datetime.now(),
                    "received_date": request.received_date or fields.Date.context_today(request),
                }
            )
            request._record_audit("mark_received", "receiving", "received", request.received_note)
        return True

    def action_done(self):
        for request in self:
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
            actions.append({"code": code, "label": PROCUREMENT_ACTION_LABELS[code]})

        if self.state == "draft" and (flags["requester"] or flags["admin"]):
            add("submit_for_quotation")
        if self.state in ("submitted", "quote_collection") and (flags["storekeeper"] or flags["admin"]):
            add("submit_quotations")
            if len(self._valid_quote_lines()) >= 3 and self.selected_quote_id:
                add("move_to_finance_review")
        if self.state == "finance_review" and (flags["finance"] or flags["admin"]):
            add("mark_paid")
        if self.state == "admin_review" and (flags["office_clerk"] or flags["admin"]):
            add("prepare_order")
        if self.state == "ceo_decision" and (flags["office_clerk"] or flags["director"] or flags["general_manager"] or flags["admin"]):
            add("director_decision")
        if self.state in ("ceo_decision", "ceo_order_uploaded") and (flags["office_clerk"] or flags["admin"]):
            add("attach_final_order")
        if self.state == "legal_contract_draft" and (flags["contract_officer"] or flags["admin"]):
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
        def has(key):
            return user.has_group(GROUPS[key])

        return {
            "id": user.id,
            "name": user.name,
            "login": user.login,
            "company": user.company_id.display_name,
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
        amount = self.selected_supplier_total or selected.amount_total or self.amount_total or 0
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
            "project": _relation_payload(self.related_project_id),
            "task": _relation_payload(self.related_task_id),
            "department": _relation_payload(self.department_id),
            "requester": _relation_payload(self.requested_by),
            "storekeeper": _relation_payload(self.purchase_manager_id),
            "procurement_type": self._state_payload("request_type", self.request_type),
            "urgency": self._state_payload("urgency", self.urgency),
            "description": self.description,
            "required_date": self.required_date.isoformat() if self.required_date else None,
            "state": self._state_payload("state", self.state),
            "flow_type": self._state_payload("flow_type", self.flow_type),
            "selected_supplier": {"id": selected.supplier_id.id, "name": selected.supplier_id.display_name, "total": selected.amount_total} if selected else None,
            "selected_quotation_id": selected.id if selected else None,
            "selected_supplier_total": amount,
            "amount_approx_total": sum(self.line_ids.mapped("subtotal")) or self.amount_total or 0,
            "payment_status": self._state_payload("payment_status", self.payment_status),
            "receipt_status": self._state_payload("receipt_status", self.receipt_status),
            "is_over_threshold": self.requires_high_value_approval,
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
        payload.update(
            {
                "lines": [line._api_payload(index + 1) for index, line in enumerate(self.line_ids)],
                "quotations": [quote._api_payload() for quote in self.quote_line_ids],
                "documents": [document._api_payload() for document in self.document_ids],
                "audit": [audit._api_payload() for audit in self.audit_ids.sorted("changed_at", reverse=True)],
                "attachments": [self._api_attachment_payload(attachment) for attachment in self.quote_attachment_ids],
                "paid_amount": self.paid_amount,
                "payment_note": self.payment_note,
                "legal_state": self._state_payload("legal_state", self.legal_state),
            }
        )
        return payload

    def _api_attachment_payload(self, attachment):
        return {"id": attachment.id, "name": attachment.name, "mimetype": attachment.mimetype or ""}

    def _api_current_responsible(self):
        self.ensure_one()
        if self.state in ("submitted", "quote_collection", "payment_recorded", "receiving"):
            return self.purchase_manager_id
        if self.state in ("finance_review", "payment_pending"):
            return self.finance_user_id
        if self.state in ("admin_review", "ceo_decision", "ceo_order_uploaded"):
            return self.administration_user_id
        if self.state in ("legal_contract_draft", "legal_final_contract"):
            return self.legal_user_id
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
        flow = filters.get("flow_type") or filters.get("flow")
        user = self.env.user
        flags = self._api_current_user_payload(user)["flags"]
        if scope == "mine":
            if flags["admin"] or flags["director"] or flags["general_manager"]:
                pass
            else:
                domain += ["|", ("requested_by", "=", user.id), ("department_id.manager_id.user_id", "=", user.id)]
        elif scope == "assigned":
            domain += [
                "|",
                "|",
                "|",
                ("purchase_manager_id", "=", user.id),
                ("finance_user_id", "=", user.id),
                ("administration_user_id", "=", user.id),
                ("legal_user_id", "=", user.id),
            ]
        if state:
            domain.append(("state", "=", state))
        if flow:
            domain.append(("flow_type", "=", flow))
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
        records = self.search(domain, limit=limit, offset=(page - 1) * limit, order="write_date desc, id desc")
        return {
            "ok": True,
            "items": [record._api_summary_payload() for record in records],
            "pagination": {"page": page, "limit": limit, "total": total, "pages": max((total + limit - 1) // limit, 1)},
        }

    @api.model
    def _api_dashboard_payload(self, filters):
        domain = self._api_domain_for_filters(filters)
        records = self.search(domain, order="write_date desc, id desc")
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
            "project_progress": self._api_group_counts(records, "related_project_id"),
            "supplier_counts": self._api_supplier_counts(records),
            "items": [record._api_summary_payload() for record in records[:10]],
        }

    @api.model
    def _api_group_counts(self, records, field_name):
        counts = {}
        for record in records:
            related = record[field_name]
            if related:
                counts.setdefault(related.id, {"id": related.id, "name": related.display_name, "count": 0})
                counts[related.id]["count"] += 1
        return sorted(counts.values(), key=lambda item: item["count"], reverse=True)[:10]

    @api.model
    def _api_supplier_counts(self, records):
        counts = {}
        for record in records:
            supplier = record.selected_supplier_id
            if supplier:
                counts.setdefault(supplier.id, {"id": supplier.id, "name": supplier.display_name, "count": 0})
                counts[supplier.id]["count"] += 1
        return sorted(counts.values(), key=lambda item: item["count"], reverse=True)[:10]

    @api.model
    def _api_meta_payload(self):
        Project = self.env["project.project"].sudo()
        Task = self.env["project.task"].sudo()
        Department = self.env["hr.department"].sudo()
        Partner = self.env["res.partner"].sudo()
        Uom = self.env["uom.uom"].sudo()
        Users = self.env["res.users"].sudo()
        storekeeper_group_ids = []
        for group_key in ("purchase_manager", "storekeeper", "repair_storekeeper"):
            group = self.env.ref(GROUPS[group_key], raise_if_not_found=False)
            if group:
                storekeeper_group_ids.append(group.id)
        storekeeper_domain = [("groups_id", "in", storekeeper_group_ids)] if storekeeper_group_ids else []
        tasks = Task.search([], limit=200, order="write_date desc")
        return {
            "ok": True,
            "projects": [_relation_payload(project) for project in Project.search([], limit=100, order="name")],
            "tasks": [
                {"id": task.id, "name": task.display_name, "project_id": task.project_id.id or 0}
                for task in tasks
            ],
            "departments": [_relation_payload(dept) for dept in Department.search([], limit=100, order="name")],
            "storekeepers": [_relation_payload(user) for user in Users.search(storekeeper_domain, limit=100, order="name")],
            "suppliers": [_relation_payload(partner) for partner in Partner.search([("supplier_rank", ">", 0)], limit=200, order="name")],
            "uoms": [_relation_payload(uom) for uom in Uom.search([], limit=100, order="name")],
        }

    @api.model
    def _api_create_request(self, payload):
        self._ensure_role(["department_head", "admin"], "Only department head can create procurement requests.")
        line_payloads = payload.get("lines") or []
        if not line_payloads:
            raise UserError("At least one purchase item is required.")
        vals = {
            "title": payload.get("title"),
            "description": payload.get("description"),
            "request_type": payload.get("procurement_type") or "material",
            "urgency": payload.get("urgency") or "medium",
            "priority": payload.get("urgency") or "medium",
            "required_date": payload.get("required_date") or False,
            "related_project_id": int(payload.get("project_id") or 0) or False,
            "related_task_id": int(payload.get("task_id") or 0) or False,
            "department_id": int(payload.get("department_id") or 0) or False,
            "purchase_manager_id": int(payload.get("responsible_storekeeper_user_id") or 0) or False,
            "line_ids": [],
        }
        if vals["request_type"] == "goods":
            vals["request_type"] = "material"
        if not vals["department_id"]:
            employee = self.env["hr.employee"].sudo().search([("user_id", "=", self.env.user.id)], limit=1)
            vals["department_id"] = employee.department_id.id or False
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
                        "estimated_unit_cost": float(line.get("approx_unit_price") or 0),
                    },
                )
            )
        request = self.create(vals)
        return request

    def _api_submit_quotations(self, payload):
        self._ensure_role(["purchase_manager", "storekeeper", "admin"], "Only purchase manager can save supplier quotes.")
        quotations = payload.get("quotations") or []
        if len(quotations) < 3:
            raise UserError("Three supplier quotes are required.")
        for request in self:
            request.quote_line_ids.unlink()
            for index, quote_payload in enumerate(quotations, start=1):
                supplier_id = int(quote_payload.get("supplier_id") or 0)
                if not supplier_id:
                    raise UserError("Supplier is required for every quote.")
                attachment_ids = quote_payload.get("attachment_ids") or []
                self.env["municipal.procurement.quote"].create(
                    {
                        "procurement_id": request.id,
                        "sequence": index,
                        "supplier_id": supplier_id,
                        "quotation_ref": quote_payload.get("quotation_ref"),
                        "quotation_date": quote_payload.get("quotation_date") or False,
                        "amount_total": float(quote_payload.get("amount_total") or 0),
                        "expected_delivery_date": quote_payload.get("expected_delivery_date") or False,
                        "payment_terms_text": quote_payload.get("payment_terms_text"),
                        "delivery_terms_text": quote_payload.get("delivery_terms_text"),
                        "notes": quote_payload.get("notes"),
                        "is_selected": bool(quote_payload.get("is_selected")),
                        "attachment_ids": [(6, 0, attachment_ids)],
                    }
                )
            request._ensure_three_quotes()
            request._ensure_selected_quote()
            request._ensure_quote_evidence()
            request.write({"date_quotation_submitted": fields.Datetime.now(), "amount_total": request.selected_supplier_total})
            request._change_state("finance_review" if not request.requires_high_value_approval else "admin_review", "submit_quotations")
        return True

    def _api_run_action(self, action, payload):
        self._api_check_write()
        if action == "submit":
            return self.action_submit()
        if action == "move_to_finance_review":
            return self.action_finance_review()
        if action == "prepare_order":
            return self.action_prepare_order()
        if action == "director_decision":
            return self.action_record_ceo_decision(payload.get("selected_quotation_id"), payload.get("note"))
        if action == "attach_final_order":
            return self.action_upload_ceo_order(payload.get("note"))
        if action == "mark_contract_signed":
            if self.contract_draft_attachment_ids and self.final_contract_attachment_ids:
                return self.action_upload_final_contract(payload.get("note"))
            return self.action_upload_contract_draft(payload.get("note"))
        if action == "mark_paid":
            vals = {
                "paid_amount": float(payload.get("paid_amount") or payload.get("amount") or 0),
                "payment_reference": payload.get("payment_reference"),
                "payment_note": payload.get("note"),
                "paid_date": payload.get("payment_date") or fields.Date.context_today(self),
            }
            if payload.get("selected_quotation_id"):
                quote = self.env["municipal.procurement.quote"].browse(int(payload["selected_quotation_id"]))
                if quote.exists() and quote.procurement_id == self:
                    self.quote_line_ids.write({"is_selected": False})
                    quote.is_selected = True
            self.write(vals)
            return self.action_mark_paid()
        if action == "mark_received":
            self.write({"received_note": payload.get("note"), "is_service_finalized": self.request_type == "service"})
            return self.action_receive()
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
        attachment = self.env["ir.attachment"].create(
            {
                "name": payload.get("name") or "attachment",
                "datas": data,
                "mimetype": payload.get("mimetype") or "application/octet-stream",
                "res_model": "municipal.procurement.request",
                "res_id": self.id,
            }
        )
        target = payload.get("target")
        document_type = payload.get("document_type") or "other"
        note = payload.get("note")
        if document_type == "director_order_final":
            self.ceo_order_attachment_ids = [(4, attachment.id)]
        elif target == "line":
            line = self.line_ids.filtered(lambda item: item.id == int(payload.get("line_id") or 0))[:1]
            if not line:
                raise UserError("A valid purchase item line is required for product image upload.")
            attachment.write({"res_model": "municipal.procurement.line", "res_id": line.id})
            line.image_ids = [(4, attachment.id)]
        elif document_type == "contract_final":
            if self.contract_draft_attachment_ids:
                self.final_contract_attachment_ids = [(4, attachment.id)]
            else:
                self.contract_draft_attachment_ids = [(4, attachment.id)]
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
                "is_required": document_type in ("director_order_final", "contract_final", "payment_proof", "receipt_proof"),
            }
        )
        return self._api_attachment_payload(attachment)


class MunicipalProcurementLine(models.Model):
    _inherit = "municipal.procurement.line"

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
            "product_name": self.name or self.product_id.display_name or self.description,
            "specification": self.specification_text,
            "quantity": self.requested_quantity,
            "uom": _relation_payload(self.uom_id) or ({"id": 0, "name": self.unit_of_measure} if self.unit_of_measure else None),
            "approx_unit_price": self.estimated_unit_cost,
            "approx_subtotal": self.subtotal,
            "final_unit_price": self.estimated_unit_cost,
            "final_subtotal": self.subtotal,
            "remark": self.note,
            "images": [self.request_id._api_attachment_payload(attachment) for attachment in self.image_ids],
        }


class MunicipalProcurementQuote(models.Model):
    _inherit = "municipal.procurement.quote"

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
            quote.contract_required = quote.amount_total > AMOUNT_THRESHOLD

    def _api_payload(self):
        self.ensure_one()
        return {
            "id": self.id,
            "sequence": self.sequence,
            "supplier": _relation_payload(self.supplier_id),
            "quotation_ref": self.quotation_ref,
            "quotation_date": self.quotation_date.isoformat() if self.quotation_date else None,
            "amount_total": self.amount_total,
            "currency": _relation_payload(self.currency_id),
            "payment_terms_text": self.payment_terms_text,
            "delivery_terms_text": self.delivery_terms_text,
            "expected_delivery_date": self.expected_delivery_date.isoformat() if self.expected_delivery_date else None,
            "is_selected": self.is_selected,
            "notes": self.notes,
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
            ("director_order_final", "CEO order"),
            ("contract_final", "Contract"),
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

    def _api_payload(self):
        self.ensure_one()
        request = self.request_id
        return {
            "id": self.id,
            "action_code": self.action_code,
            "action_label": self.action_label,
            "old_state": _code_label(self.old_state, request._fields["state"].selection) if self.old_state else None,
            "new_state": _code_label(self.new_state, request._fields["state"].selection) if self.new_state else None,
            "user": _relation_payload(self.user_id),
            "changed_at": self.changed_at,
            "note": self.note,
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
