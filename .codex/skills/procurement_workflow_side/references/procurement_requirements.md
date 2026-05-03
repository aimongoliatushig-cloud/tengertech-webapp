# Procurement / Purchase Workflow Requirements

## Contents

1. Purpose
2. Development Rules
3. Roles
4. Access Visibility
5. Core Workflow Concept
6. Request And Item Requirements
7. Supplier And Quote Requirements
8. Threshold Logic
9. Simple Flow Below Or Equal 1,000,000 MNT
10. High-Value Flow Above 1,000,000 MNT
11. Contract Logic
12. CEO Decision And Administration Paperwork
13. Payment Logic
14. Receiving And Service Finalization
15. Assigned Procurement Tasks
16. Dashboards
17. UI And Mobile Requirements
18. Notifications
19. Validation Rules
20. Recommended Models
21. Workflow Actions
22. Reports And Filters
23. Acceptance Criteria
24. Testing Checklist

## 1. Purpose

Implement a clear, traceable, task-connected purchase/procurement process for the municipal ERP project. Every department task or project can initiate a purchase need, and that need moves through purchase manager, finance, administration, CEO decision, legal contract, payment recording, receiving/finalization, and completion.

The workflow must be easy to use, visually clear, role-based, and connected to the original project/task.

## 2. Development Rules

- Inspect existing Odoo modules first.
- Do not duplicate models if equivalent models already exist.
- Reuse standard Odoo modules where possible: `purchase`, `stock`, `account`, `project`, `hr`, `res.partner`, `product.product`.
- If a custom procurement module already exists, extend it safely.
- Do not break HR, work/task, repair, push notification, or mobile reporting modules.
- Do not refactor unrelated code.
- Do not delete existing features.
- Do not push directly to main.
- Do not run production database migrations without approval.
- Do not implement multiple payment schedules, QR code, or advanced accounting reconciliation in this procurement task.

## 3. Roles

Use English role keys internally so labels can be adjusted later.

### `department_head`

- Initiates purchase need from a project/task.
- Enters products/items, optional images/specifications, optional estimated price.
- Sees only own department's purchase requests by default.
- Tracks status on own dashboard and related task/project.
- Cannot approve finance, CEO, legal, or receiving stages unless also assigned another role.

### `purchase_manager`

- Receives submitted purchase requirements.
- Finds suppliers/vendors.
- Collects at least three supplier quotes.
- Enters supplier quote details and bank account information when available.
- Uploads quote attachments.
- Manages receiving of goods/products/parts or service finalization.
- Sees purchase tasks assigned to purchase manager.

### `finance_user`

- Reviews requirements needing finance action.
- Reviews supplier, amount, quote, bank account, and contract draft when applicable.
- For purchases <= 1,000,000 MNT: selects supplier/vendor and records payment.
- For purchases > 1,000,000 MNT: records payment only after CEO-selected supplier, CEO order/approval attachment, and contract draft exist.
- Can record full, 50%, or any agreed partial paid amount.
- Does not manage remaining payment schedules in v1.

### `administration_user`

- Handles paperwork and CEO coordination for purchases > 1,000,000 MNT.
- Presents purchase information and quotes to CEO.
- Records CEO-selected supplier.
- Uploads CEO approval/order document as PDF/image.
- Uploads signed/stamped official purchase order if available.

### `ceo`

- Makes decision for purchases > 1,000,000 MNT.
- Chooses supplier/vendor for high-value purchase.
- Does not have to use the app directly; administration may enter the decision.
- Can see all departments' purchase requirements.

### `legal_user`

- Reviews CEO-approved purchase requirements.
- Drafts contract and uploads contract draft.
- Later uploads final signed/stamped contract.
- Final signed contract is tracked but does not block payment or receiving/finalization in v1.

### `general_manager`

- Sees all departments' purchase requirements.
- Tracks process by department.
- Sees stage/status summary and delayed requests.

### `storekeeper`

- May overlap with purchase manager depending on current business setup.
- Handles receiving/material issue only when assigned by procurement workflow.

## 4. Access Visibility

