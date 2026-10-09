"use client";

import { useState } from "react";
import { useHousehold, useScenario } from "@/store/useScenario";
import { Field } from "@/components/ui/Field";
import { MoneyInput, PercentInput, TextInput } from "@/components/ui/inputs";
import { AddButton, EntityCard, ReadStat } from "@/components/ui/EntityCard";
import { RestoreDeleted } from "@/components/ui/RestoreDeleted";
import {
  DEFAULT_BUSINESS_GROWTH,
  DEFAULT_INCOME_GROWTH,
} from "@/lib/config/defaults";
import { uid } from "@/lib/id";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { Business } from "@/lib/domain/types";
import {
  GROWTH_START_LABELS,
  businessGrowthStart,
  businessIncomes,
} from "@/lib/domain/household";
import { GrowthStartToggle } from "@/components/ui/GrowthStartToggle";

function BusinessFields({
  business,
  editing,
  onEdit,
  onDone,
}: {
  business: Business;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
}) {
  const household = useHousehold();
  const { updateBusiness, removeBusiness, addIncome, updateIncome } =
    useScenario();
  const linked = businessIncomes(household, business.id);
  const monthlyIncome = linked.reduce((sum, inc) => sum + inc.monthlyAmount, 0);
  const purchasePrice = business.purchasePrice ?? 0;

  // The card edits the first linked business income, or creates one. Dates,
  // owner, growth and taxes stay on the Income step.
  function setMonthlyIncome(monthlyAmount: number) {
    const first = linked[0];
    if (first) {
      updateIncome(first.id, { monthlyAmount });
      return;
    }
    if (monthlyAmount <= 0) return;
    addIncome({
      id: uid("inc"),
      label: business.label || "Business income",
      ownerId: household.mainPersonId ?? household.people[0]?.id ?? "",
      kind: "business",
      monthlyAmount,
      growthRate: DEFAULT_INCOME_GROWTH,
      taxability: "full",
      businessId: business.id,
    });
  }

  return (
    <EntityCard
      title={business.label || "Business"}
      editing={editing}
      onEdit={onEdit}
      onDone={onDone}
      summaryLayout="stacked"
      onRemove={() => {
        removeBusiness(business.id);
        onDone();
      }}
      summary={
        <>
          <ReadStat label="Purchase price" value={formatCurrency(purchasePrice)} />
          <ReadStat label="Current value" value={formatCurrency(business.value)} />
          <ReadStat
            label="Appreciation"
            value={`${formatPercent(business.growthRate)} / yr`}
          />
          <ReadStat
            label="Growth starts"
            value={GROWTH_START_LABELS[businessGrowthStart(business)]}
          />
          <ReadStat
            label="Business income"
            value={`${formatCurrency(monthlyIncome)} / mo`}
          />
        </>
      }
    >
      <div className="flex flex-col gap-2.5">
        <Field layout="row" label="Label">
          <TextInput
            value={business.label}
            onChange={(label) => updateBusiness(business.id, { label })}
          />
        </Field>
        <Field
          layout="row"
          label="Purchase price"
          help="What you paid for your share of the business. Shown for reference with the gain to date: heirs get a stepped-up basis, so it does not change the projection."
        >
          <MoneyInput
            value={purchasePrice}
            onChange={(next) => updateBusiness(business.id, { purchasePrice: next })}
          />
        </Field>
        <Field
          layout="row"
          label="Current value"
          help="What your share of the business is worth today. It grows each year by the appreciation rate and counts toward total assets, after-tax assets, and the inheritance."
        >
          <MoneyInput
            value={business.value}
            onChange={(value) => updateBusiness(business.id, { value })}
          />
        </Field>
        <Field
          layout="row"
          label="Appreciation"
          help="Yearly increase in the business's value."
        >
          <PercentInput
            value={business.growthRate}
            onChange={(growthRate) =>
              updateBusiness(business.id, { growthRate })
            }
          />
        </Field>
        <Field
          layout="row"
          label="Growth starts"
          help="Plan start grows the value from today. Retirement keeps it at today's value until the plan starts (the household's first retirement year), then it starts growing."
        >
          <GrowthStartToggle
            value={businessGrowthStart(business)}
            onChange={(growthStart) =>
              updateBusiness(business.id, { growthStart })
            }
          />
        </Field>
        <Field
          layout="row"
          label="Monthly business income"
          help="What the business pays you each month. It is the Business income entry on the Income step, linked to this business: set its owner, years, growth, and taxes there."
        >
          <MoneyInput value={monthlyIncome} onChange={setMonthlyIncome} />
        </Field>
        {linked.length > 1 ? (
          <p className="m-0 text-xs text-muted lg:pl-[calc(13.5rem+0.75rem)]">
            {linked.length} business incomes are linked; this field edits the
            first. Edit the others on the Income step.
          </p>
        ) : null}
        <p className="m-0 text-xs text-muted lg:pl-[calc(13.5rem+0.75rem)]">
          Gain to date: {formatCurrency(business.value - purchasePrice)}
        </p>
      </div>
    </EntityCard>
  );
}

export function BusinessStep() {
  const household = useHousehold();
  const { addBusiness, restoreBusiness, discardDeletedBusiness } =
    useScenario();
  const [editingId, setEditingId] = useState<string | null>(null);
  const businesses = household.businesses ?? [];

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-xs text-muted">
          Your share of any privately held business. Its value counts toward
          total assets and the inheritance.
        </p>
        <div className="flex gap-2">
          <RestoreDeleted
            items={(household.deletedBusinesses ?? []).map((entry) => ({
              id: entry.item.id,
              label: entry.item.label || "Business",
              deletedAt: entry.deletedAt,
            }))}
            onRestore={restoreBusiness}
            onDiscard={discardDeletedBusiness}
          />
          <AddButton
            label="Add business"
            onClick={() => {
              const id = uid("biz");
              addBusiness({
                id,
                label: "",
                value: 0,
                growthRate: DEFAULT_BUSINESS_GROWTH,
              });
              setEditingId(id);
            }}
          />
        </div>
      </div>
      {businesses.map((business) => (
        <BusinessFields
          key={business.id}
          business={business}
          editing={editingId === business.id}
          onEdit={() => setEditingId(business.id)}
          onDone={() => setEditingId(null)}
        />
      ))}
    </div>
  );
}
