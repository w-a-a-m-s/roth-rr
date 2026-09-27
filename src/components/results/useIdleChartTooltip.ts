"use client";

import { useState } from "react";
import { chartTooltipProps } from "@/components/results/chartUtils";
import { useLgUp } from "@/lib/useLgUp";

/**
 * On desktop, keep the last data point displayed when the pointer is outside
 * the chart. Recharts only applies `defaultIndex` before interaction, so we
 * remount on mouse leave to snap back to the final year. Below `lg` there is
 * no hover, so we leave the tooltip closed until the user taps a point.
 */
export function useIdleChartTooltip(dataLength: number) {
  const [chartKey, setChartKey] = useState(0);
  const { lgUp } = useLgUp();
  return {
    chartKey: lgUp ? chartKey : 0,
    onMouseLeave: lgUp ? () => setChartKey((k) => k + 1) : undefined,
    tooltipProps: chartTooltipProps(dataLength, { idleLastPoint: lgUp }),
  };
}
