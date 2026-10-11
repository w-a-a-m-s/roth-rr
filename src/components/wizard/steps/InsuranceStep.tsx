"use client";

import { useState, type ReactNode } from "react";
import { useHousehold, useScenario } from "@/store/useScenario";
import { Field } from "@/components/ui/Field";
import {
  MoneyInput,
  NumberField,
  Select,
  TextInput,
  YearSelect,
} from "@/components/ui/inputs";
import { AddButton, EntityCard, ReadStat } from "@/components/ui/EntityCard";
import { RestoreDeleted } from "@/components/ui/RestoreDeleted";
import { uid } from "@/lib/id";
import { formatCurrency } from "@/lib/format";
import type {
  DisabilityInsurancePolicy,
  Household,
  InsuranceKind,
  InsurancePolicy,
  LifeInsurancePolicy,
  LongTermCarePolicy,
} from "@/lib/domain/types";
import {
  DEFAULT_TERM_YEARS,
  DEFAULT_WAITING_DAYS,
  DISABILITY_BENEFIT_PERIODS,
  DISABILITY_BENEFIT_PERIOD_LABELS,
  DISABILITY_OCCUPATION_LABELS,
  INSURANCE_WAITING_DAYS,
  INSURANCE_WAITING_LABELS,
  LIFE_POLICY_TYPE_LABELS,
  LONG_TERM_CARE_BENEFIT_YEARS,
  LONG_TERM_CARE_POLICY_TYPE_LABELS,
  PERMANENT_LIFE_TYPE_LABELS,
  PREMIUM_FREQUENCY_LABELS,
  disabilityPolicies,
  lifePolicies,
  longTermCareBenefitLabel,
  longTermCarePolicies,
  termEndYear,
} from "@/lib/domain/insurance";

const KIND_TITLES: Record<InsuranceKind, string> = {
  life: "Life insurance",
  disability: "Disability insurance",
  longTermCare: "Long-term care insurance",
};

const options = <T extends string>(labels: Record<T, string>, keys: T[]) =>
  keys.map((k) => ({ value: k, label: labels[k] }));

const WAITING_OPTIONS = INSURANCE_WAITING_DAYS.map((d) => ({
  value: String(d),
  label: INSURANCE_WAITING_LABELS[d],
}));

function personName(household: Household, id: string): string {
  return household.people.find((p) => p.id === id)?.name?.trim() || "Person";
}

/** Who the policy covers. */
function InsuredField({ policy }: { policy: InsurancePolicy }) {
  const household = useHousehold();
  const updateInsurance = useScenario((s) => s.updateInsurance);
  return (
    <Field layout="row" label="Insured" help="The person this policy covers.">
      <Select
        value={policy.insuredId}
        onChange={(insuredId) => updateInsurance(policy.id, { insuredId })}
        options={household.people.map((p) => ({
          value: p.id,
          label: personName(household, p.id),
        }))}
      />
    </Field>
  );
}

function LabelField({ policy }: { policy: InsurancePolicy }) {
  const updateInsurance = useScenario((s) => s.updateInsurance);
  return (
    <Field layout="row" label="Label">
      <TextInput
        value={policy.label}
        onChange={(label) => updateInsurance(policy.id, { label })}
      />
    </Field>
  );
}

interface CardProps<P> {
  policy: P;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
}

function PolicyCard({
  policy,
  editing,
  onEdit,
  onDone,
  summary,
  children,
}: CardProps<InsurancePolicy> & { summary: ReactNode; children: ReactNode }) {
  const household = useHousehold();
  const removeInsurance = useScenario((s) => s.removeInsurance);
  return (
    <EntityCard
      title={`${policy.label || KIND_TITLES[policy.kind]} · ${personName(household, policy.insuredId)}`}
      editing={editing}
      onEdit={onEdit}
      onDone={onDone}
      summaryLayout="stacked"
      onRemove={() => {
        removeInsurance(policy.id);
        onDone();
      }}
      summary={summary}
    >
      <div className="flex flex-col gap-2.5">{children}</div>
    </EntityCard>
  );
}

