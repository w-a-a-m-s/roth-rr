/**
 * Human / AI-agent instructions when `external-data:check` fails on
 * state-income-tax. The full agent prompt is written under `.external-data/`
 * (gitignored); the terminal only prints a short summary + paths.
 */
import fs from "node:fs";
import path from "node:path";
import { fallbackAbsolute } from "./util";

export const STATE_TAX_SOURCE_URL =
  "https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/";

/** Repo-relative candidate path (gitignored). Prefer absolute helpers below. */
export const STATE_TAX_CANDIDATE_REL =
  ".external-data/state-income-tax-candidate.json";

/** Repo-relative prompt path (gitignored). Prefer absolute helpers below. */
export const STATE_TAX_PROMPT_REL = ".external-data/state-tax-update-prompt.md";

export function stateTaxCandidateAbsolute(): string {
  return path.resolve(process.cwd(), STATE_TAX_CANDIDATE_REL);
}

export function stateTaxPromptAbsolute(): string {
  return path.resolve(process.cwd(), STATE_TAX_PROMPT_REL);
}

export function stateTaxFallbackAbsolute(): string {
  return (
    fallbackAbsolute("state-income-tax") ??
    path.resolve(process.cwd(), "src/lib/config/data/stateIncomeTax.json")
  );
}

export function stateTaxApplyCommand(candidatePath?: string): string {
  const from = candidatePath ?? stateTaxCandidateAbsolute();
  return `npm run external-data:apply -- --dataset=state-income-tax --from=${from}`;
}

/**
 * Full prompt an operator can give an AI agent to rebuild the dataset.
 * `todayIso` should be YYYY-MM-DD (UTC date of the review).
 * All filesystem paths in the prompt are absolute; the committed fallback is
 * referenced by path (not inlined) so the agent opens that file to compare.
 */
export function buildStateTaxAgentPrompt(todayIso: string): string {
  const candidateAbs = stateTaxCandidateAbsolute();
  const fallbackAbs = stateTaxFallbackAbsolute();
  const applyCmd = stateTaxApplyCommand(candidateAbs);

  return `You are updating the Roth planner's state income-tax external dataset.

REQUIRED WORKFLOW (do not skip):
1. FETCH / OPEN this URL in a browser or with a web-fetch tool and READ the live tables on the page (do not invent rates from memory):
   ${STATE_TAX_SOURCE_URL}
2. Extract every state's rates, brackets, standard deductions, and personal exemptions from that page (and footnotes for special cases like WA capital-gains-only).
3. OPEN the committed fallback file at the absolute path below and DIFF your extracted numbers against it.
4. WRITE a complete candidate JSON (all 51 jurisdictions) to the output path below.
5. Tell the operator to run the apply command at the end of this prompt.

If the Tax Foundation URL 404s or the year in the path is outdated, find the latest "State Income Tax Rates and Brackets" page on taxfoundation.org for the current tax year and use that instead (set sourceUrl to the URL you actually used).
Cross-check mid-year changes against state department-of-revenue publications when Tax Foundation notes a change or a rate looks wrong.

Do NOT rely on training data for rates. The live page is the source of truth.

CURRENT COMMITTED FALLBACK (open this file and compare):
${fallbackAbs}

OUTPUT:
Write a single JSON file to this absolute path:
${candidateAbs}

The JSON must match StateIncomeTaxYear exactly:
{
  "year": <tax year integer, e.g. ${todayIso.slice(0, 4)}>,
  "reviewedAt": "${todayIso}",
  "sourceUrl": "${STATE_TAX_SOURCE_URL}",
  "states": { ... all 51 jurisdictions ... }
}

REQUIRED JURISDICTIONS (exactly these keys, no extras, none missing):
AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC

PER-STATE OBJECT:
{
  "name": string,
  "hasIncomeTax": boolean,
  "capitalGainsOnly"?: boolean,          // true only for Washington
  "brackets": { "single": TaxBracket[], "mfj": TaxBracket[], "hoh"?: TaxBracket[] },
  "standardDeduction": { "single": number, "mfj": number, "hoh"?: number },
  "personalExemption": { "single": number, "mfj": number, "hoh"?: number },
  "socialSecurityTaxablePct": number,    // 0..1 (0 = SS exempt; 0.85 ≈ federal)
  "capitalGains": "ordinary" | "exempt" | "preferential",
  "capitalGainsBrackets"?: { "single": TaxBracket[], "mfj": TaxBracket[], "hoh"?: TaxBracket[] },
  "notes"?: string
}
TaxBracket = { "floor": number, "rate": number } with floors strictly ascending.
If the first published rate starts above $0, prepend { "floor": 0, "rate": 0 }.
No-income-tax states (AK FL NV NH SD TN TX WY): hasIncomeTax false, empty brackets, deductions 0, capitalGains "ordinary", socialSecurityTaxablePct 0.
Washington (WA): hasIncomeTax false, capitalGainsOnly true, capitalGains "preferential", and non-empty capitalGainsBrackets for single and mfj.
Missouri (MO): capitalGains "exempt" if still exempting capital gains.
Tax credits in source tables → personalExemption 0 (we do not model credits).
n.a. deductions → 0.

COMPLETENESS (apply will REJECT the entire update if any of these fail — there is no partial apply):
1. All 51 codes present; no unknown codes.
2. year integer; reviewedAt exactly YYYY-MM-DD (use ${todayIso}).
3. Every hasIncomeTax:true state has non-empty single and mfj brackets.
4. Every capitalGainsOnly state has non-empty capitalGainsBrackets.
5. Bracket floors strictly ascending; rates finite numbers.
6. socialSecurityTaxablePct in [0, 1]; standardDeduction / personalExemption non-negative for single and mfj.
7. Head of household (\`hoh\`) is OPTIONAL per state. Include \`hoh\` brackets / deduction / exemption ONLY when the state has a distinct HOH schedule (today: CA, NY, NJ). Do not invent HOH numbers: if the source has no HOH column, omit the key so the engine aliases to single. When the committed fallback already has \`hoh\` for a state, KEEP those keys (update the numbers if the source moved). Never drop an existing \`hoh\` key.

After fetching ${STATE_TAX_SOURCE_URL} and comparing against ${fallbackAbs}:
keep unchanged numbers; update what moved; always set reviewedAt to ${todayIso}.
If rates are unchanged vs the fallback, still emit a full valid file with reviewedAt=${todayIso}.
Write the JSON to ${candidateAbs}, then tell the operator to run:
${applyCmd}
`;
}

