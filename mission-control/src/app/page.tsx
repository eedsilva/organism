import React from "react";
import { Activity } from "lucide-react";
import { getSystemMetrics, getPipelineOpportunities, getRecentEvents, getOSIMetrics } from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OpportunityBoard } from "@/components/OpportunityBoard";
import { OSIPanel } from "@/components/OSIPanel";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [metrics, opportunities, events, osiMetrics] = await Promise.all([
    getSystemMetrics(),
    getPipelineOpportunities(),
    getRecentEvents(),
    getOSIMetrics(),
  ]);

  return (
    <main className="flex-1 flex flex-col min-w-0 overflow-y-auto h-screen">
      <header className="h-16 border-b border-[#222] flex items-center px-8 shrink-0 bg-black/50 backdrop-blur-md sticky top-0 z-10">
        <h2 className="text-lg font-medium text-zinc-200">Pipeline Overview</h2>
      </header>

      <div className="p-8 space-y-8 max-w-7xl">

        {/* OSI Panel - Primary V4 metric */}
        <OSIPanel metrics={osiMetrics} />

        {/* Top Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-zinc-400 text-sm font-medium flex items-center gap-2">
                <Activity className="w-4 h-4" /> Total Validated Leads
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">0</div>
              <p className="text-xs text-zinc-500 mt-1">Emails captured from targeted traffic</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-zinc-400 text-sm font-medium">Daily LLM Burn</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">${metrics.burnToday.toFixed(2)}</div>
              <p className="text-xs text-zinc-500 mt-1">Cost incurred today</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-zinc-400 text-sm font-medium">Total Validation Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">${metrics.revenue.toFixed(2)}</div>
              <p className="text-xs text-zinc-500 mt-1">Stripe validation checks</p>
            </CardContent>
          </Card>
        </div>

        {/* Kanban Board */}
        <OpportunityBoard opportunities={opportunities} />

      </div>
    </main>
  );
}
