import fetch from "node-fetch";
import { query } from "../state/db";

/**
 * llm.ts — Multi-model brain with task-aware routing.
 *
 * ROUTING LOGIC:
 *   1. Cloud LLM (OpenAI) — primary, used when budget allows
 *   2. Ollama task-specific model — fallback (e.g. qwen2.5-coder for code tasks)
 *   3. Ollama default model — last resort
 *
 * TASK TYPES drive model selection:
 *   "code"      → cloud GPT-4o, fallback qwen2.5-coder:32b
 *   "planning"  → cloud GPT-4o, fallback deepseek-v3 (default)
 *   "reflect"   → cloud GPT-4o, fallback deepseek-v3 (default)
 *   "chat"      → cloud GPT-4o-mini (cheaper), fallback deepseek-v3
 *   "scoring"   → cloud GPT-4o-mini, fallback deepseek-v3
 */

// ── Model configuration ───────────────────────────────────────────────────────

const OLLAMA_URL = "http://localhost:11434/api/generate";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

// Default Ollama model (general purpose)
const OLLAMA_DEFAULT = process.env.OLLAMA_MODEL ?? "deepseek-v3.1:671b-cloud";

// Task-specific Ollama models — used as fallback when cloud budget exhausted
const OLLAMA_TASK_MODELS: Record<string, string> = {
  code: process.env.OLLAMA_CODE_MODEL ?? "qwen2.5-coder:32b",
  planning: process.env.OLLAMA_DEFAULT_MODEL ?? OLLAMA_DEFAULT,
  reflect: process.env.OLLAMA_DEFAULT_MODEL ?? OLLAMA_DEFAULT,
  chat: process.env.OLLAMA_DEFAULT_MODEL ?? OLLAMA_DEFAULT,
  scoring: process.env.OLLAMA_DEFAULT_MODEL ?? OLLAMA_DEFAULT,
};

// Cloud model selection by task — cheaper models for lightweight tasks
const CLOUD_TASK_MODELS: Record<string, string> = {
  code: "gpt-4o",
  planning: "gpt-4o",
  reflect: "gpt-4o",
  chat: "gpt-4o-mini",   // cheaper for conversational queries
  scoring: "gpt-4o-mini",   // cheaper for scoring/ranking
};

// Cloud fallback chain per task (if primary cloud model fails)
const CLOUD_FALLBACK_MODELS: Record<string, string[]> = {
  code: ["gpt-4o", "gpt-4o-mini"],
  planning: ["gpt-4o", "gpt-4o-mini"],
  reflect: ["gpt-4o", "gpt-4o-mini"],
  chat: ["gpt-4o-mini"],
  scoring: ["gpt-4o-mini", "gpt-4o"],
};

// How long to wait for human /approve-cloud before falling back (ms)
const CLOUD_APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

export type TaskType = "code" | "planning" | "reflect" | "chat" | "scoring";

// ── Local brain (Ollama) ──────────────────────────────────────────────────────

async function callOllama(prompt: string, model: string, imageBase64?: string): Promise<string> {
  const payload: any = { model, prompt, stream: false };
  if (imageBase64) {
    payload.images = [imageBase64];
  }

  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Ollama unavailable (${model}): ${response.status}`);
  }

  const data: any = await response.json();
  return data.response;
}

async function callOllamaWithFallback(prompt: string, taskType: TaskType, imageBase64?: string): Promise<string> {
  // If doing a vision task locally, we MUST use a vision model. Llama3.2-vision is the local default.
  const preferred = imageBase64
    ? (process.env.OLLAMA_VISION_MODEL ?? "llama3.2-vision")
    : (OLLAMA_TASK_MODELS[taskType] ?? OLLAMA_DEFAULT);

  let fallback = OLLAMA_DEFAULT;
  if (imageBase64) fallback = preferred; // Don't fallback to a text-only model if we have an image

  // Try task-specific model first, then default
  const modelsToTry = preferred !== fallback
    ? [preferred, fallback]
    : [preferred];

  for (const model of modelsToTry) {
    try {
      console.log(`  🦙 Ollama [${model}]`);
      return await callOllama(prompt, model, imageBase64);
    } catch (err: any) {
      if (model === modelsToTry[modelsToTry.length - 1]) throw err;
      console.log(`  ⚠️  ${model} unavailable, trying ${modelsToTry[modelsToTry.length - 1]}`);
    }
  }

  throw new Error("All Ollama models unavailable");
}

// ── Cloud brain (OpenAI) ──────────────────────────────────────────────────────

async function callOpenAI(prompt: string, model: string, imageBase64?: string): Promise<{ text: string; cost: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const messages: any[] = [];
  if (imageBase64) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}`, detail: "low" } }
      ]
    });
  } else {
    messages.push({ role: "user", content: prompt });
  }

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err: any = await response.json().catch(() => ({}));
    throw new Error(`OpenAI error (${model}): ${err?.error?.message ?? response.status}`);
  }

  const data: any = await response.json();
  const text = data.choices?.[0]?.message?.content ?? "";

  // Cost estimation: GPT-4o ~$5/$15 per 1M tokens; GPT-4o-mini ~$0.15/$0.60
  const isGpt4o = model.startsWith("gpt-4o") && !model.includes("mini");
  const inputCost = isGpt4o ? 0.000005 : 0.00000015;
  const outputCost = isGpt4o ? 0.000015 : 0.0000006;
  const cost = (data.usage?.prompt_tokens ?? 0) * inputCost
    + (data.usage?.completion_tokens ?? 0) * outputCost;

  await query(
    `INSERT INTO events (type, payload) VALUES ($1, $2)`,
    ["cloud_llm_call", {
      model,
      input_tokens: data.usage?.prompt_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
      cost_usd: cost,
      task_type: null,   // filled in by callBrain
    }]
  );

  return { text, cost };
}

