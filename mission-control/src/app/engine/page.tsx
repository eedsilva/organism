import React from "react";
import { Settings } from "lucide-react";
import { getPolicies } from "../actions";
import EngineForm from "./EngineForm";

export const dynamic = "force-dynamic";

export default async function EngineRoom() {
    const policies = await getPolicies();

    return (
        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto w-full h-screen">
            <header className="h-16 border-b border-[#222] flex items-center px-8 shrink-0 bg-black/50 backdrop-blur-md sticky top-0 z-10">
                <h2 className="text-lg font-medium text-zinc-200 flex items-center gap-2">
                    <Settings className="w-5 h-5" /> Engine Room
                </h2>
            </header>

            <div className="p-8 max-w-4xl space-y-8">
                <div>
                    <h1 className="text-2xl font-semibold mb-2 text-white">System Policies</h1>
                    <p className="text-zinc-400 text-sm">
                        Adjust the Organism's core constraints. Changes here affect survival budgets, threshold weightings, and API limits.
                    </p>
                </div>

                <EngineForm initialPolicies={policies} />
            </div>
        </main>
    );
}
