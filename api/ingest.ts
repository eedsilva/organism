/**
 * ingest.ts — God Pipe: Manual idea ingestion
 *
 * Parses plain text or URLs into displacement events and immediately
 * deploys chassis, bypassing the sensor pipeline.
 */

import { query } from "../state/db";
import { callBrain } from "../cognition/llm";
import { launchFreeToolFromDisplacement } from "../kernel/build";

const DISPLACEMENT_TYPES = ["PRICE_SHOCK", "ACQUISITION_KILL", "FEATURE_REMOVAL", "MARKET_GAP"] as const;

export type IngestRequestBody = {
  type: "text" | "url";
  content: string;
};

export type IngestResponse =
  | { success: true; displacement_event_id: string; deployment_id: number; folder_path: string }
  | { success: false; error: string };

/**
 * Parse raw input (text or URL content) into a displacement event using LLM.
 */
async function parseToDisplacement(input: string): Promise<{
  product_or_role: string;
  type: string;
  displacement_strength: number;
  affected_persona_niche?: string;
}> {
  const prompt = `You are parsing a market insight or URL content into a structured displacement event for a B2B software revenue interception engine.

INPUT:
${input.slice(0, 4000)}

Extract:
1. product_or_role: The product, tool, or vendor causing displacement (e.g. "Klaviyo", "Zapier")
2. type: One of PRICE_SHOCK, ACQUISITION_KILL, FEATURE_REMOVAL, MARKET_GAP
3. displacement_strength: 0-1 score (0.9 = urgent, 0.5 = moderate)
4. affected_persona_niche: Optional niche (e.g. "shopify-marketing", "devops")

Respond with valid JSON only, no markdown:
{"product_or_role":"...","type":"...","displacement_strength":0.8,"affected_persona_niche":"..."}`;

  const response = await callBrain(prompt, "god pipe ingest parse", false, "chat");
  const clean = response.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean);

  const type = DISPLACEMENT_TYPES.includes(parsed.type as any)
    ? parsed.type
    : "MARKET_GAP";
  const displacement_strength = Math.max(0.3, Math.min(1, Number(parsed.displacement_strength) || 0.6));
  const product_or_role = String(parsed.product_or_role || "Unknown").slice(0, 200);
  const affected_persona_niche = parsed.affected_persona_niche
    ? String(parsed.affected_persona_niche).slice(0, 100)
    : undefined;

  return { product_or_role, type, displacement_strength, affected_persona_niche };
}

/**
 * Handle God Pipe ingest: parse, insert displacement_event, deploy chassis.
 */
export async function handleIngest(body: IngestRequestBody): Promise<IngestResponse> {
  if (!body.content || typeof body.content !== "string") {
    return { success: false, error: "content is required and must be a string" };
  }

  let content = body.content.trim();
  if (body.type === "url") {
    try {
      const res = await fetch(content, {
        headers: { "User-Agent": "Organism/1.0" },
      });
      content = await res.text();
    } catch (err: any) {
      return { success: false, error: `Failed to fetch URL: ${err.message}` };
    }
  }

  let parsed;
  try {
    parsed = await parseToDisplacement(content);
  } catch (err: any) {
    return {
      success: false,
      error: `Failed to parse: ${err.message}. Use clear product/vendor and problem description.`,
    };
  }

  const eventId = `god_${Date.now()}_${parsed.product_or_role.replace(/[^a-z0-9]/gi, "_").slice(0, 30)}`;

  await query(
    `INSERT INTO displacement_events (
      id, type, product_or_role, affected_persona_niche,
      displacement_strength, status, source
    ) VALUES ($1, $2, $3, $4, $5, 'active', 'god')`,
    [
      eventId,
      parsed.type,
      parsed.product_or_role,
      parsed.affected_persona_niche ?? null,
      parsed.displacement_strength,
    ]
  );

  const deployment = await launchFreeToolFromDisplacement({
    id: eventId,
    type: parsed.type,
    product_or_role: parsed.product_or_role,
    affected_persona_niche: parsed.affected_persona_niche,
    displacement_strength: parsed.displacement_strength,
  });

  if (!deployment) {
    return {
      success: false,
      error: "Displacement event created but chassis deployment failed.",
    };
  }

  return {
    success: true,
    displacement_event_id: eventId,
    deployment_id: deployment.deploymentId,
    folder_path: deployment.folderPath,
  };
}