async function callCloudWithFallback(
  prompt: string,
  taskType: TaskType,
  imageBase64?: string
): Promise<string> {
  const models = CLOUD_FALLBACK_MODELS[taskType] ?? ["gpt-4o"];

  for (const model of models) {
    try {
      console.log(`  ☁️  Cloud [${model}]`);
      const { text } = await callOpenAI(prompt, model, imageBase64);
      return text;
    } catch (err: any) {
      if (model === models[models.length - 1]) throw err;
      console.log(`  ⚠️  ${model} failed, trying ${models[models.length - 1]}`);
    }
  }

  throw new Error("All cloud models failed");
}

// ── Cloud daily spend ─────────────────────────────────────────────────────────

export async function getTodayCloudSpend(): Promise<number> {
  const result = await query(
    `SELECT COALESCE(SUM((payload->>'cost_usd')::numeric), 0) as total
     FROM events
     WHERE type = 'cloud_llm_call'
       AND DATE(created_at) = CURRENT_DATE`
  );
  return Number(result.rows[0]?.total ?? 0);
}

export async function getCloudSpendSummary(): Promise<{
  today: number;
  week: number;
  allTime: number;
  budget: number;
  remaining: number;
  breakdown: Array<{ model: string; calls: number; cost: number }>;
}> {
  const [today, week, allTime, budgetRow, breakdown] = await Promise.all([
    query(`SELECT COALESCE(SUM((payload->>'cost_usd')::numeric), 0) as total
           FROM events WHERE type = 'cloud_llm_call' AND DATE(created_at) = CURRENT_DATE`),
    query(`SELECT COALESCE(SUM((payload->>'cost_usd')::numeric), 0) as total
           FROM events WHERE type = 'cloud_llm_call' AND created_at >= NOW() - INTERVAL '7 days'`),
    query(`SELECT COALESCE(SUM((payload->>'cost_usd')::numeric), 0) as total
           FROM events WHERE type = 'cloud_llm_call'`),
    query(`SELECT value FROM policies WHERE key = 'daily_cloud_budget_usd'`),
    query(`SELECT payload->>'model' as model,
                  COUNT(*) as calls,
                  COALESCE(SUM((payload->>'cost_usd')::numeric), 0) as cost
           FROM events
           WHERE type = 'cloud_llm_call' AND DATE(created_at) = CURRENT_DATE
           GROUP BY payload->>'model'
           ORDER BY cost DESC`),
  ]);

  const todayVal = Number(today.rows[0]?.total ?? 0);
  const budgetVal = Number(budgetRow.rows[0]?.value ?? 2);

  return {
    today: todayVal,
    week: Number(week.rows[0]?.total ?? 0),
    allTime: Number(allTime.rows[0]?.total ?? 0),
    budget: budgetVal,
    remaining: Math.max(0, budgetVal - todayVal),
    breakdown: breakdown.rows.map(r => ({
      model: r.model,
      calls: Number(r.calls),
      cost: Number(r.cost),
    })),
  };
}

export async function getCloudBudget(): Promise<number> {
  const result = await query(
    `SELECT value FROM policies WHERE key = 'daily_cloud_budget_usd'`
  );
  return Number(result.rows[0]?.value ?? 2);
}

// ── Human approval gate ───────────────────────────────────────────────────────

