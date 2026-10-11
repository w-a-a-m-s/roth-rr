'use client';

import { useMemo, useState } from 'react';
import { useHousehold, useScenario } from '@/store/useScenario';
import { usePlanAccess } from '@/components/plan/usePlanAccess';
import type { ConversionTaxPaidFrom } from '@/lib/domain/types';
import { useExternalData } from '@/store/useExternalData';
import { calculate } from '@/lib/calculate';
import { isHouseholdReady } from '@/lib/domain/household';
import { primaryRmdAge } from '@/lib/domain/rmd';
import { primaryPersonId } from '@/lib/engine/project';
import { ComparisonMetrics, TotalImpact } from '@/components/results/ComparisonSummary';
import { AssetsChart } from '@/components/results/AssetsChart';
import { AfterTaxAssetsTimeline } from '@/components/results/AfterTaxAssetsTimeline';
import { CashflowChart } from '@/components/results/CashflowChart';
import { ProjectionTable } from '@/components/results/ProjectionTable';
import { ScenarioSnapshot } from '@/components/results/ScenarioSnapshot';
import { PresentationCharts } from '@/components/results/PresentationCharts';
import { LabsLoading } from '@/lib/common/client';
import { AnalysisTabs, ComingSoon, LongTermCareControls, SurvivorshipControls } from '@/components/results/AnalysisTabs';
import { longTermCareSettings } from '@/lib/domain/longTermCare';
import { survivorshipEvent } from '@/lib/domain/survivorship';
import { useUI } from '@/store/useUI';

export function ResultsView() {
	const household = useHousehold();
	const ready = isHouseholdReady(household);
	const refsStatus = useExternalData(s => s.status);
	const refs = useExternalData(s => s.refs);
	const refsReady = refsStatus === 'ready';
	const analysis = useUI(s => s.analysis);
	const deathEvent = useMemo(() => survivorshipEvent(household), [household]);
	const careSettings = useMemo(() => longTermCareSettings(household), [household]);
	// Every analysis runs from the same plan; each one only adds its options.
	const options = useMemo(() => {
		if (analysis === 'survivorship' && deathEvent) return { death: deathEvent };
		if (analysis === 'longTermCare' && careSettings) return { longTermCare: careSettings };
		return {};
	}, [analysis, deathEvent, careSettings]);
	const comparison = useMemo(
		() => (ready && refsReady ? calculate(household, refs, options) : null),
		[household, ready, refsReady, refs, options],
	);
	const [tab, setTab] = useState<'baseline' | 'roth'>('baseline');
	// Clients land on Main (the tables); Summary, Graphic view and the
	// year-by-year detail are tabs.
	const [view, setView] = useState<ResultsViewKey>('main');
	const primaryId = primaryPersonId(household);

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

	if (analysis === 'disability') {
		return (
			<div className="mx-auto flex w-full min-w-0 max-w-[1080px] flex-col gap-4">
				<AnalysisTabs />
				<ComingSoon title="Disability" />
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

	const scenario = tab === 'baseline' ? comparison.baseline : comparison.roth;
	const rmdAge = primaryRmdAge(household);

	return (
		<div className="mx-auto flex w-full min-w-0 max-w-[1080px] flex-col gap-6">
			<AnalysisTabs />
			{analysis === 'survivorship' && deathEvent ? (
				<SurvivorshipControls household={household} event={deathEvent} />
			) : null}
			{analysis === 'longTermCare' && careSettings ? (
				<LongTermCareControls household={household} settings={careSettings} />
			) : null}
			<div className="flex flex-wrap items-center justify-between gap-3">
				<ViewLinks view={view} onChange={setView} />
				<ConversionTaxToggle />
			</div>

			{view === 'summary' ? (
				<section className="flex flex-col gap-4">
					<TotalImpact comparison={comparison} />
					<ComparisonMetrics comparison={comparison} rmdAge={rmdAge} />
					<AfterTaxAssetsTimeline
						rothRows={comparison.roth.rows}
						baselineRows={comparison.baseline.rows}
						household={household}
						refs={refs}
						primaryId={primaryId}
					/>
				</section>
			) : null}

			{view === 'graphic' ? (
				<section className="flex flex-col gap-6">
					<PresentationCharts comparison={comparison} household={household} primaryId={primaryId} />
					<div className="flex flex-col gap-4">
						<div className="flex flex-wrap items-center justify-between gap-4">
							<h3 className="m-0 text-[14.5px] font-bold text-foreground">Assets and cash flow</h3>
							<ScenarioToggle tab={tab} onChange={setTab} />
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
					<ScenarioSnapshot comparison={comparison} household={household} primaryId={primaryId} />
				</section>
			) : null}

			{view === 'detail' ? (
				<section className="flex flex-col gap-3">
					<div className="flex flex-wrap items-center justify-between gap-4">
						<h3 className="m-0 text-[14.5px] font-bold text-foreground">Year-by-year</h3>
						<ScenarioToggle tab={tab} onChange={setTab} />
					</div>
					<ProjectionTable scenario={scenario} household={household} primaryId={primaryId} />
				</section>
			) : null}
		</div>
	);
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
