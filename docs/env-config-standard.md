# Env / Config стандарт

Энэ repo дээр local, VPS, өөр төхөөрөмжүүд ижил нэртэй env хувьсагч ашиглана. Бодит `.env`, `.env.local` файлууд commit хийхгүй. Tracked template нь `config/env/` дотор байна.

## Canonical файлууд

- Local: `config/env/local.env.example` -> `.env.local`
- VPS/staging/production: `config/env/vps.env.example` -> `.env`

## Canonical хувьсагч

- `APP_BASE_URL` бол app-ийн public URL-ийн үндсэн эх сурвалж.
- `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL` нь legacy alias тул боломжтой бол хоосон үлдээнэ.
- `ODOO_URL`, `ODOO_DB`, `ODOO_LOGIN`, `ODOO_PASSWORD` нь Odoo connection-ийн үндсэн contract.
- `SESSION_SECRET` төхөөрөмж бүр дээр өөр байж болно, гэхдээ 32+ тэмдэгттэй secret байна.
- `SESSION_COOKIE_SECURE=false` зөвхөн local HTTP дээр. VPS HTTPS дээр `true`.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` болон `VAPID_PRIVATE_KEY` хоёул байж байж push notification real ажиллана.

## Local setup

```bash
copy config\env\local.env.example .env.local
npm run env:check
npm run dev
```

## VPS setup

```bash
cp config/env/vps.env.example .env
# CHANGE_ME утгуудыг бодит secret/config-р солино
npm run env:check -- --production
npm run build
```

Docker/compose ашиглаж байгаа бол container дотор мөн адил env contract орсон эсэхийг шалгана.

Template-үүд өөрсдөө бүрэн key-тэй эсэхийг шалгах:

```bash
node scripts/check-env.mjs --template --file=config/env/local.env.example
node scripts/check-env.mjs --template --production --file=config/env/vps.env.example
```

## Шинэ төхөөрөмж дээр pull хийх checklist

```bash
git fetch origin
git switch codex/staging-odoo-smoke-fixes
git pull --ff-only origin codex/staging-odoo-smoke-fixes
npm install
copy config\env\local.env.example .env.local
npm run env:check
npm run build
```

VPS дээр `copy` биш `cp` хэрэглэнэ.

## Хориглох зүйл

- `.env`, `.env.local`, `.env.production` commit хийхгүй.
- Secret, password, token, DB password-г GitHub руу оруулахгүй.
- VPS дээр ажиллахгүй байна гээд env хувьсагчийн нэрийг өөрчлөхгүй; template болон code contract-ийг хамтад нь шинэчилнэ.
- Production DB update/migration-г env standard хийх нэрээр ажиллуулахгүй.
