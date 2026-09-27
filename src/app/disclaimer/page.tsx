import type { Metadata } from "next";
import Link from "next/link";
import {
  DISCLAIMER_CLOSING,
  DISCLAIMER_SECTIONS,
} from "@/lib/disclaimer";

export const metadata: Metadata = {
  title: "Disclaimer",
  description:
    "Disclaimer for the Advanced Roth Calculator and related calculators.",
};

export default function DisclaimerPage() {
  return (
    <div className="min-h-full bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="text-sm font-semibold text-slate-900 hover:text-slate-700"
          >
            Advanced Roth Calculator
          </Link>
          <Link
            href="/"
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            Back to calculator
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
          Disclaimer
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Please read this disclaimer carefully before using the Software.
        </p>

        <div className="mt-8 flex flex-col gap-7 rounded-md border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          {DISCLAIMER_SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-base font-semibold text-slate-900">
                {section.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {section.body}
              </p>
            </section>
          ))}

          {DISCLAIMER_CLOSING.map((paragraph) => (
            <p
              key={paragraph.slice(0, 40)}
              className="text-sm leading-6 text-slate-600"
            >
              {paragraph}
            </p>
          ))}
        </div>
      </main>
    </div>
  );
}
