import { query } from "../state/db";

/**
 * Status transitions go through the event log. Never UPDATE opportunities.status directly.
 * The opportunity_current_state view derives status from opportunity_events; o.status
 * is a legacy fallback preserved only for records with no events.
 */
export async function transitionOpportunity(id: number, newStatus: string, payload: any = {}) {
    await query(
        `INSERT INTO opportunity_events (opportunity_id, event_type, new_status, payload) 
     VALUES ($1, $2, $3, $4)`,
        [id, 'status_change', newStatus, JSON.stringify(payload)]
    );
}
