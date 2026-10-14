'use client';

import { useMemo, useState } from 'react';
import { useHousehold, useScenario } from '@/store/useScenario';
import { usePlanAccess } from '@/components/plan/usePlanAccess';
import type { ConversionTaxPaidFrom, DeathEvent, DisabilityEvent, Household, LongTermCareSettings } from '@/lib/domain/types';
import { useExternalData } from '@/store/useExternalData';
import { calculate } from '@/lib/calculate';
import { isHouseholdReady } from '@/lib/domain/household';
import { primaryRmdAge } from '@/lib/domain/rmd';
import { primaryPersonId, retirementStartYear } from '@/lib/engine/project';
import type { Comparison } from '@/lib/engine/types';
import { DisplayFromToggle } from '@/components/results/DisplayFromToggle';
import { scenarioFrom, snapshotFromYear, type SnapshotFrom } from '@/components/results/snapshotTable';
import { ComparisonMetrics, ScenarioMetrics, TotalImpact } from '@/components/results/ComparisonSummary';
import { AssetsChart } from '@/components/results/AssetsChart';
import { AfterTaxAssetsTimeline } from '@/components/results/AfterTaxAssetsTimeline';
import { CashflowChart } from '@/components/results/CashflowChart';
import { ProjectionTable } from '@/components/results/ProjectionTable';
import { ScenarioSnapshot } from '@/components/results/ScenarioSnapshot';
import { PresentationCharts } from '@/components/results/PresentationCharts';
import { LabsLoading } from '@/lib/common/client';
import { MortgageAnalysis } from '@/components/results/MortgageAnalysis';
import { SocialSecurityAnalysis } from '@/components/results/SocialSecurityAnalysis';
import { CarAnalysis } from '@/components/results/CarAnalysis';
import { MedicareAnalysis } from '@/components/results/MedicareAnalysis';
import { LifeInsuranceSummary } from '@/components/wizard/steps/LifeInsuranceSummary';
import { AnalysisTabs, DisabilityControls, LongTermCareControls, SurvivorshipControls } from '@/components/results/AnalysisTabs';
import { disabilityEvent, resolveDisability } from '@/lib/domain/insurance';
import { longTermCareSettings, resolveLongTermCare } from '@/lib/domain/longTermCare';
import { resolveDeath, survivorshipEvent } from '@/lib/domain/survivorship';
import { useUI } from '@/store/useUI';

/** Analyses that aren't a projection run and skip the results tabs. */
const STANDALONE = new Set(['mortgage', 'socialSecurity', 'car']);