function LifeCard(props: CardProps<LifeInsurancePolicy>) {
  const { policy } = props;
  const updateInsurance = useScenario((s) => s.updateInsurance);
  const update = (patch: Partial<LifeInsurancePolicy>) => updateInsurance(policy.id, patch);
  const isTerm = policy.policyType === "term";
  const end = termEndYear(policy);
  const premium = policy.premium ?? 0;
  const perLabel = policy.premiumFrequency === "annual" ? "yr" : "mo";

  return (
    <PolicyCard
      {...props}
      summary={
        <>
          <ReadStat
            label="Type"
            value={
              isTerm
                ? `Term, ${policy.termYears ?? DEFAULT_TERM_YEARS} years`
                : `Permanent, ${PERMANENT_LIFE_TYPE_LABELS[policy.permanentType ?? "whole"]}`
            }
          />
          <ReadStat label="Duration" value={isTerm ? (end ? `Through ${end}` : "Term") : "Lifetime"} />
          <ReadStat label="Face amount" value={formatCurrency(policy.faceAmount)} />
          {!isTerm ? (
            <ReadStat label="Cash value" value={formatCurrency(policy.cashValue ?? 0)} />
          ) : null}
          <ReadStat label="Premium" value={`${formatCurrency(premium)} / ${perLabel}`} />
        </>
      }
    >
      <LabelField policy={policy} />
      <InsuredField policy={policy} />
      <Field layout="row" label="Term or permanent">
        <Select
          value={policy.policyType}
          onChange={(policyType) =>
            update(
              policyType === "term"
                ? {
                    policyType,
                    termYears: policy.termYears ?? DEFAULT_TERM_YEARS,
                    issueYear: policy.issueYear ?? new Date().getFullYear(),
                    permanentType: undefined,
                  }
                : {
                    policyType,
                    permanentType: policy.permanentType ?? "whole",
                    termYears: undefined,
                    issueYear: undefined,
                  },
            )
          }
          options={options(LIFE_POLICY_TYPE_LABELS, ["term", "permanent"])}
        />
      </Field>
      {isTerm ? (
        <>
          <Field
            layout="row"
            label="Duration of the term"
            help="How many years the term policy covers. A death after the term ends pays nothing."
          >
            <NumberField
              value={policy.termYears}
              min={1}
              step={1}
              onChange={(termYears) => update({ termYears: Math.max(1, Math.round(termYears)) })}
            />
          </Field>
          <Field
            layout="row"
            label="Coverage starts"
            hint={end ? `Covers through ${end}.` : undefined}
          >
            <YearSelect
              value={policy.issueYear}
              onChange={(issueYear) => update({ issueYear })}
            />
          </Field>
        </>
      ) : (
        <>
          <Field layout="row" label="Duration">
            <p className="m-0 text-[13px] font-semibold text-foreground">Lifetime</p>
          </Field>
          <Field layout="row" label="Type">
            <Select
              value={policy.permanentType ?? "whole"}
              onChange={(permanentType) => update({ permanentType })}
              options={options(PERMANENT_LIFE_TYPE_LABELS, ["vul", "iul", "ul", "whole"])}
            />
          </Field>
        </>
      )}
      <Field
        layout="row"
        label="Face amount"
        help="The death benefit. In the Survivorship analysis it's invested at 8% a year and pays the survivor a guaranteed lifetime income."
      >
        <MoneyInput value={policy.faceAmount} onChange={(faceAmount) => update({ faceAmount })} />
      </Field>
      {!isTerm ? (
        <Field
          layout="row"
          label="Cash value"
          help="The policy's cash value today. For reference: it doesn't change the projection."
        >
          <MoneyInput value={policy.cashValue} onChange={(cashValue) => update({ cashValue })} />
        </Field>
      ) : null}
      <Field
        layout="row"
        label="Premium amount"
        help="What you pay for the policy. For reference: it isn't added to your expenses."
      >
        <div className="flex gap-2">
          <MoneyInput
            step={50}
            value={policy.premium}
            onChange={(premium) => update({ premium })}
          />
          <span className="w-[130px] shrink-0">
            <Select
              value={policy.premiumFrequency ?? "monthly"}
              onChange={(premiumFrequency) => update({ premiumFrequency })}
              options={options(PREMIUM_FREQUENCY_LABELS, ["monthly", "annual"])}
            />
          </span>
        </div>
      </Field>
    </PolicyCard>
  );
}

