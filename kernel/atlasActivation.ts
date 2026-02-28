/**
 * kernel/atlasActivation.ts
 *
 * Buyer Atlas activation checker. When a displacement event fires, checks each
 * target community for active threads about the affected product.
 *
 * If hot thread exists: reply strategy (3–5x higher engagement than new post).
 * If no thread: create new post from trusted identity.
 */

import { query } from "../state/db";

export interface CommunityActivationStatus {
  hasActiveThread: boolean;
  threadUrl?: string;
  threadCommentCount?: number;
  threadSentiment?: "angry" | "concerned" | "neutral" | "positive";
  activationScore: number;
}

/**
 * Build search URL for a community based on platform.
 */
function buildSearchUrl(platform: string, communityUrl: string, productName: string): string {
  const encoded = encodeURIComponent(`${productName} alternative OR ${productName} price`);
  if (platform === "reddit") {
    const subMatch = communityUrl.match(/reddit\.com\/r\/(\w+)/);
    const sub = subMatch ? subMatch[1] : "all";
    return `https://reddit.com/r/${sub}/search?q=${encoded}&restrict_sr=on`;
  }
  if (platform === "facebook" || platform === "linkedin") {
    return communityUrl; // Search within group — would need manual or API
  }
  return communityUrl;
}

/**
 * Check community activation for a displacement event. Stub implementation.
 * In production: use BrowserAgent to visit search URL, extract top thread URL and comment count.
 */
export async function checkCommunityActivation(
  communityId: number,
  displacementEventId: string,
  productName: string,
  platform: string,
  communityUrl: string
): Promise<CommunityActivationStatus> {
  const searchUrl = buildSearchUrl(platform, communityUrl, productName);

  // TODO: BrowserAgent.runTask(searchUrl, `Find threads about ${productName} pricing or alternatives`, 3)
  // For now: store check with zero activation
  const status: CommunityActivationStatus = {
    hasActiveThread: false,
    activationScore: 0,
  };

  await query(
    `INSERT INTO community_activation_checks
     (community_id, displacement_event_id, has_active_thread, thread_url, thread_comment_count, thread_sentiment, activation_score, checked_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [
      communityId,
      displacementEventId,
      status.hasActiveThread,
      status.threadUrl ?? null,
      status.threadCommentCount ?? 0,
      status.threadSentiment ?? null,
      status.activationScore,
    ]
  );

  return status;
}

/**
 * Get top communities for a displacement event by niche match.
 */
export async function getTargetCommunities(
  displacementEventId: string,
  niche: string,
  limit: number = 5
): Promise<Array<{ id: number; community_url: string; platform: string; community_name: string }>> {
  const result = await query(
    `SELECT id, community_url, platform, community_name
     FROM buyer_communities
     WHERE niche = $1
       AND self_promo_tolerance >= 0.3
     ORDER BY effectiveness_score DESC NULLS LAST, member_count DESC NULLS LAST
     LIMIT $2`,
    [niche, limit]
  );
  return result.rows;
}
