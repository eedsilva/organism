"use client";

import React, { useEffect } from "react";
import { X, Calendar, Activity, Database, DollarSign, TrendingUp } from "lucide-react";

interface OpportunityModalProps {
    opportunity: any;
    onClose: () => void;
}

export function OpportunityModal({ opportunity, onClose }: OpportunityModalProps) {
    // Close on ESC key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    if (!opportunity) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal */}
            <div
                className="relative bg-[#0a0a0a] border border-[#222] rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                role="dialog"
                aria-modal="true"
            >
                {/* Header */}
                <div className="flex items-start justify-between p-6 border-b border-[#222] bg-[#111]">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider bg-[#222] text-zinc-300">
                                {opportunity.status}
                            </span>
                            <span className="text-xs text-zinc-500 uppercase flex items-center gap-1">
                                <Database className="w-3 h-3" />
                                {opportunity.source}
                            </span>
                        </div>
                        <h2 className="text-xl font-semibold text-zinc-100 leading-tight">
                            {opportunity.title}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 -mr-2 text-zinc-500 hover:text-zinc-300 hover:bg-[#222] rounded-lg transition-colors"
                        title="Close (Esc)"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[70vh]">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
                        {/* Score Metric */}
                        <div className="bg-[#111] border border-[#222] rounded-xl p-4 flex flex-col items-center justify-center text-center">
                            <div className="text-zinc-500 text-xs font-medium uppercase mb-2 flex items-center gap-1.5">
                                <Activity className="w-3.5 h-3.5" /> Viability
                            </div>
                            <div className="text-3xl font-bold text-emerald-500 font-mono">
                                {opportunity.viability_score ?? 'N/A'}
                            </div>
                        </div>

                        <div className="bg-[#111] border border-[#222] rounded-xl p-4 flex flex-col items-center justify-center text-center">
                            <div className="text-zinc-500 text-xs font-medium uppercase mb-2 flex items-center gap-1.5">
                                <TrendingUp className="w-3.5 h-3.5" /> Pain Score
                            </div>
                            <div className="text-3xl font-bold text-amber-500 font-mono">
                                {opportunity.pain_score ?? 'N/A'}
                            </div>
                        </div>

                        <div className="bg-[#111] border border-[#222] rounded-xl p-4 flex flex-col items-center justify-center text-center">
                            <div className="text-zinc-500 text-xs font-medium uppercase mb-2 flex items-center gap-1.5">
                                <DollarSign className="w-3.5 h-3.5" /> WTP
                            </div>
                            <div className="text-3xl font-bold text-blue-500 font-mono">
                                {opportunity.wtp_score ?? 'N/A'}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <h3 className="text-sm font-medium text-zinc-400 mb-2">Description</h3>
                            <div className="text-zinc-300 text-sm leading-relaxed bg-[#111] p-4 rounded-xl border border-[#222]">
                                {opportunity.description || "No detailed description available for this opportunity."}
                            </div>
                        </div>

                        <div className="flex items-center text-xs text-zinc-500 gap-2">
                            <Calendar className="w-4 h-4" />
                            Created: {new Date(opportunity.created_at).toLocaleString()}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