export function ResultsView() {
	const household = useHousehold();
	const ready = isHouseholdReady(household);
	const refsStatus = useExternalData(s => s.status);
	const refs = useExternalData(s => s.refs);
	const refsReady = refsStatus === 'ready';
	const analysis = useUI(s => s.analysis);
	const deathEvent = useMemo(() => survivorshipEvent(household), [household]);
	const careSettings = useMemo(() => longTermCareSettings(household), [household]);
	const disabilitySetting = useMemo(
		() => disabilityEvent(household, new Date().getFullYear()),
		[household],
	);
	// Every analysis runs from the same plan; each one only adds its options.
	const options = useMemo(() => {
		if (analysis === 'survivorship' && deathEvent) return { death: deathEvent };
		if (analysis === 'longTermCare' && careSettings) return { longTermCare: careSettings };
		if (analysis === 'disability' && disabilitySetting) return { disability: disabilitySetting };
		return {};
	}, [analysis, deathEvent, careSettings, disabilitySetting]);
	const comparison = useMemo(
		() => (ready && refsReady && !STANDALONE.has(analysis) ? calculate(household, refs, options) : null),
		[household, ready, refsReady, refs, options, analysis],
	);
	// The tables and charts also show the years from today to the plan start
	// (Jump to from today). Summary keeps the normal run, so its totals don't
	// count the years before the plan.
	const displayComparison = useMemo(
		() =>
			ready && refsReady && !STANDALONE.has(analysis)
				? calculate(household, refs, { ...options, fromYear: new Date().getFullYear() })
				: null,
		[household, ready, refsReady, refs, options, analysis],
	);
	const [tab, setTab] = useState<'baseline' | 'roth'>('baseline');
	// Clients land on Main (the tables); Summary, Graphic view and the
	// year-by-year detail are tabs.
	const [view, setView] = useState<ResultsViewKey>('main');
	// From today / From the analysis's milestone: one choice for Main, Graphic
	// view and the year-by-year table.
	const [from, setFrom] = useState<SnapshotFrom>('today');
	const primaryId = primaryPersonId(household);

	// Mortgage analysis is an amortization table from a statement, not a
	// projection, so it skips the results tabs.
	if (analysis === 'mortgage') {
		return (
			<div className="mx-auto flex w-full min-w-0 max-w-[1080px] flex-col gap-4">
				<AnalysisTabs />
				<MortgageAnalysis household={household} />
			</div>
		);
	}

	// Social Security analysis compares claiming ages for the plan's benefit,
	// not a projection, so it skips the results tabs too.
	if (analysis === 'socialSecurity') {
		return (
			<div className="mx-auto flex w-full min-w-0 max-w-[1080px] flex-col gap-4">
				<AnalysisTabs />
				<SocialSecurityAnalysis household={household} />
			</div>
		);
	}

	// Car analysis: lease, cash or finance one car. Not a projection either.
	if (analysis === 'car') {
		return (
			<div className="mx-auto flex w-full min-w-0 max-w-[1080px] flex-col gap-4">
				<AnalysisTabs />
				<CarAnalysis household={household} />
			</div>
		);
	}

	if (!refsReady) {
		return (
			<div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-white p-8">
				<LabsLoading size="md" />
				<p className="text-sm text-muted">Fetching tax and Medicare tables…</p>
			</div>
		);
	}

	if (!comparison) {
		return (
			<div className="rounded-2xl border border-border bg-white p-6 text-center text-sm text-muted">
				<p className="font-medium text-foreground">Almost there</p>
				<p className="mt-1">Enter a birth year and retirement year for everyone in the Household step to see your projection.</p>
			</div>
		);
	}

	// Medicare analysis reads the Retirement projection (both scenarios) and
	// skips the results tabs.
	if (analysis === 'medicare') {
		return (
			<div className="mx-auto flex w-full min-w-0 max-w-[1080px] flex-col gap-4">
				<AnalysisTabs />
				<MedicareAnalysis household={household} comparison={comparison} medicare={refs.medicare} />
			</div>
		);
	}

	if (analysis === 'disability' && !disabilitySetting) {
		return (
			<div className="mx-auto flex w-full min-w-0 max-w-[1080px] flex-col gap-4">
				<AnalysisTabs />
				<div className="rounded-2xl border border-border bg-white p-6 text-center text-sm text-muted">
					<p className="font-medium text-foreground">Disability needs a birth year</p>
					<p className="mt-1">Enter a birth year in the Household step to see what happens if someone can&apos;t work.</p>
				</div>
			</div>
		);
	}

	if (analysis === 'survivorship' && !deathEvent) {
		return (
			<div className="mx-auto flex w-full min-w-0 max-w-[1080px] flex-col gap-4">
				<AnalysisTabs />
				<div className="rounded-2xl border border-border bg-white p-6 text-center text-sm text-muted">
					<p className="font-medium text-foreground">Survivorship needs two people</p>
					<p className="mt-1">Add a spouse in the Household step to see what happens when one of you passes.</p>
				</div>
			</div>
		);
	}

	// Survivorship, Disability and Long-term care show the plan without
	// conversions only; Retirement compares the two.
	const single = analysis !== 'retirement';
	const shown = displayComparison ?? comparison;
	const todayYear = refs.asOfDate ? Number(refs.asOfDate.slice(0, 4)) : new Date().getFullYear();
	const milestone = displayMilestone(household, analysis, deathEvent, careSettings, disabilitySetting);
	const fromYear = snapshotFromYear(
		shown.baseline.rows.map(r => r.calendarYear),
		from === 'today' ? todayYear : milestone.year,
	);
	const fromToggle = <DisplayFromToggle value={from} onChange={setFrom} milestoneLabel={milestone.label} />;
	const visible: Comparison = {
		...shown,
		baseline: scenarioFrom(shown.baseline, fromYear),
		roth: scenarioFrom(shown.roth, fromYear),
	};
	const scenario = single || tab === 'baseline' ? visible.baseline : visible.roth;
	const rmdAge = primaryRmdAge(household);

	return (
		<div className="mx-auto flex w-full min-w-0 max-w-[1080px] flex-col gap-6">
			<AnalysisTabs />
			{analysis === 'survivorship' && deathEvent ? (
				<>
					<SurvivorshipControls household={household} event={deathEvent} />
					<LifeInsuranceSummary household={household} />
				</>
			) : null}
			{analysis === 'disability' && disabilitySetting ? (
				<DisabilityControls household={household} event={disabilitySetting} />
			) : null}
			{analysis === 'longTermCare' && careSettings ? (
				<LongTermCareControls household={household} settings={careSettings} />
			) : null}
			<div className="flex flex-wrap items-center justify-between gap-3">
				<ViewLinks view={view} onChange={setView} />
				{single ? null : <ConversionTaxToggle />}
			</div>

			{view === 'summary' ? (
				<section className="flex flex-col gap-4">
					{single ? (
						<ScenarioMetrics scenario={comparison.baseline} rmdAge={rmdAge} />
					) : (
						<>
							<TotalImpact comparison={comparison} />
							<ComparisonMetrics comparison={comparison} rmdAge={rmdAge} />
						</>
					)}
					<AfterTaxAssetsTimeline
						rothRows={comparison.roth.rows}
						baselineRows={comparison.baseline.rows}
						household={household}
						refs={refs}
						primaryId={primaryId}
						single={single}
					/>
				</section>
			) : null}

			{view === 'graphic' ? (
				<section className="flex flex-col gap-6">
					<div className="flex justify-end">{fromToggle}</div>
					<PresentationCharts comparison={visible} household={household} primaryId={primaryId} single={single} />
					<div className="flex flex-col gap-4">
						<div className="flex flex-wrap items-center justify-between gap-4">
							<h3 className="m-0 text-[14.5px] font-bold text-foreground">Assets and cash flow</h3>
							{single ? null : <ScenarioToggle tab={tab} onChange={setTab} />}
						</div>
						<div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
							<AssetsChart rows={scenario.rows} />
							<CashflowChart rows={scenario.rows} />
						</div>
					</div>
				</section>
			) : null}

			{view === 'main' ? (
				<section className="flex flex-col gap-4">
					<ScenarioSnapshot
						key={comparison.baseline.rows[0]?.calendarYear}
						initialYear={comparison.baseline.rows[0]?.calendarYear}
						comparison={shown}
						household={household}
						primaryId={primaryId}
						single={single}
						from={from}
						fromYear={fromYear}
						onFromChange={setFrom}
						milestoneLabel={milestone.label}
					/>
				</section>
			) : null}

			{view === 'detail' ? (
				<section className="flex flex-col gap-3">
					<div className="flex flex-wrap items-center justify-between gap-4">
						<h3 className="m-0 text-[14.5px] font-bold text-foreground">Year-by-year</h3>
						<div className="flex flex-wrap items-center gap-3">
							{fromToggle}
							{single ? null : <ScenarioToggle tab={tab} onChange={setTab} />}
						</div>
					</div>
					<ProjectionTable scenario={scenario} household={household} primaryId={primaryId} />
				</section>
			) : null}
		</div>
	);
}

