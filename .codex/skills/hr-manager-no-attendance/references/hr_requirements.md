# HR manager module requirements without attendance

Use this reference when implementing, reviewing, or testing the HR manager module in the municipal ERP.

## Goal

The HR manager manages employee registry, personal files, contracts, orders, attachments, leave, sick leave, business trips, disciplinary records, employee explanations, employee transfers, offboarding, archive, clearance sheets, HR dashboard, and PDF/Excel HR reports.

The HR manager does not manage daily attendance, lateness, absences, check-in/check-out, route-start attendance, team attendance, attendance devices, QR/location attendance, or automatic attendance discipline.

## HR menus

Required menus:

- `Хүний нөөц`
- `Dashboard`
- `Ажилтнууд`
- `Шинэ ажилтан бүртгэх`
- `Чөлөө`
- `Өвчтэй`
- `Томилолт`
- `Сахилгын бүртгэл`
- `Тушаал`
- `Шилжилт хөдөлгөөн`
- `Тойрох хуудас`
- `Архив`
- `Тайлан`
- `Тохиргоо`

Forbidden HR menus:

- `Ирц`
- `Хоцролт / таслалт`
- `Ирцийн асуудал`
- `Өдөр тутмын ирц`

## Employee registration

Core fields:

- Овог
- Нэр
- Регистрийн дугаар
- Хүйс
- Төрсөн огноо
- Утасны дугаар
- И-мэйл
- Гэрийн хаяг
- Яаралтай холбоо барих хүн
- Яаралтай холбоо барих утас
- Ажилтны зураг

Job fields:

- Ажилтны код
- Хэлтэс / алба
- Албан тушаал
- Шууд удирдлага
- Ажилд орсон огноо
- Ажлын төрөл: `Үндсэн`, `Түр`, `Гэрээт`, `Улирлын`
- Ажлын төлөв: `Идэвхтэй`, `Чөлөөтэй`, `Өвчтэй`, `Томилолттой`, `Ажлаас гарсан`, `Архивласан`

Documents:

- Хөдөлмөрийн гэрээ
- Иргэний үнэмлэхний хуулбар
- Диплом / үнэмлэх
- Эрүүл мэндийн үзлэгийн бичиг
- Жолооны үнэмлэх, тусгай зөвшөөрөл
- Бусад хавсралт

## Employee profile tabs

Required tabs:

- `Үндсэн мэдээлэл`
- `Ажлын мэдээлэл`
- `Чөлөө / өвчтэй / томилолт`
- `Сахилгын бүртгэл`
- `Оноогдсон ажил`
- `Тушаал / гэрээ`
- `Хавсралт`
- `Түүх / өөрчлөлт`

Forbidden tabs:

- `Ирцийн түүх`
- `Хоцролтын түүх`
- `Таслалтын түүх`
- `Ирцийн үзүүлэлт`

## Leave, sick leave, and business trip

Leave fields:

- Ажилтан
- Хэлтэс
- Чөлөөний төрөл: `Цалинтай чөлөө`, `Цалингүй чөлөө`, `Хувийн чөлөө`, `Гэр бүлийн шалтгаан`, `Бусад`
- Эхлэх огноо
- Дуусах огноо
- Нийт өдөр
- Шалтгаан
- Хавсралт
- Батлах хүн
- Төлөв: `Ноорог`, `Илгээсэн`, `HR шалгаж байна`, `Батлагдсан`, `Татгалзсан`, `Цуцлагдсан`

Sick leave fields:

- Ажилтан
- Хэлтэс
- Эхлэх огноо
- Дуусах огноо
- Эмнэлгийн магадлагаа
- Эмнэлгийн байгууллага
- Шалтгаан
- Хавсралт
- Төлөв

Business trip fields:

- Ажилтан
- Хэлтэс
- Томилолтын газар
- Эхлэх огноо
- Дуусах огноо
- Зорилго
- Баталсан хүн
- Тушаал / хавсралт
- Төлөв

## Discipline

Allowed violation types:

- Ажил үүргээ биелүүлээгүй
- Ажлын чанар муу
- Тайлан дутуу / буруу оруулсан
- Давтан буцаагдсан тайлан
- Хариуцлага алдсан
- Аюулгүй ажиллагааны дүрэм зөрчсөн
- Эд хөрөнгө гэмтээсэн
- Удирдлагын өгсөн үүрэг биелүүлээгүй
- Бусад

