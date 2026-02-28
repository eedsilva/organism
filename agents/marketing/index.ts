/**
 * agents/marketing — Trust Identity distribution agent
 *
 * Warmup: Builds account age and karma for new identities.
 * Strike: Drops deployed tool links into relevant complaint threads.
 */

import { query } from "../../state/db";
import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import * as path from "path";
import * as fs from "fs";
import { callBrain } from "../../cognition/llm";

chromium.use(stealthPlugin() as any);

const POLL_INTERVAL_MS = Number(process.env.MARKETING_POLL_INTERVAL_MS) || 6 * 60 * 60 * 1000; // 6 hours default
let isRunning = false;

/**
 * Warmup: For identities with warmup_complete=false, surf subreddits, upvote, build karma.
 */
async function runWarmup(identity: { id: number; platform: string; handle: string; auth_file: string }) {
  if (identity.platform !== "reddit") return;
  const authPath = path.resolve(process.cwd(), identity.auth_file);
  if (!fs.existsSync(authPath)) {
    console.log(`  ⚠️  [Marketing] Auth file not found for ${identity.handle}: ${authPath}`);
    return;
  }

  console.log(`  🛡️  [Marketing] Warming up ${identity.handle}...`);
  const browser = await chromium.launch({
    executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    headless: process.env.SHOW_BROWSER === "true" ? false : true,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });

  try {
    const context = await browser.newContext({
      storageState: authPath,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    await page.goto("https://www.reddit.com", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(3000);

    // Natural scrolling
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 600 + Math.random() * 300);
      await page.waitForTimeout(1500 + Math.random() * 2000);
    }

    // Upvote 1–2 items to build engagement
    try {
      const upvoteButtons = await page.$$('button[data-click-id="upvote"]');
      const toClick = Math.min(2, Math.floor(upvoteButtons.length * 0.3));
      for (let i = 0; i < toClick && upvoteButtons[i]; i++) {
        await upvoteButtons[i].click();
        await page.waitForTimeout(1000 + Math.random() * 2000);
        await query(
          `INSERT INTO identity_activity_log (identity_id, activity_type, content_preview) VALUES ($1, 'upvote', 'Warmup upvote')`,
          [identity.id]
        );
      }
    } catch (e) {
      // Ignore upvote failures
    }

    await query(
      `UPDATE trust_identities SET last_active_at = NOW(), account_age_days = COALESCE(account_age_days, 0) + 1 WHERE id = $1`,
      [identity.id]
    );

    await context.close();
  } finally {
    await browser.close();
  }
}

/**
 * Strike: For warmed identities + ready deployments, drop links into complaint threads.
 * Simplified: log intent; full implementation would use BrowserAgent to find/post.
 */
async function runStrike(
  identity: { id: number; platform: string; handle: string; auth_file: string },
  deployment: { id: number; tool_name: string; live_url: string | null; displacement_event_id: string }
) {
  if (!deployment.live_url) return;
  if (identity.platform !== "reddit") return;
  const authPath = path.resolve(process.cwd(), identity.auth_file);
  if (!fs.existsSync(authPath)) return;

  console.log(`  🎯 [Marketing] Strike: ${identity.handle} synthesizing comment for ${deployment.tool_name}...`);

  // Simulate finding a complaint thread related to the displacement event
  const threadContext = "A reddit user complaining that their current software just raised prices by 30% and it is too expensive now.";

  const prompt = `
You are a helpful internet user (${identity.handle}). You are reading a thread where someone is complaining:
"${threadContext}"

You want to share a free tool that solves their problem concisely and casually.
Do NOT sound like a marketer. Sound like another developer/user who just stumbled upon it.
The free tool is called: ${deployment.tool_name}
The URL is: ${deployment.live_url}

Write ONLY the 1-2 sentence comment text you will post.`;

  try {
    const comment = await callBrain(prompt, "marketing strike comment", false, "chat");
    const cleanComment = comment.trim();

    console.log(`  💬 [Marketing] ${identity.handle} drafted: "${cleanComment}"`);

    // TODO: Use BrowserAgent to actually navigate and post `cleanComment` to the live Reddit thread.
    // For now, log the action to the activity log.

    await query(
      `INSERT INTO identity_activity_log (identity_id, activity_type, content_preview, url) VALUES ($1, 'strike_drafted', $2, $3)`,
      [identity.id, cleanComment.slice(0, 50) + "...", deployment.live_url]
    );

    // Mark identity as having posted
    await query(`UPDATE trust_identities SET posts_sent = COALESCE(posts_sent, 0) + 1, last_active_at = NOW() WHERE id = $1`, [identity.id]);

  } catch (err: any) {
    console.log(`  ❌ [Marketing] LLM failed to draft strike: ${err.message}`);
  }
}

async function runMarketingLoop() {
  // Warmup: identities not yet warmed
  const toWarm = await query(
    `SELECT id, platform, handle, auth_file FROM trust_identities
     WHERE warmup_complete = FALSE AND platform = 'reddit'
     ORDER BY last_active_at ASC NULLS FIRST
     LIMIT 2`
  );

  for (const row of toWarm.rows) {
    try {
      await runWarmup(row);
    } catch (err: any) {
      console.error(`  ❌ [Marketing] Warmup failed for ${row.handle}: ${err.message}`);
    }
  }

  // Strike: warmed identities + ready deployments
  const readyDeployments = await query(
    `SELECT id, displacement_event_id, tool_name, live_url FROM tool_deployments WHERE status = 'ready' AND live_url IS NOT NULL LIMIT 3`
  );
  const warmed = await query(
    `SELECT id, platform, handle, auth_file FROM trust_identities
     WHERE warmup_complete = TRUE AND platform = 'reddit' LIMIT 3`
  );

  for (const dep of readyDeployments.rows) {
    for (const ident of warmed.rows) {
      try {
        await runStrike(ident, dep);
      } catch (err: any) {
        console.error(`  ❌ [Marketing] Strike failed: ${err.message}`);
      }
    }
  }
}

async function poll() {
  if (isRunning) return;
  isRunning = true;
  try {
    await runMarketingLoop();
  } catch (err: any) {
    console.error(`  ❌ Marketing Agent Error: ${err.message}`);
  } finally {
    isRunning = false;
  }
}

export { runMarketingLoop };

export function startMarketingWorker() {
  console.log("  ✅ Marketing Worker started.");
  setInterval(poll, POLL_INTERVAL_MS);
  poll();
}
