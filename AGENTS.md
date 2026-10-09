<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes. APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Agent instructions

Read the Workspace Guide first:

- [.cursor/rules/workspace-guide.mdc](.cursor/rules/workspace-guide.mdc)

It holds the global standards and which feature guide to open. The rest of
this file is the calculator: what it does, and how the engine is shaped.

## Shipping to main

Pushes on `claude/**` merge into `main` after 120 seconds of quiet. Each new
push on that branch cancels the in-progress wait and the 120 seconds start
over. The workflow then runs tests and merges that commit into `main`. See
`.github/workflows/auto-merge-claude.yml`.

## Tell the user when a push is live

Main deploys to production on Vercel (`https://roth-rr.vercel.app`). A push
isn't done until it's live there, so after every push, follow it through and
tell the user:

1. Find the "Auto-merge Claude branches" run for the pushed commit and wait
   for it to finish. If it fails, say so with the failing step and stop.
2. Read the new head of `main`. That's the commit Vercel builds.
3. Poll `https://roth-rr.vercel.app/api/version` (every 15 seconds or so, for
   up to 10 minutes) until its `buildId` equals that commit's sha. Run the
   poll as one background command so the session is woken when it ends.
4. Tell the user in one line that the change is live, with the short sha. If
   the poll times out, or the host can't be reached, say exactly that rather
   than guessing it deployed.

# What this system does

This is a **Roth conversion planner**. A US retiree (or married couple) holds
money in tax-deferred accounts (401k, IRA, DROP, TSP...). Those balances are
taxed when withdrawn, and once the owner hits their RMD age (73 or 75 by
birth year under SECURE / SECURE 2.0) the IRS forces taxable withdrawals
(RMDs). Converting some of that money to a Roth account earlier, paying tax
now at today's bracket, can mean lower lifetime taxes,
lower Medicare premiums, and a larger after-tax inheritance.

The app lets a user describe a household (people, accounts, income, real estate,
assumptions, and a conversion strategy), then **projects their finances year by
year** and **compares two scenarios**: doing nothing vs. running Roth
conversions. The headline outputs are lifetime taxes, Medicare cost, and after-tax
assets at the RMD age, and final inheritance.

Auth and plan persistence are server-backed in one MongoDB
(`MONGODB_DB`): Auth.js users and sessions, invites, and plans are
collections in that database. Config is in `src/lib/auth`, mounted at
`/api/auth`. Env and legal versioning are in the workspace guide.

The projection engine itself is still pure client-side (React + Zustand).

## RMDs are set by law, not by the user

Both halves of an RMD come from the IRS, so neither is a plan assumption:

- **When** they start: 72 / 73 / 75 from the owner's birth year (SECURE /
  SECURE 2.0), in `src/lib/domain/rmd.ts`.
- **How much**: the balance as of **December 31 of the preceding year** divided
  by the owner's applicable denominator from the Uniform Lifetime Table, in
  `src/lib/config/rmdTable.ts`. At 75 that's 1/24.6, about 4.07%.

Two things follow from the prior year-end base, and both are easy to get wrong.
Growth, scheduled draws, and conversions taken *during* the year don't change
that year's RMD, so `projectScenario` carries a `priorYearEndBalances` snapshot
rather than reading the live balance. And because the base can exceed what's
left in a depleting account, the take is capped at the current balance so a
balance never goes negative.

Starting balances are January 1 of the first projection year. Every year,
including year 0, applies a full year of growth *before* withdrawals,
conversions, and RMDs, **except DROP**: a `retirementType === "drop"` account
waits until the year after *that owner's* retirement year (see the retirement
account types feature guide). Skipping year-0 growth on other accounts made an
after-tax account that earns about as much as it distributes look like it was
shrinking.

In the app, balances are entered as of **today**, not January 1. The external
data store stamps today's date on the refs (`refs.asOfDate`), and when that date
falls inside year 0, `projectScenario` compounds year 0 only for what is left of
the year (`firstYearGrowthFraction`: on October 7, 86 of 365 days). Later years
get a full year. With no `asOfDate` (tests, golden cases) year 0 is a full year.
Only the projection's growth step is prorated: the conversion strategies,
including `depleteByRmd`, and `convertibleTotal` still use a full first year.

Plans used to carry a flat `assumptions.rmdRate` (default 5%) applied to the
live balance. That overstated RMDs in the early years and understated them in
the late ones, since the table's implied rate crosses 5% around age 80 and keeps
climbing. The field is gone and `migrateHousehold` strips it.

## How the data flows

```
Household (domain input)
  -> buildConversionSchedule()        # optimizer: strategy -> per-year $ amounts
  -> projectScenario()                # engine: year-by-year ProjectionRow[]
  -> runScenario() / compareScenarios()  # totals + baseline-vs-Roth deltas
  -> calculate(household, refs)   # UI entry; refs from hydrate (or fallback)
  -> React components render it
```

