import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, DollarSign, Cpu, Clock } from "lucide-react";

interface OSIMetrics {
  revenue: number;
  llmCost: number;
  toolCosts: number;
  rawOSI: number;
  operatorHours: number;
  effectiveOSIPerHour: number;
  status: string;
}

export function OSIPanel({ metrics }: { metrics: OSIMetrics }) {
  const statusLabel =
    metrics.status === "profitable"
      ? "Profitable"
      : metrics.status === "surviving"
      ? "Surviving — Not Yet Profitable"
      : "Dying — Needs Attention";

  return (
    <Card className="border-[#222] bg-[#0a0a0a]">
      <CardHeader className="pb-2">
        <CardTitle className="text-zinc-400 text-sm font-medium flex items-center gap-2">
          <TrendingUp className="w-4 h-4" /> Effective OSI (30 days)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-zinc-300">
          <DollarSign className="w-4 h-4 text-emerald-500" />
          <span>Revenue:</span>
          <span className="font-mono">${metrics.revenue.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-2 text-zinc-300">
          <Cpu className="w-4 h-4 text-amber-500" />
          <span>LLM Cost:</span>
          <span className="font-mono">-${metrics.llmCost.toFixed(2)}</span>
        </div>
        {metrics.toolCosts > 0 && (
          <div className="flex items-center gap-2 text-zinc-300">
            <span>Tool Subscriptions:</span>
            <span className="font-mono">-${metrics.toolCosts.toFixed(2)}</span>
          </div>
        )}
        <div className="border-t border-[#222] pt-2">
          <span className="text-zinc-400">Raw OSI: </span>
          <span className={`font-mono font-semibold ${metrics.rawOSI >= 0 ? "text-emerald-500" : "text-amber-500"}`}>
            {metrics.rawOSI >= 0 ? "+" : ""}${metrics.rawOSI.toFixed(2)}
          </span>
        </div>
        {metrics.operatorHours > 0 && (
          <div className="flex items-center gap-2 text-zinc-300">
            <Clock className="w-4 h-4" />
            <span>Operator Hours: {metrics.operatorHours}h</span>
            <span className="font-mono">${metrics.effectiveOSIPerHour.toFixed(2)}/hr effective</span>
          </div>
        )}
        <div className="text-xs text-zinc-500 pt-1">
          Status: {statusLabel}
        </div>
      </CardContent>
    </Card>
  );
}
