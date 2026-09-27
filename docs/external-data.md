# External reference data

Live IRS/CMS (and future) tables live in MongoDB collection `external_data`.
The browser hydrates them on app boot (24h cache). The pure engine never
fetches: it receives tables as `calculate(household, refs)` arguments.

Committed fallbacks under `src/lib/config/data/` power offline use and all
unit/golden tests. After every successful apply, **DB ≡ fallback ≡ tests**.

## TL;DR

### Prerequisite: app must be running

`npm run external-data:*` (`check` live GET, `seed`, `apply`) calls the app's
HTTP API. Start the app in **another terminal** first:

```bash
npm run dev
```

Scripts use `EXTERNAL_DATA_API_URL` from `.env` (default
`http://localhost:3000`). That must be this app. Without a running server,
those commands fail with `fetch failed`.

### Staying current

A GitHub Action runs every week and executes `npm run external-data:check`.
**`check` is the single source of truth** for whether any external dataset needs
an update. It must cover **every** wired dataset, each with that dataset's own
staleness criteria (not always "calendar year"). If anything is stale or drifted,
the Action fails. That is your alarm. You can run the same check yourself:

```bash
npm run external-data:check
```

Today: `federal-tax` and `medicare` (year-vs-calendar); `state-income-tax`
(year + all 51 jurisdictions + `reviewedAt` within 90 days).

### When a dataset needs an update

1. Retrieve the new data from the source in that dataset's section below
   (IRS Rev. Proc, CMS fact sheet, etc.).
2. Convert it to the documented JSON shape for that dataset (described below
   under each **Dataset:** section).
3. Apply (one dataset at a time; atomic: DB + fallback + tests, or rollback):

```bash
npm run external-data:apply -- --dataset=federal-tax --from=./candidate.json
# or
npm run external-data:apply -- --dataset=medicare --from=./candidate.json
```

4. Commit the fallback + any test diffs apply left behind. Apply is incomplete
   until that commit.

### First-time / empty DB

```bash
npm run external-data:seed
```

Needs `EXTERNAL_DATA_ADMIN_TOKEN` and `EXTERNAL_DATA_API_URL` in `.env` (scripts
load it automatically), plus `npm run dev` as above. Details below.

## Rules

- Live data: Mongo `external_data` (one document per dataset `key`).
- Browser caches `GET /api/external-data` for 24 hours (`localStorage`).
- Engine receives data as arguments; never fetches.
- Committed fallback under `src/lib/config/data/` for tests/offline.
- Successful apply **always** rewrites that fallback and re-blesses tests in
the same change.
- Each apply is **atomic per dataset** (one `--dataset=` key): validate → DB →
fallback → tests, or full rollback of DB + fallback.
- `**npm run external-data:check` is mandatory for every wired dataset.** It is
the one place that answers "do I need to update something?" The weekly GitHub
Action only runs `check`; if a dataset is not in `check`, you will never get
an alarm for it. Do not ship a new external source without extending `check`.

## Adding a dataset (required checklist)

When a feature needs new or differently sourced external data, in the **same
change**:

1. Add a section to this doc (source → format → who/how → into DB → **how
  `check` decides it is stale**).
2. Add provenance defaults in `src/lib/externalData/meta.ts` and types/validation.
3. Committed fallback under `src/lib/config/data/`, register in
  `scripts/external-data/util.ts` `FALLBACK_PATHS`.
4. Wire GET/PUT validation, hydrate into `ReferenceData`, engine injection.
5. Extend `apply` / `seed` for that key.
6. **Extend `scripts/external-data/check.ts`** so the new key is checked with
  criteria that match how that data actually goes stale, for example:
  - **Yearly tables** (federal tax, medicare): fail if fallback `year` <
  calendar year (optional `--year=` override).
  - **Per-jurisdiction / irregular** (e.g. state income tax): fail on your
  documented rule: missing states, `effectiveDate` / `asOf` older than a
  threshold, hash/version mismatch vs an expected manifest, etc. Document
  the rule in this file's dataset section.
  - Always include optional live GET drift (fallback ≠ Mongo) when the API is
  reachable, same as existing keys.
