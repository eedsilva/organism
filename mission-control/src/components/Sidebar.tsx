"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, LayoutDashboard, Settings, Target } from "lucide-react";

export function Sidebar() {
    const pathname = usePathname();

    const navItems = [
        { name: "Pipeline", href: "/", icon: LayoutDashboard },
        { name: "Analytics", href: "/analytics", icon: Target },
        { name: "Engine Room", href: "/engine", icon: Settings },
    ];

    return (
        <aside className="w-64 border-r border-[#222] bg-[#050505] hidden md:flex flex-col h-screen shrink-0 sticky top-0">
            <div className="p-6">
                <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                    <Activity className="w-5 h-5 text-emerald-500" />
                    Organism
                </h1>
                <p className="text-xs text-zinc-500 mt-1">Mission Control</p>
            </div>
            <nav className="flex-1 px-4 space-y-2">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive
                                    ? "bg-white/10 text-white"
                                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                                }`}
                        >
                            <Icon className="w-4 h-4" /> {item.name}
                        </Link>
                    );
                })}
            </nav>
        </aside>
    );
}
