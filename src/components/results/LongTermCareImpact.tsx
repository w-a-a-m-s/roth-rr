'use client';

import type { LongTermCareAssetImpact } from '@/lib/engine/longTermCareImpact';
import { formatCurrency } from '@/lib/format';

/**
 * Long-term care summary on Main, above the Assets, Income & Taxes table: how
 * much total assets went down over the care years, and how far below the plan
 * without care they end.
 */
export function LongTermCareImpact({ impact }: { impact: LongTermCareAssetImpact }) {
	const { firstYear, lastYear, before, after, drop, withoutCare, shortfall } = impact;
	const years = firstYear === lastYear ? String(firstYear) : `${firstYear} to ${lastYear}`;
	const fell = drop >= 0;
	const below = shortfall >= 0;

	return (
		<div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
			<div className="rounded-2xl border border-border bg-white px-5 py-4">
				<div className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-muted-3">
					{fell ? 'Total assets went down' : 'Total assets went up'}
				</div>
				<div className={`mt-1 font-serif text-[32px] font-medium leading-none ${fell ? 'text-danger' : 'text-success'}`}>
					{formatCurrency(Math.abs(drop))}
				</div>
				<p className="m-0 mt-1.5 text-[12.5px] leading-snug text-muted-3">
					During long-term care ({years}): from {formatCurrency(before)} going in to {formatCurrency(after)} at the end.
				</p>
			</div>
			<div className="rounded-2xl border border-border bg-white px-5 py-4">
				<div className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-muted-3">
					{below ? 'Less than without care' : 'More than without care'}
				</div>
				<div className={`mt-1 font-serif text-[32px] font-medium leading-none ${below ? 'text-danger' : 'text-success'}`}>
					{formatCurrency(Math.abs(shortfall))}
				</div>
				<p className="m-0 mt-1.5 text-[12.5px] leading-snug text-muted-3">
					At the end of {lastYear}: {formatCurrency(after)} with care, {formatCurrency(withoutCare)} in the same plan
					without it (no conversion).
				</p>
			</div>
		</div>
	);
}