7. Confirm the weekly Action still only needs `npm run external-data:check`
  (no per-dataset workflow). If `check` exits non-zero for the new rule, the
   Action fails. That is intentional.

A dataset that is in Mongo/hydrate but **not** in `check` is incomplete.

## Env

| Variable | Where | Purpose |
|----------|-------|---------|
| `EXTERNAL_DATA_ADMIN_TOKEN` | server + `.env` for apply/seed | Bearer token for `PUT /api/external-data` |
| `EXTERNAL_DATA_API_URL` | `.env` for apply/check/seed | App origin (`http://localhost:3000`) |

Scripts (`apply` / `check` / `seed`) auto-load `.env` then `.env.local`
(existing shell env wins). You do not need to `export` these for local npm runs
if they are in `.env`. The Next.js server also reads the same `.env` for PUT auth.

## Document shape (Mongo + GET)

```ts
{
  key: "federal-tax" | "medicare" | "rmd" | "state-income-tax",
  year: number,
  data: unknown,           // typed per dataset
  meta: {
    source: string,
    sourceUrl?: string,
    updateMethod: string,
    format: string,
    processor: string,
    notes?: string,
  },
  updatedAt: number,
  updatedBy?: string,
}
```

## Dataset: federal-tax

- **What:** Federal ordinary brackets, standard deduction, senior deduction, and
  long-term capital gains brackets (0% / 15% / 20%) for MFJ, Single, and Head of
  household.
- **Source:** IRS annual inflation Rev. Proc (e.g. Rev. Proc. 2025-32) / IRS newsroom.
- **Cadence:** Annual (fall). Weekly check only detects staleness (year lag).
- **Format:** `FederalTaxYear` JSON (see `src/lib/config/federalTax.ts`).
Fallback file: `src/lib/config/data/federalTax.json`.
- **How to update:**
  1. Obtain new year numbers from the IRS publication (ordinary + §1(h) LTCG
     maximum zero / 15% amounts).
  2. Write candidate JSON matching `FederalTaxYear` (include `longTermCapitalGains`).
  3. `npm run external-data:apply -- --dataset=federal-tax --from=./candidate.json`
    (one dataset only; atomic). On success: admin PUT → rewrite fallback →
     re-bless goldens / `engine.test.ts` when numbers move. On mid-flight
     failure: roll back DB + fallback.
  4. Commit the fallback + test diffs in the same PR. Apply is incomplete until
    that commit.
- **Who:** Human or Claude cowork following this section. No PDF scrape in v1.
- **Allow rate-set changes:** `--allow-rate-change` (statute change only; applies
  to ordinary and LTCG rate sets).

## Dataset: medicare

- **What:** Medicare Part B premiums + IRMAA tiers by filing status (MFJ + Single;
  Head of household aliases to the individual / Single schedule).
- **Source:** [CMS fact sheet: 2026 Medicare Parts A & B Premiums and Deductibles](https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-deductibles)
(published annually, typically mid-November for the next calendar year).
- **Cadence:** Annual (fall). Weekly check detects year lag.
- **Format:** `MedicarePartBYear` JSON (see `src/lib/config/medicare.ts`).
Fallback file: `src/lib/config/data/medicare.json`.
- **How to update:**
  1. Open the latest CMS fact sheet (URL pattern:
    `https://www.cms.gov/newsroom/fact-sheets/{YEAR}-medicare-parts-b-premiums-deductibles`).
  2. Extract standard Part B premium and the IRMAA total-premium table for
    individual and joint filers into `MedicarePartBYear` JSON (six tiers each,
     `magiFloor` ascending from 0, `monthlyPremium` = standard + IRMAA).
  3. `npm run external-data:apply -- --dataset=medicare --from=./candidate.json`
    (one dataset only; atomic). On success: admin PUT → rewrite fallback →
     re-bless goldens when numbers move. On mid-flight failure: roll back.
  4. Commit the fallback + test diffs in the same PR.
