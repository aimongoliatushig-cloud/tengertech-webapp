# Web App UI/UX QA Standard

This project is used by field and office staff through the Next.js web app. Odoo is the backend. Every frontend change must keep the following standard.

## Language

- All user-facing text must be Mongolian Cyrillic.
- Do not ship mojibake text such as `Ð`, `Ñ`, `Ò`, or `Ó` in rendered UI.
- Use short operational labels: `Ажил`, `Тайлан`, `Илгээх`, `Батлах`, `Буцаах`, `Хяналтад`, `Буцаагдсан`.

## Navigation

- The side menu and mobile dock must stay stable for the current role while moving between tabs.
- A tab must not disappear after navigation unless the role truly has no permission.
- Active menu state must match the current section.
- Unauthorized routes must show a clear Mongolian permission message or redirect safely.

## Role QA Matrix

Run QA with at least these role profiles when credentials are available:

- Системийн админ
- Захирал
- Үйл ажиллагаа хариуцсан менежер
- Хэлтсийн дарга
- Ахлах мастер
- Мастер
- Ажилтан
- HR хэрэглэгч
- Засвар / нярав / санхүүгийн хэрэглэгч

For each role, check:

- Нүүр / dashboard
- Ажил
- Календарь
- Талбайн ажил
- Тайлан
- Хяналт / мэдэгдэл
- Хүний нөөц
- Авто бааз / засвар
- Хог тээврийн маршрут
- Худалдан авалт
- Тохиргоо / профайл

## Visual Standard

- ERP screens must be calm, dense, and easy to scan.
- Cards are for repeated records or focused panels only.
- Buttons must use consistent height, radius, icon placement, and loading states.
- Long Mongolian labels must wrap or truncate intentionally, never overlap.
- Desktop first screen must show the main KPI or urgent action.
- Mobile screens must use large tap targets and avoid long forms.

## Required Checks

Before saying UI work is done:

- Run `npm run lint`.
- Run `npx tsc --noEmit`.
- Run `npm run build` when the change affects routing, layout, auth, or shared data.
- Run role smoke screenshots with `npm run qa:roles` when credentials and Odoo are available.
- Inspect desktop and mobile screenshots for broken layout, menu changes, bad text, and console errors.

## Failure Rules

Treat these as bugs:

- Login returns `connection` because an optional Odoo field is missing.
- Any route shows a Next.js error page.
- The same role sees a different primary menu without a permission reason.
- Worker users can see all records.
- Department heads see unrelated departments.
- Odoo missing optional fields break web app rendering.
