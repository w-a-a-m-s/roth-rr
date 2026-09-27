"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  flattenSelectList,
  matchTypeahead,
  nextTypeaheadQuery,
  placeSelectMenu,
  type SelectGroup,
  type SelectOption,
} from "./selectMenu";

const triggerClass =
  "flex w-full items-center justify-between gap-2 rounded-[9px] border border-border-2 bg-surface-muted px-2.5 py-1.5 text-left text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:cursor-not-allowed disabled:opacity-60";

export function SelectMenu({
  value,
  onChange,
  options,
  groups,
  id,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options?: SelectOption[];
  groups?: SelectGroup[];
  id?: string;
  disabled?: boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const typeaheadRef = useRef("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [coords, setCoords] = useState<ReturnType<typeof placeSelectMenu> | null>(
    null,
  );
  const { items, options: flat } = flattenSelectList(options, groups);
  const selected = flat.find((opt) => opt.value === value);
  const selectedIndex = Math.max(
    0,
    flat.findIndex((opt) => opt.value === value),
  );

  const place = () => {
    const trigger = rootRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setCoords(
      placeSelectMenu(
        {
          top: rect.top,
          left: rect.left,
          bottom: rect.bottom,
          width: rect.width,
        },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  };

  const close = () => {
    typeaheadRef.current = "";
    setOpen(false);
    setCoords(null);
  };

  const openMenu = () => {
    if (disabled || flat.length === 0) return;
    setActiveIndex(selectedIndex);
    place();
    setOpen(true);
  };

  const pick = (next: string) => {
    onChange(next);
    close();
    rootRef.current?.querySelector("button")?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      close();
    };
    const onReposition = () => {
      const trigger = rootRef.current;
      if (!trigger) return close();
      const rect = trigger.getBoundingClientRect();
      const visible =
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        rect.right > 0 &&
        rect.left < window.innerWidth;
      if (!visible) return close();
      place();
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const active = menuRef.current?.querySelector("[data-active='true']");
    if (active instanceof HTMLElement) {
      active.scrollIntoView({ block: "nearest" });
    }
  }, [open, activeIndex]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((i) => {
        if (flat.length === 0) return 0;
        return (i + delta + flat.length) % flat.length;
      });
      return;
    }
    if (event.key === "Home" && open) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End" && open) {
      event.preventDefault();
      setActiveIndex(Math.max(0, flat.length - 1));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      if (!open) {
        event.preventDefault();
        openMenu();
        return;
      }
      event.preventDefault();
      const opt = flat[activeIndex];
      if (opt) pick(opt.value);
      return;
    }
    if (event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    const next = nextTypeaheadQuery(typeaheadRef.current, event.key, flat);
    typeaheadRef.current = next;
    const match = matchTypeahead(flat, next, open ? activeIndex : selectedIndex);
    if (match < 0) return;
    event.preventDefault();
    if (open) setActiveIndex(match);
    else pick(flat[match]!.value);
  };

  return (
    <div ref={rootRef} className="relative w-full min-w-0">
      <button
        id={id}
        type="button"
        role="combobox"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={
          open ? `${listId}-opt-${activeIndex}` : undefined
        }
        className={triggerClass}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span
          className={`min-w-0 flex-1 truncate ${
            value ? "" : "text-muted-3"
          }`}
        >
          {selected?.label ?? "\u00a0"}
        </span>
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`shrink-0 text-muted-3 transition ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path
            d="M6 9l6 6 6-6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && coords && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              id={listId}
              role="listbox"
              style={{
                position: "fixed",
                top: coords.top,
                left: coords.left,
                width: coords.width,
                maxHeight: coords.maxHeight,
              }}
              className="z-[100] overflow-y-auto rounded-xl border border-border bg-white p-1.5 shadow-[0_12px_30px_rgba(30,26,20,0.14)]"
            >
              {items.map((item, i) => {
                if (item.type === "group") {
                  return (
                    <div
                      key={`g-${item.label}-${i}`}
                      className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-3"
                    >
                      {item.label}
                    </div>
                  );
                }
                const index = item.index;
                const active = index === activeIndex;
                const isSelected = item.value === value;
                return (
                  <button
                    key={item.value}
                    id={`${listId}-opt-${index}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-active={active ? "true" : undefined}
                    className={`flex min-h-11 w-full items-center rounded-lg px-3 py-2 text-left text-base leading-snug transition lg:min-h-0 lg:py-1.5 lg:text-sm ${
                      active
                        ? "bg-[color-mix(in_srgb,var(--accent)_12%,#fff)] text-foreground"
                        : "text-foreground hover:bg-surface-muted"
                    } ${isSelected ? "font-semibold" : ""}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => pick(item.value)}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