- Department head sees requests created by themselves, requests from own department, and related project/task purchase status. They do not see other departments unless they also have manager/CEO/admin role.
- Purchase manager sees assigned quote collection, supplier/vendor information needed for purchasing, and receiving/finalization tasks.
- Finance sees waiting finance review, selected supplier/vendor, quote amounts, supplier bank account, contract draft if high-value, paid amount, and payment status.
- Administration sees high-value purchases, quote comparison, CEO decision stage, and document/order upload stage.
- Legal sees contract draft/final upload tasks.
- CEO/general manager see all departments, requests, high-value approvals, dashboards, and reports.

## 5. Core Workflow Concept

Relationship:

```text
Project
  -> Task
      -> Purchase Requirement
          -> Purchase Items
          -> Supplier Quotes
          -> Selected Supplier
          -> Approval Flow
          -> Contract / Legal Flow
          -> Payment Recording
          -> Receiving / Service Finalization
          -> Completion
```

The request must always show what task created it, needed items, current stage, next responsible user, selected supplier, payment state, paid amount, receiving/finalization state, and whether the related task/project can continue.

## 6. Request And Item Requirements

Purchase need is initiated from a project/task. A task/project may have multiple purchase requirements. A request may contain multiple item lines.

Item line fields:

- `name`
- `description`
- `specification_text`
- `quantity`
- `uom_id`
- `estimated_unit_price`
- `estimated_total`
- `image_ids`
- `suggested_supplier_id`
- `note`

Rules:

- Product image is useful but not always required.
- Specification is generic free text.
- Product master creation is not required before submission.
- Product may later be matched with `product.product`.

## 7. Supplier And Quote Requirements

Use `res.partner` where possible. Supplier data should include name, phone, email, address, bank account name/number/bank, tax/VAT registration, contact person, notes, supplied products/services, and previous purchase history.

One request can have multiple supplier quotes. One supplier quote can cover multiple requested items.

Supplier quote fields:

- supplier/vendor
- quote date
- total amount
- currency
- quote attachment PDF/image
- note
- quote line items
- bank account information
- selected flag

Quote line fields:

- `quote_id`
- `request_line_id`
- product/item description
- quantity
- unit price
- subtotal
- note

Rules:

- At least three supplier quotes should normally exist before supplier selection.
- Supplier quote total amount drives threshold logic.
- Selected supplier quote determines simple vs high-value workflow.
- Do not add complex missing-three-quotes exception workflow in v1 unless already implemented.

## 8. Threshold Logic

Threshold:

```text
amount_threshold = 1000000
requires_high_value_approval = selected_quote_amount > 1000000
```

The threshold is based on the total amount from one selected supplier/vendor. If the selected supplier provides multiple items and the total exceeds 1,000,000 MNT, the high-value workflow is required. If the selected quote is <= 1,000,000 MNT, the simplified workflow applies.

## 9. Simple Flow Below Or Equal 1,000,000 MNT

Flow:

1. Department head initiates purchase need from project/task.
2. Request is submitted.
3. Purchase manager receives request.
4. Purchase manager collects at least three supplier quotes.
5. Finance reviews quotes.
6. Finance selects supplier/vendor.
7. Finance records paid amount.
8. Purchase manager receives goods/products/parts or finalizes service.
9. Purchase manager marks received/finalized.
10. Purchase task is completed.
11. Original project/task shows purchase as completed.

States:

- `draft`
- `submitted`
- `quote_collection`
- `finance_review`
- `finance_selected_supplier`
- `payment_pending`
- `payment_recorded`
- `receiving`
- `received`
- `done`
- `returned`
- `cancelled`

## 10. High-Value Flow Above 1,000,000 MNT

Flow:

1. Department head initiates purchase need from project/task.
2. Request is submitted.
3. Purchase manager receives request.
4. Purchase manager collects at least three supplier quotes.
5. Administration receives high-value purchase task.
6. Administration presents information and quotes to CEO.
7. CEO chooses supplier/vendor.
8. Administration records CEO-selected supplier.
9. Administration uploads CEO approval/order document.
10. Legal receives contract drafting task.
11. Legal uploads contract draft.
12. Finance records payment after CEO-selected supplier, CEO order, and contract draft exist.
13. Purchase manager receives goods/products/parts or finalizes service.
14. Legal uploads final signed/stamped contract later if needed.
15. Request is completed.

States:

- `draft`
- `submitted`
- `quote_collection`
- `admin_review`
- `ceo_decision`
- `ceo_order_uploaded`
- `legal_contract_draft`
- `finance_review`
- `payment_pending`
- `payment_recorded`
- `receiving`
- `received`
- `legal_final_contract`
- `done`
- `returned`
- `cancelled`