External reference data (federal tax today) is hydrated on app boot from
Mongo/`GET /api/external-data` with a 24h browser cache. See
[`docs/external-data.md`](docs/external-data.md).

# Architecture: clean / layered

The code is organized in **layers, and dependencies point inward** (UI depends
on domain/engine, never the reverse). Respect these boundaries when editing.

- **`src/lib/domain/`:** the core model (`types.ts`) and pure domain rules
  (`household.ts`). Plain TypeScript types and functions. No React, no Next.js,
  no I/O, no UI. This is the center of the onion; it imports nothing from the
  outer layers.
- **`src/lib/engine/`:** the pure calculation engine. `project.ts` does the
  year-by-year projection; `runScenario.ts` rolls rows up into totals and the
  baseline-vs-Roth `Comparison`; `tax.ts` is progressive-tax math. **Pure
  functions in, pure data out.** No side effects, no I/O, no React. This is
  what makes the engine unit-testable.
- **`src/lib/optimizer/`:** turns an `OptimizerConfig` strategy (`even`,
  `immediate`, `fillBracket`, `irmaa`, `depleteByRmd`, `manual`) into a concrete
  per-year conversion schedule. Every strategy returns the same `number[]` shape
  so the engine treats them identically. The strategy menu scores each option
  with `scoreConversionStrategies` (one shared baseline, then one Roth run
  each). See the Conversion strategies feature guide.
- **`src/lib/config/`:** app-level constants that are the same for every plan
  (committed fallbacks for federal tax, Medicare/IRMAA tiers, default
  assumptions). Keep these out of the per-household model.
  **Externally changing reference data** (federal tax and medicare today; RMD /
  state tax later) is documented in [`docs/external-data.md`](docs/external-data.md).
  Live values live in Mongo `external_data`, hydrate on app boot (24h cache),
  and are passed into `calculate(household, refs)`. Any feature that needs new
  or differently sourced external data **must update that playbook in the same
  change**, and **must extend `npm run external-data:check`** with that
  dataset's own staleness criteria (`check` is the single source of truth for
  "does something need an update?").
- **`src/lib/auth/`:** Auth.js config, mail, invites, and auth UI. The route
  at `src/app/api/auth/[...nextauth]/route.ts` re-exports `handlers`. Session
  checks use `auth()` from `@/lib/auth/server`.
- **`src/lib/common/`:** shared UI, legal copy, site URLs, and email sending.
- **`src/lib/server/`** + **`src/app/api/`:** plans and external-data APIs.
- **`src/store/`:** Zustand stores. `useScenario.ts` owns editable plans and
  server hydrate/save; `useUI.ts` owns transient UI state. Pending drafts before
  sign-in may briefly use `localStorage`.
- **`src/components/` + `src/app/`:** React/Next.js presentation. Components
  read the active household from the store and call `calculate()`; they should
  **not** reimplement financial logic.

**Guidelines**
- Keep the engine and domain pure and framework-free. Don't import React, the
  store, or I/O into `lib/engine` or `lib/domain`.
- New financial behavior goes in the engine (and gets a test), not in a
  component.
- The UI talks to the engine through `calculate()` / `compareScenarios()`, one
  entry point.
- Use the `@/` path alias for imports.
- Never use a long dash (em dash, `—`) in UI copy, comments, or docs.
- Never use a hyphen (`-`) as a sentence separator (e.g. not
  `themselves - they're`). Prefer a colon, comma, or rephrase. Hyphens inside
  words or compound adjectives are fine (e.g. `year-by-year`).

# Saved plans

Signed-in plans are stored in MongoDB (`plans` collection in the roth DB) via
`/api/plans`. When a plan loads, `migrateHousehold` in `src/store/useScenario.ts`
fills in fields older documents don't have. There is no separate migration
script.

If you rename, remove, or change the meaning of a saved field, update
`migrateHousehold` in the same change so an old plan still opens, and extend
`src/store/migrate.test.ts` from the old shape to the new one. New optional
fields need a safe default there too.

# Code concept: early return (guard clauses)

This codebase prefers **early returns / guard clauses** over nested `if`/`else`.
Handle the edge case or the "skip this item" condition first and `return`/
`continue`/`break`, so the main logic stays at the left margin and is never
buried in indentation.

Examples already in the code:

```8:12:src/lib/engine/tax.ts
export function progressiveTax(
  taxableIncome: number,
  brackets: TaxBracket[],
): number {
  if (taxableIncome <= 0 || brackets.length === 0) return 0;
```

```54:58:src/lib/engine/project.ts
function isIncomeActive(income: IncomeSource, calendarYear: number): boolean {
  if (income.startYear != null && calendarYear < income.startYear) return false;
  if (income.endYear != null && calendarYear > income.endYear) return false;
  return true;
}
```