Do not automatically create discipline from attendance reasons such as late, absent, missing check-in, or no route start. If such a case must be recorded manually, use `Бусад` with a written explanation; the HR module must not infer it from attendance data.

Disciplinary action types:

- Аман сануулга
- Бичгээр сануулга
- Анхааруулга
- Цалингийн суутгал
- 20% суутгал
- Ажил үүргээс түр түдгэлзүүлэх
- Албан тушаал бууруулах санал
- Ажлаас чөлөөлөх санал
- Бусад

Discipline fields:

- Ажилтан
- Хэлтэс
- Албан тушаал
- Зөрчлийн төрөл
- Зөрчлийн огноо
- Давтан эсэх
- Авсан арга хэмжээ
- Шийтгэлийн хэмжээ
- Суутгалын хувь
- Тайлбар
- Ажилтны тайлбар
- Хавсралт
- Бүртгэсэн хүн
- Баталсан хүн
- Холбогдох тушаал
- Төлөв

Workflow:

`Ноорог` -> `HR шалгаж байна` -> `Шууд удирдлагын тайлбар` -> `Ажилтны тайлбар` -> `Захиргааны хяналт` -> `Баталгаажсан` -> `Архивласан`

Additional states: `Буцаагдсан`, `Цуцлагдсан`.

Employees must be able to write an explanation, upload an attachment, and choose whether they agree or disagree.

## Orders, contracts, and attachments

Supported document types:

- Ажилд авах тушаал
- Ажлаас чөлөөлөх тушаал
- Албан тушаал өөрчлөх тушаал
- Цалин өөрчлөх тушаал
- Чөлөөний тушаал
- Сахилгын тушаал
- Хөдөлмөрийн гэрээ
- Нэмэлт гэрээ
- Тойрох хуудас
- Бусад баримт

Document fields:

- Баримтын төрөл
- Дугаар
- Огноо
- Хавсралт файл
- Тайлбар
- Оруулсан хүн
- Оруулсан огноо

## Employee transfers

Types:

- Хэлтэс шилжих
- Албан тушаал өөрчлөх
- Шууд удирдлага өөрчлөх
- Ажлын төрөл өөрчлөх
- Цалин өөрчлөх
- Түр шилжүүлэх
- Буцааж шилжүүлэх

Fields:

- Ажилтан
- Өмнөх хэлтэс
- Шинэ хэлтэс
- Өмнөх албан тушаал
- Шинэ албан тушаал
- Хүчинтэй огноо
- Шалтгаан
- Тушаал / хавсралт
- Бүртгэсэн хүн

## Offboarding, archive, and clearance sheet

Offboarding flow:

1. Register resignation request or decision.
2. Enter resignation reason.
3. Create clearance sheet.
4. Responsible departments mark checklist items.
5. After all checks are complete, set employee status to `Ажлаас гарсан`.
6. Archive the employee profile.

Resignation reasons:

- Өөрийн хүсэлтээр
- Гэрээ дууссан
- Сахилгын үндэслэлээр
- Эрүүл мэндийн шалтгаан
- Тэтгэвэрт гарсан
- Бусад

Archived employees must not appear in the active list, but their history, contracts, orders, and attachments must remain available from archive.

Clearance sections:

- Нярав: багаж, хувцас, материал буцаасан эсэх
- IT: системийн эрх хаасан эсэх, төхөөрөмж буцаасан эсэх
- Санхүү: тооцоо дууссан эсэх
- Шууд удирдлага: ажил хүлээлцсэн эсэх
- HR: баримт бичиг бүрэн эсэх

Clearance fields:

- Ажилтан
- Үүсгэсэн огноо
- Шалгах хэсэг
- Хариуцсан хүн
- Төлөв
- Тайлбар
- Баталсан огноо
- Хавсралт

States:

- Ноорог
- Илгээсэн
- Хүлээгдэж байна
- Баталгаажсан
- Дутуу
- Дууссан

## Dashboard

Required metrics:

- Нийт ажилтан
- Идэвхтэй ажилтан
- Чөлөөтэй ажилтан
- Өвчтэй ажилтан
- Томилолттой ажилтан
- Шинэ ажилтан
- Ажлаас гарсан ажилтан
- Архивласан ажилтан
- Сахилгын идэвхтэй бүртгэл
- Дууссан сахилгын бүртгэл
- Шилжилт хөдөлгөөн
- Дуусах дөхсөн гэрээ
- Дутуу хавсралттай ажилтан
- Тойрох хуудас хүлээгдэж буй

