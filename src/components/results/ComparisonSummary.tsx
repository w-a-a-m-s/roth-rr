'use client';

import { Fragment, useState, type ReactNode } from 'react';
import type { Comparison, ScenarioResult } from '@/lib/engine/types';
import { formatCurrency, formatSignedCurrency } from '@/lib/format';
import { totalImpact as totalImpactOf } from '@/lib/optimizer/score';

type PreTax = { baseline: number; roth: number; delta: number };

function Metric({
	label,
	baseline,
	roth,
	delta,
	higherIsBetter,
	hint,
	deltaSuffix,
	preTax
}: {
	label: string;
	baseline: number;
	roth: number;
	delta: number;
	higherIsBetter: boolean;
	hint?: string;
	deltaSuffix?: string;
	/** Before-tax amounts; the main amounts are then shown as after tax. */
	preTax?: PreTax;
}) {
	const deltaColor = deltaTone(delta, higherIsBetter);

	return (
		<div className="rounded-[14px] border border-border bg-white p-[17px]">
			<div className="text-[15px] font-bold leading-tight text-foreground">{label}</div>
			{hint ? <div className="mt-0.5 text-[11px] leading-snug text-muted-3">{hint}</div> : null}
			<div className={`mt-4 text-2xl font-extrabold leading-none tracking-[0.04em] tabular-nums ${deltaColor}`}>
				{formatSignedCurrency(delta)}
			</div>
			<div className="mt-1 mb-2.5 text-[11.5px] leading-none text-muted-3">
				{preTax ? 'after tax, ' : ''}
				{deltaSuffix ?? (higherIsBetter ? 'vs. no conversion' : 'in taxes')}
			</div>
			{preTax ? (
				<div className="-mt-1 mb-2.5 text-[11.5px] leading-none text-muted-3">
					<span className={`font-bold tabular-nums ${deltaTone(preTax.delta, higherIsBetter)}`}>
						{formatSignedCurrency(preTax.delta)}
					</span>{' '}
					before tax
				</div>
			) : null}
			{preTax ? (
				<PreAndAfterTaxGrid baseline={baseline} roth={roth} preTax={preTax} />
			) : (
				<div className="grid grid-cols-2 gap-2 border-t border-border-subtle pt-2.5">
					<div>
						<div className={SMALL_HEAD}>No conversion</div>
						<div className={SMALL_VALUE}>{formatCurrency(baseline)}</div>
					</div>
					<div>
						<div className={SMALL_HEAD}>With conversion</div>
						<div className={SMALL_VALUE}>{formatCurrency(roth)}</div>
					</div>
				</div>
			)}
		</div>
	);
}

const SMALL_HEAD = 'text-[10px] uppercase tracking-[0.03em] text-[#b5b0a6]';
const SMALL_VALUE = 'text-[13px] font-bold tabular-nums text-muted-2';

function deltaTone(delta: number, higherIsBetter: boolean): string {
	if (Math.abs(delta) < 1) return 'text-muted-3';
	const good = higherIsBetter ? delta > 0 : delta < 0;
	return good ? 'text-success' : 'text-danger';
}

function PreAndAfterTaxGrid({ baseline, roth, preTax }: { baseline: number; roth: number; preTax: PreTax }) {
	const rows = [
		{ label: 'Before tax', baseline: preTax.baseline, roth: preTax.roth },
		{ label: 'After tax', baseline, roth },
	];
	return (
		<div className="grid grid-cols-[auto_1fr_1fr] items-baseline gap-x-2 gap-y-1 border-t border-border-subtle pt-2.5">
			<div />
			<div className={SMALL_HEAD}>No conversion</div>
			<div className={SMALL_HEAD}>With conversion</div>
			{rows.map(row => (
				<Fragment key={row.label}>
					<div className={`${SMALL_HEAD} whitespace-nowrap`}>{row.label}</div>
					<div className={SMALL_VALUE}>{formatCurrency(row.baseline)}</div>
					<div className={SMALL_VALUE}>{formatCurrency(row.roth)}</div>
				</Fragment>
			))}
		</div>
	);
}

