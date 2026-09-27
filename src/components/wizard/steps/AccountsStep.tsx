"use client";

import { Fragment, useRef, useState, type RefObject } from "react";
import { useHousehold, useScenario } from "@/store/useScenario";
import { Field } from "@/components/ui/Field";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import {
  MoneyInput,
  PercentInput,
  Select,
  TextInput,
  YearSelect,
} from "@/components/ui/inputs";
import {
  AddButton,
  EntityCard,
  PencilIcon,
  ReadStat,
} from "@/components/ui/EntityCard";
import { RestoreDeleted } from "@/components/ui/RestoreDeleted";
import { submitEditOnEnter } from "@/components/ui/submitEditOnEnter";
import { StepTour } from "@/components/onboarding/StepTour";
import type {
  Account,
  AccountKind,
  Deposit,
  DepositFrequency,
  RetirementAccountType,
} from "@/lib/domain/types";
import {
  AFTER_TAX_ACCOUNT_KINDS,
  DEFAULT_RETIREMENT_ACCOUNT_TYPE,
  JOINT_OWNER_VALUE,
  RETIREMENT_ACCOUNT_TYPES,
  RETIREMENT_ACCOUNT_TYPE_LABELS,
  accountDepositEndYear,
  accountOwnerLabel,
  canAccountBeJoint,
} from "@/lib/domain/household";
import { DEFAULT_ACCOUNT_GROWTH } from "@/lib/config/defaults";
import {
  depositAmountLabel,
  depositYearsLabel,
} from "@/lib/depositSummary";
import { projectionStartYear } from "@/lib/engine/project";
import { formatCurrency } from "@/lib/format";
import { uid } from "@/lib/id";
import { ACCOUNTS_TOUR_STEPS } from "@/lib/onboarding/accountsTour";

const GROWTH_HELP: Record<AccountKind, string> = {
  retirementTaxable:
    "Annual return for this pre-tax retirement account.",
  rothTaxFree:
    "Annual return for this Roth account. Roth balances grow tax-free, so a higher return makes converting more valuable.",
  investment: "Annual return for this taxable brokerage / investment account.",
  annuity: "Annual growth rate for this annuity balance.",
  cd: "Annual interest rate earned on this certificate of deposit.",
  savings: "Annual interest rate earned on this cash / savings account.",
};

const KIND_LABELS: Record<AccountKind, string> = {
  retirementTaxable: "Taxable retirement",
  rothTaxFree: "Roth (tax-free)",
  investment: "Investment / brokerage",
  annuity: "Annuity",
  cd: "CD",
  savings: "Savings / money market",
};

const FREQUENCY_OPTIONS: { value: DepositFrequency; label: string }[] = [
  { value: "monthly", label: "Every month" },
  { value: "yearly", label: "Every year" },
  { value: "oneTime", label: "One time" },
];

const depositField = "min-w-[7rem] flex-1";

const DEPOSITS_HELP =
  "Money you pay into this account. Deposits dated before your plan starts (the first retirement year) build up the opening balance instead of showing in the plan's cash flow. From the start year on, a deposit comes out of that year's income, just like an expense.";

const ACCOUNT_GROUPS: {
  title: string;
  description: string;
  kinds: AccountKind[];
  addKind: AccountKind;
  addLabel: string;
}[] = [
  {
    title: "Taxable retirement accounts",
    description:
      "401(k), 403(b), IRA, TSP, DROP - subject to RMDs and conversions.",
    kinds: ["retirementTaxable"],
    addKind: "retirementTaxable",
    addLabel: "Add retirement account",
  },
  {
    title: "Roth (tax-free)",
    description:
      "Roth IRA / Roth 401(k) - grows tax free and receives conversions.",
    kinds: ["rothTaxFree"],
    addKind: "rothTaxFree",
    addLabel: "Add Roth account",
  },
  {
    title: "After-tax accounts",
    description: "Brokerage, annuity, CDs and savings - tracked with cost basis.",
    kinds: AFTER_TAX_ACCOUNT_KINDS,
    addKind: "investment",
    addLabel: "Add after-tax account",
  },
];