- **Who:** Human or Claude cowork (read CMS HTML/PDF, build candidate JSON).
- **Tier-count changes:** `--allow-rate-change` if CMS changes the number of IRMAA tiers.
- **How you know:** weekly `external-data:check` / GitHub Action fails when
fallback `year` lags the calendar year (same alarm as federal-tax).

## Dataset: rmd (deferred, ships as a committed constant)

- **What:** IRS Uniform Lifetime Table (age → applicable denominator).
- **Source:** IRS Pub. 590-B, Appendix B, Table III.
- **Where it lives:** `src/lib/config/rmdTable.ts`, as a plain constant with
  `uniformLifetimeDenominator(age)`. Not in Mongo, not in `ReferenceData`, and
  deliberately not part of `external-data:check`.
- **Why it isn't an external dataset:** unlike tax and Medicare, this table has
  no annual cadence. The IRS reissues the life expectancy tables rarely (the
  current ones took effect in 2022), so a yearly staleness alarm would only ever
  cry wolf. The `rmd` key stays declared but unimplemented, so
  `external-data:apply --dataset=rmd` is rejected by validation.
- **How to update (rare):** when the IRS publishes new life expectancy tables,
  edit `rmdTable.ts` from Appendix B, update `rmdTable.test.ts`, and re-bless the
  golden cases. Starting age is separate: it comes from birth year (SECURE /
  SECURE 2.0) in `src/lib/domain/rmd.ts`.

## Dataset: state-income-tax

- **What:** State income tax tables for all 50 states + DC (brackets, standard
  deduction, personal exemption, Social Security inclusion, capital-gains
  treatment). Not sales tax. Washington is capital-gains-only. `single` and
  `mfj` are required; `hoh` is optional and only present for states with a
  distinct HOH schedule (CA, NY, NJ today). Missing `hoh` aliases to `single`.
- **Source:** [Tax Foundation 2026 state income tax rates and brackets](https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/)
  (cross-check state DOR publications for mid-year changes).
- **Cadence:** Re-review at least every **90 days** (and whenever legislatures
  cut rates). State tables change mid-year; calendar `year` alone is not enough.
- **Format:** `StateIncomeTaxYear` JSON (see `src/lib/config/stateTax.ts`).
  Required top-level fields: `year`, `reviewedAt` (`YYYY-MM-DD`), `states`.
  Optional: `sourceUrl`. Fallback: `src/lib/config/data/stateIncomeTax.json`.
- **How to update:**
  1. When `external-data:check` fails on this key, the terminal prints a short
     **STATE TAX CHECK INSTRUCTIONS** banner and writes a full AI agent prompt
     (absolute paths to source, fallback, and candidate: fallback is not
     inlined) to `.external-data/state-tax-update-prompt.md` (gitignored).
  2. Have an AI follow that prompt: scan Tax Foundation / DOR, open the
     absolute fallback path, write the candidate JSON to the absolute path
     named in the prompt (under `.external-data/`, all 51 codes). Set
     `reviewedAt` to today's date even if numbers did not move.
  3. Run the apply command printed in the banner (uses an absolute `--from=`
     path), e.g.
     `npm run external-data:apply -- --dataset=state-income-tax --from=<abs-path-to-candidate.json>`
     Apply is **atomic**: validation runs first; missing states / bad schema
     abort with nothing written to Mongo or the fallback. Mid-flight failures
     roll back DB + fallback.
  4. Commit the fallback + test diffs in the same PR.
- **Who:** Human or Claude cowork. No automated scrape in v1. Check cannot
  detect a silent rate cut by itself; it forces a periodic human review.
- **How `check` decides stale:**
  1. fallback `year` &lt; expected calendar year;
  2. any of the 51 jurisdictions missing / invalid schema;
  3. `reviewedAt` older than **90 days** (or missing / future);
  4. live GET drifts from fallback when API reachable.
  On any of those failures, check prints the agent prompt + apply command.
