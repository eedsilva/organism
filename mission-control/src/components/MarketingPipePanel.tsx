import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Megaphone, User, CheckCircle } from "lucide-react";
import { getTrustIdentities } from "@/app/actions";

export async function MarketingPipePanel() {
  const identities = await getTrustIdentities();

  return (
    <Card className="border-[#222] bg-[#0a0a0a]">
      <CardHeader className="pb-2">
        <CardTitle className="text-zinc-400 text-sm font-medium flex items-center gap-2">
          <Megaphone className="w-4 h-4" /> Marketing Pipe — Trust Identities
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-zinc-500 mb-3">Distribution accounts: karma, age, warmup status</p>
        {identities.length === 0 ? (
          <p className="text-zinc-500 text-sm">No trust identities yet. Add one via scripts/trust-warmup.ts</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {identities.map((id: any) => (
              <div
                key={id.id}
                className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/50 border border-[#222]"
              >
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-zinc-500" />
                  <div>
                    <span className="font-medium text-zinc-200">{id.handle}</span>
                    <span className="text-zinc-500 text-xs ml-2">({id.platform})</span>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      Karma: {id.karma_score ?? 0} · Age: {id.account_age_days ?? 0}d · {id.trust_level}
                    </div>
                  </div>
                </div>
                {id.warmup_complete ? (
                  <span className="text-emerald-500 flex items-center gap-1 text-xs">
                    <CheckCircle className="w-3.5 h-3.5" /> Ready
                  </span>
                ) : (
                  <span className="text-amber-500 text-xs">Warming</span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
