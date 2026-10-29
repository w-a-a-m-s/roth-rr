'use client';

import type { LongTermCareAssetImpact } from '@/lib/engine/longTermCareImpact';
import { formatCurrency } from '@/lib/format';

/**
 * Long-term care summary on Main, above the Assets, Income & Taxes table: how
 * much total assets went down over the care years, and how far below the plan
 * without care they end, and whether the income covers the care years.
 */
export function LongTermCareImpact({ impact }: { impact: LongTermCareAssetImpact }) {
	const { firstYear, lastYear, before, after, drop, withoutCare, shortfall, cashFlow } = impact;
	const years = firstYear === lastYear ? String(firstYear) : `${firstYear} to ${lastYear}`;
	const fell = drop >= 0;
	const below = shortfall >= 0;

	return (
		<div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
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
			<CashFlowCard cashFlow={cashFlow} years={years} />
		</div>
	);
}

/** Whether the year's income after tax pays for the care and the rest of the spending. */
function CashFlowCard({ cashFlow, years }: { cashFlow: LongTermCareAssetImpact['cashFlow']; years: string }) {
	const { shortYears, fromAccounts, uncovered } = cashFlow;
	const sufficient = shortYears.length === 0;
	// Back-to-back years read as a range; with a gap, list them.
	const contiguous = shortYears.every((y, i) => i === 0 || y === shortYears[i - 1] + 1);
	const shortRange =
		shortYears.length === 1
			? String(shortYears[0])
			: contiguous
				? `${shortYears[0]} to ${shortYears[shortYears.length - 1]}`
				: shortYears.join(', ');

	return (
		<div className="rounded-2xl border border-border bg-white px-5 py-4">
			<div className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-muted-3">Cash flow during care</div>
			<div className={`mt-1 font-serif text-[32px] font-medium leading-none ${sufficient ? 'text-success' : 'text-danger'}`}>
				{sufficient ? 'Sufficient' : 'Not sufficient'}
			</div>
			<p className="m-0 mt-1.5 text-[12.5px] leading-snug text-muted-3">
				{sufficient
					? `Income after tax covers the care and the rest of the spending every year (${years}).`
					: `Income falls short in ${shortYears.length} of ${cashFlow.years} care years (${shortRange}), so ${formatCurrency(fromAccounts)} more comes out of savings, tax on it included.`}
				{uncovered > 0 ? ` Once the accounts run out, ${formatCurrency(uncovered)} is left unpaid.` : null}
			</p>
		</div>
	);
}
