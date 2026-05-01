# Хот тохижилтын веб апп

Next.js дээр хийсэн энэ frontend нь Odoo 19 дээр байгаа `project`, `project.task`, `ops.task.report` өгөгдлийг уншаад municipal operations dashboard болгон харуулна. Одоо Odoo-ийн одоогийн хэрэглэгчээр app дотроос шууд нэвтэрдэг login урсгалтай болсон.

## Юу хийдэг вэ

- Odoo credential-ээр app дотроос нэвтрэх login screen
- Ерөнхий менежерийн хяналтын dashboard
- Review queue болон live task list
- 5 хэлтсийн ачааллын блок
- Team leader cockpit
- Field report feed
- Mobile-friendly responsive layout
- Odoo-д холбогдож чадахгүй үед demo fallback

## Ажиллуулах

1. `.env.example`-ийг `.env.local` болгож хуулна.
2. Танай Odoo өөр тохиргоотой бол утгуудыг шинэчилнэ.
3. `SESSION_SECRET` дээр урт random string өгнө.
4. Дараах командаар асаана.

```bash
npm install
npm run dev
```

Дараа нь [http://localhost:3000](http://localhost:3000)-г нээнэ.
Login хийхдээ Odoo дээрх одоогийн user/password-аа ашиглана.

## Default Odoo тохиргоо

```env
ODOO_URL=http://localhost:8069
ODOO_DB=odoo19_admin
ODOO_LOGIN=admin
ODOO_PASSWORD=admin
SESSION_SECRET=replace-this-with-a-long-random-secret
SESSION_COOKIE_SECURE=false
```

`SESSION_COOKIE_SECURE=true` тохиргоог зөвхөн HTTPS reverse proxy дээр ажиллуулж байгаа үед асаана.

## Гол файлууд

- `app/page.tsx` - session protected dashboard
- `app/page.module.css` - dashboard visual system + responsive layout
- `app/login/page.tsx` - нэвтрэх дэлгэц
- `app/login/page.module.css` - login screen styling
- `app/actions.ts` - login/logout server actions
- `lib/auth.ts` - encrypted cookie session helper
- `lib/session.ts` - shared session cookie name
- `lib/odoo.ts` - Odoo JSON-RPC integration + live auth
- `middleware.ts` - login required route guard
- `app/layout.tsx` - metadata, font setup

## QA Documentation

- [Municipal UI Acceptance Guide](docs/qa/municipal-ui-acceptance.md)
- [QA screenshot and mockup assets](docs/qa-assets/README.md)
