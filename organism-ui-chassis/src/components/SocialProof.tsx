import { Users } from "lucide-react";

export function SocialProof({ text }: { text: string }) {
    if (!text) return null;
    return (
        <div className="flex items-center gap-2 text-sm text-zinc-400 font-medium">
            <div className="flex -space-x-2 mr-2">
                {/* Placeholder avatars to give it a premium feel */}
                {[1, 2, 3].map((i) => (
                    <div key={i} className={`w-6 h-6 rounded-full border border-zinc-900 bg-zinc-${800 - i * 100} shrink-0 ring-1 ring-zinc-800`} />
                ))}
            </div>
            <span className="translate-y-px">{text}</span>
        </div>
    );
}