Business rule: finance does not need to wait for final signed contract before payment if CEO decision and contract draft exist.

## 11. Contract Logic

High-value purchase normally requires contract workflow.

Fields:

- `contract_required`
- `contract_draft_attachment_ids`
- `contract_draft_uploaded_by`
- `contract_draft_uploaded_date`
- `final_contract_attachment_ids`
- `final_contract_uploaded_by`
- `final_contract_uploaded_date`
- `legal_user_id`
- `legal_state`

Legal states:

- `not_required`
- `draft_needed`
- `draft_uploaded`
- `final_pending`
- `final_uploaded`
- `completed`

Rules:

- Legal uploads contract draft.
- Finance can proceed after draft contract is uploaded and CEO decision exists.
- Final signed/stamped contract can be uploaded later.
- Final upload does not block payment or receiving/finalization in v1.

## 12. CEO Decision And Administration Paperwork

Fields:

- `ceo_selected_quote_id`
- `ceo_decision_date`
- `ceo_decision_recorded_by`
- `ceo_order_attachment_ids`
- `ceo_order_note`

Rules:

- CEO does not have to use the app personally.
- Administration records CEO-selected vendor and uploads order/approval document.
- Finance can see selected supplier, amount, bank account, and approval document.
- Finance cannot record high-value payment without CEO-selected quote and CEO order attachment.

## 13. Payment Logic

Use a simple payment model only. Do not implement payment schedules, installment workflow, reminder dates, automatic remaining balance reminders, final payment approval workflow, or legal delivery confirmation for final payment.

Payment fields:

- `paid_amount`
- `paid_date`
- `paid_by`
- `payment_reference`
- `payment_note`
- `payment_attachment_ids`
- `payment_status`

Payment status:

- `not_paid`
- `payment_recorded`
- `cancelled`

Payment rules:

- For simple purchase: supplier/vendor is selected and paid amount is entered.
- For high-value purchase: CEO-selected supplier exists, CEO order/approval attachment exists, contract draft exists, and paid amount is entered.
- Paid amount may be lower than selected quote total.
- Partial payment must show an informational badge such as "Partial amount recorded".
- Completion must not require paid amount to equal selected quote total.

Payment UI should show selected supplier, selected quote amount, paid amount, payment date, payment reference, payment attachment, payment note, and payment status.

## 14. Receiving And Service Finalization

Receiving fields:

- `received_by`
- `received_date`
- `received_note`
- `receipt_attachment_ids`
- `received_line_ids`
- `is_service_finalized`

Receiving line fields:

- product/item
- ordered quantity
- received quantity
- difference
- note

Rules:

- Purchase cannot be completed before receiving/finalization if goods/service are expected.
- Purchase manager marks received.
- Partial quantity is allowed but requires note.
- If all required quantities are received, mark receiving complete.
- For services, allow marking service finalized with note and attachment.
- Related task/project should show purchase received/completed status.

## 15. Assigned Procurement Tasks

Procurement stages should create or appear as tasks for responsible users:

- Purchase manager: collect quotes, enter supplier data, receive goods, finalize service.
- Finance: review quote, select supplier for simple purchase, record paid amount, upload payment attachment/reference.
- Administration: prepare CEO paperwork, upload CEO order, record CEO-selected supplier.
- Legal: draft contract, upload contract draft, upload final signed contract.

Each user should see their actions in dashboard, task list, and related purchase request list/kanban.

## 16. Dashboards

- Department head: own department requests, pending, quote collection, finance pending, payment recorded, received/done, delayed, by related task/project.
- General manager: all departments, by department, by stage, high-value, delayed approvals, pending finance/legal/receiving.
- CEO: high-value waiting decision, selected/approved high-value, total high-value amount, delayed CEO decision.
- Purchase manager: quote collection tasks, receiving tasks, missing supplier bank info, received today, delayed receiving.
- Finance: finance review pending, supplier selection pending, payment pending/recorded, partial amount recorded, high-value waiting CEO/contract draft, paid requests.
- Administration: high-value paperwork, CEO decision pending, CEO order upload pending, selected supplier to record.
- Legal: contract draft needed, final signed contract pending, draft uploaded, final uploaded.

