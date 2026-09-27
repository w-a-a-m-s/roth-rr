"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm" | "xs";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-hover focus-visible:ring-accent/30",
  secondary:
    "bg-surface text-foreground border border-border-2 hover:bg-card focus-visible:ring-border",
  ghost:
    "bg-transparent text-muted-2 hover:bg-segment focus-visible:ring-border",
  danger:
    "bg-danger-bg text-danger border border-danger-border hover:bg-danger-bg focus-visible:ring-danger/20",
};

const sizes: Record<Size, string> = {
  md: "rounded-[9px] px-4 py-2.5 text-sm",
  sm: "rounded-[9px] px-3 py-2 text-sm",
  xs: "rounded-lg px-2 py-1 text-xs",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-semibold transition focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${sizes[size]} ${variants[variant]} ${className ?? ""}`}
      {...props}
    >
      {children}
    </button>
  );
}
