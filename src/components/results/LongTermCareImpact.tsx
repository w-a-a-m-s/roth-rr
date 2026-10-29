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

/** Back-to-back years read as a range; with a gap, list them. */
function yearList(years: number[]): string {
	if (years.length === 1) return String(years[0]);
	const contiguous = years.every((y, i) => i === 0 || y === years[i - 1] + 1);
	return contiguous ? `${years[0]} to ${years[years.length - 1]}` : years.join(', ');
}

/**
 * Whether the plan can pay for the care years: from income, or from savings
 * when income falls short. Not sufficient only once the accounts run dry and
 * spending is left unpaid.
 */
function CashFlowCard({ cashFlow, years }: { cashFlow: LongTermCareAssetImpact['cashFlow']; years: string }) {
	const { shortYears, fromAccounts, unpaidYears, uncovered, savingsRunOutYear, planEndYear } = cashFlow;
	const sufficient = unpaidYears.length === 0;
	let detail = `Income after tax covers the care and the rest of the spending every year (${years}).`;
	if (shortYears.length > 0) {
		detail = `Income alone falls short in ${shortYears.length} of ${cashFlow.years} care years (${yearList(shortYears)}), and savings cover it with ${formatCurrency(fromAccounts)} more, tax included.`;
	}
	if (!sufficient) {
		detail = `${formatCurrency(uncovered)} of care-year spending is left unpaid (${yearList(unpaidYears)}). Before that, ${formatCurrency(fromAccounts)} came out of savings.`;
	}
	const runOut =
		savingsRunOutYear == null ? `Savings last through ${planEndYear}` : `Savings run out in ${savingsRunOutYear}`;

	return (
		<div className="rounded-2xl border border-border bg-white px-5 py-4">
			<div className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-muted-3">Cash flow during care</div>
			<div className={`mt-1 font-serif text-[32px] font-medium leading-none ${sufficient ? 'text-success' : 'text-danger'}`}>
				{sufficient ? 'Sufficient' : 'Not sufficient'}
			</div>
			<p className={`m-0 mt-1.5 text-[12.5px] font-semibold ${savingsRunOutYear == null ? 'text-success' : 'text-danger'}`}>
				{runOut}
			</p>
			<p className="m-0 mt-1 text-[12.5px] leading-snug text-muted-3">{detail}</p>
		</div>
	);
}