/**
 * The year "From <milestone>" starts at: the death in Survivorship, the first
 * year of care in Long-term care, the disability in Disability, otherwise the
 * first retirement year.
 */
function displayMilestone(
	household: Household,
	analysis: string,
	death: DeathEvent | null,
	care: LongTermCareSettings | null,
	disability: DisabilityEvent | null,
): { label: string; year: number } {
	if (analysis === 'disability') {
		const resolved = resolveDisability(household, disability);
		if (resolved) return { label: 'From disability', year: resolved.year };
	}
	if (analysis === 'survivorship') {
		const resolved = resolveDeath(household, death);
		if (resolved) return { label: 'From death', year: resolved.year };
	}
	if (analysis === 'longTermCare') {
		const stays = resolveLongTermCare(household, care)?.stays ?? [];
		if (stays.length > 0) {
			return { label: 'From long-term care', year: Math.min(...stays.map(s => s.firstYear)) };
		}
	}
	return { label: 'From retirement year', year: retirementStartYear(household) };
}

type ResultsViewKey = 'main' | 'summary' | 'graphic' | 'detail';

const VIEW_LINKS: { key: ResultsViewKey; label: string }[] = [
	{ key: 'main', label: 'Main' },
	{ key: 'summary', label: 'Summary' },
	{ key: 'graphic', label: 'Graphic view' },
	{ key: 'detail', label: 'Main in detail analysis' },
];