/** Write the full agent prompt under `.external-data/` (gitignored). Returns absolute path. */
export function writeStateTaxAgentPromptFile(todayIso: string): string {
  const prompt = buildStateTaxAgentPrompt(todayIso);
  const abs = stateTaxPromptAbsolute();
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${prompt}\n`, "utf8");
  return abs;
}

/**
 * Short terminal banner when state-income-tax check fails. Full prompt is on disk.
 */
export function printStateTaxCheckInstructions(todayIso: string): void {
  const promptAbs = writeStateTaxAgentPromptFile(todayIso);
  const candidateAbs = stateTaxCandidateAbsolute();
  const fallbackAbs = stateTaxFallbackAbsolute();
  const applyCmd = stateTaxApplyCommand(candidateAbs);
  const line = "=".repeat(78);

  console.error("");
  console.error(line);
  console.error("=== STATE TAX CHECK INSTRUCTIONS");
  console.error(line);
  console.error("");
  console.error(
    "State income-tax data needs a review (rates change mid-year; year alone is not enough).",
  );
  console.error("");
  console.error("1. Have an AI agent open the prompt file, FETCH the Tax Foundation URL,");
  console.error("   extract live rates, compare against the committed fallback, write candidate JSON.");
  console.error(`   Prompt written to: ${promptAbs}`);
  console.error(`   Source URL:        ${STATE_TAX_SOURCE_URL}`);
  console.error(`   Fallback to compare: ${fallbackAbs}`);
  console.error(`   Candidate output:  ${candidateAbs}`);
  console.error("");
  console.error("2. With the app running (npm run dev) and EXTERNAL_DATA_ADMIN_TOKEN set, apply:");
  console.error(`   ${applyCmd}`);
  console.error("");
  console.error(
    "   Apply is atomic: missing/invalid states abort with nothing written.",
  );
  console.error(
    "   On success: commit the rewritten fallback + any golden/test diffs.",
  );
  console.error(line);
  console.error("");
}
