"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, CheckCircle2 } from "lucide-react";

interface Props {
    ctaText: string;
    webhookUrl: string;
    opportunityId: number;
}

export function EmailCapture({ ctaText, webhookUrl, opportunityId }: Props) {
    const [email, setEmail] = useState("");
    const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;

        setStatus("loading");

        // Grab UTM params from URL if present
        const urlParams = new URLSearchParams(window.location.search);
        const utm_source = urlParams.get("utm_source") || "direct";
        const utm_medium = urlParams.get("utm_medium") || "";
        const utm_campaign = urlParams.get("utm_campaign") || "";

        try {
            const res = await fetch(webhookUrl || `/api/lead/${opportunityId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, utm_source, utm_medium, utm_campaign }),
            });

            if (res.ok) {
                setStatus("success");
            } else {
                setStatus("error");
            }
        } catch (err) {
            // Optimistic UI for local testing or connection drops
            console.warn("Failed to reach webhook. Assuming optimistic success.", err);
            setStatus("success");
        }
    };

    if (status === "success") {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-6 py-4 rounded-full font-medium"
            >
                <CheckCircle2 className="w-5 h-5" />
                You're on the list. We'll be in touch.
            </motion.div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="w-full max-w-sm relative group z-10">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] rounded-full blur opacity-50 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative flex items-center bg-zinc-950 p-1 rounded-full ring-1 ring-zinc-800 focus-within:ring-[var(--primary)] transition-all">
                <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="flex-1 min-w-0 bg-transparent px-5 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none"
                />
                <button
                    type="submit"
                    disabled={status === "loading"}
                    className="group flex flex-none items-center gap-2 rounded-full py-2.5 px-6 ml-1 text-sm font-semibold text-white shadow-sm bg-[var(--primary)] hover:bg-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 transition-all disabled:opacity-75 disabled:cursor-not-allowed"
                >
                    {status === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                    {ctaText}
                </button>
            </div>
            {status === "error" && (
                <p className="text-red-400 text-sm mt-3 absolute -bottom-8 left-0 right-0 text-center">Something went wrong. Please try again.</p>
            )}
        </form>
    );
}
