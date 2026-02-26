"use client";

import React, { useState } from "react";
import { updatePolicy } from "../actions";

export default function EngineForm({ initialPolicies }: { initialPolicies: any[] }) {
  const [policies, setPolicies] = useState(initialPolicies);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const handleChange = (key: string, newValue: string) => {
    setPolicies((prev) =>
      prev.map((p) => (p.key === key ? { ...p, value: newValue } : p))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      // Send updates to the server one by one or all at once? The action supports one.
      await Promise.all(
        policies.map((p) => {
          // We need to pass the raw string/number as a parser. Usually `p.value` is a number or string in the UI.
          // If the original value was a number, we should try to parseFloat if it doesn't fail, otherwise keep as string.
          const valToSave = !isNaN(Number(p.value)) ? Number(p.value) : p.value;
          return updatePolicy(p.key, valToSave as any);
        })
      );
      setMessage("Policies successfully updated. The Organism will adapt on the next cycle.");
    } catch (e: any) {
      setMessage(`Error updating policies: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[#0a0a0a] border border-[#222] p-6 rounded-xl space-y-6">
      <div className="space-y-4">
        {policies.map((policy) => (
          <div key={policy.key} className="flex flex-col gap-1.5 border-b border-[#222] pb-4 last:border-0 last:pb-0">
            <label className="text-sm font-medium text-zinc-300 font-mono">
              {policy.key}
            </label>
            <input
              type="text"
              value={policy.value}
              onChange={(e) => handleChange(policy.key, e.target.value)}
              className="bg-[#111] border border-[#333] text-white rounded px-3 py-2 text-sm max-w-md focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>
        ))}
      </div>

      <div className="pt-4 flex items-center justify-between">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-zinc-100 hover:bg-white text-black font-medium px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Configuration"}
        </button>
        {message && (
          <span className={`text-sm ${message.includes("Error") ? "text-red-400" : "text-emerald-400"}`}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
