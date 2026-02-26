import React from "react";
import { Target, AlertCircle } from "lucide-react";
import { getPlausibleStats } from "../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AnalyticsRoom() {
    // In a real scenario, you might loop through all active domains from the DB.
    // We will default to a placeholder or the first domain for the demo.
    const domain = process.env.NEXT_PUBLIC_DEFAULT_DOMAIN || "example.com";
    const statsResponse = await getPlausibleStats(domain);

    return (
        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto w-full h-screen">
            <header className="h-16 border-b border-[#222] flex items-center px-8 shrink-0 bg-black/50 backdrop-blur-md sticky top-0 z-10">
                <h2 className="text-lg font-medium text-zinc-200 flex items-center gap-2">
                    <Target className="w-5 h-5" /> Analytics
                </h2>
            </header>

            <div className="p-8 max-w-6xl space-y-8">
                <div>
                    <h1 className="text-2xl font-semibold mb-2 text-white">Traffic & Sources</h1>
                    <p className="text-zinc-400 text-sm">
                        Real-time validation metrics powered by Plausible Analytics.
                    </p>
                </div>

                {statsResponse.error ? (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-4">
                        <AlertCircle className="w-8 h-8 text-red-400" />
                        <div>
                            <h3 className="text-red-400 font-medium">Analytics Unavailable</h3>
                            <p className="text-sm text-red-400/80 mt-1">{statsResponse.error}</p>
                        </div>
                        <p className="text-xs text-zinc-500 max-w-md">
                            To view real-time traffic sources, add <code className="bg-black px-1 py-0.5 rounded">PLAUSIBLE_API_KEY</code> to your <code className="bg-black px-1 py-0.5 rounded">.env</code> file. The Organism will still track standard Waitlist conversions in the Pipeline view without this.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-zinc-400 text-sm font-medium">Unique Visitors (30d)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-semibold">{statsResponse.stats?.visitors?.value || 0}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-zinc-400 text-sm font-medium">Pageviews</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-semibold">{statsResponse.stats?.pageviews?.value || 0}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-zinc-400 text-sm font-medium">Bounce Rate</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-semibold">{statsResponse.stats?.bounce_rate?.value || 0}%</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-zinc-400 text-sm font-medium">Visit Duration</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-semibold">{statsResponse.stats?.visit_duration?.value || 0}s</div>
                            </CardContent>
                        </Card>

                        {/* Sources Table */}
                        <div className="col-span-full mt-6">
                            <h3 className="text-lg font-medium text-white mb-4">Top Sources</h3>
                            <div className="bg-[#0a0a0a] border border-[#222] rounded-xl overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-[#111] text-zinc-400 border-b border-[#222]">
                                        <tr>
                                            <th className="px-6 py-3 font-medium">Source</th>
                                            <th className="px-6 py-3 font-medium text-right">Visitors</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#222]">
                                        {statsResponse.sources?.length === 0 ? (
                                            <tr><td colSpan={2} className="px-6 py-8 text-center text-zinc-500">No traffic data available.</td></tr>
                                        ) : (
                                            statsResponse.sources?.map((source: any, i: number) => (
                                                <tr key={i} className="hover:bg-[#111] transition-colors">
                                                    <td className="px-6 py-3 text-zinc-200">{source.source}</td>
                                                    <td className="px-6 py-3 text-right text-zinc-300 font-mono">{source.visitors}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
