"use client";

import { motion } from "framer-motion";

export function Hero({ headline, subheadline }: { headline: string; subheadline: string }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
        >
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl drop-shadow-md">
                {headline}
            </h1>
            <p className="mt-6 text-lg leading-8 text-zinc-300">
                {subheadline}
            </p>
        </motion.div>
    );
}
