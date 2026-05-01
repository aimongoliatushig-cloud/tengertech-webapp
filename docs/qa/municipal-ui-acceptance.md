# Municipal UI Acceptance Guide

This guide is for UI reviewers validating the municipal ERP web app and mobile-friendly screens. It covers visual and flow acceptance only. Backend security, Odoo record rules, and business workflow fixes belong to the separate security/access branch.

## Review Setup

- Test desktop at 1440x960 or similar.
- Test mobile at 390x844 or similar.
- Use real Odoo role accounts when available.
- Confirm the app renders Mongolian Cyrillic text without mojibake.
- Confirm the side menu on desktop and bottom navigation on mobile are stable for the current role.
- Capture a screenshot for each flow and store new evidence under `docs/qa-assets/` when a reviewer needs a visual reference.
- Use only test or staging data; do not store credentials, production data, or private citizen/employee information in screenshots.

## Reference Assets

| Asset | Purpose |
|---|---|
| `docs/qa-assets/desktop-dashboard-preview.png` | Desktop dashboard visual reference |
| `docs/qa-assets/mobile-dashboard-preview.png` | Mobile dashboard visual reference |
| `docs/qa-assets/municipal-design-board-showcase.png` | Full design board / mockup reference |
| `docs/qa-assets/mobile-worker-assigned.png` | Mobile worker assigned-work evidence |
| `docs/qa-assets/manager-tohijilt-desktop.png` | Department manager desktop evidence |
| `docs/qa-assets/inspector-master-desktop.png` | Inspector/master desktop evidence |
| `docs/qa-assets/hr-dashboard-desktop.png` | HR desktop evidence |
| `docs/qa-assets/hr-dashboard-mobile.png` | HR mobile evidence |
| `docs/qa-assets/garbage-route-today-desktop.png` | Garbage route today-view evidence |
| `docs/qa-assets/garbage-route-weekly-plan-mobile.png` | Garbage route weekly-plan mobile evidence |
| `docs/qa-assets/repair-requests-list.png` | Repair request list evidence |
| `docs/qa-assets/repair-request-detail.png` | Repair request detail evidence |
| `docs/qa-assets/role-ui-summary.json` | Role UI smoke summary |
| `docs/qa-assets/permission-matrix.json` | Permission matrix reference |

## Mobile Worker Flow

Expected audience: driver, loader, field worker, helper worker, master-assigned mobile user.

Acceptance checklist:

- [ ] User can log in and lands on a worker-appropriate dashboard.
- [ ] Mobile bottom navigation is visible, large enough to tap, and does not overlap page content.
- [ ] User can open "My work" or today's assigned work from dashboard/navigation.
- [ ] Today's assigned route or task is visible with status, location, vehicle/route context where applicable.
- [ ] User can start work with a clear primary action.
- [ ] User can upload or capture a photo from the phone camera.
- [ ] User can enter quantity or completion value when the task requires it.
- [ ] User can write a short note without a long desktop-style form.
- [ ] User can submit the report for review.
- [ ] Returned work/report is clearly marked and can be edited/resubmitted.
- [ ] Empty state is clear when no work is assigned.
- [ ] Error and success messages are visible in Mongolian.

Evidence:

- `docs/qa-assets/mobile-worker-assigned.png`
- `docs/qa-assets/role-ui-summary.json`

Fail conditions:

- Worker can see unrelated people or other departments' records.
- Form fields are too dense for mobile use.
- Buttons overlap, truncate badly, or become too small to tap.
- Photo upload accepts no file or silently fails.

## Department Manager Flow

Expected audience: department head, manager, senior master.

Acceptance checklist:

- [ ] Dashboard shows department-focused KPIs and urgent/review items.
- [ ] User can open department work list.
- [ ] User can create a work item only if the role is allowed.
- [ ] User can assign an employee or team where the UI exposes assignment controls.
- [ ] Today, overdue, returned, and review queues are discoverable.
- [ ] User can open a task detail page and see progress, reports, photos, and notes.
- [ ] User can approve or return a submitted report with a visible reason field.
- [ ] Returned action requires a reason in the UI.
- [ ] Department report page filters to the correct department scope.
- [ ] Desktop sidebar remains consistent across dashboard, work, tasks, reports, and review pages.

Evidence:

- `docs/qa-assets/manager-tohijilt-desktop.png`
- `docs/qa-assets/permission-matrix.json`

Fail conditions:

- Manager sees unrelated departments without executive/admin permission.
- Approve/return controls appear for roles that should not review.
- Returned state is not visible after rejection.

## Inspector Flow

Expected audience: internal inspector, route inspector, quality/control user.

Acceptance checklist:

- [ ] Inspector dashboard or review page shows only assigned or permitted review items.
- [ ] Inspector can open route/report evidence and see proof photos.
- [ ] Inspector can create or view an issue/violation report where the route UI supports it.
- [ ] Inspector can return an item for correction with a reason.
- [ ] Inspector can approve or verify route execution only where permitted.
- [ ] Review queue distinguishes submitted, returned, overdue, and verified items.
- [ ] Photo evidence is visible with before/after or completion context when available.

Evidence:

- `docs/qa-assets/inspector-master-desktop.png`
- `docs/qa-assets/permission-matrix.json`

Fail conditions:

- Inspector sees all departments by default.
- Issue creation has no title/description validation.
- Photo evidence area is missing for route/stop review.

## HR Flow

Expected audience: HR specialist, HR manager, HR officer.

Acceptance checklist:

- [ ] HR dashboard opens without timeout or error page.
- [ ] Employee directory is visible with search/filter-friendly layout.
- [ ] User can open employee profile and see core profile details.
- [ ] Leave, sick, trip, transfer, clearance, and archive sections are discoverable.
- [ ] Attendance issue page supports late, absent, leave, sick, trip, and annual leave states.
- [ ] Repeated attendance/discipline risk is visible where data exists.
- [ ] Employee explanation flow is understandable and not mixed with manager-only actions.
- [ ] HR approval/archive status is visible.
- [ ] Sensitive discipline/attendance views are not exposed to unrelated worker roles.

Evidence:

- `docs/qa-assets/hr-dashboard-desktop.png`
- `docs/qa-assets/hr-dashboard-mobile.png`

Fail conditions:

- HR page shows Next.js application error or times out in normal use.
- Worker users can browse HR discipline records for other employees.
- Mongolian labels are broken or unreadable.

## Garbage Route Flow

Expected audience: dispatcher, transport inspector, driver, loader team, route manager.

Acceptance checklist:

- [ ] Garbage route dashboard opens and shows daily/weekly route context.
- [ ] Weekly plan/template screen shows Monday-Sunday planning clearly.
- [ ] Daily route screen shows route, vehicle, driver, inspector, crew/team, and stop count.
- [ ] Driver/mobile user can start route or shift where allowed.
- [ ] Stop list shows arrival/done/skipped states.
- [ ] Each stop supports proof photo upload from mobile.
- [ ] Issue report can be created from a stop with type, severity, title, and description.
- [ ] Route can be submitted for inspector review.
- [ ] Inspector review can verify/return route execution.
- [ ] Missing proof photo or skipped-without-reason state is visible as a quality warning.

Evidence:

- `docs/qa-assets/garbage-route-today-desktop.png`
- `docs/qa-assets/garbage-route-weekly-plan-mobile.png`

Fail conditions:

- Route screen hides assigned route from the assigned mobile user.
- Weekly board is unreadable on mobile.
- Vehicle/driver/team details are missing from route context.

## Repair Flow

Expected audience: mechanic, repair team lead, storekeeper, finance, director/approver.

Acceptance checklist:

- [ ] Repair request list opens for permitted repair roles.
- [ ] New repair request screen clearly asks for vehicle and issue description.
- [ ] Vehicle detail or repair detail shows current repair state.
- [ ] Mechanic can record diagnosis where permitted.
- [ ] Parts request section is visible when parts are needed.
- [ ] Storekeeper/material issue step is distinguishable from mechanic diagnosis.
- [ ] Finance/director approval states are visible for high-value requests.
- [ ] Vehicle in repair is visually distinct from active/available vehicles.
- [ ] Repair completion and vehicle return states are visible.
- [ ] Error/success feedback is visible after workflow actions.

Evidence:

- `docs/qa-assets/repair-requests-list.png`
- `docs/qa-assets/repair-request-detail.png`

Fail conditions:

- Repair page exposes finance/director actions to non-approver users.
- Vehicle status is ambiguous after start repair or return vehicle.
- Attachment upload areas accept wrong evidence without clear label.

## Reviewer Sign-Off Template

Use this table in the PR or QA note after running the checks.

| Flow | Desktop result | Mobile result | Screenshot evidence | Notes |
|---|---|---|---|---|
| Mobile worker | Pending | Pending |  |  |
| Department manager | Pending | Pending |  |  |
| Inspector | Pending | Pending |  |  |
| HR | Pending | Pending |  |  |
| Garbage route | Pending | Pending |  |  |
| Repair | Pending | Pending |  |  |

## Branch PR Checklist

- [ ] Mobile worker flow documented.
- [ ] Manager, inspector, HR, garbage, and repair flows documented.
- [ ] Screenshots and mockups are stored under `docs/qa-assets/`.
- [ ] No Odoo security or model files changed.
- [ ] No frontend business logic changed.
- [ ] `npm run lint`, `npx tsc --noEmit`, and `npm run build` pass.

## Out Of Scope For This Branch

- Odoo security group changes.
- Odoo record rule changes.
- Backend model or workflow changes.
- Frontend business logic or API route changes.
- Push notification implementation.
- Production deployment or database update.