## 17. UI And Mobile Requirements

UI principles:

- Keep forms practical and not overly complex.
- Show process stage visually.
- Show selected supplier, product images, quote comparison, next responsible user, payment status, paid amount, and contract status clearly.
- Use cards, tabs, and sections to avoid long confusing forms.
- Use colored stage badges, warning badge for > 1,000,000 MNT, selected quote highlight, product thumbnails, supplier comparison cards, simple icons, and clear primary action buttons.
- Preserve the green municipal visual style.

Recommended sections:

- Header
- Products Needed
- Supplier Quotes
- Approval / Decision
- Contract
- Payment
- Receiving / Service Finalization
- History / Chatter

Mobile should support essential action views with large buttons, minimal fields, clear stage, attachment/photo upload, and no overcrowded tables.

Mobile role actions:

- Department head: view own requests/status, initiate safe simple request from task, upload product image, add product/specification.
- Finance: view pending payment tasks, selected supplier/amount, record paid amount if allowed, upload payment attachment/reference.
- Purchase manager: quote tasks, upload quote attachment, mark received/finalized.
- Administration: CEO paperwork tasks, upload CEO order, record selected supplier.
- Legal: contract tasks, upload draft/final.

## 18. Notifications

Use Odoo activities and/or push notification if available. Trigger when request submitted, quote collection needed, finance review needed, supplier selected, CEO decision required, paperwork required, legal draft required, contract draft uploaded, payment pending/recorded, receiving needed, received/finalized, final contract pending, returned/rejected, and completed.

## 19. Validation Rules

- Cannot submit without at least one product line.
- Cannot move to finance review without supplier quotes.
- At least three supplier quotes should be collected before selection.
- Selected supplier quote must exist before payment.
- If selected quote total > 1,000,000 MNT, CEO decision, administration order document, and contract draft are required before finance payment.
- Finance cannot record payment if paid amount is missing.
- Finance cannot record payment if supplier bank account is missing unless exception note exists.
- Paid amount may be lower than selected quote total.
- Purchase cannot be marked done before receiving/finalization.
- Return/rejection requires reason.
- Unauthorized users cannot approve outside their role.
- Department head cannot see other departments' requests.
- Worker cannot approve procurement.
- Request creator cannot approve own finance/CEO/legal stage unless explicitly assigned another role.
- Finance cannot record CEO decision.
- Administration cannot record payment.
- Legal cannot record payment.
- Purchase manager cannot approve high-value CEO decision.
- Non-purchase-manager cannot mark received unless explicitly allowed.

## 20. Recommended Models

Use existing equivalent models if present; otherwise create or extend:

### `municipal.procurement.request`

Fields: `name`, `related_project_id`, `related_task_id`, `department_id`, `requested_by`, `requested_employee_id`, `request_date`, `request_type`, `description`, `state`, `priority`, `line_ids`, `quote_ids`, `selected_quote_id`, `selected_supplier_id`, `selected_amount_total`, `requires_high_value_approval`, `ceo_selected_quote_id`, `ceo_decision_date`, `ceo_decision_recorded_by`, `ceo_order_attachment_ids`, `contract_required`, `contract_draft_attachment_ids`, `final_contract_attachment_ids`, `legal_user_id`, `finance_user_id`, `administration_user_id`, `purchase_manager_id`, `paid_amount`, `paid_date`, `paid_by`, `payment_reference`, `payment_note`, `payment_attachment_ids`, `payment_status`, `received_by`, `received_date`, `received_note`, `receipt_attachment_ids`, `is_service_finalized`, `rejection_reason`, `company_id`, `active`.

### `municipal.procurement.line`

Fields: `request_id`, `product_id`, `name`, `description`, `specification_text`, `quantity`, `uom_id`, `estimated_unit_price`, `estimated_total`, `image_ids`, `suggested_supplier_id`, `note`.

### `municipal.procurement.quote`

Fields: `request_id`, `supplier_id`, `supplier_name`, `quote_date`, `amount_total`, `currency_id`, `bank_account_text`, `attachment_ids`, `line_ids`, `is_selected`, `selected_by`, `selected_date`, `note`.

### `municipal.procurement.quote.line`

Fields: `quote_id`, `request_line_id`, `name`, `quantity`, `unit_price`, `subtotal`, `note`.

