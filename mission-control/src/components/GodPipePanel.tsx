"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Loader2 } from "lucide-react";
import { submitGodPipeIngest } from "@/app/actions";
import { useRouter } from "next/navigation";

export function GodPipePanel({ recentGod }: { recentGod: any[] }) {
  const [content, setContent] = useState("");
  const [type, setType] = useState<"text" | "url">("text");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await submitGodPipeIngest(type, content.trim());
      setContent("");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Ingest failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-[#222] bg-[#0a0a0a]">
      <CardHeader className="pb-2">
        <CardTitle className="text-zinc-400 text-sm font-medium flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> God Pipe — Manual Idea Ingestion
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-2">
            <label className="flex items-center gap-1.5 text-sm text-zinc-400">
              <input
                type="radio"
                name="type"
                checked={type === "text"}
                onChange={() => setType("text")}
                className="rounded"
              />
              Text
            </label>
            <label className="flex items-center gap-1.5 text-sm text-zinc-400">
              <input
                type="radio"
                name="type"
                checked={type === "url"}
                onChange={() => setType("url")}
                className="rounded"
              />
              URL
            </label>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              type === "url"
                ? "https://example.com/article-about-software-price-hike"
                : "Paste a market insight, complaint thread summary, or product displacement signal..."
            }
            className="w-full h-24 px-3 py-2 rounded-lg bg-zinc-900 border border-[#222] text-zinc-200 placeholder:text-zinc-500 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !content.trim()}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-black text-sm font-medium flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Inject Idea
          </button>
        </form>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {recentGod.length > 0 && (
          <div className="pt-3 border-t border-[#222]">
            <p className="text-xs text-zinc-500 mb-2">Recently injected:</p>
            <ul className="space-y-1">
              {recentGod.slice(0, 5).map((ev: any) => (
                <li key={ev.id} className="text-sm text-zinc-400 truncate">
                  {ev.product_or_role} — {ev.type}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
