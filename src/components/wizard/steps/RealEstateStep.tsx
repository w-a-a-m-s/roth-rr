"use client";

import { useRef, useState } from "react";
import { useHousehold, useScenario } from "@/store/useScenario";
import { Field } from "@/components/ui/Field";
import {
  MoneyInput,
  NumberField,
  PercentInput,
  TextInput,
  YearSelect,
} from "@/components/ui/inputs";
import { AddButton, EntityCard, ReadStat } from "@/components/ui/EntityCard";
import { RestoreDeleted } from "@/components/ui/RestoreDeleted";
import { GrowthStartToggle } from "@/components/ui/GrowthStartToggle";
import { StepTour } from "@/components/onboarding/StepTour";
import {
  DEFAULT_BUSINESS_GROWTH,
  DEFAULT_DEPRECIATION_YEARS,
  DEFAULT_INCOME_GROWTH,
  DEFAULT_REAL_ESTATE_APPRECIATION,
  DEFAULT_RENT_GROWTH,
} from "@/lib/config/defaults";
import { uid } from "@/lib/id";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { Business, RealEstate } from "@/lib/domain/types";
import {
  GROWTH_START_LABELS,
  businessIncomes,
  realEstateGrowthStart,
} from "@/lib/domain/household";
import { REAL_ESTATE_TOUR_STEPS } from "@/lib/onboarding/realEstateTour";

