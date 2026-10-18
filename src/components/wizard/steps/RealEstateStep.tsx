"use client";

import { useRef, useState } from "react";
import { useHousehold, useScenario } from "@/store/useScenario";
import { Field } from "@/components/ui/Field";
import {
  MoneyInput,
  NumberField,
  PercentInput,
  RateInput,
  Select,
  TextInput,
  YearSelect,
} from "@/components/ui/inputs";
import { AddButton, EntityCard, ReadStat } from "@/components/ui/EntityCard";
import { RestoreDeleted } from "@/components/ui/RestoreDeleted";
import { GrowthStartToggle } from "@/components/ui/GrowthStartToggle";
import { PropertyUseToggle } from "@/components/ui/PropertyUseToggle";
import { StepTour } from "@/components/onboarding/StepTour";
import {
  DEFAULT_DEPRECIATION_YEARS,
  DEFAULT_REAL_ESTATE_APPRECIATION,
  DEFAULT_RENT_GROWTH,
} from "@/lib/config/defaults";
import { uid } from "@/lib/id";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { PropertyLoan, RealEstate } from "@/lib/domain/types";
import {
  DEFAULT_REPAYMENT_YEARS,
  PROPERTY_LOAN_LABELS,
  loanMonthlyPaymentToday,
  propertyLoanBalance,
  propertyLoans,
} from "@/lib/domain/propertyLoans";
import {
  GROWTH_START_LABELS,
  propertyLandShare,
  propertyPurchaseMonth,
  realEstateGrowthStart,
} from "@/lib/domain/household";
import { REAL_ESTATE_TOUR_STEPS } from "@/lib/onboarding/realEstateTour";

const MONTH_OPTIONS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
].map((label, i) => ({ value: String(i + 1), label }));

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
  const homestead = re.use === "homestead";
  const loans = propertyLoans(re);

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
          <ReadStat label="Type" value={homestead ? "Homestead" : "Investment property"} />
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
            label={loans.length === 1 ? PROPERTY_LOAN_LABELS[loans[0].kind] : "Loans"}
            value={
              loans.length === 0
                ? "None"
                : formatCurrency(propertyLoanBalance(re))
            }
          />
          <ReadStat
            label="Loan payments"
            value={`${formatCurrency(
              loans.reduce((sum, loan) => sum + loanMonthlyPaymentToday(loan), 0),
            )} / mo`}
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
          label="Property type"
          help="Homestead is the home you live in: it isn't depreciated, so it takes no depreciation deduction. Investment property is depreciated over its useful life."
        >
          <PropertyUseToggle
            value={homestead ? "homestead" : "investment"}
            onChange={(use) =>
              updateRealEstate(re.id, { use: use === "homestead" ? "homestead" : undefined })
            }
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
          help="Depreciation basis. Original cost basis used for straight-line depreciation (the building's share ÷ useful life). This is not the current market value."
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
        {homestead ? (
          <p className="m-0 text-xs text-muted lg:pl-[calc(13.5rem+0.75rem)]">
            A homestead takes no depreciation deduction.
          </p>
        ) : (
          <>
        <Field
          layout="row"
          label="Depreciation years"
          help="Useful life used to depreciate this property. Residential real estate is depreciated over 27.5 years under IRS rules; yearly depreciation (the building's share of the price ÷ years) is a non-cash deduction against rental income, limited by passive-loss rules."
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
          label="Month placed in service"
          help="The month the property was first ready to rent. The IRS starts depreciation in the middle of that month (the mid-month convention), so the first and last years are partial. Leave it on January if you're not sure."
        >
          <Select
            value={String(propertyPurchaseMonth(re))}
            onChange={(month) => updateRealEstate(re.id, { purchaseMonth: Number(month) })}
            options={MONTH_OPTIONS}
          />
        </Field>
        <Field
          layout="row"
          label="Land share"
          help="How much of the purchase price is the land. Land can't be depreciated, so only the building is. Your property tax bill often splits land and building value; 20% is a common estimate when you don't know."
        >
          <PercentInput
            value={propertyLandShare(re)}
            onChange={(landShare) =>
              updateRealEstate(re.id, { landShare: Math.min(1, Math.max(0, landShare)) })
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
          </>
        )}
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
        <LoansEditor re={re} />
        <p className="m-0 text-xs text-muted lg:pl-[calc(13.5rem+0.75rem)]">
          Starting equity:{" "}
          {formatCurrency(
            Math.max(0, re.marketValue - propertyLoanBalance(re)),
          )}
        </p>
      </div>
    </EntityCard>
  );
}

