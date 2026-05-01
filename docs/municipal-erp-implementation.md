# Municipal ERP Implementation Notes

## Modules

- `municipal_core`: work, report, work type, attendance issue, discipline, HR activity metrics.
- `municipal_field_ops`: mobile/task compatibility, garbage route, execution, stop, proof, issue models.
- `municipal_repair_workflow`: fleet repair request, repair part line, minimal procurement request, vehicle operational status.
- `municipal_public_services`: citizen complaint, QR token/url support, audit log, dashboard data helpers, report menus.

## Core Models

- `municipal.work`
- `municipal.work.report`
- `municipal.attendance.issue`
- `municipal.discipline`
- `mfo.route`, `mfo.route.execution`, `mfo.stop.execution.line`
- `municipal.repair.request`, `municipal.repair.part.line`
- `municipal.procurement.request`
- `municipal.complaint`
- `municipal.audit.log`
- `municipal.dashboard.snapshot`

## Roles

- Municipal core groups cover director, manager, department head, inspector, master, worker, HR, admin, IT.
- Field ops groups cover manager, dispatcher, inspector, mobile user.
- Repair groups cover repair manager, team lead, mechanic, storekeeper, finance, director approval.
- Complaint records are visible to assigned users, department heads for their department, and managers/directors/admins.

## Workflows

- Work: draft, planned, assigned, started, report submitted, under review, returned, approved, done, cancelled.
- Report: draft, submitted, under review, returned, approved.
- Route execution: draft, planned, dispatched, in progress, submitted, verified, delayed, cancelled.
- Repair: new, diagnosed, waiting parts, waiting approval, approved, in repair, done, vehicle returned, cancelled.
- Complaint: new, assigned, in progress, resolved, rejected, cancelled.

## Mobile Flow

- Existing frontend references are supported through `project.task`, `ops.task.report`, and `mfo.*` compatibility models.
- Mobile report submission can create compatible operational reports and link to `municipal.work.report` when a municipal work exists.
- Starting field work can mark attendance as present through the backend bridge.

## Dashboard Flow

- `municipal.dashboard.snapshot` exposes backend helper methods for management, department, inspector, and repair dashboard metrics.
- HR dashboard data is extended through `hr_custom_mn` with municipal attendance/discipline summary payload.
- Frontend dashboard UI was not rewritten in these backend phases.

## Reports

- Backend action menus exist for daily work, department work, garbage route, green area placeholder, improvement placeholder, repair, overdue work, and photo reports.
- HR attendance/discipline/activity report menus exist through Phase 3 backend actions.
- PDF/Excel rendering beyond existing `hr_custom_mn` exports remains a later hardening task.

## QR Support

- QR support stores token/url only; it does not generate QR images.
- QR URLs avoid embedding private record details and use opaque tokens.
- Supported objects: work, vehicle, route, garbage point, repair request, complaint.

## Audit Notes

- Odoo chatter remains active on operational models.
- `municipal.audit.log` records important state changes for work, reports, attendance, discipline, route execution, repair, and complaint.
- The audit model is read-only for managers/directors/IT, with admin create access for system use.

## Testing Notes

- Safe checks used in development: Python syntax, XML parse, manifest data references, security CSV references, static XML button/menu checks, Odoo namespace imports, Next.js lint/typecheck, browser smoke checks.
- Odoo module install/update was not run because production DB changes are not allowed without explicit approval.

## Remaining Risks

- Odoo dev DB install/update is still required before production deployment.
- Record rules should be validated with real user/employee/department data.
- Full PDF/Excel operational reports need business-specific layout approval.
- Public citizen-facing form/API is not exposed yet; only backend complaint handling exists.
- QR image generation requires adding and approving a QR generation dependency or report template.

## Production Deploy Checklist

- Confirm target is a safe dev/staging DB first.
- Add all custom addons to Odoo `addons_path`.
- Install/update modules in order: `municipal_core`, `municipal_field_ops`, `municipal_repair_workflow`, `municipal_public_services`.
- Verify groups and assign real users.
- Validate record rules by role.
- Test mobile report submission, returned report resubmission, repair state changes, complaint-to-work flow, and dashboard RPC helpers.
- Run frontend lint/typecheck/build.
- Review `.env` values manually; do not change credentials from automated tooling.
- Back up database before production update.
