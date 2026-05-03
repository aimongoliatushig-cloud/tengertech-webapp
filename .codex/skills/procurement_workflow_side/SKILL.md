---
name: procurement-workflow-side
description: Branch-specific guardrails for the procurement, warehouse, finance, and approval side of the municipal ERP when two developers or Codex agents work in parallel from the same repository. Use for purchase requests, three quotes, storekeeper material issue, finance/director approvals, and procurement dashboards.
---

# Procurement Workflow Side Skill

## Purpose

Use this skill when working on the municipal ERP procurement side:

- Худалдан авалтын хүсэлт
- 3 үнийн санал
- 1 саяас доош / 1 саяас дээш approval workflow
- Няравын материал олголт
- Санхүүгийн баталгаа
- Захирлын баталгаа
- Агуулахын орлого / зарлага
- Засвартай холбогдох material flow
- Procurement dashboards, lists, detail pages, and reports

This side must not overwrite task/report/dashboard work being done in parallel.

## Branch Ownership

Recommended branch for the other developer/agent:

- `codex/procurement-workflow-v2`

Create it from the latest shared base:

```bash
git fetch origin
git switch codex/staging-odoo-smoke-fixes
git pull --ff-only origin codex/staging-odoo-smoke-fixes
git switch -c codex/procurement-workflow-v2
```

Before editing on every session:

```bash
git status
git fetch origin
git pull --ff-only
```

If the working tree is dirty, commit or stash your own work before switching branches or pulling.

## Allowed Files

Prefer changes in:

- `app/procurement/**`
- procurement-specific API routes
- procurement-specific server actions
- procurement dashboard/report UI
- procurement Odoo addon files
- procurement security groups, access CSV, record rules, menus, and views
- warehouse/material flow files only when they belong to procurement approval or issue workflow

If procurement functionality needs shared helpers, keep the shared edit narrowly scoped and document it in the commit message.

## Avoid / Do Not Touch

Do not modify these unless the user explicitly asks and the workflow/task side is paused:

- `app/projects/**`
- `app/tasks/**`
- `app/field/**`
- `app/dashboard-view.tsx`
- `app/api/tasks/**`
- `app/api/workspace-report/**`
- `lib/workspace.ts`
- `lib/official-task-report.ts`
- task/report/progress calculation logic

Do not overwrite another side's changes. If a file has unrelated edits, preserve them.

## Implementation Rules

- Keep UI text Mongolian Cyrillic.
- Preserve the existing green municipal visual style.
- Do not hardcode production credentials, DB names, tokens, passwords, or IP addresses.
- Do not edit `.env*`.
- Do not run production DB updates or Odoo module upgrades unless explicitly requested.
- Keep procurement workflow states explicit and auditable.
- Enforce validation for:
  - required quote/evidence fields
  - duplicate suppliers
  - amount threshold workflow
  - finance/director approval gates
  - warehouse receipt/issue notes
- Do not weaken task/report access rules while adding procurement access rules.

## Test Plan

Run before committing:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

For Odoo procurement changes, also run safe static checks if available:

- XML parse check
- manifest data path check
- security CSV reference check
- duplicate XML ID check
- Python syntax check

Run Odoo install/update only on a confirmed dev/staging database with backup, never production.