function DepositRow({
  accountId,
  deposit,
  planStartYear,
  editing,
  onEdit,
  onDone,
}: {
  accountId: string;
  deposit: Deposit;
  planStartYear: number | null;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
}) {
  const { updateDeposit, removeDeposit } = useScenario();
  const currentYear = new Date().getFullYear();
  const oneTime = deposit.frequency === "oneTime";
  const beforePlan =
    planStartYear != null && deposit.startYear < planStartYear;

  if (!editing) {
    return (
      <button
        type="button"
        onClick={onEdit}
        className="flex w-full cursor-pointer flex-col gap-1.5 rounded-lg border border-border bg-surface-muted px-3 py-1.5 text-left lg:flex-row lg:items-center lg:gap-3"
      >
        <span className="flex items-center gap-3 max-lg:border-b max-lg:border-border max-lg:pb-1.5">
          <span className="mr-auto truncate text-[13px] font-bold text-foreground">
            {deposit.label || "Deposit"}
          </span>
          <span className="shrink-0 lg:hidden">
            <PencilIcon />
          </span>
        </span>
        <span className="flex flex-col text-[12px] text-muted lg:flex-row lg:items-center lg:gap-3">
          <span className="flex flex-col max-lg:divide-y max-lg:divide-border lg:contents [&>*]:max-lg:py-1.5">
            <span className="flex items-baseline justify-between gap-3 lg:block">
              <span className="lg:hidden">Amount</span>
              <span>{depositAmountLabel(deposit)}</span>
            </span>
            <span className="flex items-baseline justify-between gap-3 lg:block">
              <span className="lg:hidden">Years</span>
              <span>{depositYearsLabel(deposit)}</span>
            </span>
          </span>
          <span className="hidden lg:block">
            <PencilIcon />
          </span>
        </span>
      </button>
    );
  }

  return (
    <div
      className="rounded-lg border border-border bg-white p-2.5"
      onKeyDown={(event) => submitEditOnEnter(event, onDone)}
    >
      <div className="flex flex-col items-stretch gap-2.5 lg:flex-row lg:flex-wrap lg:items-start">
        <Field label="Deposit Label" className={depositField}>
          <TextInput
            value={deposit.label}
            placeholder="401(k) contribution"
            onChange={(label) =>
              updateDeposit(accountId, deposit.id, { label })
            }
          />
        </Field>
        <Field label="Amount" className={depositField}>
          <MoneyInput
            value={deposit.amount}
            step={100}
            onChange={(amount) =>
              updateDeposit(accountId, deposit.id, { amount })
            }
          />
        </Field>
        <Field label="How often" className={depositField}>
          <Select
            value={deposit.frequency}
            onChange={(frequency) =>
              updateDeposit(accountId, deposit.id, {
                frequency: frequency as DepositFrequency,
              })
            }
            options={FREQUENCY_OPTIONS}
          />
        </Field>
        <Field label={oneTime ? "Year" : "Years"} className={depositField}>
          <div className="flex flex-col gap-2 lg:flex-row [&>*]:min-w-0 lg:[&>*]:flex-1">
            <YearSelect
              value={deposit.startYear}
              from={currentYear - 40}
              to={currentYear + 60}
              onChange={(startYear) =>
                updateDeposit(accountId, deposit.id, {
                  startYear: startYear ?? currentYear,
                })
              }
            />
            {oneTime ? null : (
              <YearSelect
                value={deposit.endYear}
                from={currentYear - 40}
                to={currentYear + 60}
                allowEmpty
                placeholder="No end"
                onChange={(endYear) =>
                  updateDeposit(accountId, deposit.id, { endYear })
                }
              />
            )}
          </div>
        </Field>
        <div className="flex shrink-0 items-center gap-3 self-end pb-1.5">
          <button
            type="button"
            onClick={onDone}
            className="border-0 bg-transparent p-0 text-xs font-bold text-warning-rmd-text"
          >
            Done
          </button>
          <button
            type="button"
            onClick={() => {
              removeDeposit(accountId, deposit.id);
              onDone();
            }}
            className="border-0 bg-transparent p-0 text-xs font-bold text-danger"
          >
            Delete
          </button>
        </div>
      </div>
      {beforePlan ? (
        <p className="m-0 mt-2 text-[11px] leading-tight text-muted">
          {oneTime || deposit.endYear == null || deposit.endYear < planStartYear
            ? `Lands before your plan starts in ${planStartYear}, so it grows into the opening balance.`
            : `Starts before your plan does in ${planStartYear}. The earlier years build up the opening balance; the rest come out of your income.`}
        </p>
      ) : null}
    </div>
  );
}

