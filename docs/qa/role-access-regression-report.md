# Role Access Regression Report

## 1. Executive Summary
- Overall result: PASS
- Number of roles tested: 18
- Number of routes tested: 25
- Number of failures: 0
- Number of warnings: 2
- Lint/build/qa scripts: lint PASS, qa:roles PASS, build PASS

## 2. Test Environment
- Branch / commit SHA: codex/hr-role-access-deploy-fix / fe6c94f
- Node version: v24.14.1
- Next.js mode: dev smoke from existing localhost plus production build verification
- Data mode: live Odoo for scripts/webapp-role-qa.mjs; source-level fixtures for roles without live credentials
- Desktop viewport: 1440x900
- Mobile viewport: 390x844

## 3. Role-by-role Result Matrix
| Role | Desktop menu | Mobile dock | Direct route access | Forbidden pages blocked | Actions/buttons | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| system_admin | PASS | PASS | PASS | PASS | PASS | - |
| director | PASS | PASS | PASS | PASS | PASS | - |
| general_manager | PASS | PASS | PASS | PASS | PASS | - |
| auto_garbage_department_head | PASS | PASS | PASS | PASS | PASS | - |
| unrelated_department_head | PASS | PASS | PASS | PASS | PASS | - |
| mfoManager | PASS | PASS | PASS | PASS | DATA_DEPENDENT | Field/route action assertions need assigned Odoo route data. |
| mfoDispatcher | PASS | PASS | PASS | PASS | DATA_DEPENDENT | Field/route action assertions need assigned Odoo route data. |
| mfoInspector | PASS | PASS | PASS | PASS | DATA_DEPENDENT | Field/route action assertions need assigned Odoo route data. |
| municipalInspector_or_HSE | PASS | PASS | PASS | PASS | PASS | - |
| mfoDriver | PASS | PASS | PASS | PASS | DATA_DEPENDENT | Field/route action assertions need assigned Odoo route data. |
| mfoLoader | PASS | PASS | PASS | PASS | DATA_DEPENDENT | Field/route action assertions need assigned Odoo route data. |
| mfoMobile | PASS | PASS | PASS | PASS | DATA_DEPENDENT | Field/route action assertions need assigned Odoo route data. |
| normal_worker | PASS | PASS | PASS | PASS | PASS | - |
| fleetRepairMechanic | PASS | PASS | PASS | PASS | PASS | - |
| fleetRepairTeamLeader | PASS | PASS | PASS | PASS | PASS | - |
| fleetRepairManager | PASS | PASS | PASS | PASS | PASS | - |
| procurement_storekeeper_or_finance | PASS | PASS | PASS | PASS | PASS | - |
| HR_only_user | PASS | PASS | PASS | PASS | PASS | - |

## 4. Detailed Failures
No failures.

## 5. Warnings
- Low: general_manager live login - Live QA account skipped: invalid.
- Low: field execution roles /field - Proof upload, stop arrived/done/skipped, issue creation, and shift submission require assigned Odoo route data; marked data-dependent.

