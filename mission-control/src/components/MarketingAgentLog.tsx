"use client";

import React, { useState, useEffect } from "react";
import { Terminal } from "lucide-react";

export function MarketingAgentLog() {
    const [logs, setLogs] = useState<any[]>([]);

    useEffect(() => {
        const port = process.env.NEXT_PUBLIC_WEBHOOK_PORT || 3001;
        const source = new EventSource(`http://localhost:${port}/events/stream`);

        const handleUpdate = (event: MessageEvent) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === "agent_log" && data.payload?.agent === "marketing") {
                    setLogs((prev) => [data.payload, ...prev].slice(0, 50));
                }
            } catch (e) {
                // ignore parse errors
            }
        };

        source.addEventListener("agent_log", handleUpdate);
        source.addEventListener("message", handleUpdate);
        source.addEventListener("update", handleUpdate);

        return () => source.close();
    }, []);

    if (logs.length === 0) return null;

    return (
        <div className="mt-4 border-t border-[#222] pt-4">
            <h4 className="text-xs font-medium flex items-center gap-1.5 text-zinc-500 mb-2">
                <Terminal className="w-3.5 h-3.5" /> Agent Live Stream
            </h4>
            <div className="bg-[#111] border border-[#222] rounded-md p-3 max-h-48 overflow-y-auto space-y-1.5 font-mono text-[10px] sm:text-xs">
                {logs.map((log, i) => (
                    <div key={i} className="flex gap-2 items-start">
                        <span className="text-zinc-600 shrink-0 select-none">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}
                        </span>
                        <span className="text-emerald-500 shrink-0 select-none">@{log.handle}</span>
                        <span className="text-amber-500 shrink-0 select-none">[{log.action}]</span>
                        <span className="text-zinc-300 break-words leading-relaxed">{log.message}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