Inside the projection loop, per-item skips use `continue` rather than wrapping
the body in an `if`:

```360:367:src/lib/engine/project.ts
    for (const income of household.incomes) {
      if (!isWithdrawalIncome(income.kind)) continue;
      if (!isIncomeActive(income, calendarYear)) continue;
      const accId = income.drawsFromAccountId;
      if (!accId || balances[accId] == null) continue;
      const withdraw = incomeAmountForYear(income, i) * 12;
      const balBefore = Math.max(0, balances[accId]);
      const take = Math.min(balBefore, Math.max(0, withdraw));
```

When you write or edit code here:
- Validate inputs and bail out at the top (`if (!ready) return null`).
- In loops, `continue` past items that don't apply instead of nesting.
- Avoid `else` after a `return`; just continue at the same indentation level.

# Golden-master regression is the safety net

This project was built by giving an AI agent the source spreadsheet
(`doc/reference/Example - Aligned.xlsx`) and asking it to build a system matching
it. The golden cases and their pinned results are our **test oracle**. They let
us confirm a code change didn't break the math.

- `src/lib/config/excelPlan.ts` (`EXCEL_HOUSEHOLD`) is a faithful transcription
  of the spreadsheet's inputs, used by the spreadsheet golden case (not shipped
  as a UI sample plan).
- **`src/lib/engine/golden/` is the primary regression net.** It is a set of
  **golden cases, one JSON file per case** in `src/lib/engine/golden/cases/`.
  Each case file holds:
  - `name`: what the plan exercises
  - `strategy`: the conversion strategy it relates to (must match the plan's
    `household.optimizer.strategy`)
  - `commit` / `commitDate`: the git commit the `expected` numbers were last
    verified against, so a discrepancy can be traced to the code changes since
  - `household`: the plan input (same shape the app stores per plan)
  - `expected`: the four comparison metrics (lifetime taxes, Medicare,
    after-tax assets at RMD, inheritance) for the baseline + roth scenarios and
    the deltas.

  The runner `src/lib/engine/golden/golden.test.ts` loads every case, runs the
  real UI entry point `calculate()`, and fails if any number moves, even by a
  cent. The helper + types live in `src/lib/engine/golden/harness.ts`. Cases use
  the `manual` conversion schedule so they stay valid as the optimizer changes.
- `src/lib/engine/engine.test.ts` covers the **mechanical, row-level details**
  (progressive tax, projection spot-checks, real-estate appreciation / mortgage
  amortization / rent) so a regression points at the specific broken behavior,
  not just a moved total.

**This is where fixes live.** When you fix or change a behavior (real estate,
Medicare/IRMAA, RMDs, inheritance, taxes, anything), the corrected/expected
result must be captured here so it can never silently regress:

- Adding/fixing a behavior? Add a golden case (a new `cases/*.json`) and/or a
  row-level case in `engine.test.ts` that exercises it, so the right number is
  pinned to a plan and a commit.
- Found a behavior with no coverage? Add a case now, even if you didn't change it.

**Authoring / blessing golden cases:**

- New case: copy a `cases/*.json`, edit `name`, `strategy`, `note`, and
  `household`, then run `GOLDEN_BLESS=1 npm test` to fill `expected` and stamp
  `commit` / `commitDate`.
- Intentional model change: run `GOLDEN_BLESS=1 npm test`. Only cases whose
  numbers actually moved are rewritten (and re-stamped with the current commit);
  unchanged cases keep their original commit. Call out which metrics moved and
  why in your summary. Never bless blindly, or to "make the test pass".

# Tests are part of every change

Tests are part of the definition of done for **any** development work. On
every change you must:

- **a. Consider tests.** Before and while you code, ask what behavior this
  change touches and which tests cover it. New financial behavior in `domain`,
  `engine`, or `config` should come *with* a test, not after.
- **b. Maintain tests.** Keep existing tests meaningful. If you intentionally
  change the financial model, update the affected `engine.test.ts` expectations
  and re-bless the golden cases (`GOLDEN_BLESS=1 npm test`) **in the same
  change**. Never loosen or delete an assertion just to make a test pass.
- **c. Extend tests when needed.** Every fix and every "make sure this stays
  correct" check goes into a golden case (`src/lib/engine/golden/cases/*.json`)
  and/or `engine.test.ts`: when you add or fix a behavior, edge case, or plan
  shape that nothing currently exercises, add a case that pins the corrected
  result to a plan and a commit.
- **d. Verify nothing broke.** Always run the full suite (and lint) before
  declaring a change done, and report the result:

```bash
npm test      # vitest run: golden regression + engine row-level checks
npm run lint
```

Any movement in the golden cases or `engine.test.ts` expectations must be
**intentional and explained in your summary**. If a number changed and you can't
say why, treat it as a regression, not a case to re-bless.

