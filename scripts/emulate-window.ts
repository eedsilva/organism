#!/usr/bin/env ts-node
/**
 * emulate-window.ts
 *
 * Automates the 96-hour window emulation by:
 * 1. Firing a fake "Klaviyo Price Shock" displacement event into the DB.
 * 2. Triggering the free tool chassis generation (`build.ts` -> `launchFreeToolFromDisplacement`).
 * 3. Pointing it to the local webhook.
 *
 * Run with: npx ts-node scripts/emulate-window.ts
 */

import { query } from "../state/db";
import { launchFreeToolFromDisplacement } from "../kernel/build";
import * as path from "path";
import * as fs from "fs";
import { exec } from "child_process";
import util from "util";

const execAsync = util.promisify(exec);

(async () => {
    console.log(`\n🧪  V4 EMULATION: The 96-Hour Window\n`);

    // 1. Create a fake displacement event
    console.log(`📡 [1/3] Injecting simulated Displacement Event (Klaviyo Price Shock)...`);

    const eventId = `emulated_klaviyo_shock_${Date.now()}`;

    await query(
        `INSERT INTO displacement_events (
      id, type, product_or_role, affected_persona_niche, affected_persona_title,
      spend_proof_score, displacement_strength, window_urgency, status
    ) VALUES ($1, 'PRICE_SHOCK', $2, $3, $4, 0.9, 0.85, 1.0, 'detected')`,
        [
            eventId,
            "Klaviyo",
            "shopify-marketing",
            "Shopify Store Owner",
        ]
    );

    console.log(`   ✅ Injected event: ${eventId}`);

    // 2. Trigger the Archetype Builder
    console.log(`\n🏗️  [2/3] Triggering Archetype builder to construct escape hatch...`);

    const deployment = await launchFreeToolFromDisplacement({
        id: eventId,
        type: "PRICE_SHOCK",
        product_or_role: "Klaviyo",
        affected_persona_niche: "shopify-marketing",
        displacement_strength: 0.85
    });

    if (!deployment) {
        console.error(`   ❌ Failed to deploy free tool chassis.`);
        process.exit(1);
    }

    console.log(`   ✅ Tool generated at: ${deployment.folderPath}`);

    const configPath = path.join(deployment.folderPath, "chassis.config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    console.log(`   ✅ Archetype selected: ${config.archetype}`);
    console.log(`   ✅ Webhook mapped to: ${config.lead_webhook_url}`);

    // 3. Start the dev server for the emulated project
    console.log(`\n🚀 [3/3] Emulation Complete. Starting Next.js server on port 3005...`);
    console.log(`   To test the lead capture, open http://localhost:3005 and submit an email.\n`);

    console.log(`   (Press Ctrl+C to exit)`);

    try {
        const child = exec(`npm run dev -- -p 3005`, { cwd: deployment.folderPath });
        child.stdout?.pipe(process.stdout);
        child.stderr?.pipe(process.stderr);
    } catch (err) {
        console.error("Failed to start dev server", err);
    }

})();