function DisabilityCard(props: CardProps<DisabilityInsurancePolicy>) {
  const { policy } = props;
  const updateInsurance = useScenario((s) => s.updateInsurance);
  const update = (patch: Partial<DisabilityInsurancePolicy>) =>
    updateInsurance(policy.id, patch);

  return (
    <PolicyCard
      {...props}
      summary={
        <>
          <ReadStat label="Definition" value={DISABILITY_OCCUPATION_LABELS[policy.occupation]} />
          <ReadStat label="Monthly benefit" value={formatCurrency(policy.monthlyBenefit)} />
          <ReadStat label="Waiting period" value={INSURANCE_WAITING_LABELS[policy.waitingDays]} />
          <ReadStat
            label="Benefits paid"
            value={DISABILITY_BENEFIT_PERIOD_LABELS[policy.benefitPeriod]}
          />
        </>
      }
    >
      <LabelField policy={policy} />
      <InsuredField policy={policy} />
      <Field
        layout="row"
        label="Definition of disability"
        help="Own occupation pays when you can't do your own job; modified when you can't do your job or one like it; any occupation only when you can't work at all."
      >
        <Select
          value={policy.occupation}
          onChange={(occupation) => update({ occupation })}
          options={options(DISABILITY_OCCUPATION_LABELS, ["own", "modified", "any"])}
        />
      </Field>
      <Field layout="row" label="Monthly benefit amount">
        <MoneyInput
          step={100}
          value={policy.monthlyBenefit}
          onChange={(monthlyBenefit) => update({ monthlyBenefit })}
        />
      </Field>
      <Field
        layout="row"
        label="Waiting period"
        help="How long after the disability starts before the first payment."
      >
        <Select
          value={String(policy.waitingDays)}
          onChange={(v) => update({ waitingDays: Number(v) as DisabilityInsurancePolicy["waitingDays"] })}
          options={WAITING_OPTIONS}
        />
      </Field>
      <Field
        layout="row"
        label="Benefits paid until"
        help="When the payments stop: after a number of years, or when you reach an age."
      >
        <Select
          value={policy.benefitPeriod}
          onChange={(benefitPeriod) => update({ benefitPeriod })}
          options={options(DISABILITY_BENEFIT_PERIOD_LABELS, DISABILITY_BENEFIT_PERIODS)}
        />
      </Field>
      <Field
        layout="row"
        label="Benefits are"
        help="Tax free when you pay the premiums yourself with after-tax dollars; taxable when an employer pays them."
      >
        <Select
          value={policy.taxable ? "taxable" : "taxFree"}
          onChange={(v) => update({ taxable: v === "taxable" ? true : undefined })}
          options={[
            { value: "taxFree", label: "Tax free (you pay the premiums)" },
            { value: "taxable", label: "Taxable (employer pays)" },
          ]}
        />
      </Field>
    </PolicyCard>
  );
}

function LongTermCareCard(props: CardProps<LongTermCarePolicy>) {
  const { policy } = props;
  const updateInsurance = useScenario((s) => s.updateInsurance);
  const update = (patch: Partial<LongTermCarePolicy>) => updateInsurance(policy.id, patch);

  return (
    <PolicyCard
      {...props}
      summary={
        <>
          <ReadStat label="Type" value={LONG_TERM_CARE_POLICY_TYPE_LABELS[policy.policyType]} />
          <ReadStat label="Monthly benefit" value={formatCurrency(policy.monthlyBenefit)} />
          <ReadStat label="Waiting period" value={INSURANCE_WAITING_LABELS[policy.waitingDays]} />
          <ReadStat label="Benefit duration" value={longTermCareBenefitLabel(policy.benefitYears)} />
        </>
      }
    >
      <LabelField policy={policy} />
      <InsuredField policy={policy} />
      <Field layout="row" label="Type of long-term care">
        <Select
          value={policy.policyType}
          onChange={(policyType) => update({ policyType })}
          options={options(LONG_TERM_CARE_POLICY_TYPE_LABELS, ["traditional", "hybrid", "annuity"])}
        />
      </Field>
      <Field layout="row" label="Monthly benefit amount">
        <MoneyInput
          step={100}
          value={policy.monthlyBenefit}
          onChange={(monthlyBenefit) => update({ monthlyBenefit })}
        />
      </Field>
      <Field
        layout="row"
        label="Waiting period"
        help="How long care has to last before the policy starts paying."
      >
        <Select
          value={String(policy.waitingDays)}
          onChange={(v) => update({ waitingDays: Number(v) as LongTermCarePolicy["waitingDays"] })}
          options={WAITING_OPTIONS}
        />
      </Field>
      <Field
        layout="row"
        label="Duration of benefits"
        help="How long the policy pays once benefits start. It never pays past the end of care."
      >
        <Select
          value={String(policy.benefitYears)}
          onChange={(v) =>
            update({ benefitYears: v === "lifetime" ? "lifetime" : (Number(v) as 2 | 3 | 4 | 5 | 6) })
          }
          options={LONG_TERM_CARE_BENEFIT_YEARS.map((y) => ({
            value: String(y),
            label: longTermCareBenefitLabel(y),
          }))}
        />
      </Field>
    </PolicyCard>
  );
}