/** Tabs for the results: each shows only its own sections. */
function ViewLinks({ view, onChange }: { view: ResultsViewKey; onChange: (key: ResultsViewKey) => void }) {
	return (
		<nav aria-label="Results view" className="flex flex-wrap items-center gap-x-1 gap-y-1">
			{VIEW_LINKS.map(({ key, label }, i) => (
				<span key={key} className="inline-flex items-center gap-1">
					{i > 0 ? (
						<span aria-hidden className="px-1 text-muted-3">
							|
						</span>
					) : null}
					<button
						type="button"
						onClick={() => onChange(key)}
						aria-current={view === key ? 'page' : undefined}
						className={`rounded px-1 text-[14px] font-semibold underline-offset-4 transition ${
							view === key ? 'text-foreground underline decoration-2' : 'text-accent hover:underline'
						}`}
					>
						{label}
					</button>
				</span>
			))}
		</nav>
	);
}

function ScenarioToggle({ tab, onChange }: { tab: 'baseline' | 'roth'; onChange: (tab: 'baseline' | 'roth') => void }) {
	return (
		<div className="inline-flex rounded-[9px] bg-segment p-[3px]">
			<button
				type="button"
				onClick={() => onChange('baseline')}
				className={`h-[30px] rounded-[7px] px-3.5 text-[12.5px] font-bold transition ${
					tab === 'baseline' ? 'bg-white text-foreground shadow-sm' : 'bg-transparent text-muted-2'
				}`}
			>
				No conversion
			</button>
			<button
				type="button"
				onClick={() => onChange('roth')}
				className={`h-[30px] rounded-[7px] px-3.5 text-[12.5px] font-bold transition ${
					tab === 'roth'
						? 'bg-white text-[color-mix(in_srgb,var(--accent)_70%,#000)] shadow-sm'
						: 'bg-transparent text-muted-2'
				}`}
			>
				With conversion
			</button>
		</div>
	);
}

const TAX_PAID_FROM: { key: ConversionTaxPaidFrom; label: string; help: string }[] = [
	{ key: 'income', label: 'Paid from income', help: "You pay the conversion's tax out of that year's income." },
	{ key: 'assets', label: 'Paid from assets', help: "The conversion's tax is withheld from the converted money, so less lands in the Roth." },
];

/** Who pays the tax a conversion adds: the year's income, or the converted dollars. */
function ConversionTaxToggle() {
	const paidFrom = useHousehold().optimizer.conversionTaxPaidFrom ?? 'income';
	const setOptimizer = useScenario(s => s.setOptimizer);
	const { readOnly } = usePlanAccess();
	return (
		<div className="flex items-center gap-2">
			<span className="text-[12.5px] font-semibold text-muted-2">Conversion tax</span>
			<div role="group" aria-label="Conversion tax" className="inline-flex rounded-[9px] bg-segment p-[3px]">
				{TAX_PAID_FROM.map(({ key, label, help }) => (
					<button
						key={key}
						type="button"
						title={help}
						disabled={readOnly}
						aria-pressed={paidFrom === key}
						onClick={() => setOptimizer({ conversionTaxPaidFrom: key })}
						className={`h-[30px] rounded-[7px] px-3.5 text-[12.5px] font-bold transition disabled:cursor-not-allowed ${
							paidFrom === key ? 'bg-white text-foreground shadow-sm' : 'bg-transparent text-muted-2'
						}`}
					>
						{label}
					</button>
				))}
			</div>
		</div>
	);
}
