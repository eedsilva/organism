/**
 * agents/marketing — Fully Autonomous Trust Identity distribution agent
 *
 * Scoped to a single Reddit identity.
 * 1. Authenticates (headed) if no session exists.
 * 2. Autonomously loops (headless) to build karma and distribute chassis links.
 * 3. Broadcasts real-time statuses to Mission Control.
 */

import { query } from "../../state/db";
import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { callBrain } from "../../cognition/llm";

chromium.use(stealthPlugin() as any);

const POLL_INTERVAL_MS = Number(process.env.MARKETING_POLL_INTERVAL_MS) || 6 * 60 * 60 * 1000;

async function notifyMissionControl(handle: string, action: string, message: string) {
  try {
    await query(`SELECT pg_notify('organism_events', $1)`, [
      JSON.stringify({
        type: "agent_log",
        payload: { agent: "marketing", handle, action, message, timestamp: new Date().toISOString() }
      })
    ]);
  } catch (e) { }
}

async function doInitialAuth(handle: string, identityId: number, authPath: string, profileDir: string) {
  console.log(`\n🛡️  Trust Identity Initial Login Required: ${handle}`);
  console.log(`   Please log in when the browser opens.`);
  await notifyMissionControl(handle, "auth_required", "Waiting for human to log in...");

  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    headless: false,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    locale: "en-US",
  } as any);

  const page = await context.newPage();
  await page.goto("https://www.reddit.com");

  console.log("⏳ Waiting 60s for you to log in to Reddit...");
  await page.waitForTimeout(60000);

  if (!fs.existsSync(".auth")) fs.mkdirSync(".auth");
  await context.storageState({ path: authPath });

  await query(
    `UPDATE trust_identities SET account_age_days = COALESCE(account_age_days, 0) + 1, last_active_at = NOW() WHERE id = $1`,
    [identityId]
  );
  await context.close();
  console.log(`✅ Session saved to ${authPath}.`);
  await notifyMissionControl(handle, "auth_success", "Human login complete. Session saved.");
}

async function runAutonomousCycle(handle: string, identityId: number, authPath: string) {
  await notifyMissionControl(handle, "cycle_start", "Waking up for autonomous cycle.");
  const browser = await chromium.launch({
    executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    headless: process.env.SHOW_BROWSER === "true" ? false : true,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });

  try {
    const context = await browser.newContext({
      storageState: authPath,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    // 1. Warmup
    await notifyMissionControl(handle, "warmup", "Surfing Reddit to build trust and karma...");
    await page.goto("https://www.reddit.com", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(3000);

    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 600 + Math.random() * 300);
      await page.waitForTimeout(1500 + Math.random() * 2000);
    }

    try {
      const upvoteButtons = await page.$$('button[data-click-id="upvote"]');
      if (upvoteButtons.length > 0) {
        await upvoteButtons[0].click();
        await query(`INSERT INTO identity_activity_log (identity_id, activity_type, content_preview) VALUES ($1, 'upvote', 'Autonomous feed upvote')`, [identityId]);
        await notifyMissionControl(handle, "warmup", "Upvoted a post to simulate human engagement.");
      }
    } catch (e) { }

    // 2. Strike
    const readyDeployments = await query(
      `SELECT id, displacement_event_id, tool_name, live_url FROM tool_deployments WHERE status = 'ready' AND live_url IS NOT NULL LIMIT 1`
    );

    if (readyDeployments.rows.length > 0) {
      const dep = readyDeployments.rows[0];
      await notifyMissionControl(handle, "strike_search", `Drafting distribution comment for: ${dep.tool_name}...`);

      const prompt = `
You are a helpful internet user (${handle}). You are reading a thread where someone is complaining about software pricing or a missing feature.
You want to share a free tool that solves their problem concisely and casually.
Do NOT sound like a marketer. Sound like another developer/user who just stumbled upon it.
The free tool is called: ${dep.tool_name}
The URL is: ${dep.live_url}

Write ONLY the 1-2 sentence comment text you will post.`;

      const comment = await callBrain(prompt, "marketing strike comment", false, "chat");
      const cleanComment = comment.trim();

      await query(
        `INSERT INTO identity_activity_log (identity_id, activity_type, content_preview, url) VALUES ($1, 'strike_drafted', $2, $3)`,
        [identityId, cleanComment.slice(0, 50) + "...", dep.live_url]
      );

      await query(`UPDATE trust_identities SET posts_sent = COALESCE(posts_sent, 0) + 1, last_active_at = NOW() WHERE id = $1`, [identityId]);
      await notifyMissionControl(handle, "strike_drafted", `Drafted comment: "${cleanComment}"`);
      // NOTE: Simulating the target thread injection until Vercel deployments are live to avoid domain bans.
    } else {
      await notifyMissionControl(handle, "strike_skip", "No active deployments ready for distribution.");
    }

    await context.close();
  } catch (err: any) {
    console.error(`❌ [Marketing Agent] Cycle error: ${err.message}`);
    await notifyMissionControl(handle, "error", `Cycle failed: ${err.message}`);
  } finally {
    await browser.close();
  }
}

export async function runMarketingAgent(handle: string) {
  const PROFILE_DIR = path.join(os.homedir(), `.organism-trust-${handle.toLowerCase()}`);
  const AUTH_FILE = `.auth/reddit_${handle.toLowerCase()}.json`;

  let res = await query(`SELECT id FROM trust_identities WHERE handle = $1`, [handle]);
  let identityId = res.rows[0]?.id;

  if (!identityId) {
    const insert = await query(
      `INSERT INTO trust_identities (platform, handle, auth_file, trust_level) VALUES ('reddit', $1, $2, 'building') RETURNING id`,
      [handle, AUTH_FILE]
    );
    identityId = insert.rows[0].id;
    console.log(`   Added new trust identity to tracking DB (ID: ${identityId})`);
  }

  if (!fs.existsSync(AUTH_FILE)) {
    await doInitialAuth(handle, identityId, AUTH_FILE, PROFILE_DIR);
  }

  console.log(`🚀 Marketing Agent @${handle} is fully autonomous.`);

  // Single immediate cycle, then loop
  await runAutonomousCycle(handle, identityId, AUTH_FILE);

  while (true) {
    console.log(`💤 Agent sleeping for ${POLL_INTERVAL_MS / 1000 / 60} minutes...`);
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    await runAutonomousCycle(handle, identityId, AUTH_FILE);
  }
}
