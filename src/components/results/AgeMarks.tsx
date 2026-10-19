import type { Person } from "@/lib/domain/types";
import { personRmdAge } from "@/lib/domain/rmd";

export type AgeMark = "retires" | "rmd" | "both";

/** Retirement year in green, first RMD year in the RMD amber, both in amber with a green rule. */
export const MARK_CELL: Record<AgeMark, string> = {
  retires: "bg-[#2F7D57] text-white",
  rmd: "bg-[#F2C14E] text-[#14243D]",
  both: "bg-[#F2C14E] text-[#14243D] shadow-[inset_0_-4px_0_#2F7D57]",
};

export const MARK_LABEL: Record<AgeMark, string> = {
  retires: "Retires",
  rmd: "1st RMD",
  both: "Retires · 1st RMD",
};

/** Calendar year of a person's first RMD (birth year + RMD age), if known. */
export function firstRmdYear(person: Pick<Person, "birthYear">): number | undefined {
  const age = personRmdAge(person);
  if (age == null || person.birthYear == null) return undefined;
  return person.birthYear + age;
}

/** Whether a person retires or takes a first RMD in `year`. */
export function ageMark(
  marks: { retireYear?: number; rmdYear?: number },
  year: number,
): AgeMark | null {
  const retires = marks.retireYear === year;
  const rmd = marks.rmdYear === year;
  if (retires && rmd) return "both";
  if (retires) return "retires";
  if (rmd) return "rmd";
  return null;
}

/** Small tag under a highlighted age. */
export function MarkTag({ mark }: { mark: AgeMark }) {
  return (
    <span className="block text-[10.5px] font-semibold uppercase tracking-wide">
      {MARK_LABEL[mark]}
    </span>
  );
}

export function MarkLegend({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-semibold text-[#1B365D] ${className}`}
    >
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="inline-block h-3 w-3 rounded-sm bg-[#2F7D57]" />
        Retirement year
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="inline-block h-3 w-3 rounded-sm bg-[#F2C14E]" />
        First RMD year
      </span>
    </div>
  );
}
