"use client";

import { useRef, useState } from "react";
import { useHousehold, useScenario } from "@/store/useScenario";
import { Field } from "@/components/ui/Field";
import {
  NumberField,
  Select,
  TextInput,
  YearSelect,
} from "@/components/ui/inputs";
import { AddButton, EntityCard, ReadStat } from "@/components/ui/EntityCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { RestoreDeleted } from "@/components/ui/RestoreDeleted";
import { StepTour } from "@/components/onboarding/StepTour";
import {
  FILING_STATUS_LABELS,
  FILING_STATUS_ORDER,
} from "@/lib/config/defaults";
import { US_STATE_CODES, US_STATE_LABELS } from "@/lib/config/stateTax";
import { maxPeople } from "@/lib/domain/household";
import type { FilingStatus, Sex } from "@/lib/domain/types";
import { primaryPersonId } from "@/lib/engine/project";
import { uid } from "@/lib/id";
import {
  HOUSEHOLD_TOUR_STEPS,
  findPlanModalPrimaryAction,
} from "@/lib/onboarding/householdTour";

const SEX_OPTIONS: { value: "" | Sex; label: string }[] = [
  { value: "", label: "Not set" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

export function HouseholdStep() {
  const household = useHousehold();
  const {
    setFilingStatus,
    setResidenceState,
    addPerson,
    updatePerson,
    removePerson,
    restorePerson,
    discardDeletedPerson,
    setMainPerson,
    setAssumptions,
  } = useScenario();
  const currentYear = new Date().getFullYear();
  const canAddPerson = household.people.length < maxPeople(household.filingStatus);
  const mainPersonId = primaryPersonId(household);
  const [pendingMainId, setPendingMainId] = useState<string | null>(null);
  // Open the first person when they still have no details; after Next (and a
  // filled-in person), returning remounts with the read view closed.
  const [editingId, setEditingId] = useState<string | null>(() => {
    const person = household.people[0];
    if (!person) return null;
    const blank =
      person.name.trim().length === 0 &&
      !Number.isFinite(person.birthYear) &&
      !Number.isFinite(person.retirementYear);
    return blank ? person.id : null;
  });
  const pendingMainName = household.people.find(
    (p) => p.id === pendingMainId,
  )?.name;
  const deletedPeople = canAddPerson ? (household.deletedPeople ?? []) : [];

  const filingRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<HTMLDivElement>(null);
  const peopleRef = useRef<HTMLDivElement>(null);

  const onFilingStatusChange = (status: FilingStatus) => {
    const prevIds = new Set(household.people.map((p) => p.id));
    setFilingStatus(status);
    if (status !== "mfj") return;
    const { configs, activeId } = useScenario.getState();
    const people =
      configs.find((c) => c.id === activeId)?.household.people ?? [];
    const added = people.find((p) => !prevIds.has(p.id));
    if (added) setEditingId(added.id);
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <StepTour
        tourId="household"
        steps={HOUSEHOLD_TOUR_STEPS}
        targets={{
          filing: filingRef,
          state: stateRef,
          people: peopleRef,
          next: findPlanModalPrimaryAction,
        }}
      />
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-4 [&>*]:min-w-0">
        <div ref={filingRef} className="w-full self-start">
          <Field
            label="Filing status"
            help={
              household.filingStatus === "hoh"
                ? "Head of household often ends partway through a long projection, once a qualifying person no longer lives with you. State tax uses each state's HOH table when we have one, and the single table otherwise."
                : undefined
            }
          >
            <Select
              value={household.filingStatus}
              onChange={onFilingStatusChange}
              options={FILING_STATUS_ORDER.map((value) => ({
                value,
                label: FILING_STATUS_LABELS[value],
              }))}
            />
          </Field>
        </div>
        <div ref={stateRef} className="w-full self-start">
          <Field
            label="State of residence"
            help="Tax residence for state income tax. No-income-tax states (FL, TX, …) produce $0 state tax. Washington taxes capital gains only."
          >
            <Select
              value={household.residenceState ?? "FL"}
              onChange={(code) => setResidenceState(code)}
              options={US_STATE_CODES.map((code) => ({
                value: code,
                label: `${US_STATE_LABELS[code]} (${code})`,
              }))}
            />
          </Field>
        </div>
        <Field
          label="Project to age"
          help="Age of the primary person at which the projection stops."
        >
          <NumberField
            value={household.assumptions.finalAge}
            onChange={(finalAge) => setAssumptions({ finalAge })}
          />
        </Field>
      </div>

      <div ref={peopleRef}>
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <h3 className="m-0 text-[13.5px] font-bold text-foreground">People</h3>
          <div className="flex items-center gap-2">
            <RestoreDeleted
              items={deletedPeople.map((entry) => ({
                id: entry.item.id,
                label: entry.item.name || "Person",
                deletedAt: entry.deletedAt,
              }))}
              onRestore={restorePerson}
              onDiscard={discardDeletedPerson}
            />
            {canAddPerson ? (
              <AddButton
                label="Add person"
                onClick={() => {
                  const id = uid("p");
                  addPerson({ id, name: "" });
                  setEditingId(id);
                }}
              />
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {household.people.map((person) => {
            const isEditing = editingId === person.id;
            const isMain = person.id === mainPersonId;
            return (
              <EntityCard
                key={person.id}
                title={person.name || "Person"}
                badge={
                  isMain ? (
                    <span className="rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,#fff)] px-[7px] py-0.5 text-[9.5px] font-bold tracking-[0.04em] text-[color-mix(in_srgb,var(--accent)_50%,#000)]">
                      MAIN
                    </span>
                  ) : undefined
                }
                editing={isEditing}
                onEdit={() => setEditingId(person.id)}
                onDone={() => setEditingId(null)}
                onRemove={
                  household.people.length > 1
                    ? () => {
                        removePerson(person.id);
                        setEditingId(null);
                      }
                    : undefined
                }
                headerAction={
                  !isMain ? (
                    <button
                      type="button"
                      onClick={() => setPendingMainId(person.id)}
                      className="rounded-md px-1.5 py-0.5 text-xs font-medium text-accent hover:bg-accent-soft"
                    >
                      Set as main
                    </button>
                  ) : undefined
                }
                summary={
                  <>
                    <ReadStat
                      label="Birth year"
                      value={person.birthYear ?? "-"}
                    />
                    <ReadStat
                      label="Retirement"
                      value={person.retirementYear ?? "-"}
                    />
                  </>
                }
              >
                <div className="flex flex-col gap-[9px] lg:flex-row lg:flex-wrap">
                  <Field label="Name" className="min-w-[100px] flex-1">
                    <TextInput
                      value={person.name}
                      onChange={(name) => updatePerson(person.id, { name })}
                      placeholder="e.g. David"
                    />
                  </Field>
                  <Field label="Birth year" className="min-w-[100px] flex-1">
                    <YearSelect
                      value={person.birthYear}
                      from={1930}
                      to={currentYear}
                      allowEmpty
                      placeholder="Select year"
                      onChange={(birthYear) =>
                        updatePerson(person.id, { birthYear })
                      }
                    />
                  </Field>
                  <Field
                    label="Sex"
                    className="min-w-[100px] flex-1"
                    help="Optional. Sets the default length of long-term care: 3 years for men, 5 for women."
                  >
                    <Select
                      value={person.sex ?? ""}
                      onChange={(sex) =>
                        updatePerson(person.id, { sex: sex || undefined })
                      }
                      options={SEX_OPTIONS}
                    />
                  </Field>
                  <Field label="Retirement year" className="min-w-[100px] flex-1">
                    <YearSelect
                      value={person.retirementYear}
                      from={currentYear - 20}
                      to={currentYear + 50}
                      allowEmpty
                      placeholder="Select year"
                      onChange={(retirementYear) =>
                        updatePerson(person.id, { retirementYear })
                      }
                    />
                  </Field>
                </div>
              </EntityCard>
            );
          })}
        </div>
      </div>

      <ConfirmDialog
        open={pendingMainId != null}
        title="Change the main person?"
        confirmLabel="Make main person"
        message={
          <>
            Setting <strong>{pendingMainName || "this person"}</strong> as the
            main person will change the overall results. The main person anchors
            the calculations: the projection runs to their project-to age, and
            the after-tax assets at RMD age snapshot is taken when they reach the
            RMD age.
          </>
        }
        onCancel={() => setPendingMainId(null)}
        onConfirm={() => {
          if (pendingMainId) setMainPerson(pendingMainId);
          setPendingMainId(null);
        }}
      />
    </div>
  );
}