async function requestCloudApproval(reason: string): Promise<boolean> {
  const insert = await query(
    `INSERT INTO events (type, payload) VALUES ($1, $2) RETURNING id`,
    ["cloud_budget_approval_requested", {
      reason,
      status: "pending",
      requested_at: new Date().toISOString(),
    }]
  );
  const eventId = insert.rows[0]?.id;

  console.log(`\n⚠️  CLOUD BUDGET LIMIT HIT`);
  console.log(`   Reason: ${reason}`);
  console.log(`   → /approve-cloud ${eventId}   (5 min timeout, then falls back to Ollama)\n`);

  // Also emit telegram_notify so bot can pick it up
  await query(
    `INSERT INTO events (type, payload) VALUES ($1, $2)`,
    ["telegram_notify", {
      message: `⚠️ Cloud budget limit hit.\n${reason}\nApprove? Event ID: ${eventId}`,
      action: "approve_cloud",
      event_id: eventId,
    }]
  ).catch(() => { }); // non-fatal if telegram not set up yet

  const deadline = Date.now() + CLOUD_APPROVAL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 10_000));

    const check = await query(
      `SELECT payload->>'status' as status FROM events WHERE id = $1`,
      [eventId]
    );
    const status = check.rows[0]?.status;
    if (status === "approved") {
      console.log(`  ✅ Cloud approved.`);
      return true;
    }
    if (status === "rejected") {
      console.log(`  ❌ Cloud rejected.`);
      return false;
    }
  }

  await query(
    `INSERT INTO events (type, payload) VALUES ($1, $2)`,
    ["cloud_budget_blocked", { reason: "timeout", event_id: eventId }]
  );
  console.log(`  ⏰ Timeout — falling back to Ollama.`);
  return false;
}

// ── Public interface ──────────────────────────────────────────────────────────

/**
 * callLocalBrain — Always Ollama. Uses task-specific model if available.
 * Never touches cloud budget.
 */
export async function callLocalBrain(
  prompt: string,
  taskType: TaskType = "planning",
  imageBase64?: string
): Promise<string> {
  return callOllamaWithFallback(prompt, taskType, imageBase64);
}

/**
 * callBrain — Primary interface. Uses cloud when budget allows, Ollama as fallback.
 *
 * Flow:
 *   1. Cloud under budget → use cloud (task-appropriate model)
 *   2. Cloud over budget → request human approval (5 min timeout)
 *      - Approved → cloud
 *      - Rejected / timeout → Ollama with task-specific model
 *   3. Cloud fails → fall back to Ollama with task-specific model
 *   4. forceLocal = true → skip cloud entirely
 */
export async function callBrain(
  prompt: string,
  reason: string = "general task",
  forceLocal: boolean = false,
  taskType: TaskType = "planning",
  imageBase64?: string
): Promise<string> {
  if (forceLocal || !process.env.OPENAI_API_KEY) {
    return callOllamaWithFallback(prompt, taskType, imageBase64);
  }

  const [todaySpend, dailyBudget] = await Promise.all([
    getTodayCloudSpend(),
    getCloudBudget(),
  ]);

  if (todaySpend < dailyBudget) {
    try {
      return await callCloudWithFallback(prompt, taskType, imageBase64);
    } catch (err: any) {
      console.log(`  ⚠️  Cloud failed (${err.message}), using Ollama.`);
      return callOllamaWithFallback(prompt, taskType, imageBase64);
    }
  }

  // Over budget — request human approval
  const approved = await requestCloudApproval(
    `Daily cloud budget $${dailyBudget.toFixed(2)} reached ($${todaySpend.toFixed(2)} spent). ${reason}`
  );

  if (approved) {
    try {
      return await callCloudWithFallback(prompt, taskType, imageBase64);
    } catch (err: any) {
      console.log(`  ⚠️  Cloud failed after approval (${err.message}), using Ollama.`);
    }
  }

  return callOllamaWithFallback(prompt, taskType, imageBase64);
}

// ── Approval helpers (called by CLI and Telegram) ────────────────────────────

export async function approveCloudRequest(eventId: number): Promise<void> {
  await query(
    `UPDATE events
     SET payload = payload || '{"status":"approved"}'::jsonb
     WHERE id = $1 AND type = 'cloud_budget_approval_requested'`,
    [eventId]
  );
  console.log(`✅ Cloud request ${eventId} approved.`);
}

export async function rejectCloudRequest(eventId: number): Promise<void> {
  await query(
    `UPDATE events
     SET payload = payload || '{"status":"rejected"}'::jsonb
     WHERE id = $1 AND type = 'cloud_budget_approval_requested'`,
    [eventId]
  );
  console.log(`❌ Cloud request ${eventId} rejected.`);
}