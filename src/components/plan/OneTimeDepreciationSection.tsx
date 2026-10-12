"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { MoneyInput, TextInput, YearSelect } from "@/components/ui/inputs";
import type { OneTimeDepreciation } from "@/lib/domain/types";
import { formatCurrency } from "@/lib/format";
import { uid } from "@/lib/id";
import { useHousehold, useScenario } from "@/store/useScenario";

interface Draft {
  id: string | null;
  label: string;
  amount: number;
  year: number | undefined;
}

/**
 * One-time 100% depreciation in the plan summary: each entry (asset name,
 * amount, year) deducts its full amount from that year's taxable income.
 */
export function OneTimeDepreciationSection({ readOnly }: { readOnly: boolean }) {
  const household = useHousehold();
  const setOneTimeDepreciation = useScenario((s) => s.setOneTimeDepreciation);
  const entries = household.oneTimeDepreciation ?? [];
  const currentYear = new Date().getFullYear();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const openNew = () => {
    setSubmitted(false);
    setDraft({ id: null, label: "", amount: 0, year: currentYear });
  };
  const openEdit = (entry: OneTimeDepreciation) => {
    setSubmitted(false);
    setDraft({ id: entry.id, label: entry.label, amount: entry.amount, year: entry.year });
  };

  const valid = draft != null && draft.amount > 0 && draft.year != null;

  const save = () => {
    setSubmitted(true);
    if (!draft || !valid || draft.year == null) return;
    const entry: OneTimeDepreciation = {
      id: draft.id ?? uid("dep"),
      label: draft.label.trim(),
      amount: draft.amount,
      year: draft.year,
    };
    const existing = entries.find((e) => e.id === draft.id);
    if (existing?.hidden) entry.hidden = true;
    const next = draft.id
      ? entries.map((e) => (e.id === draft.id ? entry : e))
      : [...entries, entry];
    next.sort((a, b) => a.year - b.year);
    setOneTimeDepreciation(next);
    setDraft(null);
  };

  // Hiding keeps the entry but takes it out of the taxes and the results.
  const toggleHidden = (id: string) =>
    setOneTimeDepreciation(
      entries.map((e) => {
        if (e.id !== id) return e;
        const next = { ...e };
        if (e.hidden) delete next.hidden;
        else next.hidden = true;
        return next;
      }),
    );

  const remove = (id: string) =>
    setOneTimeDepreciation(entries.filter((e) => e.id !== id));

  return (
    <section className="border-b border-border-subtle py-[13px]">
      <div className="mb-[7px] flex items-center justify-between">
        <h3 className="m-0 text-[13.5px] font-bold text-foreground">
          One-time depreciation
        </h3>
        {readOnly ? null : (
          <button
            type="button"
            onClick={openNew}
            className="border-0 bg-transparent p-0 text-xs font-bold text-accent"
          >
            Add
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {entries.length === 0 ? (
          <p className="text-[12.5px] text-muted-3">No 100% depreciation added</p>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className={`flex items-baseline justify-between gap-2${entry.hidden ? " opacity-50" : ""}`}
            >
              <span className="truncate text-[12.5px] text-muted">
                {entry.label || "Asset"} ({entry.year})
                {entry.hidden ? " (hidden)" : ""}
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="text-[12.5px] font-semibold tabular-nums text-foreground">
                  {formatCurrency(entry.amount)}
                </span>
                {readOnly ? null : (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleHidden(entry.id)}
                      aria-pressed={!entry.hidden}
                      aria-label={`${entry.hidden ? "Show" : "Hide"} ${entry.label || "asset"}`}
                      className="border-0 bg-transparent p-0 text-[11px] font-bold text-accent"
                    >
                      {entry.hidden ? "Show" : "Hide"}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(entry)}
                      className="border-0 bg-transparent p-0 text-[11px] font-bold text-accent"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(entry.id)}
                      aria-label={`Remove ${entry.label || "asset"}`}
                      className="border-0 bg-transparent p-0 text-[11px] font-bold text-danger"
                    >
                      Remove
                    </button>
                  </>
                )}
              </span>
            </div>
          ))
        )}
      </div>
      <div className="mt-2 text-[11.5px] leading-snug text-muted-2">
        <p className="m-0">Eligible taxpayers include:</p>
        <ul className="m-0 mt-1 list-disc pl-4">
          <li>Individuals with a sole proprietorship (Schedule C)</li>
          <li>Individuals with rental real estate (Schedule E)</li>
          <li>
            Partnerships, multi-member LLCs, S corporations, and C corporations
            (with the deduction flowing through to owners where applicable)
          </li>
        </ul>
      </div>

      <Modal
        open={draft != null}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit 100% depreciation" : "Add 100% depreciation"}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={submitted && !valid}>
              Save
            </Button>
          </div>
        }
      >
        {draft ? (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-[12.5px] text-muted-2">
              The full amount comes off that year&apos;s taxable income.
            </p>
            <Field label="Asset name" htmlFor="depreciation-label">
              <TextInput
                id="depreciation-label"
                value={draft.label}
                onChange={(label) => setDraft({ ...draft, label })}
                placeholder="e.g. Equipment"
                autoFocus
              />
            </Field>
            <Field label="Amount" htmlFor="depreciation-amount">
              <MoneyInput
                id="depreciation-amount"
                value={draft.amount || undefined}
                onChange={(amount) => setDraft({ ...draft, amount: Math.max(0, amount) })}
                placeholder="0"
              />
            </Field>
            <Field label="Year" htmlFor="depreciation-year">
              <YearSelect
                id="depreciation-year"
                value={draft.year}
                from={currentYear - 5}
                to={2100}
                onChange={(year) => setDraft({ ...draft, year })}
              />
            </Field>
            {submitted && !valid ? (
              <p className="m-0 text-xs text-danger" role="alert">
                Enter an amount and a year.
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
