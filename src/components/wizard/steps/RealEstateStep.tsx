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
import { StepTour } from "@/components/onboarding/StepTour";
import {
  DEFAULT_DEPRECIATION_YEARS,
  DEFAULT_REAL_ESTATE_APPRECIATION,
  DEFAULT_RENT_GROWTH,
} from "@/lib/config/defaults";
import { uid } from "@/lib/id";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { RealEstate } from "@/lib/domain/types";
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