Forbidden metrics:

- Өнөөдрийн ирц
- Ирсэн ажилтан
- Хоцорсон ажилтан
- Тасалсан ажилтан
- Ирцийн хувь
- Давтан тасалсан ажилтан

## Reports

Required reports:

- Ажилтны жагсаалт
- Хэлтэс тус бүрийн ажилтны тайлан
- Шинээр орсон ажилтны тайлан
- Ажлаас гарсан ажилтны тайлан
- Чөлөөний тайлан
- Өвчтэй ажилтны тайлан
- Томилолтын тайлан
- Сахилгын тайлан
- Шилжилт хөдөлгөөний тайлан
- Тушаал, гэрээний тайлан
- Тойрох хуудасны тайлан
- Архивын тайлан

Forbidden reports:

- Өдрийн ирцийн тайлан
- Хоцролтын тайлан
- Таслалтын тайлан
- Ирцийн хувь
- Ирцийн төхөөрөмжийн тайлан

## Search and filters

Employee filters: name, register number, phone, department, position, work status, hire date, resigned flag, archived flag.

Leave/sick/trip filters: employee, department, date, state, type.

Discipline filters: employee, department, violation type, action, date, state.

Order/contract filters: employee, document type, date, number.

Clearance filters: employee, responsible section, state, date.

## Notifications

Send HR notifications for:

- Шинэ ажилтан бүртгэгдсэн
- Чөлөөний хүсэлт ирсэн
- Өвчтэй бүртгэл ирсэн
- Томилолтын бүртгэл ирсэн
- Сахилгын бүртгэл шалгах шаардлагатай болсон
- Ажилтны тайлбар ирсэн
- Гэрээ дуусах дөхсөн
- Тойрох хуудас хүлээгдэж байгаа
- Ажлаас гаралт бүртгэгдсэн
- Хавсралт дутуу ажилтан байгаа

Forbidden attendance notifications:

- Хоцорсон
- Тасалсан
- Ирээгүй
- Check-in хийгээгүй

## Access rights

HR manager:

- View/edit employee HR information.
- Manage leave, sick leave, business trips.
- Manage discipline.
- Upload orders, contracts, and attachments.
- Manage archive and clearance sheets.
- View HR dashboard and reports.

Employee:

- View limited own profile information.
- View own leave, sick leave, and business trip records.
- Submit explanation on own discipline record.
- View own attachments if allowed.

Department head:

- View basic information for department employees.
- View department leave, sick leave, and business trip records.
- Add explanations or comments to department discipline records.
- View sensitive HR attachments only when explicitly allowed.

Director/general manager:

- View HR dashboard.
- View broad HR information for all employees.
- Approve discipline where required.
- View reports.

IT:

- Manage system access only.
- Do not view personal files, discipline attachments, contracts, or orders.

## Validation

- Employee surname, name, register number, department, and position are required.
- Register number must be unique.
- Hire date cannot be in the future.
- Leave end date cannot be before start date.
- Sick certificate requirement is configurable.
- Discipline approval requires explanation.
- Returning a record requires a reason.
- Archiving may require a completed clearance sheet.
- Warn or block new work assignment for resigned employees.

## UI and acceptance criteria

UI principles:

- Simple and understandable.
- Employee profile centered.
- Easy attachment upload.
- Leave, sick leave, and business trip visible as separate cards/tables.
- Discipline visible as a timeline.
- Orders, contracts, and attachments organized in one tab.
- Archived employees separate from active list.
- Clearance sheet visible as a checklist.
- All buttons, statuses, and messages in Mongolian Cyrillic.

Acceptance criteria:

- HR manager can create employee records.
- Employee profile shows core info, job info, contracts, orders, and attachments.
- HR can register leave, sick leave, and business trip records.
- HR can create discipline records.
- Employee can submit an explanation on discipline.
- HR can upload orders, contracts, and attachments.
- HR can register employee transfers.
- HR can archive resigned employees.
- HR can create and monitor clearance sheets as checklists.
- HR dashboard shows employee, leave, sick, business trip, and discipline data.
- HR reports are available.
- HR module has no attendance, lateness, or absence menus.
- HR dashboard has no attendance KPI.
- HR reports have no attendance reports.
- HR role cannot access sensitive finance or IT settings.
- IT role cannot access sensitive HR data.