/** The mortgages and lines of credit on one property. */
function LoansEditor({ re }: { re: RealEstate }) {
  const { updateRealEstate } = useScenario();
  const currentYear = new Date().getFullYear();
  const loans = propertyLoans(re);
  // Writing the list retires the older single-mortgage fields.
  const setLoans = (next: PropertyLoan[]) =>
    updateRealEstate(re.id, {
      loans: next,
      mortgageBalance: undefined,
      mortgageRate: undefined,
      mortgageMonthlyPayment: undefined,
    });
  const update = (id: string, patch: Partial<PropertyLoan>) =>
    setLoans(loans.map((loan) => (loan.id === id ? { ...loan, ...patch } : loan)));
  const add = (kind: PropertyLoan["kind"]) =>
    setLoans([
      ...loans,
      kind === "mortgage"
        ? { id: uid("loan"), kind, label: "Mortgage", balance: 0, rate: 0, monthlyPayment: 0 }
        : {
            id: uid("loan"),
            kind,
            label: "Line of credit",
            balance: 0,
            rate: 0,
            creditLimit: 0,
            drawEndYear: currentYear + 9,
            repaymentYears: DEFAULT_REPAYMENT_YEARS,
          },
    ]);

  return (
    <div className="flex flex-col gap-2 rounded-[12px] border border-border bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-foreground">Loans</span>
        <div className="flex gap-2">
          <AddButton label="Add mortgage" shortLabel="Mortgage" onClick={() => add("mortgage")} />
          <AddButton label="Add line of credit" shortLabel="Line of credit" onClick={() => add("lineOfCredit")} />
        </div>
      </div>
      {loans.length === 0 ? (
        <p className="m-0 text-xs text-muted">No mortgage or line of credit: owned free and clear.</p>
      ) : null}
      {loans.map((loan) => (
        <div key={loan.id} className="flex flex-col gap-2 rounded-[10px] bg-surface-muted p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-bold text-foreground">
              {PROPERTY_LOAN_LABELS[loan.kind]}
            </span>
            <button
              type="button"
              onClick={() => setLoans(loans.filter((l) => l.id !== loan.id))}
              className="border-0 bg-transparent p-0 text-xs font-bold text-danger"
            >
              Remove
            </button>
          </div>
          <Field layout="row" label="Label">
            <TextInput value={loan.label} onChange={(label) => update(loan.id, { label })} />
          </Field>
          <Field
            layout="row"
            label={loan.kind === "mortgage" ? "Balance" : "Amount drawn"}
            help={
              loan.kind === "mortgage"
                ? "Principal still owed today. Each month the payment covers interest first; the rest pays down the balance."
                : "What you owe on the line of credit today."
            }
          >
            <MoneyInput value={loan.balance} onChange={(balance) => update(loan.id, { balance })} />
          </Field>
          <Field layout="row" label="Interest rate" help="Yearly rate. Interest is charged monthly on what's owed.">
            <RateInput value={loan.rate} onChange={(rate) => update(loan.id, { rate })} />
          </Field>
          {loan.kind === "mortgage" ? (
            <Field
              layout="row"
              label="Monthly payment"
              help="Principal and interest each month, without escrow. Payments stop once the loan is paid off."
            >
              <MoneyInput
                value={loan.monthlyPayment ?? 0}
                onChange={(monthlyPayment) => update(loan.id, { monthlyPayment })}
              />
            </Field>
          ) : (
            <>
              <Field layout="row" label="Credit limit" help="For reference: the most you can draw.">
                <MoneyInput
                  value={loan.creditLimit ?? 0}
                  onChange={(creditLimit) => update(loan.id, { creditLimit })}
                />
              </Field>
              <Field
                layout="row"
                label="Draw period ends"
                help="You pay interest only through this year. Leave empty to pay interest only for the whole plan."
                hint={`Interest only now: ${formatCurrency(loanMonthlyPaymentToday(loan))} / mo`}
              >
                <YearSelect
                  value={loan.drawEndYear}
                  allowEmpty
                  from={currentYear}
                  to={2100}
                  onChange={(drawEndYear) => update(loan.id, { drawEndYear })}
                />
              </Field>
              <Field
                layout="row"
                label="Repayment years"
                help="After the draw period, a level monthly payment pays it off over this many years."
              >
                <NumberField
                  value={loan.repaymentYears ?? DEFAULT_REPAYMENT_YEARS}
                  min={1}
                  step={1}
                  onChange={(repaymentYears) =>
                    update(loan.id, { repaymentYears: Math.max(1, Math.round(repaymentYears)) })
                  }
                />
              </Field>
            </>
          )}
        </div>
      ))}
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
        Add your home (as a Homestead) and investment properties, with any mortgage or line of credit on each.
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
