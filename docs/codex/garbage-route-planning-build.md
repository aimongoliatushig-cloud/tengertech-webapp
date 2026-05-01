# Garbage Collection Route Planning + Daily Execution Build Instruction

## Goal

Build a production-ready frontend module in the existing Next.js web app for garbage collection route planning and daily execution. The module connects to existing Odoo 19 backend/custom modules through server-side JSON-RPC API routes. All UI must be in Mongolian Cyrillic.

This feature is not settings CRUD. Do not rebuild settings for машин, жолооч, хог ачигч, баг, хогийн цэг, дүүрэг/хороо, маршрутын үндсэн өгөгдөл.

## Architecture

```txt
Next.js Frontend
↓
Next.js API Routes
↓
Odoo JSON-RPC
↓
Existing Odoo Custom Garbage/Fleet Module
```

Do not call Odoo directly from client components. All Odoo calls must go through server-side API routes and use the existing Odoo shared session.

## Main Menu And Routes

Menu: `Хог тээврийн маршрут`

Routes:

- `/garbage-routes`
- `/garbage-routes/weekly-plan`
- `/garbage-routes/weekly-plan/new`
- `/garbage-routes/weekly-plan/[id]`
- `/garbage-routes/today`
- `/garbage-routes/execution/[id]`
- `/garbage-routes/inspections`
- `/garbage-routes/dashboard`

## Roles

- `Хэлтсийн дарга`: долоо хоногийн төлөвлөгөө, машин/жолооч/2 ачигч оноох, өнөөдрийн маршрут өөрчлөх, өөрчлөлтийн шалтгаан бүртгэх, явц хянах.
- `Жолооч`: өнөөдрийн маршрут харах, цэг дээр очсон тэмдэглэх, өмнөх/дараах зураг авах, дуусгах, асуудал тэмдэглэх.
- `Хог ачигч`: өөрийн багийн өнөөдрийн маршрут, гүйцэтгэлийн мэдээлэл харах, шаардлагатай бол зураг/тайлбар нэмэх.
- `Хяналтын байцаагч`: бүх маршрут харах, явц шалгах, хяналтын тайлан, зураг, зөрчил, үнэлгээ оруулах.
- `Удирдлага / Project Manager`: dashboard, өдөр тутмын явц, машинаар/жолоочоор/цэгээр гүйцэтгэл, хоцорсон/дуусаагүй маршрут, хяналтын тайлан харах.

## Core Data Concept

```txt
Weekly Route Plan
↓
Day Plan
↓
Vehicle + Team Assignment
↓
Ordered Collection Points
↓
Generated Daily Route Task
↓
Collection Point Execution Lines
↓
Proof Photos + Status
↓
Inspection Report
```

## Confirmed Odoo Models

Model names were inspected through Odoo metadata and centralized in `lib/garbage-route-models.ts`.

- `weeklyRoutePlan`: `mfo.planning.template`
- `weeklyRoutePlanLine`: `mfo.planning.template.line`
- `dailyRouteTask`: `project.task`
- `routePointLine`: `mfo.stop.execution.line`
- `inspectionReport`: `mfo.issue.report`
- `proofImage`: `mfo.proof.image`
- `planningOverride`: `mfo.planning.override`
- `vehicle`: `fleet.vehicle`
- `employee`: `hr.employee`
- `garbagePoint`: `mfo.collection.point`
- `route`: `mfo.route`
- `routeLine`: `mfo.route.line`
- `crewTeam`: `mfo.crew.team`

## API Routes

- `GET /api/garbage-routes/weekly-plans`
- `POST /api/garbage-routes/weekly-plans`
- `GET /api/garbage-routes/weekly-plans/[id]`
- `PATCH /api/garbage-routes/weekly-plans/[id]`
- `POST /api/garbage-routes/generate-today`
- `GET /api/garbage-routes/today`
- `GET /api/garbage-routes/daily/[id]`
- `POST /api/garbage-routes/daily/[id]/change`
- `POST /api/garbage-routes/points/[id]/arrived`
- `POST /api/garbage-routes/points/[id]/upload-before`
- `POST /api/garbage-routes/points/[id]/upload-after`
- `POST /api/garbage-routes/points/[id]/complete`
- `POST /api/garbage-routes/points/[id]/issue`
- `GET /api/garbage-routes/inspections`
- `POST /api/garbage-routes/inspections`
- `GET /api/garbage-routes/dashboard`
- `GET /api/garbage-routes/options`

All routes validate session, check permission, call Odoo server-side, return normalized JSON, and never expose Odoo credentials.

## Required UI Labels

Statuses:

- `Төлөвлөгдсөн`
- `Эхэлсэн`
- `Явцтай`
- `Дууссан`
- `Дутуу`
- `Асуудалтай`
- `Цуцлагдсан`
- `Өөрчлөгдсөн`

Loading and error messages:

- `Мэдээлэл ачаалж байна...`
- `Хадгалж байна...`
- `Зураг байршуулж байна...`
- `Маршрут үүсгэж байна...`
- `Мэдээлэл ачаалж чадсангүй.`
- `Хадгалах үед алдаа гарлаа.`
- `Таны эрх хүрэхгүй байна.`
- `Зураг хавсаргах үед алдаа гарлаа.`
- `Odoo сервертэй холбогдож чадсангүй.`
- `Маршрут олдсонгүй.`

## Execution Rules

- Driver should complete collection points in order.
- If a driver skips a point, require: `Та өмнөх цэгийг дуусгаагүй байна. Алгасах шалтгаанаа оруулна уу.`
- Do not allow completing a point without required before/after proof images unless an issue reason is selected.
- Хэлтсийн дарга route changes require reason.
- If today’s route already started, completed points remain locked and only unfinished points can be changed.
- Show badge: `Өдрийн явцад өөрчлөгдсөн`.

## Acceptance Criteria

- All UI is Mongolian Cyrillic.
- Хэлтсийн дарга can create weekly route plan.
- Each car can have different route per weekday.
- Each route has driver + 2 collectors.
- Route points are ordered and can be rearranged.
- Today’s route can be generated.
- Driver sees only today’s assigned route.
- Driver can complete points sequentially.
- Before/after images upload to Odoo.
- Skipped points require reason.
- Хэлтсийн дарга can change active route with reason.
- Completed points are locked.
- Хяналтын байцаагч can submit report with images.
- Dashboard shows today’s progress.
- Odoo is source of truth.
- No settings CRUD is rebuilt.
- No English labels appear in UI.