### `municipal.procurement.receipt`

Fields: `request_id`, `received_by`, `received_date`, `line_ids`, `attachment_ids`, `note`, `is_service_finalized`, `state`.

### `municipal.procurement.receipt.line`

Fields: `receipt_id`, `request_line_id`, `product_id`, `ordered_quantity`, `received_quantity`, `difference_quantity`, `note`.

## 21. Workflow Actions

Main actions:

- `action_submit`
- `action_start_quote_collection`
- `action_send_finance_review`
- `action_finance_select_quote`
- `action_send_admin_review`
- `action_record_ceo_decision`
- `action_upload_ceo_order`
- `action_send_legal_contract`
- `action_upload_contract_draft`
- `action_send_payment`
- `action_record_payment`
- `action_receive_goods`
- `action_finalize_service`
- `action_upload_final_contract`
- `action_done`
- `action_return`
- `action_cancel`
- `action_reset_to_draft`

## 22. Reports And Filters

Reports:

- purchase request list
- purchase by department
- high-value purchase
- supplier quote comparison
- payment recorded
- partial paid amount
- received goods
- service finalized
- purchase completion
- purchase by related task/project

Filters:

- My department
- My requests
- Waiting for quotes
- Waiting for finance
- Waiting for CEO decision
- Waiting for legal
- Waiting for payment
- Payment recorded
- Waiting for receiving
- Received
- Done
- Returned
- High value
- Below threshold
- Partial amount recorded
- By supplier
- By related task/project

Search by request name, supplier, item name, task/project, department, requester.

## 23. Acceptance Criteria

- Department head can create purchase requirement from task/project.
- Request can contain multiple products/items with image/specification/optional estimated price.
- Purchase manager can enter at least three supplier quotes.
- One supplier quote can contain multiple products.
- System determines whether selected quote exceeds 1,000,000 MNT.
- Below/equal flow goes through finance supplier selection/payment recording and receiving.
- Above flow requires administration/CEO decision/legal contract draft.
- Finance can proceed after CEO decision and contract draft without final signed contract.
- Legal can finalize signed contract asynchronously.
- Finance can record paid amount lower than selected quote total.
- No multiple payment schedule or remaining payment reminder is required.
- Purchase manager can mark goods received or service finalized.
- Purchase status is visible on related task/project.
- Department head sees only own department purchase requests.
- General manager/CEO sees all purchase requests.
- Finance, administration, legal, and purchase manager each see assigned procurement tasks.
- UI is clean, realistic, easy to understand, and visually clear.
- Sensitive access is protected by backend record rules.
- Tests/checks pass or failures are clearly reported.

## 24. Testing Checklist

Safe checks:

- `git status`
- Python syntax check if Odoo Python changed
- XML parse check
- manifest path check
- security CSV reference check
- duplicate XML ID check
- frontend lint/typecheck if frontend changed
- Odoo dev/staging module install/update only if safe

Simple purchase test:

1. Department head creates request from task.
2. Adds multiple product lines and image/specification.
3. Submits request.
4. Purchase manager adds three supplier quotes.
5. Finance selects supplier <= 1,000,000 MNT.
6. Finance records paid amount.
7. Purchase manager receives goods.
8. Request becomes done and related task shows purchase done.

High-value test:

1. Department head creates request.
2. Purchase manager adds three supplier quotes.
3. Selected quote total > 1,000,000 MNT.
4. Request goes to administration/CEO decision.
5. Administration records CEO-selected supplier and uploads CEO order.
6. Legal uploads contract draft.
7. Finance records paid amount.
8. Purchase manager receives goods or finalizes service.
9. Legal uploads final contract later.
10. Request becomes done.

Partial payment test:

1. Selected quote total is 2,000,000 MNT.
2. Finance records paid amount as 1,000,000 MNT.
3. System allows payment recording.
4. System shows partial amount recorded.
5. System allows receiving/finalization.
6. System does not require payment schedule or remaining payment reminder.

Security test:

1. Department head A cannot see Department B request.
2. Worker cannot approve procurement.
3. Finance cannot record CEO decision.
4. Administration cannot mark finance payment recorded.
5. Legal cannot mark finance payment recorded.
6. Purchase manager cannot approve high-value CEO decision.
7. General manager/CEO can see all.
8. Unauthorized user cannot access supplier bank/payment details.
