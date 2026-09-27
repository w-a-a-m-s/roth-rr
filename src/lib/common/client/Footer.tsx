"use client";

import { useState, type ReactNode } from "react";
import { FooterContent } from "./FooterContent";
import { LegalDocModal } from "./LegalDocModal";
import { FOOTER_MODALS, type FooterModalId } from "./footerData";

export function Footer({
  className,
  children,
  inline,
  inlineClassName = "mx-auto flex w-full max-w-[900px] flex-col gap-4 text-left text-[12px] leading-[1.6] text-[color:var(--muted-3,#9b968c)]",
  year = new Date().getFullYear(),
}: {
  className?: string;
  children?: ReactNode;
  /** Render one footer content block under the menu (e.g. `"disclaimer"`). */
  inline?: FooterModalId;
  inlineClassName?: string;
  year?: number;
}) {
  const [openId, setOpenId] = useState<FooterModalId | null>(null);

  return (
    <>
      <footer
        className={
          className ??
          "flex shrink-0 flex-col items-center gap-2 px-5 py-6 text-center text-[12.5px] text-[color:var(--muted-3,#9b968c)]"
        }
      >
        <nav className="flex flex-wrap justify-center gap-x-[18px] gap-y-2">
          {FOOTER_MODALS.map((modal) => (
            <button
              key={modal.id}
              type="button"
              onClick={() => setOpenId(modal.id)}
              className="cursor-pointer rounded-sm border-0 bg-transparent p-0 text-[12.5px] font-semibold text-[color:var(--muted,#76716a)] transition-colors hover:text-[color:var(--accent,#2563eb)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent,#2563eb)]/30"
            >
              {modal.label}
            </button>
          ))}
        </nav>
        <div>© {year} Roth RR</div>
        {inline ? (
          <FooterContent id={inline} className={inlineClassName} />
        ) : null}
        {children}
      </footer>
      {openId ? (
        <LegalDocModal id={openId} onClose={() => setOpenId(null)} />
      ) : null}
    </>
  );
}