function Deposits({ account }: { account: Account }) {
  const household = useHousehold();
  const { addDeposit } = useScenario();
  const [editingId, setEditingId] = useState<string | null>(null);
  const deposits = account.deposits ?? [];
  const currentYear = new Date().getFullYear();
  const start = projectionStartYear(household);
  const planStartYear = Number.isFinite(start) ? start : null;
  const ownerRetirementYear = accountDepositEndYear(
    account,
    household.people,
    household.filingStatus,
  );

  return (
    <section className="my-3 flex flex-col gap-2 border-y border-border py-3">
      <div className="flex items-center gap-2.5">
        <span className="flex items-center gap-1">
          <span className="text-xs font-medium text-muted-2">Deposits</span>
          <InfoTooltip text={DEPOSITS_HELP} label="About deposits" />
        </span>
        <button
          type="button"
          onClick={() => {
            const id = uid("dep");
            addDeposit(account.id, {
              id,
              label: "",
              amount: 0,
              frequency: "monthly",
              startYear: currentYear,
              // Most deposits are contributions made while still working, so
              // default to stopping when the owner retires (later of the two
              // when the account is joint).
              ...(Number.isFinite(ownerRetirementYear)
                ? { endYear: ownerRetirementYear }
                : {}),
            });
            setEditingId(id);
          }}
          className="border-0 bg-transparent p-0 text-xs font-bold text-accent"
        >
          + Add deposit
        </button>
      </div>
      {deposits.length === 0 ? (
        <p className="m-0 text-[11.5px] text-muted-3">
          No deposits yet. Add one if you&apos;re still paying into this
          account.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {deposits.map((deposit) => (
            <DepositRow
              key={deposit.id}
              accountId={account.id}
              deposit={deposit}
              planStartYear={planStartYear}
              editing={editingId === deposit.id}
              onEdit={() => setEditingId(deposit.id)}
              onDone={() => setEditingId(null)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function AccountFields({
  account,
  editing,
  onEdit,
  onDone,
}: {
  account: Account;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
}) {
  const household = useHousehold();
  const { updateAccount, removeAccount } = useScenario();
  const hasCostBasis = account.kind === "investment" || account.kind === "annuity";
  const ownerName = accountOwnerLabel(
    account,
    household.people,
    household.filingStatus,
  );
  const allowJoint = canAccountBeJoint(account.kind, household.filingStatus);
  const ownerOptions = [
    ...household.people.map((p) => ({
      value: p.id,
      label: p.name || "Person",
    })),
    ...(allowJoint ? [{ value: JOINT_OWNER_VALUE, label: "Both" }] : []),
  ];
  const depositCount = (account.deposits ?? []).length;
  const typeLabel =
    account.kind === "retirementTaxable"
      ? RETIREMENT_ACCOUNT_TYPE_LABELS[
          account.retirementType ?? DEFAULT_RETIREMENT_ACCOUNT_TYPE
        ]
      : KIND_LABELS[account.kind];
  const growthHelp =
    account.kind === "retirementTaxable" &&
    (account.retirementType ?? DEFAULT_RETIREMENT_ACCOUNT_TYPE) === "drop"
      ? "Annual return for this DROP. Growth starts the year after the owner retires."
      : GROWTH_HELP[account.kind];

  return (
    <EntityCard
      title={account.label || typeLabel}
      badge={
        <span className="rounded-full bg-[#F2F0EA] px-2 py-0.5 text-[10.5px] font-semibold text-muted">
          {typeLabel}
        </span>
      }
      editing={editing}
      onEdit={onEdit}
      onDone={onDone}
      onRemove={() => {
        removeAccount(account.id);
        onDone();
      }}
      summary={
        <>
          <ReadStat label="Owner" value={ownerName} />
          <ReadStat label="Balance" value={formatCurrency(account.balance)} />
          <ReadStat label="Deposits" value={String(depositCount)} />
        </>
      }
    >
      <div className="flex flex-col gap-2.5 lg:flex-row [&>*]:min-w-0 lg:[&>*]:flex-1">
        <Field label="Account Label">
          <TextInput
            value={account.label}
            onChange={(label) => updateAccount(account.id, { label })}
          />
        </Field>
        <Field label="Owner">
          <Select
            value={
              allowJoint && account.joint ? JOINT_OWNER_VALUE : account.ownerId
            }
            onChange={(ownerId) => {
              if (ownerId === JOINT_OWNER_VALUE) {
                updateAccount(account.id, { joint: true });
                return;
              }
              updateAccount(account.id, { joint: false, ownerId });
            }}
            options={ownerOptions}
          />
        </Field>
        {account.kind === "retirementTaxable" ? (
          <Field label="Type">
            <Select
              value={
                account.retirementType ?? DEFAULT_RETIREMENT_ACCOUNT_TYPE
              }
              onChange={(retirementType) =>
                updateAccount(account.id, {
                  retirementType: retirementType as RetirementAccountType,
                })
              }
              options={RETIREMENT_ACCOUNT_TYPES.map((t) => ({
                value: t,
                label: RETIREMENT_ACCOUNT_TYPE_LABELS[t],
              }))}
            />
          </Field>
        ) : null}
        {AFTER_TAX_ACCOUNT_KINDS.includes(account.kind) ? (
          <Field label="Type">
            <Select
              value={account.kind}
              onChange={(kind) =>
                updateAccount(account.id, { kind: kind as AccountKind })
              }
              options={AFTER_TAX_ACCOUNT_KINDS.map((k) => ({
                value: k,
                label: KIND_LABELS[k],
              }))}
            />
          </Field>
        ) : null}
        <Field label="Current balance">
          <MoneyInput
            value={account.balance}
            onChange={(balance) => updateAccount(account.id, { balance })}
          />
        </Field>
        {hasCostBasis ? (
          <Field
            label="Cost basis"
            hint="Return of basis is tax-free; the rest of each withdrawal is taxed as long-term capital gains. Also used for inheritance valuation."
          >
            <MoneyInput
              value={account.costBasis ?? 0}
              onChange={(costBasis) => updateAccount(account.id, { costBasis })}
            />
          </Field>
        ) : null}
        <Field label="Annual growth" help={growthHelp}>
          <PercentInput
            value={account.growthRate}
            onChange={(growthRate) => updateAccount(account.id, { growthRate })}
          />
        </Field>
      </div>
      <Deposits account={account} />
    </EntityCard>
  );
}

function Group({
  title,
  description,
  kinds,
  addKind,
  addLabel,
  editingId,
  setEditingId,
  addButtonRef,
}: {
  title: string;
  description: string;
  kinds: AccountKind[];
  addKind: AccountKind;
  addLabel: string;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  addButtonRef?: RefObject<HTMLDivElement | null>;
}) {
  const household = useHousehold();
  const { addAccount, restoreAccount, discardDeletedAccount } = useScenario();
  const accounts = household.accounts.filter((a) => kinds.includes(a.kind));
  const firstOwner = household.people[0]?.id ?? "";
  const deleted = (household.deletedAccounts ?? []).filter((entry) =>
    kinds.includes(entry.item.kind),
  );

  return (
    <section className="flex flex-col gap-2">
      <div className="mb-0.5 flex items-center justify-between gap-2.5">
        <div className="min-w-0">
          <h3 className="m-0 text-[13.5px] font-bold text-foreground">{title}</h3>
          <p className="m-0 mt-0.5 text-[11.5px] text-muted-3">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <RestoreDeleted
            items={deleted.map((entry) => ({
              id: entry.item.id,
              label: entry.item.label || KIND_LABELS[entry.item.kind],
              deletedAt: entry.deletedAt,
            }))}
            onRestore={restoreAccount}
            onDiscard={discardDeletedAccount}
          />
          <div ref={addButtonRef}>
            <AddButton
              label={addLabel}
              shortLabel="Add"
              onClick={() => {
                const id = uid("acc");
                addAccount({
                  id,
                  label: "",
                  ownerId: firstOwner,
                  kind: addKind,
                  balance: 0,
                  growthRate: DEFAULT_ACCOUNT_GROWTH[addKind],
                  ...(addKind === "retirementTaxable"
                    ? { retirementType: DEFAULT_RETIREMENT_ACCOUNT_TYPE }
                    : {}),
                  ...(addKind === "investment" || addKind === "annuity"
                    ? { costBasis: 0 }
                    : {}),
                });
                setEditingId(id);
              }}
            />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {accounts.map((account) => (
          <AccountFields
            key={account.id}
            account={account}
            editing={editingId === account.id}
            onEdit={() => setEditingId(account.id)}
            onDone={() => setEditingId(null)}
          />
        ))}
      </div>
    </section>
  );
}

export function AccountsStep() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const retirementAddRef = useRef<HTMLDivElement>(null);
  const rothAddRef = useRef<HTMLDivElement>(null);
  const afterTaxAddRef = useRef<HTMLDivElement>(null);
  const addRefs = [retirementAddRef, rothAddRef, afterTaxAddRef];

  return (
    <div className="flex flex-col gap-0 lg:gap-9">
      <StepTour
        tourId="accounts"
        steps={ACCOUNTS_TOUR_STEPS}
        targets={{
          "add-account": [retirementAddRef, rothAddRef, afterTaxAddRef],
        }}
      />
      {ACCOUNT_GROUPS.map((g, i) => (
        <Fragment key={g.title}>
          {i > 0 ? (
            <hr className="my-6 border-0 border-t border-border lg:hidden" />
          ) : null}
          <Group
            {...g}
            editingId={editingId}
            setEditingId={setEditingId}
            addButtonRef={addRefs[i]}
          />
        </Fragment>
      ))}
    </div>
  );
}