function PropertyFields({
  re,
  editing,
  onEdit,
  onDone,
}: {
  re: RealEstate;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
}) {
  const { updateRealEstate, removeRealEstate } = useScenario();
  const currentYear = new Date().getFullYear();

  return (
    <EntityCard
      title={re.label || "Property"}
      editing={editing}
      onEdit={onEdit}
      onDone={onDone}
      summaryLayout="stacked"
      onRemove={() => {
        removeRealEstate(re.id);
        onDone();
      }}
      summary={
        <>
          <ReadStat label="Market value" value={formatCurrency(re.marketValue)} />
          <ReadStat
            label="Appreciation"
            value={`${formatPercent(re.appreciationRate)} / yr`}
          />
          <ReadStat
            label="Growth starts"
            value={GROWTH_START_LABELS[realEstateGrowthStart(re)]}
          />
          <ReadStat
            label="Monthly rent"
            value={formatCurrency(re.monthlyRent ?? 0)}
          />
          <ReadStat
            label="Monthly operating expenses"
            value={formatCurrency(re.monthlyOperatingExpenses ?? 0)}
          />
          <ReadStat
            label="Mortgage balance"
            value={formatCurrency(re.mortgageBalance ?? 0)}
          />
          <ReadStat
            label="Interest rate"
            value={formatPercent(re.mortgageRate ?? 0)}
          />
          <ReadStat
            label="Monthly payment"
            value={formatCurrency(re.mortgageMonthlyPayment ?? 0)}
          />
        </>
      }
    >
      <div className="flex flex-col gap-2.5">
        <Field layout="row" label="Label">
          <TextInput
            value={re.label}
            onChange={(label) => updateRealEstate(re.id, { label })}
          />
        </Field>
        <Field
          layout="row"
          label="Purchase year"
          help="Year the property was acquired. Used to determine how many years of depreciation remain (depreciation runs for the useful life set on this property)."
        >
          <YearSelect
            value={re.purchaseYear}
            from={currentYear - 80}
            to={currentYear}
            onChange={(purchaseYear) =>
              updateRealEstate(re.id, {
                purchaseYear: purchaseYear ?? currentYear,
              })
            }
          />
        </Field>
        <Field
          layout="row"
          label="Purchase price"
          help="Depreciation basis. Original cost basis used for straight-line depreciation (basis ÷ useful life). This is not the current market value."
        >
          <MoneyInput
            value={re.purchasePrice}
            onChange={(purchasePrice) =>
              updateRealEstate(re.id, { purchasePrice })
            }
          />
        </Field>
        <Field
          layout="row"
          label="Market value"
          help="Current market value of the property. It grows each year by the real-estate appreciation rate, and its equity (value minus mortgage) counts toward the inheritance comparison."
        >
          <MoneyInput
            value={re.marketValue}
            onChange={(marketValue) =>
              updateRealEstate(re.id, { marketValue })
            }
          />
        </Field>
        <Field
          layout="row"
          label="Appreciation"
          help="Annual increase in this property's market value. Its equity (value minus mortgage) is included in the net-worth and inheritance comparison."
        >
          <PercentInput
            value={re.appreciationRate}
            onChange={(appreciationRate) =>
              updateRealEstate(re.id, { appreciationRate })
            }
          />
        </Field>
        <Field
          layout="row"
          label="Growth starts"
          help="Plan start appreciates the market value from today. Retirement keeps it at today's value until the plan starts (the household's first retirement year), then it starts growing."
        >
          <GrowthStartToggle
            value={realEstateGrowthStart(re)}
            onChange={(growthStart) =>
              updateRealEstate(re.id, { growthStart })
            }
          />
        </Field>
        <Field
          layout="row"
          label="Depreciation years"
          help="Useful life used to depreciate this property. Residential real estate is depreciated over 27.5 years under IRS rules; yearly depreciation (purchase price ÷ years) is a non-cash deduction against rental income, limited by passive-loss rules."
        >
          <NumberField
            value={re.depreciationYears}
            step={0.5}
            onChange={(depreciationYears) =>
              updateRealEstate(re.id, { depreciationYears })
            }
          />
        </Field>
        <Field
          layout="row"
          label="I actively participate"
          help="Needed for the $25,000 rental-loss allowance against other income. Most landlords who make management decisions qualify. Turn this off if you do not participate."
        >
          <label className="flex items-center gap-2 text-[13px] text-foreground">
            <input
              type="checkbox"
              checked={re.activeParticipation !== false}
              onChange={(e) =>
                updateRealEstate(re.id, {
                  activeParticipation: e.target.checked,
                })
              }
              className="h-4 w-4 rounded border border-border"
            />
          </label>
        </Field>
        <Field
          layout="row"
          label="Monthly rent"
          help="Gross monthly rent collected. Grows each year by the rent growth rate. Leave at 0 if the property is not currently rented."
        >
          <MoneyInput
            value={re.monthlyRent ?? 0}
            onChange={(monthlyRent) =>
              updateRealEstate(re.id, { monthlyRent })
            }
          />
        </Field>
        <Field
          layout="row"
          label="Monthly operating expenses"
          help="Recurring monthly costs excluding the mortgage: property tax, insurance, management, maintenance. Deducted from rent for both cash flow and taxable income."
        >
          <MoneyInput
            value={re.monthlyOperatingExpenses ?? 0}
            onChange={(monthlyOperatingExpenses) =>
              updateRealEstate(re.id, { monthlyOperatingExpenses })
            }
          />
        </Field>
        <Field
          layout="row"
          label="Rent growth"
          help="Annual growth applied to the rent."
        >
          <PercentInput
            value={re.rentGrowthRate ?? DEFAULT_RENT_GROWTH}
            onChange={(rentGrowthRate) =>
              updateRealEstate(re.id, { rentGrowthRate })
            }
          />
        </Field>
        <Field
          layout="row"
          label="Mortgage balance"
          help="Outstanding loan principal today. Set to 0 if the property is owned free and clear. Each year the model splits payments into interest (tax-deductible against rent) and principal (which reduces the balance and builds equity)."
        >
          <MoneyInput
            value={re.mortgageBalance ?? 0}
            onChange={(mortgageBalance) =>
              updateRealEstate(re.id, { mortgageBalance })
            }
          />
        </Field>
        <Field
          layout="row"
          label="Interest rate"
          help="Annual mortgage interest rate. Interest accrues monthly on the remaining balance."
        >
          <PercentInput
            value={re.mortgageRate ?? 0}
            onChange={(mortgageRate) =>
              updateRealEstate(re.id, { mortgageRate })
            }
          />
        </Field>
        <Field
          layout="row"
          label="Monthly payment"
          help="Total monthly principal + interest payment. The portion above the month's interest pays down principal; payments stop automatically once the loan is paid off."
        >
          <MoneyInput
            value={re.mortgageMonthlyPayment ?? 0}
            onChange={(mortgageMonthlyPayment) =>
              updateRealEstate(re.id, { mortgageMonthlyPayment })
            }
          />
        </Field>
        <p className="m-0 text-xs text-muted lg:pl-[calc(13.5rem+0.75rem)]">
          Starting equity:{" "}
          {formatCurrency(
            Math.max(0, re.marketValue - (re.mortgageBalance ?? 0)),
          )}
        </p>
      </div>
    </EntityCard>
  );
}

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