- **Allow structural changes:** `--allow-rate-change` is unused for this key
  (rates/brackets vary freely by state); validation still requires complete
  51-state coverage, ascending floors, and a valid `reviewedAt`. Incomplete
  candidates never partially apply.

## Commands

**Prerequisite:** `npm run dev` (or a deployed app) must be running so
`EXTERNAL_DATA_API_URL` is reachable. Scripts load `.env` automatically.
`apply` and `seed` also need `EXTERNAL_DATA_ADMIN_TOKEN` in `.env`.

### `external-data:apply`

**Purpose:** Push a new candidate for **one** dataset into production shape:
Mongo + committed fallback + tests, atomically.

```bash
npm run external-data:apply -- --dataset=federal-tax --from=./candidate.json
# optional: --allow-rate-change   (statute changed the rate set)
# optional: --skip-bless         (skip GOLDEN_BLESS / verify; not for normal use)
```

What it does, in order:

1. Requires exactly one `--dataset=` and a `--from=` JSON file.
2. Snapshots the current DB doc (GET) and the current fallback file.
3. Validates the candidate against that dataset’s schema (fail here → no writes).
4. `PUT /api/external-data` with the admin token (writes Mongo).
5. Rewrites the committed fallback under `src/lib/config/data/`.
6. Re-blesses goldens (`GOLDEN_BLESS=1 npm test`), then runs `npm test` to verify.
7. On any failure after step 4: restores the previous fallback file and PUTs the
  previous DB doc back; exits non-zero.
8. On success: leave a commit-ready diff. **You still must commit** fallback +
  any test changes; apply is incomplete until that commit.

Use this when IRS/CMS (etc.) published new numbers and you have a candidate JSON.

### `external-data:check`

**Purpose:** Read-only health check. Does **not** write Mongo or files.
Used manually and by the weekly GitHub Action.

```bash
npm run external-data:check
npm run external-data:check -- --year=2027   # override expected tax year
```

What it does:

1. For **every** wired dataset in `CHECKABLE` (`federal-tax`, `medicare`, …),
  load the committed fallback and apply that dataset's staleness rule
   (today: `year` ≥ expected calendar year, or `--year=`).
2. If the API is reachable, `GET` live data for each key and fail on invalid
  payload, **drift** (live ≠ fallback), or live year lagging expected.
3. If the API is down or returns 404 (not seeded), warn and still pass when
  the fallback rule alone is OK.

**Invariant:** any new external dataset **must** be added to `CHECKABLE` with
its own criteria before the feature is considered done. `check` (and thus the
weekly Action) is the only alarm that something needs updating.

Use this to detect "we forgot to update" or "DB and repo fell out of sync."

### `external-data:seed`

**Purpose:** First-time (or empty-DB) bootstrap: copy the **committed fallback**
into Mongo via the admin API. Does **not** change fallback files or tests.

```bash
npm run external-data:seed                         # all seedable datasets
npm run external-data:seed -- --dataset=medicare   # one key
```

What it does:

1. Reads the committed fallback JSON for the chosen key(s).
2. `PUT /api/external-data` with that payload + default provenance meta.
3. Prints the seeded year on success.

Use this after deploy / local setup when `GET ?key=...` is 404 so the app can
hydrate from Mongo instead of only the fallback. Safe to re-run; it upserts.
With no `--dataset`, seeds every seedable key (needed for hydrate).

## Claude cowork checklist

1. Read this file for the dataset section.
2. Fetch/build candidate JSON in the documented format.
3. Run apply with the correct `--dataset=` and `--from=`.
4. Review the printed metric diff; commit fallback + test changes.
5. If you add a new external dataset or change how one is sourced, **update this
  doc in the same change**, and **extend `external-data:check`** with that
   dataset's staleness criteria so the weekly Action can alarm on it.

