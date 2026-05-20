---
name: latency-first
description: Minimize latency and perceived wait time in this municipal Odoo + Next.js PWA. Use whenever Codex changes frontend UX, dashboard/report/task pages, API route handlers, server actions, Odoo RPC usage, data loading, notification flows, or any feature where response time, navigation speed, render cost, mobile PWA performance, or backend round-trips can be affected.
---

# Latency First

Make latency a default design constraint. Prefer the fastest correct path for the user, especially on mobile PWA, dashboard, task/report, notification, and Odoo-backed pages.

## Default Workflow

1. Identify the user-visible wait: initial page load, navigation, button action, search/filter, export, notification connection, or server mutation.
2. Trace the data path: React render -> Server Component/action/API route -> Odoo RPC -> post-action revalidation.
3. Remove avoidable work before adding UI polish.
4. Keep correctness and permissions intact; never cache or skip access checks in a way that exposes data.
5. Verify with `npx tsc --noEmit`, `npm run lint`, and `npm run build` when code changed.

## Next.js / React Rules

- Prefer Server Components for static or session-scoped reads; use Client Components only for interaction.
- Keep Client Component state local and small.
- Avoid page-load permission prompts, auto-subscribe flows, or heavy browser APIs unless the user clicked.
- Avoid duplicate fetches between page, child components, and headers. Share loaded data in props when practical.
- Use `Promise.all` for independent server reads.
- Use `Suspense` for slow secondary panels so the main page becomes usable first.
- Avoid large derived arrays in render; precompute once with `useMemo` in client code or before JSX in server code.
- Do not add large libraries for small UI behavior.
- Keep images sized, lazy where appropriate, and avoid unnecessary generated media on operational dashboards.

## Odoo RPC Rules

- Batch independent `search_read` calls with `Promise.all`.
- Request only needed fields.
- Add `limit`, domain filters, and ordering whenever possible.
- Avoid loops that call Odoo once per record. Prefer one query with `id in [...]`, then map locally.
- Reuse existing project helpers and caches before adding new RPCs.
- For mutations, revalidate only affected paths, not every dashboard, unless the data truly appears everywhere.

## API / Server Action Rules

- Return precise errors quickly; do not hide backend failures behind generic success.
- Treat permission success separately from backend persistence success.
- Do not block a mutation on non-critical side effects. Fire best-effort notifications/audits quietly when existing helpers support it.
- Keep payloads minimal. Do not return full records when the UI needs only ids/status/counts.
- Avoid synchronous export/report work on normal page render; run it only after explicit user action.

## UI / UX Latency Rules

- Show immediate button loading state for actions over 300ms.
- Use optimistic UI only when rollback is simple and permissions are already known.
- Prefer direct in-page expansion over modal flows when it reduces clicks and avoids remounting large forms.
- Keep operational screens dense but readable; remove explanatory text that does not help the task.
- On mobile, reduce fields and steps first, then improve styling.

## Review Checklist

Before finishing, ask:

- Did I add any extra page-load network request?
- Can any serial awaits become `Promise.all`?
- Can any Odoo loop be batched?
- Is this Client Component larger than necessary?
- Did I preserve role/department access rules?
- Does the user see a fast, clear state while waiting?
- Did build/lint/typecheck pass?
