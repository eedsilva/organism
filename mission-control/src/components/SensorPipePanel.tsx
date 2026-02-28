import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Radio } from "lucide-react";

export function SensorPipePanel({ events }: { events: any[] }) {
  return (
    <Card className="border-[#222] bg-[#0a0a0a]">
      <CardHeader className="pb-2">
        <CardTitle className="text-zinc-400 text-sm font-medium flex items-center gap-2">
          <Radio className="w-4 h-4" /> Sensor Pipe — Automated Displacement Events
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-zinc-500 mb-3">Displacement events found by the Researcher (price shock, G2, etc.)</p>
        {events.length === 0 ? (
          <p className="text-zinc-500 text-sm">No displacement events yet.</p>
        ) : (
          <ul className="space-y-2">
            {events.map((ev: any) => (
              <li
                key={ev.id}
                className="flex items-center justify-between gap-2 py-2 border-b border-[#222] last:border-0"
              >
                <div>
                  <span className="font-medium text-zinc-200">{ev.product_or_role}</span>
                  <span className="text-zinc-500 text-sm ml-2">({ev.type})</span>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    Strength: {(Number(ev.displacement_strength) * 100).toFixed(0)}% · {ev.status}
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    ev.source === "god" ? "bg-amber-500/20 text-amber-400" : "bg-zinc-700/50 text-zinc-400"
                  }`}
                >
                  {ev.source === "god" ? "God Pipe" : "Sensor"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
