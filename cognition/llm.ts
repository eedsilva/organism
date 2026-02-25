import fetch from "node-fetch";
import { query } from "../state/db";

const OLLAMA_URL = "http://localhost:11434/api/generate";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "deepseek-v3.1:671b-cloud";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o";

// How long to wait for human /approve-cloud before falling back (ms)
const CLOUD_APPROVAL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ── Local brain (Ollama) ─────────────────────────────────────────────────────

async function callOllama(prompt: string): Promise<string> {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false }),
  });

  if (!response.ok) {
    throw new Error(`Local brain unavailable: ${response.status}`);
  }

  const data: any = await response.json();
  return data.response;
}

// ── Cloud brain (OpenAI) ─────────────────────────────────────────────────────

async function callCloud(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err: any = await response.json().catch(() => ({}));
    throw new Error(`Cloud brain error: ${err?.error?.message ?? response.status}`);
  }

  const data: any = await response.json();
  const content = data.choices?.[0]?.message?.content ?? "";

  // Estimate cost (rough: $5/1M input tokens, $15/1M output)
  const inputTokens  = data.usage?.prompt_tokens     ?? 0;
  const outputTokens = data.usage?.completion_tokens ?? 0;
  const cost = (inputTokens * 0.000005) + (outputTokens * 0.000015);

  // Log the cloud call and its cost
  await query(
    `INSERT INTO events (type, payload) VALUES ($1, $2)`,
    ["cloud_llm_call", { model: OPENAI_MODEL, input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: cost }]
  );

  return content;
}

// ── Cloud daily spend tracker ─────────────────────────────────────────────────

async function getTodayCloudSpend(): Promise<number> {
  const result = await query(
    `SELECT COALESCE(SUM((payload->>'cost_usd')::numeric), 0) as total
     FROM events
     WHERE type = 'cloud_llm_call'
       AND DATE(created_at) = CURRENT_DATE`
  );
  return Number(result.rows[0]?.total ?? 0);
}

async function getCloudBudget(): Promise<number> {
  const result = await query(
    `SELECT value FROM policies WHERE key = 'daily_cloud_budget_usd'`
  );
  return Number(result.rows[0]?.value ?? 2);
}

// ── Human approval gate ───────────────────────────────────────────────────────
// Writes a pending approval request and waits up to CLOUD_APPROVAL_TIMEOUT_MS
// for an 'approved' status. If timeout passes, falls back to local.

async function requestCloudApproval(reason: string): Promise<boolean> {
  // Insert approval request
  const insert = await query(
    `INSERT INTO events (type, payload) VALUES ($1, $2) RETURNING id`,
    ["cloud_budget_approval_requested", { reason, status: "pending", requested_at: new Date().toISOString() }]
  );
  const eventId = insert.rows[0]?.id;

  console.log(`\n⚠️  CLOUD BUDGET LIMIT HIT — Human approval required.`);
  console.log(`   Reason: ${reason}`);
  console.log(`   Run: /approve-cloud ${eventId}  (you have 5 minutes)`);
  console.log(`   Auto-fallback to local LLM in ${CLOUD_APPROVAL_TIMEOUT_MS / 60000} min if no response.\n`);

  const deadline = Date.now() + CLOUD_APPROVAL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 10_000)); // poll every 10s

    const check = await query(
      `SELECT payload->>'status' as status FROM events WHERE id = $1`,
      [eventId]
    );

    const status = check.rows[0]?.status;
    if (status === "approved") {
      console.log(`  ✅ Cloud usage approved.`);
      return true;
    }
    if (status === "rejected") {
      console.log(`  ❌ Cloud usage rejected by operator.`);
      return false;
    }
  }

  // Timeout
  await query(
    `INSERT INTO events (type, payload) VALUES ($1, $2)`,
    ["cloud_budget_blocked", { reason: "timeout", event_id: eventId }]
  );
  console.log(`  ⏰ No human response in 5 min — falling back to local LLM.`);
  return false;
}

// ── Public interface ─────────────────────────────────────────────────────────

/**
 * callLocalBrain — Always uses Ollama. Never touches cloud budget.
 * Use for routine tasks where cloud escalation is not warranted.
 */
export async function callLocalBrain(prompt: string): Promise<string> {
  return callOllama(prompt);
}

/**
 * callBrain — Uses cloud if budget allows AND human approves (within 5 min).
 * Falls back to local Ollama if budget is exhausted, approval is denied, or timeout.
 *
 * @param prompt    The prompt to send
 * @param reason    Human-readable reason why cloud is being requested
 * @param forceLocal Skip cloud check entirely (use when budget is lean/exhausted)
 */
export async function callBrain(
  prompt: string,
  reason: string = "high-viability opportunity",
  forceLocal: boolean = false
): Promise<string> {
  if (forceLocal || !process.env.OPENAI_API_KEY) {
    return callOllama(prompt);
  }

  const [todaySpend, dailyBudget] = await Promise.all([
    getTodayCloudSpend(),
    getCloudBudget(),
  ]);

  // Under budget — use cloud directly
  if (todaySpend < dailyBudget) {
    try {
      return await callCloud(prompt);
    } catch (err: any) {
      console.log(`  ⚠️  Cloud brain failed (${err.message}), falling back to local.`);
      return callOllama(prompt);
    }
  }

  // Over budget — request human approval with 5-min timeout
  const approved = await requestCloudApproval(
    `Daily cloud budget $${dailyBudget.toFixed(2)} reached (spent: $${todaySpend.toFixed(2)}). ${reason}`
  );

  if (approved) {
    try {
      return await callCloud(prompt);
    } catch (err: any) {
      console.log(`  ⚠️  Cloud brain failed after approval (${err.message}), using local.`);
      return callOllama(prompt);
    }
  }

  return callOllama(prompt);
}

// ── Cloud approval helper (called by CLI /approve-cloud <id>) ────────────────

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