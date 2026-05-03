---
name: hr-manager-no-attendance
description: Implement or review the municipal HR manager module for this Odoo 19 CE plus Next.js PWA repository when work involves employee registry, employee profile, personal file attachments, leave, sick leave, business trip, disciplinary records, employee explanations, orders/contracts, transfers, offboarding, clearance sheets, archive, HR dashboard, HR reports, HR notifications, access rights, or Mongolian HR UI, while explicitly excluding attendance, lateness, absence, check-in/check-out, route-start attendance, attendance devices, attendance KPIs, attendance reports, and automatic attendance-based discipline.
---

# HR Manager Without Attendance

## Core Rule

Implement HR as a personnel records and workflow module, not an attendance module. Do not add menus, fields, KPIs, reports, notifications, automations, or discipline triggers based on daily attendance, lateness, absence, check-in/check-out, QR/location/device attendance, or driver route start time.

Load `references/hr_requirements.md` before implementing a feature, changing access rights, or reviewing acceptance criteria.

## Implementation Order

1. Align Odoo backend models first: employee extensions, leave/sick/trip, discipline, documents, transfer, offboarding, clearance, archive, reports/dashboard helpers.
2. Add security groups, model access, record rules, and menu visibility for HR manager, employee, department head, director/general manager, and IT.
3. Add Odoo workflow actions and validations before exposing frontend actions.
4. Align Next.js types/API calls with actual backend model names. Verify model existence before referencing a model.
5. Build the HR UI around employee profile, lists, forms, checklist views, timeline views, dashboard cards, and reports.
6. Add safe tests/checks for Python import/syntax, XML validity, security CSV references, and Next.js lint/type/build checks where available.

## Required Feature Surface

Include:

- HR dashboard with employee, leave, sick, trip, discipline, transfer, expiring contract, missing attachment, clearance, archive metrics.
- Employee registry and new employee registration.
- Employee profile tabs: core info, job info, leave/sick/trip, discipline, assigned work, orders/contracts, attachments, history.
- Leave, sick leave, and business trip records with Mongolian statuses.
- Discipline workflow with manager explanation, employee explanation, administration review, approval, archive, return, and cancellation.
- Orders, contracts, and attachments stored on employee profile.
- Employee transfers and job changes.
- Offboarding, archive, and clearance sheet checklist.
- PDF/Excel HR reports, search/filter, and HR notifications.

Exclude:

- Attendance menu, lateness/absence menu, daily attendance menu, attendance issue menu.
- Attendance fields on HR profile tabs.
- Attendance KPIs on HR dashboard.
- Attendance reports.
- Attendance notifications.
- Automatic discipline from attendance data.

## Access Boundaries

- HR manager can view and manage all employee HR records but cannot change sensitive finance data or technical system settings.
- Employee can view limited own profile data and respond to own discipline records.
- Department head can view own department employee basics and comment on relevant HR workflows within allowed scope.
- Director/general manager can view HR dashboard, broad HR information, reports, and approve discipline where required.
- IT can manage system access only; IT must not see HR personal files, discipline attachments, contracts, or sensitive HR documents.

## Mongolian UX

Use Mongolian Cyrillic for all user-facing labels, buttons, statuses, validation messages, dashboard text, report names, notifications, and menu names.

Common buttons: `Шинэ ажилтан`, `Хадгалах`, `Илгээх`, `Батлах`, `Буцаах`, `Архивлах`, `Тайлбар авах`, `Хавсралт нэмэх`, `Тайлан татах`.

## Validation

Always enforce or surface:

- Employee surname, name, register number, department, and position are required.
- Register number is unique.
- Hire date cannot be in the future.
- End date cannot be before start date for leave, sick leave, and business trip.
- Sick certificate requirement is configurable.
- Discipline approval requires explanation.
- Return actions require a reason.
- Archiving may require completed clearance sheet.
- Assigning new work to a resigned employee should warn or block according to existing workflow.

## Acceptance Check

Before finishing HR work, confirm the implemented surface still has no attendance, lateness, absence, check-in/check-out, attendance KPI, attendance report, or attendance notification exposure in the HR module.
