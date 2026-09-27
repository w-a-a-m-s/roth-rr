'use client';

import type { Comparison } from '@/lib/engine/types';
import { formatCurrency, formatSignedCurrency } from '@/lib/format';
import { totalImpact as totalImpactOf } from '@/lib/optimizer/score';

function Metric({
	label,
	baseline,
	roth,
	delta,
	higherIsBetter,
	hint,
	deltaSuffix
}: {
	label: string;
	baseline: number;
	roth: number;
	delta: number;
	higherIsBetter: boolean;
	hint?: string;
	deltaSuffix?: string;
}) {
	const good = higherIsBetter ? delta > 0 : delta < 0;
	const neutral = Math.abs(delta) < 1;
	const deltaColor = neutral ? 'text-muted-3' : good ? 'text-success' : 'text-danger';

	return (
		<div className="rounded-[14px] border border-border bg-white p-[17px]">
			<div className="text-[15px] font-bold leading-tight text-foreground">{label}</div>
			{hint ? <div className="mt-0.5 text-[11px] leading-snug text-muted-3">{hint}</div> : null}
			<div className={`mt-4 text-2xl font-extrabold leading-none tracking-[0.04em] tabular-nums ${deltaColor}`}>
				{formatSignedCurrency(delta)}
			</div>
			<div className="mt-1 mb-2.5 text-[11.5px] leading-none text-muted-3">
				{deltaSuffix ?? (higherIsBetter ? 'vs. no conversion' : 'in taxes')}
			</div>
			<div className="grid grid-cols-2 gap-2 border-t border-border-subtle pt-2.5">
				<div>
					<div className="text-[10px] uppercase tracking-[0.03em] text-[#b5b0a6]">No conversion</div>
					<div className="text-[13px] font-bold tabular-nums text-muted-2">{formatCurrency(baseline)}</div>
				</div>
				<div>
					<div className="text-[10px] uppercase tracking-[0.03em] text-[#b5b0a6]">With conversion</div>
					<div className="text-[13px] font-bold tabular-nums text-muted-2">{formatCurrency(roth)}</div>
				</div>
			</div>
		</div>
	);
}

export function TotalImpact({ comparison }: { comparison: Comparison }) {
	const { deltas } = comparison;
	const totalImpact = totalImpactOf(deltas);
	const impactGood = totalImpact > 0;
	const impactNeutral = Math.abs(totalImpact) < 1;
	const impactColor = impactNeutral ? 'text-muted-3' : impactGood ? 'text-success' : 'text-danger';

	return (
		<div className="flex flex-col items-center rounded-2xl border border-border bg-white px-[26px] py-[26px] text-center">
			<div className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-muted-3">Total impact</div>
			<div className={`mt-1 font-serif text-[48px] font-medium leading-none tracking-[-0.02em] ${impactColor}`}>
				{formatSignedCurrency(totalImpact)}
			</div>
			<p className="m-0 mt-0.5 max-w-[460px] text-[12.5px] leading-snug text-muted-3">
				Lifetime taxes, Medicare, and inheritance combined
			</p>
		</div>
	);
}

export function ComparisonMetrics({ comparison, rmdAge }: { comparison: Comparison; rmdAge?: number }) {
	const { baseline, roth, deltas } = comparison;
	const rmdLabel = rmdAge != null ? String(rmdAge) : "RMD";

	return (
		<div className="grid w-full grid-cols-1 gap-3.5 lg:grid-cols-3">
			<Metric
				label={`Taxes until ${rmdLabel}`}
				hint={
					rmdAge != null
						? `Sum of taxes before the RMD age (${rmdAge})`
						: "Sum of taxes before the RMD age"
				}
				baseline={baseline.totals.taxesEarly}
				roth={roth.totals.taxesEarly}
				delta={deltas.taxesEarly}
				higherIsBetter={false}
			/>
			<Metric
				label={`Taxes ${rmdLabel} and after`}
				hint={
					rmdAge != null
						? `Sum of taxes from the RMD age (${rmdAge}) onward`
						: "Sum of taxes from the RMD age onward"
				}
				baseline={baseline.totals.taxesLate}
				roth={roth.totals.taxesLate}
				delta={deltas.taxesLate}
				higherIsBetter={false}
			/>
			<Metric
				label="Lifetime taxes"
				hint="Sum of taxes across the projection"
				baseline={baseline.totals.taxesTotal}
				roth={roth.totals.taxesTotal}
				delta={deltas.taxesTotal}
				higherIsBetter={false}
			/>
			<Metric
				label={`After-tax assets at ${rmdLabel}`}
				baseline={baseline.totals.afterTaxAssetsAtRmd}
				roth={roth.totals.afterTaxAssetsAtRmd}
				delta={deltas.afterTaxAssetsAtRmd}
				higherIsBetter
			/>
			<Metric
				label="Inheritance (final year)"
				baseline={baseline.totals.inheritanceFinal}
				roth={roth.totals.inheritanceFinal}
				delta={deltas.inheritanceFinal}
				higherIsBetter
			/>
			<Metric
				label="Total Medicare Part B"
				hint="Lifetime premiums incl. income-based IRMAA"
				baseline={baseline.totals.medicareTotal}
				roth={roth.totals.medicareTotal}
				delta={deltas.medicareTotal}
				higherIsBetter={false}
				deltaSuffix="in premiums"
			/>
		</div>
	);
}
