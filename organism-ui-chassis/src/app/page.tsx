import content from "../../chassis.config.json";
import { Hero } from "../components/Hero";
import { PainPoints } from "../components/PainPoints";
import { EmailCapture } from "../components/EmailCapture";
import { SocialProof } from "../components/SocialProof";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-indigo-500/30">

      {/* Dynamic Theme Colors */}
      <style>{`
        :root {
          --primary: ${content.color_primary};
          --accent: ${content.color_accent};
        }
      `}</style>

      <div className="relative isolate pt-14">
        {/* Background Gradients */}
        <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80" aria-hidden="true">
          <div className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-[var(--primary)] to-[var(--accent)] opacity-20 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]" />
        </div>

        <div className="py-24 sm:py-32 lg:pb-40">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">

              <Hero headline={content.headline} subheadline={content.subheadline} />

              <div className="mt-10 flex flex-col items-center justify-center gap-y-6">
                <EmailCapture
                  ctaText={content.cta_text}
                  webhookUrl={content.lead_webhook_url}
                  opportunityId={content.opportunity_id}
                />
                <SocialProof text={content.social_proof} />
              </div>

            </div>

            <div className="mt-20 flow-root sm:mt-24">
              <PainPoints points={content.pain_points} />
            </div>

          </div>
        </div>
      </div>
    </main>
  );
}