## 6. Final Role Menu Matrix
| Role | Visible desktop menu items | Visible mobile dock items | Allowed direct routes | Blocked direct routes | Notes |
| --- | --- | --- | --- | --- | --- |
| system_admin | Хяналтын самбар, Хүний нөөц, Засварын хүсэлт, Календарь, Баримт бичиг, Авто бааз, Хог тээвэрлэлтийн тохиргоо, Худалдан авалт, Тайлан, Чат, Тусламж, Мэдэгдэл | Нүүр, Ажлууд, Шинэ ажил, Худалдан, Тайлан | /, /tasks, /tasks?view=today, /projects, /create, /reports, /review, /notifications, /field, /auto-base, /settings/garbage-transport, /settings/garbage-transport#vehicles, /settings/garbage-transport#routes, /settings/garbage-transport#points, /garbage-routes/weekly-plan, /garbage-routes/today, /garbage-routes/inspections, /garbage-routes/dashboard, /fleet-repair/requests, /procurement/dashboard, /hr, /chat, /help, /profile |  | - |
| director | Хяналтын самбар, Хүний нөөц, Календарь, Баримт бичиг, Авто бааз, Худалдан авалт, Тайлан, Чат, Тусламж, Мэдэгдэл | Нүүр, Ажлууд, Шинэ ажил, Худалдан, Тайлан | /, /tasks, /tasks?view=today, /projects, /create, /reports, /review, /notifications, /auto-base, /garbage-routes/today, /garbage-routes/inspections, /garbage-routes/dashboard, /fleet-repair/requests, /procurement/dashboard, /hr, /chat, /help, /profile | /field, /settings/garbage-transport, /settings/garbage-transport#vehicles, /settings/garbage-transport#routes, /settings/garbage-transport#points, /garbage-routes/weekly-plan | - |
| general_manager | Хяналтын самбар, Хүний нөөц, Календарь, Баримт бичиг, Авто бааз, Худалдан авалт, Тайлан, Чат, Тусламж, Мэдэгдэл | Нүүр, Ажлууд, Шинэ ажил, Худалдан, Тайлан | /, /tasks, /tasks?view=today, /projects, /create, /reports, /review, /notifications, /auto-base, /garbage-routes/today, /garbage-routes/inspections, /garbage-routes/dashboard, /fleet-repair/requests, /procurement/dashboard, /hr, /chat, /help, /profile | /field, /settings/garbage-transport, /settings/garbage-transport#vehicles, /settings/garbage-transport#routes, /settings/garbage-transport#points, /garbage-routes/weekly-plan | - |
| auto_garbage_department_head | Хяналтын самбар, Ажил, Ажлын даалгавар, Багууд, Машин, Хог тээврийн маршрут, Маршрут, Хогийн цэгүүд, Тайлан, Хог тээвэрлэлтийн тохиргоо | Самбар, Ажил, Тайлан, Тохиргоо | /, /tasks, /tasks?view=today, /projects, /create, /reports, /review, /notifications, /settings/garbage-transport, /settings/garbage-transport#vehicles, /settings/garbage-transport#routes, /settings/garbage-transport#points, /garbage-routes/weekly-plan, /garbage-routes/today, /garbage-routes/inspections, /garbage-routes/dashboard, /fleet-repair/requests, /hr, /chat, /help, /profile | /field, /auto-base, /procurement/dashboard | - |
| unrelated_department_head | Хяналтын самбар, Хүний нөөц, Календарь, Баримт бичиг, Тайлан, Чат, Тусламж, Мэдэгдэл | Нүүр, Ажлууд, Шинэ ажил, Тайлан | /, /tasks, /tasks?view=today, /projects, /create, /reports, /review, /notifications, /fleet-repair/requests, /hr, /chat, /help, /profile | /field, /auto-base, /settings/garbage-transport, /settings/garbage-transport#vehicles, /settings/garbage-transport#routes, /settings/garbage-transport#points, /garbage-routes/weekly-plan, /garbage-routes/today, /garbage-routes/inspections, /garbage-routes/dashboard, /procurement/dashboard | - |
| mfoManager | Хяналтын самбар, Календарь, Баримт бичиг, Хог тээвэрлэлтийн тохиргоо, Тайлан, Чат, Тусламж, Мэдэгдэл | Нүүр, Ажлууд, Шинэ ажил, Тайлан | /, /tasks, /tasks?view=today, /projects, /reports, /review, /notifications, /settings/garbage-transport, /settings/garbage-transport#vehicles, /settings/garbage-transport#routes, /settings/garbage-transport#points, /garbage-routes/weekly-plan, /garbage-routes/today, /garbage-routes/inspections, /garbage-routes/dashboard, /fleet-repair/requests, /chat, /help, /profile | /create, /field, /auto-base, /procurement/dashboard, /hr | Field/route action assertions need assigned Odoo route data. |
| mfoDispatcher | Хяналтын самбар, Календарь, Баримт бичиг, Хог тээвэрлэлтийн тохиргоо, Тайлан, Чат, Тусламж, Мэдэгдэл | Нүүр, Ажлууд, Шинэ ажил, Тайлан | /, /tasks, /tasks?view=today, /projects, /reports, /review, /notifications, /settings/garbage-transport, /settings/garbage-transport#vehicles, /settings/garbage-transport#routes, /settings/garbage-transport#points, /garbage-routes/weekly-plan, /garbage-routes/today, /garbage-routes/inspections, /garbage-routes/dashboard, /fleet-repair/requests, /chat, /help, /profile | /create, /field, /auto-base, /procurement/dashboard, /hr | Field/route action assertions need assigned Odoo route data. |
| mfoInspector | Ажлын самбар, Миний машин, Миний ажил, Ажил нэмэх, Мэдэгдэл | Нүүр, Ажлууд, Шинэ ажил, Тайлан | /, /tasks, /tasks?view=today, /projects, /create, /reports, /review, /notifications, /garbage-routes/today, /garbage-routes/inspections, /garbage-routes/dashboard, /fleet-repair/requests, /chat, /help, /profile | /field, /auto-base, /settings/garbage-transport, /settings/garbage-transport#vehicles, /settings/garbage-transport#routes, /settings/garbage-transport#points, /garbage-routes/weekly-plan, /procurement/dashboard, /hr | Field/route action assertions need assigned Odoo route data. |
| municipalInspector_or_HSE | Хяналтын самбар, Календарь, Баримт бичиг, Тайлан, Чат, Тусламж, Мэдэгдэл | Нүүр, Ажлууд, Шинэ ажил, Тайлан | /, /tasks, /tasks?view=today, /projects, /reports, /review, /notifications, /garbage-routes/today, /garbage-routes/inspections, /garbage-routes/dashboard, /chat, /help, /profile | /create, /field, /auto-base, /settings/garbage-transport, /settings/garbage-transport#vehicles, /settings/garbage-transport#routes, /settings/garbage-transport#points, /garbage-routes/weekly-plan, /fleet-repair/requests, /procurement/dashboard, /hr | - |
| mfoDriver | Хяналтын самбар, Баримт бичиг, Чат, Тусламж, Мэдэгдэл | Нүүр, Ажил, Чат, Мэдэгдэл, Профайл | /, /tasks, /tasks?view=today, /projects, /reports, /notifications, /field, /garbage-routes/today, /chat, /help, /profile | /create, /review, /auto-base, /settings/garbage-transport, /settings/garbage-transport#vehicles, /settings/garbage-transport#routes, /settings/garbage-transport#points, /garbage-routes/weekly-plan, /garbage-routes/inspections, /garbage-routes/dashboard, /fleet-repair/requests, /procurement/dashboard, /hr | Field/route action assertions need assigned Odoo route data. |
| mfoLoader | Хяналтын самбар, Баримт бичиг, Чат, Тусламж, Мэдэгдэл | Нүүр, Ажил, Чат, Мэдэгдэл, Профайл | /, /tasks, /tasks?view=today, /projects, /reports, /notifications, /field, /garbage-routes/today, /chat, /help, /profile | /create, /review, /auto-base, /settings/garbage-transport, /settings/garbage-transport#vehicles, /settings/garbage-transport#routes, /settings/garbage-transport#points, /garbage-routes/weekly-plan, /garbage-routes/inspections, /garbage-routes/dashboard, /fleet-repair/requests, /procurement/dashboard, /hr | Field/route action assertions need assigned Odoo route data. |
| mfoMobile | Хяналтын самбар, Баримт бичиг, Чат, Тусламж, Мэдэгдэл | Нүүр, Ажил, Чат, Мэдэгдэл, Профайл | /, /tasks, /tasks?view=today, /projects, /reports, /notifications, /field, /garbage-routes/today, /chat, /help, /profile | /create, /review, /auto-base, /settings/garbage-transport, /settings/garbage-transport#vehicles, /settings/garbage-transport#routes, /settings/garbage-transport#points, /garbage-routes/weekly-plan, /garbage-routes/inspections, /garbage-routes/dashboard, /fleet-repair/requests, /procurement/dashboard, /hr | Field/route action assertions need assigned Odoo route data. |
| normal_worker | Хяналтын самбар, Баримт бичиг, Чат, Тусламж, Мэдэгдэл | Нүүр, Ажил, Чат, Мэдэгдэл, Профайл | /, /tasks, /tasks?view=today, /projects, /reports, /notifications, /chat, /help, /profile | /create, /review, /field, /auto-base, /settings/garbage-transport, /settings/garbage-transport#vehicles, /settings/garbage-transport#routes, /settings/garbage-transport#points, /garbage-routes/weekly-plan, /garbage-routes/today, /garbage-routes/inspections, /garbage-routes/dashboard, /fleet-repair/requests, /procurement/dashboard, /hr | - |
| fleetRepairMechanic | Хяналтын самбар, Засварын хүсэлт, Баримт бичиг, Чат, Тусламж, Мэдэгдэл | Нүүр, Ажил, Чат, Мэдэгдэл, Профайл | /, /tasks, /tasks?view=today, /projects, /reports, /notifications, /field, /fleet-repair/requests, /chat, /help, /profile | /create, /review, /auto-base, /settings/garbage-transport, /settings/garbage-transport#vehicles, /settings/garbage-transport#routes, /settings/garbage-transport#points, /garbage-routes/weekly-plan, /garbage-routes/today, /garbage-routes/inspections, /garbage-routes/dashboard, /procurement/dashboard, /hr | - |
| fleetRepairTeamLeader | Хяналтын самбар, Засварын хүсэлт, Календарь, Баримт бичиг, Тайлан, Чат, Тусламж, Мэдэгдэл | Нүүр, Ажлууд, Шинэ ажил, Тайлан | /, /tasks, /tasks?view=today, /projects, /reports, /review, /notifications, /field, /fleet-repair/requests, /chat, /help, /profile | /create, /auto-base, /settings/garbage-transport, /settings/garbage-transport#vehicles, /settings/garbage-transport#routes, /settings/garbage-transport#points, /garbage-routes/weekly-plan, /garbage-routes/today, /garbage-routes/inspections, /garbage-routes/dashboard, /procurement/dashboard, /hr | - |
| fleetRepairManager | Хяналтын самбар, Засварын хүсэлт, Календарь, Баримт бичиг, Худалдан авалт, Тайлан, Чат, Тусламж, Мэдэгдэл | Нүүр, Ажлууд, Шинэ ажил, Худалдан, Тайлан | /, /tasks, /tasks?view=today, /projects, /reports, /review, /notifications, /fleet-repair/requests, /procurement/dashboard, /chat, /help, /profile | /create, /field, /auto-base, /settings/garbage-transport, /settings/garbage-transport#vehicles, /settings/garbage-transport#routes, /settings/garbage-transport#points, /garbage-routes/weekly-plan, /garbage-routes/today, /garbage-routes/inspections, /garbage-routes/dashboard, /hr | - |
| procurement_storekeeper_or_finance | Хяналтын самбар, Баримт бичиг, Худалдан авалт, Чат, Тусламж, Мэдэгдэл | Нүүр, Ажил, Чат, Мэдэгдэл, Профайл | /, /tasks, /tasks?view=today, /projects, /reports, /notifications, /fleet-repair/requests, /procurement/dashboard, /chat, /help, /profile | /create, /review, /field, /auto-base, /settings/garbage-transport, /settings/garbage-transport#vehicles, /settings/garbage-transport#routes, /settings/garbage-transport#points, /garbage-routes/weekly-plan, /garbage-routes/today, /garbage-routes/inspections, /garbage-routes/dashboard, /hr | - |
| HR_only_user | Хүний нөөц, Профайл | HR, Профайл | /, /tasks, /tasks?view=today, /projects, /reports, /notifications, /hr, /chat, /help, /profile | /create, /review, /field, /auto-base, /settings/garbage-transport, /settings/garbage-transport#vehicles, /settings/garbage-transport#routes, /settings/garbage-transport#points, /garbage-routes/weekly-plan, /garbage-routes/today, /garbage-routes/inspections, /garbage-routes/dashboard, /fleet-repair/requests, /procurement/dashboard | - |

## 7. Final Conclusion
- Ready for production: YES, with live-data warnings reviewed
- Biggest remaining risk: Assigned Odoo route action data is not available for every mobile execution fixture, so proof upload and stop action assertions remain data-dependent.
- Exact files likely needing follow-up: app/field/page.tsx only if live assigned-route data reveals action-level issues.

PASS
