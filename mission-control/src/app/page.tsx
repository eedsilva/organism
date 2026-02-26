import React from "react";
import { Activity, LayoutDashboard, Settings, Mail, Target, ArrowUpRight } from "lucide-react";
import { getSystemMetrics, getPipelineOpportunities, getRecentEvents } from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function Dashboard() {
  const [metrics, opportunities, events] = await Promise.all([
    getSystemMetrics(),
    getPipelineOpportunities(),
    getRecentEvents(),
  ]);

  const stages = ["new", "reviewing", "validating", "building", "alive", "dead"];

  return (
    <div className="flex h-screen overflow-hidden bg-black">
      {/* Sidebar */}
      <aside className="w-64 border-r border-[#222] bg-[#050505] hidden md:flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-500" />
            Organism
          </h1>
          <p className="text-xs text-zinc-500 mt-1">Mission Control</p>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          <a href="#" className="flex items-center gap-3 px-3 py-2 bg-white/10 text-white rounded-lg text-sm font-medium">
            <LayoutDashboard className="w-4 h-4" /> Pipeline
          </a>
          <a href="#" className="flex items-center gap-3 px-3 py-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg text-sm font-medium transition-colors">
            <Target className="w-4 h-4" /> Analytics
          </a>
          <a href="#" className="flex items-center gap-3 px-3 py-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg text-sm font-medium transition-colors">
            <Settings className="w-4 h-4" /> Engine Room
          </a>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="h-16 border-b border-[#222] flex items-center px-8 shrink-0 bg-black/50 backdrop-blur-md sticky top-0 z-10">
          <h2 className="text-lg font-medium text-zinc-200">Pipeline Overview</h2>
        </header>

        <div className="p-8 space-y-8 max-w-7xl">

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
          <div>
            <h3 className="text-md font-medium text-white mb-4">Opportunity Pipeline</h3>
            <div className="flex gap-4 overflow-x-auto pb-4 hide-scrollbar">
              {stages.map(stage => {
                const columnOpps = opportunities.filter((o: any) => o.status === stage);
                return (
                  <div key={stage} className="flex flex-col w-80 shrink-0 bg-[#0a0a0a] border border-[#222] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-semibold capitalize text-zinc-300">{stage}</h4>
                      <span className="text-xs text-zinc-500 bg-[#1a1a1a] px-2 py-0.5 rounded-full">{columnOpps.length}</span>
                    </div>
                    <div className="flex flex-col gap-3">
                      {columnOpps.length === 0 ? (
                        <div className="text-sm text-zinc-600 text-center py-6 border border-dashed border-[#222] rounded-lg">Empty</div>
                      ) : (
                        columnOpps.map((opp: any) => (
                          <div key={opp.id} className="bg-[#111] p-3 rounded-lg border border-[#222] hover:border-[#444] transition-colors cursor-default">
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-xs text-emerald-500 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded">v:{opp.viability_score ?? '??'}</span>
                              <span className="text-[10px] text-zinc-500 uppercase">{opp.source}</span>
                            </div>
                            <h5 className="text-sm font-medium text-zinc-200 line-clamp-2 leading-snug">{opp.title}</h5>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
