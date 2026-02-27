"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { OpportunityModal } from "./OpportunityModal";

interface OpportunityBoardProps {
    opportunities: any[];
}

export function OpportunityBoard({ opportunities }: OpportunityBoardProps) {
    const [selectedOpportunity, setSelectedOpportunity] = useState<any | null>(null);
    const router = useRouter();
    const stages = ["new", "reviewing", "validating", "building", "alive", "dead"];

    useEffect(() => {
        const port = process.env.NEXT_PUBLIC_WEBHOOK_PORT || 3001;
        // In local dev, hardcode localhost. In prod, this would be the API URL.
        const source = new EventSource(`http://localhost:${port}/events/stream`);

        source.onmessage = (event) => {
            console.log("Organism Event Received:", event.data);
            router.refresh();
        };

        return () => source.close();
    }, [router]);

    return (
        <div>
            <h3 className="text-md font-medium text-white mb-4">Opportunity Pipeline</h3>
            <div className="flex gap-4 overflow-x-auto pb-4 hide-scrollbar">
                {stages.map(stage => {
                    const columnOpps = opportunities.filter((o: any) => o.status === stage);
                    return (
                        <div key={stage} className="flex flex-col w-80 shrink-0 bg-[#0a0a0a] border border-[#222] rounded-xl p-4 cursor-default">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-sm font-semibold capitalize text-zinc-300">{stage}</h4>
                                <span className="text-xs text-zinc-500 bg-[#1a1a1a] px-2 py-0.5 rounded-full">{columnOpps.length}</span>
                            </div>
                            <div className="flex flex-col gap-3">
                                {columnOpps.length === 0 ? (
                                    <div className="text-sm text-zinc-600 text-center py-6 border border-dashed border-[#222] rounded-lg">Empty</div>
                                ) : (
                                    columnOpps.map((opp: any) => (
                                        <div
                                            key={opp.id}
                                            className="bg-[#111] p-3 rounded-lg border border-[#222] hover:border-zinc-500 transition-colors cursor-pointer group"
                                            onClick={() => setSelectedOpportunity(opp)}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="text-xs text-emerald-500 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded">v:{opp.viability_score ?? '??'}</span>
                                                <span className="text-[10px] text-zinc-500 uppercase group-hover:text-zinc-400 transition-colors">{opp.source}</span>
                                            </div>
                                            <h5 className="text-sm font-medium text-zinc-200 line-clamp-2 leading-snug group-hover:text-white transition-colors">{opp.title}</h5>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Modal View */}
            {selectedOpportunity && (
                <OpportunityModal
                    opportunity={selectedOpportunity}
                    onClose={() => setSelectedOpportunity(null)}
                />
            )}
        </div>
    );
}