function BusinessSection() {
  const household = useHousehold();
  const { addBusiness, restoreBusiness, discardDeletedBusiness } =
    useScenario();
  const [editingId, setEditingId] = useState<string | null>(null);
  const businesses = household.businesses ?? [];

  return (
    <div className="mt-2 flex flex-col gap-3.5 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-[14.5px] font-bold text-foreground">
          Business equity
        </h3>
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
      <BusinessSection />
    </div>
  );
}

export function RealEstateStep() {
  const household = useHousehold();
  const {
    addRealEstate,
    restoreRealEstate,
    discardDeletedRealEstate,
    setRealEstateProfessional,
  } = useScenario();
  const currentYear = new Date().getFullYear();
  const [editingId, setEditingId] = useState<string | null>(null);
  const addButtonRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex flex-col gap-3.5">
      <StepTour
        tourId="realEstate"
        steps={REAL_ESTATE_TOUR_STEPS}
        targets={{ "add-property": addButtonRef }}
      />
      <div className="rounded-[9px] border border-warning-border bg-warning-bg px-3 py-2 text-xs font-semibold text-warning">
        Add investment properties here. Do not include your primary residence.
      </div>
      <Field
        label="Real estate professional"
        help="If you qualify as a real estate professional and materially participate in your rentals, those losses are treated as non-passive and can offset other income. Leave this off unless that applies."
      >
        <label className="flex items-center gap-2 text-[13px] text-foreground">
          <input
            type="checkbox"
            checked={household.realEstateProfessional === true}
            onChange={(e) => setRealEstateProfessional(e.target.checked)}
            className="h-4 w-4 rounded border border-border"
          />
          Treat rental losses as non-passive
        </label>
      </Field>
      <div className="flex justify-end gap-2">
        <RestoreDeleted
          items={(household.deletedRealEstate ?? []).map((entry) => ({
            id: entry.item.id,
            label: entry.item.label || "Property",
            deletedAt: entry.deletedAt,
          }))}
          onRestore={restoreRealEstate}
          onDiscard={discardDeletedRealEstate}
        />
        <div ref={addButtonRef}>
          <AddButton
            label="Add property"
            onClick={() => {
              const id = uid("re");
              addRealEstate({
                id,
                label: "",
                purchaseYear: currentYear,
                purchasePrice: 0,
                marketValue: 0,
                appreciationRate: DEFAULT_REAL_ESTATE_APPRECIATION,
                depreciationYears: DEFAULT_DEPRECIATION_YEARS,
                activeParticipation: true,
              });
              setEditingId(id);
            }}
          />
        </div>
      </div>
      {household.realEstate.map((re) => (
        <PropertyFields
          key={re.id}
          re={re}
          editing={editingId === re.id}
          onEdit={() => setEditingId(re.id)}
          onDone={() => setEditingId(null)}
        />
      ))}
    </div>
  );
}
