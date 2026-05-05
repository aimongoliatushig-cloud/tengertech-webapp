---
name: road_area_cleaning_mvp
description: Use this skill when implementing the first simple MVP for road, street, sidewalk, and public area cleaning in the Odoo 19 CE municipal ERP. It guides agents to add or extend cleaning area registration, today's cleaning work generation, employee mobile execution, master review, and approval flows while keeping UI labels in Mongolian Cyrillic and avoiding over-engineered route planning, scoring, or cron automation.
---

# Road / Public Area Cleaning MVP Skill

## 1. Purpose

This skill guides future Codex or AI development agents to implement the first stable MVP of **Зам талбайн цэвэрлэгээ** inside the existing municipal ERP.

The MVP lets a master register a road, street, sidewalk, or public area as a **Цэвэрлэх талбай**, assign an employee, and create today's cleaning work with default work lines. The assigned employee completes the work from mobile/PWA with before/after evidence, and the master reviews, approves, or returns it.

All user-facing UI labels, menu names, statuses, errors, buttons, and report text must be in **Mongolian Cyrillic**.

## 2. Scope

Build a simple practical workflow for:

- Registering a **Цэвэрлэх талбай**.
- Assigning one responsible master and one responsible employee.
- Creating today's cleaning work when a cleaning area is saved with an employee.
- Creating default work lines for that work.
- Showing assigned work only to the assigned employee on mobile/PWA.
- Letting the master see today's works for their responsible cleaning areas.
- Letting the master approve or return completed work.

Primary department:

- `Зам талбайн үйлчилгээний хэлтэс`

Related departments may exist but are not the main MVP target:

- `Хог тээвэр`
- `Ногоон байгууламж`
- `Авто бааз`

## 3. What Not To Build In MVP

Do not build these in the first version:

- Complex route planning.
- Map-based route optimization.
- GPS tracking.
- Full monthly scoring.
- Automatic daily cron generation.
- Advanced KPI penalties.
- Multi-shift assignment optimization.
- Complex team dispatching.
- Fleet or vehicle assignment logic.
- Procurement, warehouse, or finance logic.
- New full dashboard redesign unless needed for a minimal cleaning list.

Prefer a small, stable implementation over a broad unfinished system.

## 4. Main Models

Expected model names:

- `municipal.cleaning.area`
- `municipal.work`
- `municipal.work.line`

Important: inspect the current module first. If the repository already has compatible models such as `municipal.work`, `municipal.work.report`, `project.task`, or an existing work line/report model, reuse or extend the existing model instead of duplicating business objects.

Recommended approach:

1. Search existing Odoo custom addons for cleaning/work/task/report models.
2. Reuse existing security groups where possible.
3. Add only the missing MVP model/fields.
4. Keep model names and XML IDs stable.

## 5. Fields

### `municipal.cleaning.area`

Required MVP fields:

- `name` - Цэвэрлэх талбайн нэр.
- `street_name` - Гудамж / зам.
- `start_point` - Эхлэх цэг.
- `end_point` - Дуусах цэг.
- `area_m2` - Талбай, мкв.
- `department_id` - Хариуцсан алба нэгж.
- `master_id` - Хариуцсан мастер.
- `employee_id` - Хариуцсан ажилтан.
- `frequency` - Давтамж.
- `active` - Идэвхтэй эсэх.
- `note` - Тайлбар.
- `last_work_date` - Сүүлд ажил үүсгэсэн огноо.

Suggested frequency values:

- `daily` - Өдөр бүр
- `weekly` - 7 хоног бүр
- `manual` - Гараар

### Employee work fields

If using `municipal.work`, `project.task`, or another existing work model, map or add equivalent fields:

- `cleaning_area_id`
- `employee_id`
- `master_id`
- `work_date`
- `start_time`
- `end_time`
- `before_image`
- `after_image`
- `employee_note`
- `state`

### Review fields

Add or reuse:

- `review_note`
- `reviewed_by`
- `reviewed_date`
- `review_state`

## 6. Workflow

Basic flow:

1. Master creates or edits a **Цэвэрлэх талбай**.
2. Master assigns an employee.
3. System creates today's cleaning work if one does not already exist for that area and employee.
4. System creates default work lines.
5. Employee opens mobile/PWA and sees only their assigned work.
6. Employee starts work.
7. Employee uploads before/after photos and adds a short note.
8. Employee marks work done.
9. Master reviews submitted work.
10. Master approves or returns it with a reason.
11. Returned work goes back to employee for correction.

Default work lines:

1. `Явган зам цэвэрлэх`
2. `Замын нуух цэвэрлэх`
3. `Хогийн сав шалгах`
4. `Жижиг хог / шарилж / зарын хуудас цэвэрлэх`
5. `Өмнөх зураг оруулах`
6. `Дараах зураг оруулах`

## 7. Access Rules

Reuse existing groups if available. Do not create duplicate role systems.

Minimum access:

- Master:
  - Can create and edit cleaning areas they are responsible for.
  - Can see today's works for their cleaning areas.
  - Can review, approve, and return work.
- Employee:
  - Can see only their own assigned work.
  - Can update execution fields on their own work.
  - Can upload before/after images.
  - Cannot approve their own work.
  - Cannot see other employees' work.
- Manager/Admin:
  - Can see all cleaning areas and cleaning works.
  - Can correct records when needed.

Record rule expectations:

- Employee domain must be scoped to `employee_id` or assigned user/employee relation.
- Master domain must be scoped to `master_id` or responsible department/area.
- Avoid broad state-based rules that leak records across departments.
- Do not expose HR-sensitive data.

## 8. Employee Mobile UI Behavior

Mobile/PWA employee flow must be simple:

