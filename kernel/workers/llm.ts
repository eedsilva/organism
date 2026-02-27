import { query } from "../../state/db";
import { callBrain, TaskType } from "../../cognition/llm";
import { transitionOpportunity } from "../opportunity";

/**
 * llm.ts — Asynchronous LLM job worker pool.
 *
 * Polls the `llm_jobs` table for jobs (e.g., 'plan', 'score') and processes them using 
 * the appropriate model. This unblocks the main thread allowing parallel sensing and execution.
 */

const WORKER_COUNT = parseInt(process.env.LLM_CONCURRENCY || "2", 10);
let isRunning = false;

async function processJob(job: any) {
    const { id, job_type, input } = job;
    console.log(`  🧠 Worker picked up [${job_type}] job ${id}`);

    // Mark job as running
    await query(`UPDATE llm_jobs SET status = 'running', started_at = NOW() WHERE id = $1`, [id]);

    try {
        let output: any = null;
        let cost = 0; // Simplified cost tracking for workers

        // Dispatch based on job type
        if (job_type === "plan") {
            const prompt = input.prompt;
            const opportunityId = input.opportunity_id;
            const taskType: TaskType = input.use_cloud ? "planning" : "scoring";

            const response = await callBrain(
                prompt,
                `planning for opportunity: ${input.title?.slice(0, 60)}`,
                !input.use_cloud,
                taskType
            );

            let parsed: any = null;
            let score = 0;
            try {
                const clean = response.replace(/```json|```/g, "").trim();
                parsed = JSON.parse(clean);
                score = Math.min(100, Math.max(0, parseInt(parsed.score) || 0));
            } catch {
                // Fallback generic parse
                const match = response.match(/"score"\s*:\s*(\d+)/);
                if (match) score = Math.min(100, Math.max(0, parseInt(match[1])));
            }

            output = { response, opportunity_id: opportunityId, score, parsed };

            // Persist plan
            await query(`UPDATE opportunities SET plan = $1 WHERE id = $2`, [response.slice(0, 4000), opportunityId]);

            // Transition opportunity status
            if (score >= 30) {
                await transitionOpportunity(opportunityId, 'pursue', { score });
                await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`, ["decision", { opportunity_id: opportunityId, action: "pursue", score }]);
                console.log(`  ✅ Worker PURSUE (score: ${score}) — Opportunity ${opportunityId}`);
            } else {
                await transitionOpportunity(opportunityId, 'discarded', { score });
                await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`, ["decision", { opportunity_id: opportunityId, action: "discard", score }]);
                console.log(`  ❌ Worker Discard (score: ${score}) — Opportunity ${opportunityId}`);
            }
        } else {
            // generic handling
            const response = await callBrain(input.prompt, `Job ${id}`, false, "chat");
            output = { response };
        }

        // Mark job done
        await query(
            `UPDATE llm_jobs SET status = 'done', completed_at = NOW(), output = $1, cost_usd = $2 WHERE id = $3`,
            [JSON.stringify(output), cost, id]
        );

        console.log(`  ✅ Worker finished [${job_type}] job ${id}`);

    } catch (err: any) {
        console.error(`  ❌ Worker failed on job ${id}:`, err.message);
        await query(
            `UPDATE llm_jobs SET status = 'failed', completed_at = NOW(), output = $1 WHERE id = $2`,
            [JSON.stringify({ error: err.message }), id]
        );
    }
}

async function pollJobs() {
    // Grab up to WORKER_COUNT pending jobs, locking them
    const result = await query(
        `UPDATE llm_jobs
     SET status = 'locked'
     WHERE id IN (
       SELECT id FROM llm_jobs
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
        [WORKER_COUNT]
    );

    const jobs = result.rows;
    if (jobs.length > 0) {
        await Promise.all(jobs.map(processJob));
    }
}

export async function startLlmWorkerPool() {
    if (isRunning) return;
    isRunning = true;
    console.log(`🏭 LLM Worker Pool started (concurrency: ${WORKER_COUNT})`);

    // Simple polling loop
    setInterval(async () => {
        try {
            await pollJobs();
        } catch (err) {
            console.error("LLM Worker poll error:", err);
        }
    }, 5000); // Check every 5s
}
