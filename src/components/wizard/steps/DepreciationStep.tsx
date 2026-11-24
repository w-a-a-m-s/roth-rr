"use client";

import { useState } from "react";
import { useHousehold, useScenario } from "@/store/useScenario";
import { Field } from "@/components/ui/Field";
import { MoneyInput, TextInput, YearSelect } from "@/components/ui/inputs";
import { AddButton, EntityCard, ReadStat } from "@/components/ui/EntityCard";
import { uid } from "@/lib/id";
import { formatCurrency } from "@/lib/format";
import type { OneTimeDepreciation } from "@/lib/domain/types";

const SHOW_OPTIONS = [
  { value: false, label: "Show" },
  { value: true, label: "Hide" },
] as const;

/** Show / Hide segmented control: a hidden entry stays saved but isn't counted. */
function ShowHideToggle({
  hidden,
  onChange,
}: {
  hidden: boolean;
  onChange: (hidden: boolean) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="In the results"
      className="flex rounded-[9px] border border-border-2 bg-surface-muted p-0.5"
    >
      {SHOW_OPTIONS.map((option) => {
        const on = option.value === hidden;
        return (
          <button
            key={option.label}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.value)}
            className={`flex-1 whitespace-nowrap rounded-[7px] px-2 py-1 text-base transition md:text-sm ${
              on
                ? "bg-white font-semibold text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function sortByYear(entries: OneTimeDepreciation[]): OneTimeDepreciation[] {
  return [...entries].sort((a, b) => a.year - b.year);
}

function DepreciationFields({
  entry,
  editing,
  onEdit,
  onDone,
  onChange,
  onRemove,
}: {
  entry: OneTimeDepreciation;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
  onChange: (patch: Partial<OneTimeDepreciation>) => void;
  onRemove: () => void;
}) {
  const currentYear = new Date().getFullYear();
  return (
    <EntityCard
      title={entry.label || "Asset"}
      badge={
        entry.hidden ? (
          <span className="rounded-full bg-segment px-2 py-0.5 text-[10.5px] font-bold text-muted-2">
            Hidden
          </span>
        ) : null
      }
      editing={editing}
      onEdit={onEdit}
      onDone={onDone}
      onRemove={onRemove}
      summary={
        <>
          <ReadStat label="Amount" value={formatCurrency(entry.amount)} />
          <ReadStat label="Year" value={entry.year} />
        </>
      }
    >
      <div className="flex flex-col gap-2.5">
        <Field layout="row" label="Asset name">
          <TextInput
            value={entry.label}
            onChange={(label) => onChange({ label })}
            placeholder="e.g. Equipment"
          />
        </Field>
        <Field
          layout="row"
          label="Amount"
          help="The full amount comes off that year's federal and state taxable income."
        >
          <MoneyInput
            value={entry.amount || undefined}
            onChange={(amount) => onChange({ amount: Math.max(0, amount) })}
            placeholder="0"
          />
        </Field>
        <Field layout="row" label="Year" help="The tax year the asset is placed in service.">
          <YearSelect
            value={entry.year}
            from={currentYear - 5}
            to={2100}
            onChange={(year) => {
              if (year == null) return;
              onChange({ year });
            }}
          />
        </Field>
        <Field
          layout="row"
          label="In the results"
          help="Hide keeps the entry in the plan but leaves it out of the taxes and the results."
        >
          <ShowHideToggle
            hidden={entry.hidden === true}
            onChange={(hidden) => onChange({ hidden })}
          />
        </Field>
        {entry.amount > 0 ? null : (
          <p className="m-0 text-xs text-muted lg:pl-[calc(13.5rem+0.75rem)]">
            Add an amount so this entry counts. Entries with no amount aren&apos;t saved.
          </p>
        )}
      </div>
    </EntityCard>
  );
}

/**
 * One-time 100% (bonus) depreciation: each entry (asset name, amount, year)
 * deducts its full amount from that year's taxable income.
 */
export function DepreciationStep() {
  const household = useHousehold();
  const setOneTimeDepreciation = useScenario((s) => s.setOneTimeDepreciation);
  const entries = household.oneTimeDepreciation ?? [];
  const [editingId, setEditingId] = useState<string | null>(null);

  const update = (id: string, patch: Partial<OneTimeDepreciation>) => {
    const next = entries.map((e) => {
      if (e.id !== id) return e;
      const merged = { ...e, ...patch };
      if (!merged.hidden) delete merged.hidden;
      return merged;
    });
    // Keep the list in place while a year is being typed; sort on Done.
    setOneTimeDepreciation(next);
  };

  const done = () => {
    setOneTimeDepreciation(sortByYear(entries));
    setEditingId(null);
  };

  const remove = (id: string) => {
    setOneTimeDepreciation(entries.filter((e) => e.id !== id));
    setEditingId(null);
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-xs text-muted">
          One-time 100% depreciation. Each asset&apos;s full amount comes off
          that year&apos;s taxable income.
        </p>
        <AddButton
          label="Add depreciation"
          shortLabel="Add"
          onClick={() => {
            const id = uid("dep");
            setOneTimeDepreciation([
              ...entries,
              { id, label: "", amount: 0, year: new Date().getFullYear() },
            ]);
            setEditingId(id);
          }}
        />
      </div>
      {entries.map((entry) => (
        <DepreciationFields
          key={entry.id}
          entry={entry}
          editing={editingId === entry.id}
          onEdit={() => setEditingId(entry.id)}
          onDone={done}
          onChange={(patch) => update(entry.id, patch)}
          onRemove={() => remove(entry.id)}
        />
      ))}
      <div className="text-[11.5px] leading-snug text-muted-2">
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
    </div>
  );
}
