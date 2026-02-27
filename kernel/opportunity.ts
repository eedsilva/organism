import { query } from "../state/db";

export async function transitionOpportunity(id: number, newStatus: string, payload: any = {}) {
    await query(
        `INSERT INTO opportunity_events (opportunity_id, event_type, new_status, payload) 
     VALUES ($1, $2, $3, $4)`,
        [id, 'status_change', newStatus, JSON.stringify(payload)]
    );
}