/** One scenario's totals, for analyses that don't compare conversions. */
export function ScenarioMetrics({
	scenario,
	rmdAge,
}: {
	scenario: ScenarioResult;
	rmdAge?: number;
}) {
	const t = scenario.totals;
	const rmdLabel = rmdAge != null ? String(rmdAge) : 'RMD';
	const cards: { label: string; hint?: string; value: number; preTax?: number }[] = [
		{ label: 'Lifetime taxes', hint: 'Sum of taxes across the projection', value: t.taxesTotal },
		{ label: `Assets at ${rmdLabel}`, value: t.afterTaxAssetsAtRmd, preTax: t.preTaxAssetsAtRmd },
		{ label: 'Inheritance (final year)', value: t.inheritanceFinal, preTax: t.preTaxInheritanceFinal },
		{ label: 'Total Medicare Part B', hint: 'Lifetime premiums incl. income-based IRMAA', value: t.medicareTotal },
	];
	const splitCards: { label: string; hint?: string; value: number }[] = [
		{ label: `Taxes until ${rmdLabel}`, hint: 'Sum of taxes from retirement until the RMD age', value: t.taxesEarly },
		{ label: `Taxes ${rmdLabel} and after`, hint: 'Sum of taxes from the RMD age onward', value: t.taxesLate },
	];
	return (
		<div className="flex w-full flex-col gap-3.5">
			<div className={METRIC_GRID}>
				{cards.map(card => (
					<ValueCard key={card.label} {...card} />
				))}
			</div>
			<TaxSplit rmdLabel={rmdLabel}>
				{splitCards.map(card => (
					<ValueCard key={card.label} {...card} />
				))}
			</TaxSplit>
		</div>
	);
}

const METRIC_GRID = 'grid w-full grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4';

function ValueCard({ label, hint, value, preTax }: { label: string; hint?: string; value: number; preTax?: number }) {
	return (
		<div className="rounded-[14px] border border-border bg-white p-[17px]">
			<div className="text-[15px] font-bold leading-tight text-foreground">{label}</div>
			{hint ? <div className="mt-0.5 text-[11px] leading-snug text-muted-3">{hint}</div> : null}
			<div className="mt-4 text-2xl font-extrabold leading-none tracking-[0.04em] tabular-nums text-foreground">
				{formatCurrency(value)}
			</div>
			{preTax != null ? (
				<>
					<div className="mt-1 text-[11.5px] leading-none text-muted-3">after tax</div>
					<div className="mt-2.5 border-t border-border-subtle pt-2.5">
						<div className={SMALL_HEAD}>Before tax</div>
						<div className={SMALL_VALUE}>{formatCurrency(preTax)}</div>
					</div>
				</>
			) : null}
		</div>
	);
}

/**
 * Taxes before and after the RMD age, kept behind a link so the summary
 * leads with lifetime taxes only.
 */
function TaxSplit({ rmdLabel, children }: { rmdLabel: string; children: ReactNode }) {
	const [open, setOpen] = useState(false);
	return (
		<div className="flex flex-col gap-3.5">
			<button
				type="button"
				onClick={() => setOpen(v => !v)}
				aria-expanded={open}
				className="self-start rounded px-1 text-[14px] font-semibold text-accent underline-offset-4 transition hover:underline"
			>
				{open ? `Hide taxes before and after ${rmdLabel}` : `Show taxes before and after ${rmdLabel}`}
			</button>
			{open ? <div className="grid w-full grid-cols-1 gap-3.5 sm:grid-cols-2">{children}</div> : null}
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
		<div className="flex w-full flex-col gap-3.5">
			<div className={METRIC_GRID}>
				<Metric
					label="Lifetime taxes"
					hint="Sum of taxes across the projection"
					baseline={baseline.totals.taxesTotal}
					roth={roth.totals.taxesTotal}
					delta={deltas.taxesTotal}
					higherIsBetter={false}
				/>
				<Metric
					label={`Assets at ${rmdLabel}`}
					hint="Before and after tax on tax-deferred money"
					baseline={baseline.totals.afterTaxAssetsAtRmd}
					roth={roth.totals.afterTaxAssetsAtRmd}
					delta={deltas.afterTaxAssetsAtRmd}
					higherIsBetter
					preTax={{
						baseline: baseline.totals.preTaxAssetsAtRmd,
						roth: roth.totals.preTaxAssetsAtRmd,
						delta: deltas.preTaxAssetsAtRmd
					}}
				/>
				<Metric
					label="Inheritance (final year)"
					hint="Before and after tax on tax-deferred money"
					baseline={baseline.totals.inheritanceFinal}
					roth={roth.totals.inheritanceFinal}
					delta={deltas.inheritanceFinal}
					higherIsBetter
					preTax={{
						baseline: baseline.totals.preTaxInheritanceFinal,
						roth: roth.totals.preTaxInheritanceFinal,
						delta: deltas.preTaxInheritanceFinal
					}}
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
			<TaxSplit rmdLabel={rmdLabel}>
				<Metric
					label={`Taxes until ${rmdLabel}`}
					hint={
						rmdAge != null
							? `Sum of taxes from retirement until the RMD age (${rmdAge})`
							: "Sum of taxes from retirement until the RMD age"
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
			</TaxSplit>
		</div>
	);
}
