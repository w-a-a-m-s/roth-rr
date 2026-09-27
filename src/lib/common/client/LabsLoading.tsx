"use client";

import { useEffect, useId, useState } from "react";

const WORDS = [
  "Loading",
  "Distilling",
  "Calibrating",
  "Synthesizing",
  "Pondering",
  "Brewing",
  "Cooking",
] as const;

const INTERVAL_MS = 2200;

type Size = "sm" | "md" | "lg";

const SIZE: Record<
  Size,
  { icon: number; text: string; gap: string; line: string }
> = {
  sm: { icon: 20, text: "text-[12px]", gap: "gap-1.5", line: "h-[16px]" },
  md: { icon: 26, text: "text-[13px]", gap: "gap-2", line: "h-[18px]" },
  lg: { icon: 36, text: "text-[15px]", gap: "gap-2.5", line: "h-[22px]" },
};

/** Erlenmeyer body - wide flat base + rounded corners like the brand mark. */
const FLASK_BODY =
  "M19 9c0-1.2 1-2.2 5-2.2s5 1 5 2.2v7.4L43.8 47.2Q45.5 53.5 38.8 53.5H9.2Q2.5 53.5 4.2 47.2L19 16.4V9z";

function LabsFlask({ size }: { size: number }) {
  const uid = useId().replace(/:/g, "");
  const clipId = `labs-flask-clip-${uid}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 64"
      width={size}
      height={Math.round((size * 64) / 48)}
      fill="none"
      aria-hidden
      className="labs-flask shrink-0 overflow-visible"
    >
      <defs>
        <clipPath id={clipId}>
          <path d={FLASK_BODY} />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        <g className="labs-liquid">
          <g className="labs-liquid-sway">
            <path
              fill="#3b82f6"
              d="M-10 10 C0 7 10 13 20 10 S40 7 50 10 S70 13 80 10 V72 H-10 Z"
            >
              <animate
                attributeName="d"
                dur="1.4s"
                repeatCount="indefinite"
                values="M-10 10 C0 7 10 13 20 10 S40 7 50 10 S70 13 80 10 V72 H-10 Z;M-10 10 C0 13 10 7 20 10 S40 13 50 10 S70 7 80 10 V72 H-10 Z;M-10 10 C0 7 10 13 20 10 S40 7 50 10 S70 13 80 10 V72 H-10 Z"
              />
            </path>
            <path
              fill="#3b82f6"
              opacity="0.7"
              d="M-10 10 C0 7 10 13 20 10 S40 7 50 10 S70 13 80 10 V14.5 C70 17.5 60 11.5 50 14.5 S30 17.5 20 14.5 S0 11.5 -10 14.5 Z"
            >
              <animate
                attributeName="d"
                dur="1.4s"
                repeatCount="indefinite"
                values="M-10 10 C0 7 10 13 20 10 S40 7 50 10 S70 13 80 10 V14.5 C70 17.5 60 11.5 50 14.5 S30 17.5 20 14.5 S0 11.5 -10 14.5 Z;M-10 10 C0 13 10 7 20 10 S40 13 50 10 S70 7 80 10 V14.5 C70 11.5 60 17.5 50 14.5 S30 11.5 20 14.5 S0 17.5 -10 14.5 Z;M-10 10 C0 7 10 13 20 10 S40 7 50 10 S70 13 80 10 V14.5 C70 17.5 60 11.5 50 14.5 S30 17.5 20 14.5 S0 11.5 -10 14.5 Z"
              />
            </path>
          </g>
        </g>
      </g>

      <path
        d={FLASK_BODY}
        stroke="#C9C4B8"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17 7.5h14"
        stroke="#C9C4B8"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Dots() {
  return (
    <span className="labs-dots" aria-hidden>
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  );
}

export function LabsLoading({
  size = "sm",
  className = "",
  label,
}: {
  size?: Size;
  className?: string;
  /** Override the rotating word with a fixed label. */
  label?: string;
}) {
  const [index, setIndex] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const dims = SIZE[size];

  useEffect(() => {
    if (label) return;
    const id = window.setInterval(() => {
      setIndex((i) => {
        setPrev(i);
        return (i + 1) % WORDS.length;
      });
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [label]);

  const current = label ?? WORDS[index];
  const outgoing = prev != null ? WORDS[prev] : null;

  return (
    <div
      className={`inline-flex items-center ${dims.gap} ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <LabsFlask size={dims.icon} />
      <span
        className={`relative inline-flex overflow-hidden ${dims.line} ${dims.text} font-semibold tracking-[-0.01em] text-muted-2`}
      >
        {outgoing ? (
          <span
            key={`out-${prev}`}
            className="labs-word-out absolute left-0 top-0 whitespace-nowrap"
          >
            {outgoing}<Dots />
          </span>
        ) : null}
        <span
          key={`in-${label ?? index}`}
          className="labs-word-in relative whitespace-nowrap"
        >
          {current}<Dots />
        </span>
        <span className="sr-only">{current}…</span>
      </span>
    </div>
  );
}