# Excel: manual testing only

We **no longer analyze or reproduce Excel spreadsheets as part of development**.
The engine is validated by the golden-master and row-level tests above, not by
matching a workbook. Don't build Excel-sync tooling, transcribe workbooks into
plans, or edit/recompute `.xlsx` files as a development task.

Excel may still show up as an **occasional manual sanity-check**, for example a user
eyeballing the four comparison metrics against a spreadsheet by hand. That is a
one-off human activity, not an automated flow and not the source of truth. If a
hand-check turns up a real discrepancy, treat it like any other bug: reproduce it
in the app, fix the code, and **pin the corrected result as a golden case**
(`src/lib/engine/golden/cases/*.json`; see "Golden-master regression is the
safety net" above).

# Results layout (approved by the user, keep it)

The results page layout was signed off by the user. Keep it as is unless the
user asks for a change:

1. Analysis links: **Retirement | Survivorship | Disability | Long-term care**.
   Survivorship and Long-term care show their own settings card under them.
2. Results tabs: **Main | Summary | Graphic view | Main in detail analysis**.
   Each tab shows only its own sections; Main is the default.
   - **Main**: the Assets, Income & Taxes tables (No conversion, then With
     conversion).
   - **Summary**: Total impact, the six metric cards, After-tax assets.
   - **Graphic view**: Retirement Objective, Income Sources, Income Applied
     and Analysis Results charts, then the Assets and Cash flow charts.
   - **Main in detail analysis**: the Year-by-year table (alone, for
     pin-to-top).

Don't move sections between tabs, rename the tabs, or add sections to a tab
without asking. Details live in the analyses feature guide.

# Year-by-year projection table (frozen behavior)

The year-by-year table in `src/components/results/ProjectionTable.tsx` is a
carefully tuned dense UI. Redesigns may change **colors and typography only**.
Do **not** replace its scroll/pin model with a fixed max-height card, remove
sticky axes, or change scroll-parent assumptions without re-validating against
the main results scroller in `src/app/page.tsx`.

## Why it works this way

The table is wide (many year columns) and tall (many metric rows). Users need
to read it full-screen once they scroll to it, while still keeping year headers
and row labels visible while panning.

## Pin-to-top (fills the viewport)

`usePinToTop` + `findScrollParent`:

1. The table starts at its **natural height** in normal document flow inside the
   results scroll pane (`overflow-y: auto` on the main column in `page.tsx`).
2. On scroll, when the wrapper's top reaches the scroll parent's content top, the
   table **pins** (`sticky top-0`) and its height is set to the remaining
   scroll-parent viewport height.
3. From that point the table scrolls **internally** (`overflow-y-auto`), which is
   what makes sticky headers and section titles engage correctly.

Do not wrap this table in a card with a fixed `max-height` that bypasses pin-to-top.

## Sticky axes

- Year headers: `sticky top-0` (and the corner cell `left-0 top-0` with a higher z-index).
- Row labels (first column): `sticky left-0`.
- Section title rows: `sticky left-0 top-8` so they sit under the year header while
  vertical scrolling inside the pinned table.

RMD years use amber column highlighting. Rows with children expand/collapse
inline. Keep that interaction model.

## Always-visible horizontal scrollbar

The wrapper uses `overflow-x-scroll` plus the `.scrollbar-visible` class in
`globals.css`. On macOS the only reliable way to get a permanent (non-overlay)
scrollbar is giving `::-webkit-scrollbar` a size. Chrome 121+ throws those
pseudo-elements away the moment `scrollbar-width` or `scrollbar-color` is set
to anything but `auto`, so those two standard properties live inside
`@supports not selector(::-webkit-scrollbar)` and only ever reach Firefox.
Hoisting them back out of that block silently reverts the table to a
fades-away overlay scrollbar.

A second horizontal scrollbar sits above the year header (`useTopScrollbar`,
`data-top-scrollbar`) so users can pan years without scrolling to the bottom.
It mirrors the table's own scroller both ways. The outer wrapper is what pins
(sticky + height); the inner div is the one that scrolls on both axes, so the
sticky headers still stick to it. `usePinToTop` counts the bar's height in the
table's content height.

The hook lives in `useTopScrollbar.ts`. Every other wide results table (the
Assets, Income & Taxes tables, After-tax assets) uses `DualScroll`, which puts
the same synced bar on top. The user asked for visible bars on every
analysis: the `.scrollbar-visible` thumb is deliberately dark and 14px tall.

## Charts

Assets and cash-flow charts (`AssetsChart.tsx`, `CashflowChart.tsx`) keep their
Recharts structure, modes, and series toggles. Redesigns may remap series colors
and chrome only. The idle last-year tooltip is desktop (`lg+`) only; below
`lg` the tooltip opens only when the user taps a point.
