---
name: user-changelog
description: >-
  Writes a simple, non-developer human-readable changelog from uncommitted
  (or specified) git changes. Use when the user asks for a changelog, change
  log, release notes, "what changed", or a user-facing summary of uncommitted
  work, staged changes, a branch, or a PR.
---

# User-facing changelog

Produce a **product changelog** for humans who use the Roth conversion planner, not for developers.

## When triggered

Typical asks: "produce changelog of the uncommitted changes", "write a change log", "user-facing release notes for this diff".

Default scope: **all uncommitted changes** (staged + unstaged + untracked that belong to the feature). If the user names a branch, PR, or commit range, use that instead.

## How to gather facts

1. Run `git status` and `git diff` (and `git diff --cached` if anything is staged).
2. Skim the diff enough to understand **user-visible behavior**, not every file.
3. Prefer UI copy, wizard/results changes, bug-fix outcomes, and new capabilities over refactors, tests, types, or infra unless those affect what the user sees or can do.
4. If a bug fix changes plan numbers, say so in plain language (which kind of plan / what went wrong before / what happens now). Do not dump metric tables unless the user asks.

## Output format (match this shape)

```markdown
Changes
<one short bullet per user-visible improvement>

Bug Fixes
<one short bullet per user-visible fix; omit this section if none>
```

Rules for bullets:

- Start with a short label or plain sentence the user would recognize in the app.
- One idea per line. Keep lines short.
- Group related UI tweaks into one bullet when they are the same feature (e.g. "Expandable rows: assets, gross income, expenses").
- Quote exact UI strings when that is the change (e.g. a notice or label).
- Describe outcomes, not implementation (`withdrawals no longer overdraw empty accounts`, not `capped draw in project.ts`).
- No file paths, function names, PR numbers, commit hashes, stack traces, or "refactored X".
- No em dash (`—`) and no hyphen (`-`) as a sentence separator. Prefer colon,
  comma, or rephrase. Hyphens in compounds (e.g. `year-by-year`) are fine.
- Skip pure internal work (tests-only, lint, migrations plumbing, docs-only) unless the user asked for a full/dev changelog.
- If there are only fixes, still use the `Bug Fixes` heading (and omit `Changes` if empty). If there are only features, omit `Bug Fixes`.

## Tone

Write like a product update email: clear, concrete, non-technical. Assume the reader never opens a code editor.

## Example (gold standard)

This is the quality and density to aim for:

```markdown
Changes
Expandable rows: assets, gross income, expenses
Real estate notice: "Add investment properties here. Do not include your primary residence".
Dropdown to restore deleted: accounts, income, real estate, expenses
Table list deductions, convert all from monthly to yearly
Change list order (income and expenses at the bottom, conversion after assets etc)
Surplus: negative red, positive, green
Display age of both people and mark both yellow at 73
Workflow to update external data: federal tax brackets, income tax laws, RMD tables, medicare tables
State tax (huge overhaul!)
Graphs

Bug Fixes
Fix: withdrawals no longer overdraw empty accounts.
Scheduled retirement / Roth / after-tax draws are now capped at the source balance. Accounts stay at $0 instead of going negative, and income / tax only count what was actually withdrawn (no phantom cash after the account is empty, no negative RMD income). This fix changes the final output on the Garcia (1) plan but not on Garcia (2)
```

## What not to do

- Do not write conventional commit lists or "feat/fix/chore" sections.
- Do not organize by folder (`src/components`, `engine`, etc.).
- Do not ask the user to fill in the changelog unless a user-visible effect is truly ambiguous from the diff.
- Do not commit or open a PR unless the user also asked for that.
