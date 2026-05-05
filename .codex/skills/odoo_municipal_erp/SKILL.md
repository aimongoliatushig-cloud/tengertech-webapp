---
name: odoo-municipal-erp
description: Project-specific implementation guardrails for this Odoo 19 CE municipal ERP plus Next.js PWA repository. Use whenever Codex works in this repo on Odoo custom addons, the hr_custom_mn addon, push notifications, municipal workflows, role-based access, mobile reporting, dashboards, or frontend/backend model alignment.
---

# Odoo Municipal ERP Implementation Skill

## Project Context

This repository contains:

- Odoo 19 CE custom addons
- Existing addon: `hr_custom_mn`
- Existing addon: `tengertech_push_notifications`
- Next.js PWA frontend
- Mobile reporting UI
- Push notification API/service worker
- Municipal ERP requirements for:
  - Хог тээвэрлэлт
  - Ногоон байгууламж
  - Тохижилт
  - Авто гараж / засвар
  - Хүний нөөц
  - Ирц / сахилга
  - Санхүү / нярав / агуулах
  - Dashboard
  - Mobile PWA
  - Role-based access rights

All user-facing UI text must be Mongolian Cyrillic, including labels, buttons, menus, statuses, warnings, dashboard text, and mobile messages.

## Project Requirement References

When working on auto-base, fleet repair, vehicle registration, driver assignment, insurance, inspection reminders, garbage-truck daily weight/fuel imports, or procurement links, read `docs/codex/auto-base-user-requirements-addendum.md` before implementation.

## Absolute Safety Rules

1. Never delete existing modules or working logic unless explicitly asked.
2. Never overwrite existing HR custom features.
3. Never break existing push notification logic.
4. Never assume a backend model exists just because the frontend references it.
5. Always verify model existence in Odoo addons before using it.
6. Always keep frontend and backend model names aligned.
7. Never hardcode production credentials, database names, tokens, passwords, or IPs.
8. Never modify `.env` values unless explicitly asked.
9. Never run destructive commands.
10. Never run database migrations or Odoo module upgrades unless explicitly asked.

## Development Branch Rule

Before implementation work:

- Check `git status`.
- Identify the current branch.
- Recommend or create a feature branch only if safe.
- Never commit unless explicitly asked.
- Never push unless explicitly asked.

## Implementation Discipline

Work in small safe phases. Do not implement everything at once.

Preferred order:

1. Backend model alignment
2. Security groups and access rights
3. Record rules
4. Workflow buttons/actions
5. Mobile/API integration
6. Dashboard/KPI
7. Reports
8. Tests
9. Documentation

## Odoo Module Rules

When creating or modifying an Odoo addon:

- Update `__manifest__.py` correctly.
- Add models in `models/__init__.py`.
- Add security groups in security XML.
- Add `ir.model.access.csv` entries.
- Add record rules where needed.
- Add views, actions, and menus.
- Keep XML IDs stable.
- Use `mail.thread` and `mail.activity.mixin` where audit/activity is useful.
- Use `company_id` where multi-company may matter.
- Use `department_id` for department isolation.
- Use `user_id` / `employee_id` for assigned-user filtering.
- Add constraints for dangerous duplicate assignments.

## Required Backend Model Conventions

Use clear model names.

Recommended model namespace:

- `municipal.work`
- `municipal.work.report`
- `municipal.work.type`
- `municipal.work.template`
- `municipal.department.role`
- `municipal.attendance.issue`
- `municipal.discipline`
- `municipal.vehicle.assignment`
- `municipal.route`
- `municipal.route.template`
- `municipal.garbage.point`
- `municipal.repair.request`
- `municipal.complaint`

If the existing project already has equivalent models, extend the existing models instead of duplicating them.

## Existing Frontend Model References

The existing Next.js frontend may reference:

- `project.task`
- `ops.task.report`
- `mfo.route`
- `mfo.stop.execution.line`
- `mfo.proof.image`
- `mfo.issue.report`
- `municipal_field_ops` groups
- `municipal_procurement_workflow` API

Before changing frontend code:

- Inspect backend addon availability.
- Either implement compatible backend models or adjust frontend mapping safely.
- Document what changed.

## Access Rights Rules

Every role must have:

- Odoo security group
- Model access
- Record rules
- Menu visibility
- Clear allowed actions

Important roles:

- Захирал
- Менежер
- Дотоод хяналтын ажилтан
- Хэлтсийн дарга
- Тээвэрлэлтийн хяналтын ажилтан
- Ногоон байгууламжийн инженер
- Зам талбайн ахлах мастер
- Мастер
- Даамал, талбайн инженер
- Жолооч
- Ачигч
- Засварчин
- Механик
- Нярав
- Нягтлан
- HR мэргэжилтэн
- ХАБЭА хяналтын ажилтан

## Mobile PWA Rules

Mobile field users must have very simple flows:

- Today work
- Start work
- Take/upload photo
- Enter quantity
- Enter short note
- Submit report
- See returned report
- Fix and resubmit

Mobile UI must:

- Use large buttons.
- Avoid long forms.
- Be fast on phones.
- Show loading states.
- Show success/error messages.
- Not expose unauthorized menus.

## Workflow Rules

Work workflow must support:

- Draft
- Planned
- Assigned
- Started
- Report Submitted
- Under Review
- Returned
- Approved
- Done
- Cancelled

Report workflow must support:

- Draft
- Submitted
- Under Review
- Returned
- Approved

Returned reports must require a rejection reason.

## Validation Rules

Add backend constraints or safe warnings for:

- Missing required fields
- End date before start date
- Same employee assigned to overlapping work
- Same vehicle assigned to two routes at the same time
- Vehicle in repair assigned to route
- Employee on leave/sick assigned to work
- Required photo missing
- Rejection without reason

## Testing Rules

After each implementation phase, run available safe tests.

Check:

- Python syntax
- Odoo manifest loading
- XML validity
- Security CSV references
- Import errors
- Next.js typecheck/lint/build if available
- No broken frontend imports
- No missing model references in obvious paths

Do not claim tests passed unless they actually ran.

If tests cannot run, clearly explain why.

## Output Rule

For every task, final response must include:

- What changed
- Files changed
- Tests run
- Test result
- Risks
- Next recommended task

## Mongolian UX Rule

All user-facing labels, buttons, menu names, status names, warning messages, and dashboard text must be Mongolian Cyrillic.

Examples:

- Нэмэх
- Хадгалах
- Илгээх
- Батлах
- Буцаах
- Тайлан оруулах
- Ажил эхлүүлэх
- Ажил дуусгах
- Хяналтад
- Буцаагдсан
- Баталгаажсан
- Мэдэгдэл авахыг зөвшөөрнө үү
