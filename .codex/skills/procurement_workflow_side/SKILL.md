---
name: procurement-workflow-side
description: Implement and review the municipal ERP purchase/procurement workflow in Odoo + Next.js PWA. Use for purchase requirements from project/task, department head requests, purchase manager quote collection, three supplier quotes, 1,000,000 MNT threshold routing, finance payment recording, administration/CEO decision, legal contract draft/final contract, receiving/service finalization, procurement dashboards, role-based access, Odoo models/security/views, and procurement UI.
---

# Procurement Workflow Side Skill

## Core Rule

Use this skill for all procurement, purchase, supplier quote, finance payment, CEO approval, legal contract, and receiving/finalization work in this municipal ERP repo.

Before implementation work, read:

- `references/procurement_requirements.md` for the full business workflow, roles, states, validations, model guidance, acceptance criteria, and test checklist.

## Development Order

1. Inspect existing Odoo modules and custom addons first.
2. Reuse Odoo standard models where possible: `purchase`, `stock`, `account`, `project`, `hr`, `res.partner`, `product.product`.
3. If a custom procurement module already exists, extend it safely instead of duplicating models.
4. Produce a short implementation plan before changing code unless the user asked for a tiny fix.
5. Add or extend models, fields, security groups, record rules, workflow actions, views, menus, and dashboards in that order.
6. Update the Next.js procurement UI only after the backend contract is understood.
7. Add validations and safe checks.
8. Report results in Mongolian.

## Branch And Collaboration

Recommended branch:

```bash
git fetch origin
git switch codex/staging-odoo-smoke-fixes
git pull --ff-only origin codex/staging-odoo-smoke-fixes
git switch -c codex/procurement-workflow-v2
```

Before editing:

```bash
git status
git fetch origin
```

Do not push directly to `main`. Preserve unrelated user changes. Do not overwrite task/report/dashboard work from parallel development.

## Allowed Scope

Prefer changes in:

- `app/procurement/**`
- procurement-specific API routes and server actions
- procurement dashboard/report UI
- `lib/procurement.ts` and narrowly scoped procurement helpers
- procurement Odoo addon files
- procurement security groups, access CSV, record rules, menus, and views
- warehouse/material flow files only when they belong to procurement approval, receipt, or issue workflow

Avoid unrelated edits unless the user explicitly asks:

- `app/projects/**`
- `app/tasks/**`
- `app/field/**`
- `app/dashboard-view.tsx`
- `app/api/tasks/**`
- `app/api/workspace-report/**`
- `lib/workspace.ts`
- `lib/official-task-report.ts`
- task/report/progress calculation logic

If project/task visibility must show procurement status, make the smallest possible integration and document it.

## Business Invariants

- Every procurement request must remain connected to the originating project/task when one exists.
- A request can contain multiple item lines.
- Product master data is optional at request time; allow free-text item/specification.
- Supplier/vendor data should use `res.partner` where possible.
- Normal purchase flow requires at least three supplier quotes before supplier selection.
- Threshold logic is based on the selected supplier quote total.
- `requires_high_value_approval = selected_quote_amount > 1000000`.
- Below/equal 1,000,000 MNT: finance can select supplier and record payment.
- Above 1,000,000 MNT: administration records CEO-selected supplier and CEO order, legal uploads contract draft, then finance can record payment.
- Final signed contract is tracked asynchronously and must not block payment or receiving in this version.
- Payment is simple: one recorded paid amount, no payment schedule, no remaining-balance workflow.
- Paid amount may be lower than selected quote total and must not block completion.
- Completion requires payment recorded and goods received or service finalized.

## Internal Naming And UI Text

- Use English role keys internally: `department_head`, `purchase_manager`, `finance_user`, `administration_user`, `ceo`, `legal_user`, `general_manager`, `storekeeper`.
- Keep technical fields, state codes, XML IDs, and method names in English.
- Keep user-facing UI labels Mongolian Cyrillic by default.
- Centralize labels where practical so Mongolian terminology can change later.
- Do not hardcode final role terminology deeply into logic.

## Do Not Implement In This Version

- Multiple payment schedules
- Payment reminder dates
- Automatic remaining balance reminders
- Advanced accounting reconciliation
- QR code flow
- Production database migrations without explicit approval
- Production deployment

## Validation Priorities

Enforce:

- Cannot submit without at least one item line.
- Cannot move to finance review without supplier quotes.
- At least three quotes should exist before selection.
- Selected supplier quote must exist before payment.
- High-value payment requires CEO-selected quote, CEO order attachment, and contract draft.
- Finance cannot record payment without paid amount.
- Supplier bank account is required unless an exception note exists.
- Return/rejection requires reason.
- Unauthorized roles cannot act outside their stage.
- Department heads cannot see other departments' requests.
- Request creator cannot approve their own finance/CEO/legal stages unless explicitly allowed by another assigned role.

## Test Plan

For frontend changes, run when feasible:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

For Odoo changes, run safe static checks if available:

- Python syntax check
- XML parse check
- manifest data path check
- security CSV reference check
- duplicate XML ID check

Run Odoo install/update only on a confirmed dev/staging database with backup, never production.

## Final Report Format

After implementation, answer in Mongolian using this structure when the task is substantial:

```markdown
# Procurement / Purchase Workflow Implementation Report

## 1. Юу хийсэн
## 2. Ямар existing module/model ашигласан
## 3. Ямар model нэмсэн/өргөтгөсөн
## 4. Ямар workflow нэмсэн
## 5. Project/task-тай хэрхэн холбосон
## 6. 1 саяас доош workflow хэрхэн ажиллаж байна
## 7. 1 саяас дээш workflow хэрхэн ажиллаж байна
## 8. 3 supplier quote logic хэрхэн ажиллаж байна
## 9. CEO decision / administration paperwork flow
## 10. Legal contract draft/final contract flow
## 11. Finance payment recording flow
## 12. Partial payment буюу paid amount logic
## 13. Receiving/service finalization flow
## 14. Dashboard/task visibility by role
## 15. Access rights / record rules
## 16. UI/UX сайжруулалт
## 17. Ямар файл өөрчилсөн
## 18. Ямар test/check ажиллуулсан
## 19. Test result
## 20. Үлдсэн эрсдэл
## 21. Дараагийн алхам
```

Do not claim tests passed unless they actually ran.
