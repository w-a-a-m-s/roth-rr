'use client';

import type { ReactNode } from 'react';

export const iconProps = {
	viewBox: '0 0 24 24',
	fill: 'none',
	stroke: 'currentColor',
	strokeWidth: 1.8,
	strokeLinecap: 'round' as const,
	strokeLinejoin: 'round' as const,
	className: 'h-4 w-4'
};

export function IconButton({
	title,
	onClick,
	danger = false,
	primary = false,
	disabled = false,
	tooltipAlign = 'center',
	children
}: {
	title: string;
	onClick: () => void;
	danger?: boolean;
	primary?: boolean;
	disabled?: boolean;
	tooltipAlign?: 'center' | 'right';
	children: ReactNode;
}) {
	const variant = primary
		? 'border-accent bg-accent text-white hover:bg-accent-hover hover:border-accent-hover'
		: danger
		? 'border-border-2 bg-surface text-muted hover:bg-danger-bg hover:border-danger-border hover:text-danger'
		: 'border-border-2 bg-surface text-muted-2 hover:bg-card hover:border-accent/40 hover:text-accent';
	return (
		<span className="group relative inline-flex">
			<button
				type="button"
				aria-label={title}
				onClick={onClick}
				disabled={disabled}
				className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-[9px] border transition disabled:cursor-not-allowed disabled:opacity-40 ${variant}`}
			>
				{children}
			</button>
			<span
				className={`pointer-events-none absolute top-full z-50 mt-1.5 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-xs font-medium text-white opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 ${
					tooltipAlign === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'
				}`}
			>
				{title}
			</span>
		</span>
	);
}
