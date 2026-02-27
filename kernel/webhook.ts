import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Client } from "pg";
import { query } from "../state/db";

dotenv.config();

const app = express();
const port = process.env.WEBHOOK_PORT || 3001;

// Dedicated client for LISTEN/NOTIFY
const pgClient = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});
pgClient.connect().catch(console.error);

app.use(cors());
app.use(express.json());

// Basic health check
app.get("/health", (req, res) => {
    res.json({ status: "ok", type: "organism_webhook" });
});

// POST /signal/lead/:opportunityId
// Handles form submissions from generated landing pages
app.post("/signal/lead/:opportunityId", async (req, res) => {
    try {
        const { opportunityId } = req.params;
        const { email, utm_source, utm_medium, utm_campaign } = req.body;

        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }

        // 1. Insert into leads table
        await query(
            `INSERT INTO leads (opportunity_id, email, utm_source, utm_medium, utm_campaign)
       VALUES ($1, $2, $3, $4, $5)`,
            [opportunityId, email, utm_source, utm_medium, utm_campaign]
        );

        // 2. Write to signal_queue so the Brain picks it up next cycle
        await query(
            `INSERT INTO signal_queue (source, raw_payload)
       VALUES ('lead_capture', $1)`,
            [JSON.stringify({ opportunity_id: opportunityId, email, utm_source })]
        );

        // 3. Notify Mission Control via SSE
        await query(`SELECT pg_notify('organism_events', $1)`, [
            JSON.stringify({ type: "lead_captured", payload: { opportunity_id: opportunityId, email } })
        ]);

        console.log(`✅ Lead captured for Opportunity ${opportunityId}: ${email}`);
        res.json({ success: true });
    } catch (error: any) {
        console.error("❌ Error processing lead webhook:", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
});

// GET /events/stream
// Server-Sent Events (SSE) endpoint for Mission Control
app.get("/events/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders(); // flush the headers to establish SSE

    // Function to send events
    const notify = (event: string, data: any) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Keep connection alive
    const keepAliveInterval = setInterval(() => {
        res.write(": keepalive\n\n");
    }, 30000);

    // Set up the listener on the Postgres client
    const handleNotification = (msg: any) => {
        if (msg.channel === "organism_events") {
            try {
                const parsed = JSON.parse(msg.payload);
                notify(parsed.type || "update", parsed);
            } catch (err) {
                notify("update", msg.payload);
            }
        }
    };

    pgClient.on("notification", handleNotification);

    // Subscribe to the channel. pgClient is connected at DB initialization.
    pgClient.query("LISTEN organism_events").catch((err) => {
        console.error("Failed to listen to organism_events:", err);
    });

    req.on("close", () => {
        clearInterval(keepAliveInterval);
        pgClient.removeListener("notification", handleNotification);
    });
});

app.listen(port, () => {
    console.log(`🌐 Organism Webhook Server listening on port ${port}`);
});
