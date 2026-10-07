'use client';

import { useMemo, useState } from 'react';
import { useHousehold } from '@/store/useScenario';
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
import { LabsLoading } from '@/lib/common/client';

export function ResultsView() {
	const household = useHousehold();
	const ready = isHouseholdReady(household);
	const refsStatus = useExternalData(s => s.status);
	const refs = useExternalData(s => s.refs);
	const refsReady = refsStatus === 'ready';
	const comparison = useMemo(() => (ready && refsReady ? calculate(household, refs) : null), [household, ready, refsReady, refs]);
	const [tab, setTab] = useState<'baseline' | 'roth'>('baseline');
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

	const scenario = tab === 'baseline' ? comparison.baseline : comparison.roth;
	const rmdAge = primaryRmdAge(household);

	return (
		<div className="mx-auto flex w-full min-w-0 max-w-[1080px] flex-col gap-6">
			<section className="flex flex-col gap-4">
				<TotalImpact comparison={comparison} />
				<ComparisonMetrics comparison={comparison} rmdAge={rmdAge} />
			</section>

			<section className="flex flex-col gap-4">
				<div className="flex flex-wrap items-center justify-between gap-4">
					<h2 className="m-0 font-serif text-[21px] font-medium text-foreground">Projection</h2>
					<div className="inline-flex rounded-[9px] bg-segment p-[3px]">
						<button
							type="button"
							onClick={() => setTab('baseline')}
							className={`h-[30px] rounded-[7px] px-3.5 text-[12.5px] font-bold transition ${
								tab === 'baseline' ? 'bg-white text-foreground shadow-sm' : 'bg-transparent text-muted-2'
							}`}
						>
							No conversion
						</button>
						<button
							type="button"
							onClick={() => setTab('roth')}
							className={`h-[30px] rounded-[7px] px-3.5 text-[12.5px] font-bold transition ${
								tab === 'roth'
									? 'bg-white text-[color-mix(in_srgb,var(--accent)_70%,#000)] shadow-sm'
									: 'bg-transparent text-muted-2'
							}`}
						>
							With conversion
						</button>
					</div>
				</div>

				<div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
					<AssetsChart rows={scenario.rows} />
					<CashflowChart rows={scenario.rows} />
				</div>

				<AfterTaxAssetsTimeline
					rothRows={comparison.roth.rows}
					baselineRows={comparison.baseline.rows}
					household={household}
					refs={refs}
					primaryId={primaryId}
				/>

				<div className="flex flex-col gap-3">
					<h3 className="m-0 text-[14.5px] font-bold text-foreground">Year-by-year</h3>
					<ProjectionTable scenario={scenario} household={household} primaryId={primaryId} />
				</div>
			</section>
		</div>
	);
}
