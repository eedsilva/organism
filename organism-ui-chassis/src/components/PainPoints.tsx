"use client";

import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";

export function PainPoints({ points = [] }: { points?: string[] }) {
    if (!points || points.length === 0) return null;

    return (
        <div className="mt-16 sm:mt-24 max-w-lg mx-auto">
            <h2 className="text-center tracking-wide uppercase text-[var(--primary)] text-sm font-bold mb-8">
                If this sounds like you, keep reading
            </h2>
            <ul className="space-y-4">
                {points.map((point, i) => (
                    <motion.li
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.15, duration: 0.5 }}
                        className="flex items-start gap-4 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800"
                    >
                        <AlertCircle className="w-6 h-6 shrink-0 text-red-400 mt-0.5" />
                        <span className="text-zinc-300 leading-relaxed text-left">{point}</span>
                    </motion.li>
                ))}
            </ul>
        </div>
    );
}