- Show `Миний өнөөдрийн ажил`.
- Show cleaning area name and location:
  - Гудамж / зам
  - Эхлэх цэг
  - Дуусах цэг
  - Талбай, мкв
- Show default work lines as a checklist.
- Provide large buttons:
  - `Ажил эхлүүлэх`
  - `Өмнөх зураг оруулах`
  - `Дараах зураг оруулах`
  - `Тайлбар бичих`
  - `Дуусгах`
- Require before/after image if the workflow requires proof.
- Show returned reason if work was returned.
- Allow resubmission after correction.

Keep mobile screens narrow, fast, and low-field. Do not add desktop-only complexity to worker screens.

## 9. Master UI Behavior

Master should have a clean desktop view:

- `Цэвэрлэх талбай` list.
- Create/edit cleaning area form.
- `Өнөөдрийн цэвэрлэгээний ажил` list.
- Filter by:
  - Өнөөдөр
  - Миний хариуцсан
  - Явагдаж байна
  - Дууссан
  - Буцаасан
  - Баталгаажсан
- Open a work record and inspect:
  - assigned employee
  - checklist/work lines
  - before image
  - after image
  - employee note
  - time started/finished

Do not overbuild dashboards in MVP. A simple list and kanban/form view is enough.

## 10. Review / Approval Behavior

Master review actions:

- `Баталгаажуулах`
- `Буцаах`

Approval rules:

- Only master/manager/admin can approve.
- Employee cannot approve their own work.
- Return must require `review_note`.
- On return:
  - state becomes `returned`.
  - employee sees return reason.
  - employee can correct and submit again.
- On approve:
  - state becomes `approved`.
  - `reviewed_by` and `reviewed_date` are set.

## 11. Status Definitions

Required status flow:

- `draft` / `Төлөвлөгдсөн`
- `in_progress` / `Явагдаж байна`
- `done` / `Дууссан`
- `returned` / `Буцаасан`
- `approved` / `Баталгаажсан`

Recommended meaning:

- `draft`: work has been created but not started.
- `in_progress`: employee started the work.
- `done`: employee submitted completed work.
- `returned`: master requested correction.
- `approved`: master accepted the result.

Keep status labels consistent across Odoo views, Next.js UI, reports, filters, and notifications.

## 12. Automation Behavior

MVP automation is save-triggered, not cron-based.

When a cleaning area is created or saved:

- If `employee_id` is set.
- If `active` is true.
- If no work exists for the same `cleaning_area_id`, `employee_id`, and today's date.
- Then create today's work.
- Set `last_work_date` to today.
- Create default work lines.

Do not create duplicate work for the same area/employee/day.

Do not add automatic daily cron in MVP. Leave cron as a future phase.

## 13. Odoo Implementation Notes

Before implementation:

- Inspect existing addons and manifests.
- Inspect existing work/report models.
- Inspect existing security groups and record rules.
- Inspect existing mobile/PWA routes and API calls.
- Confirm whether `municipal.work` and `municipal.work.line` already exist.

Implementation guardrails:

- Do not break `municipal_core`.
- Do not rename existing fields unless absolutely necessary.
- Do not delete existing models, menus, reports, or security rules.
- Reuse existing security groups if available.
- Keep XML IDs stable.
- Keep views clean and simple.
- Add minimal fields and actions needed for the MVP.
- Use `mail.thread` only if existing module conventions use it.
- Add constraints to prevent duplicate same-day work.
- Add clear Odoo validation messages in Mongolian Cyrillic.

Suggested constraint:

- `(cleaning_area_id, employee_id, work_date)` should be unique for active same-day work where technically feasible.

Suggested menus:

- `Зам талбайн цэвэрлэгээ`
- `Цэвэрлэх талбай`
- `Өнөөдрийн ажил`
- `Хяналт`

## 14. Testing Checklist

Static checks:

- Manifest paths exist.
- XML parses.
- Security CSV references valid groups and models.
- No duplicate XML IDs.
- Python syntax compiles.
- TypeScript/lint/build pass if frontend changed:
  - `npm run lint`
  - `npx tsc --noEmit`
  - `npm run build`

Functional checks:

- Master can create a cleaning area.
- Saving a cleaning area with employee creates today's work.
- Saving again does not create duplicate work.
- Default work lines are created.
- Employee sees only their own work on mobile/PWA.
- Employee can start work.
- Employee can upload before image.
- Employee can upload after image.
- Employee can add a short note.
- Employee can submit done work.
- Master sees the submitted work.
- Master can approve.
- Master can return with reason.
- Return without reason is blocked.
- Returned work is visible to employee for correction.
- Other employees cannot see the work.

Do not run production database updates unless the user explicitly requests it and confirms the environment is staging/dev.

## 15. Acceptance Criteria

MVP is acceptable when:

- A cleaning area can be registered with street, start point, end point, area size, department, master, employee, and frequency.
- Today's work is automatically created when an employee is assigned.
- Default work lines are created exactly once for the same day.
- Employee mobile/PWA shows only assigned work.
- Employee can complete the work with before/after evidence and note.
- Master can review, approve, or return the work.
- Returned work requires a reason.
- Status labels display in Mongolian Cyrillic.
- No cross-employee record leak exists.
- No cross-department leak exists for normal users.
- Existing municipal ERP workflows continue to work.

## 16. Future Phases

After MVP is stable, future phases may add:

- Automatic daily cron generation.
- Team assignment.
- Route/map view.
- GPS start/end location.
- Monthly scoring.
- Quality inspection checklist.
- Citizen complaint link to cleaning area.
- Before/after report export.
- KPI dashboard by master, employee, and department.
- Weather-aware cleaning planning.
- Mobile offline queue.
- Push notifications for new/returned/approved cleaning work.

Do not include future-phase logic in the first MVP unless explicitly requested.