function Section({
  title,
  description,
  addLabel,
  onAdd,
  children,
}: {
  title: string;
  description: string;
  addLabel: string;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="m-0 text-[14px] font-bold text-foreground">{title}</h3>
          <p className="m-0 text-xs text-muted">{description}</p>
        </div>
        <AddButton label={addLabel} shortLabel="Add" onClick={onAdd} />
      </div>
      {children}
    </section>
  );
}

export function InsuranceStep() {
  const household = useHousehold();
  const { addInsurance, restoreInsurance, discardDeletedInsurance } = useScenario();
  const [editingId, setEditingId] = useState<string | null>(null);
  const insuredId = household.mainPersonId ?? household.people[0]?.id ?? "";

  const add = (policy: InsurancePolicy) => {
    addInsurance(policy);
    setEditingId(policy.id);
  };
  const card = { onDone: () => setEditingId(null) };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-xs text-muted">
          Policies only pay in their own analysis: life insurance in
          Survivorship, disability insurance in Disability, and long-term care
          insurance in Long-term care. Retirement doesn&apos;t change.
        </p>
        <RestoreDeleted
          items={(household.deletedInsurance ?? []).map((entry) => ({
            id: entry.item.id,
            label: entry.item.label || KIND_TITLES[entry.item.kind],
            deletedAt: entry.deletedAt,
          }))}
          onRestore={restoreInsurance}
          onDiscard={discardDeletedInsurance}
        />
      </div>

      <Section
        title="Life insurance"
        description="Term or permanent. When the insured passes, the death benefit becomes lifetime income for the survivor."
        addLabel="Add life insurance"
        onAdd={() =>
          add({
            id: uid("ins"),
            kind: "life",
            label: "",
            insuredId,
            policyType: "term",
            termYears: DEFAULT_TERM_YEARS,
            issueYear: new Date().getFullYear(),
            faceAmount: 0,
            premium: 0,
            premiumFrequency: "monthly",
          })
        }
      >
        {lifePolicies(household).map((policy) => (
          <LifeCard
            key={policy.id}
            policy={policy}
            editing={editingId === policy.id}
            onEdit={() => setEditingId(policy.id)}
            {...card}
          />
        ))}
      </Section>

      <Section
        title="Disability insurance"
        description="Pays a monthly benefit when the insured can't work."
        addLabel="Add disability insurance"
        onAdd={() =>
          add({
            id: uid("ins"),
            kind: "disability",
            label: "",
            insuredId,
            occupation: "own",
            monthlyBenefit: 0,
            waitingDays: DEFAULT_WAITING_DAYS,
            benefitPeriod: "age65",
          })
        }
      >
        {disabilityPolicies(household).map((policy) => (
          <DisabilityCard
            key={policy.id}
            policy={policy}
            editing={editingId === policy.id}
            onEdit={() => setEditingId(policy.id)}
            {...card}
          />
        ))}
      </Section>

      <Section
        title="Long-term care insurance"
        description="Pays a monthly benefit toward care costs."
        addLabel="Add long-term care insurance"
        onAdd={() =>
          add({
            id: uid("ins"),
            kind: "longTermCare",
            label: "",
            insuredId,
            policyType: "traditional",
            monthlyBenefit: 0,
            waitingDays: DEFAULT_WAITING_DAYS,
            benefitYears: 3,
          })
        }
      >
        {longTermCarePolicies(household).map((policy) => (
          <LongTermCareCard
            key={policy.id}
            policy={policy}
            editing={editingId === policy.id}
            onEdit={() => setEditingId(policy.id)}
            {...card}
          />
        ))}
      </Section>
    </div>
  );
}
