---
name: workflow-task-report-side
description: Branch-specific guardrails for the task/report/dashboard side of the municipal ERP when two developers or Codex agents work in parallel from the same repository. Use for project/task/work-item flows, execution reports, progress calculation, dashboards, field worker screens, and Word/PDF report exports.
---

# Workflow / Task / Report Side Skill

## Purpose

Use this skill when working on the municipal ERP task workflow side:

- Ажил / project pages
- Ажилбар / task detail and creation/edit flows
- Гүйцэтгэлийн тайлан / report create, edit, delete, review UI
- Progress and status calculation
- Dashboard and project summary views
- Field worker task/report screens
- Official Word/PDF task report export

This side must not overwrite procurement workflow work being done in parallel.

## Branch Ownership

Default working branch:

- `codex/staging-odoo-smoke-fixes`

If a separate feature branch is needed, create it from the current base branch with the `codex/` prefix.

Before editing:

```bash
git status
git fetch origin
git pull --ff-only
```

If the working tree is dirty, commit or stash your own work before switching branches or pulling.

## Allowed Files

Prefer changes in:

- `app/projects/**`
- `app/tasks/**`
- `app/field/**`
- `app/dashboard-view.tsx`
- `app/reports/**`
- `app/api/tasks/**`
- `app/api/workspace-report/**`
- `lib/workspace.ts`
- `lib/official-task-report.ts`
- shared UI/CSS only when required for these pages

Odoo files may be touched only when they directly support task/report workflow and do not overlap procurement ownership.

## Avoid / Do Not Touch

Do not modify these unless the user explicitly asks and the other side is paused:

- `app/procurement/**`
- procurement-specific API routes
- procurement-specific server actions
- procurement Odoo addons, security, menus, views, and models
- warehouse/material approval logic that belongs to procurement

Do not overwrite another side's changes. If a file has unrelated edits, preserve them.

## Implementation Rules

- Keep UI text Mongolian Cyrillic.
- Preserve the existing green municipal visual style.
- Do not hardcode production credentials, DB names, tokens, passwords, or IP addresses.
- Do not edit `.env*`.
- Do not run production DB updates or Odoo module upgrades unless explicitly requested.
- Keep task/project/report meaning clear:
  - `/projects` = parent ажил
  - `/projects/[id]` = selected ажил and its ажилбарууд
  - `/tasks/[id]` = one ажилбар
  - `/field` = worker's assigned ажилбар/report flow
- Progress and status must be consistent across project cards, task detail, report export, and dashboard.
- Report permissions must separate worker, manager, reviewer, and admin actions.

## Test Plan

Run before committing:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

When touching Odoo XML/Python for this side, also run safe static checks if available:

- XML parse check
- manifest data path check
- security CSV reference check
- duplicate XML ID check
- Python syntax check

Do not run production database updates.

