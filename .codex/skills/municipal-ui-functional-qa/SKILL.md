---
name: municipal-ui-functional-qa
description: Use for every frontend UI/UX change in this municipal ERP/PWA, especially dashboards, HR, projects, auto-base, buttons, links, filters, tabs, redirects, mobile views, or cleanup work. Enforces no duplicate UI controls, no dead buttons, correct navigation/redirect behavior, working filters/forms, and visual smoke checks before finishing.
---

# Municipal UI Functional QA

Use this skill whenever changing user-facing UI, navigation, dashboard cards, buttons, filters, forms, links, tabs, mobile layouts, or route redirects in this project.

## Core Rule

Do not leave UI that merely looks present. Every visible control must have a clear purpose, a working handler or href, and a verified result. If two controls do the same thing in the same view, remove one unless there is a strong UX reason to keep both.

## Required Workflow

1. Identify the user path being changed:
   - Page or route.
   - Main user action.
   - Expected destination or state change.
   - Mobile and desktop impact.

2. Check for duplicate UI before editing:
   - Search nearby components for the same button text, link, filter, tab, metric, or card.
   - If a new control duplicates an existing one, keep the more contextual one and remove the redundant one.
   - Avoid showing both a category pill and a matching dropdown filter unless both are truly needed.
   - Avoid showing both summary metric cards and a second row of identical status pills.

3. Verify every visible control:
   - Buttons must submit, mutate, open, close, or navigate correctly.
   - Links must point to the intended route with the correct query params.
   - Redirects must land on the expected page, not an adjacent index page.
   - Filters must actually filter the list shown on screen.
   - Empty states must match the filter state and not hide valid records.

4. Remove dead or orphan UI:
   - No unused buttons.
   - No disconnected tabs.
   - No breadcrumb, helper text, or decorative card that does not help the workflow.
   - No hidden feature entry points without a reachable button or menu.

5. Validate data logic behind UI:
   - Counts must match the visible filtered items.
   - Status labels must map to backend states correctly.
   - Test, smoke, placeholder, or seed records must not appear in production-facing dashboards unless explicitly requested.
   - If hiding data in UI, prefer fixing/archiving bad seed data too when safe and requested.

6. Do a visual and functional smoke check:
   - Desktop width.
   - Mobile width when the page is used on phones.
   - Click or inspect the changed buttons/links/filters when a local server or browser session is available.
   - Watch for text overflow, duplicate controls, awkward spacing, and empty panels.

## Verification Commands

For this Next.js repo, after UI changes run when feasible:

```bash
npx tsc --noEmit
npm run lint -- --quiet
npm run build
git diff --check
```

If browser access is possible, open the affected route and verify:

- The changed view loads.
- No console errors relevant to the change.
- The main button/link works.
- Filters and counts agree.
- Mobile layout remains usable.

## Finish Criteria

Before final response, confirm:

- No duplicate controls remain in the edited view.
- Every visible button/link has a working action.
- Redirects and query params are correct.
- The UI does not show stale helper text or irrelevant breadcrumb text.
- Verification results are reported honestly.
