/**
 * @clipop/feedback - Client API layer
 *
 * All functions take the AppConfig explicitly (no process.env access) so
 * the host app stays in control of routing. Errors throw with messages
 * that are safe to surface to end users.
 */

import type { AppConfig, Feedback } from '../core';

/** Hard limit on feedback content length, enforced both client- and server-side. */
export const FEEDBACK_MAX_LENGTH = 5000;

/** Lifecycle status of a feedback row. */
export type FeedbackStatus = 'new' | 'read' | 'resolved';

/** Resolve the API endpoint from config (falls back to the default path). */
function endpoint(config: AppConfig): string {
  return config.feedbackEndpoint || '/api/feedback';
}

/** Normalize a rating value: must be an integer in [1,5] or null. */
function normalizeRating(rating: unknown): number | null {
  if (rating === undefined || rating === null) return null;
  if (typeof rating !== 'number' || !Number.isFinite(rating)) {
    throw new Error('Rating must be a number between 1 and 5.');
  }
  const r = Math.floor(rating);
  if (r < 1 || r > 5) {
    throw new Error('Rating must be between 1 and 5.');
  }
  return r;
}

export interface SubmitFeedbackInput {
  content: string;
  /** Optional 1–5 star rating. Non-integer / out-of-range values throw. */
  rating?: number | null;
  /** Bearer token. When omitted, the call is treated as demo mode. */
  token?: string;
}

export interface SubmitFeedbackResult {
  success: boolean;
  /** True when the server persisted nothing (e.g. demo mode). */
  demo?: boolean;
}

/**
 * Submit a feedback entry via POST /api/feedback.
 * Throws on validation or network errors; the error message is user-safe.
 */
export async function submitFeedback(
  config: AppConfig,
  input: SubmitFeedbackInput,
): Promise<SubmitFeedbackResult> {
  const content = typeof input.content === 'string' ? input.content.trim() : '';
  if (!content) {
    throw new Error('Please enter your feedback.');
  }
  if (content.length > FEEDBACK_MAX_LENGTH) {
    throw new Error(`Feedback is too long (max ${FEEDBACK_MAX_LENGTH} characters).`);
  }
  const rating = normalizeRating(input.rating);

  const token = input.token;
  if (!token) {
    // No token means we cannot authenticate; mirror the server's demo-mode behavior.
    return { success: true, demo: true };
  }

  let res: Response;
  try {
    res = await fetch(endpoint(config), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ content, rating }),
    });
  } catch {
    throw new Error('Network error. Please check your connection and try again.');
  }

  const data = await res.json().catch(() => ({})) as { success?: boolean; demo?: boolean; error?: string };
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' && data.error ? data.error : 'Failed to submit feedback.');
  }
  return { success: true, demo: Boolean(data.demo) };
}

/** Raw row shape returned by GET /api/feedback (Supabase select with joined users). */
interface FeedbackRow {
  id: string;
  user_id: string;
  content: string;
  rating?: number | null;
  status: FeedbackStatus;
  created_at: string;
  users?: { email?: string | null; name?: string | null } | null;
}

function toFeedback(row: FeedbackRow): Feedback {
  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.users?.email ?? undefined,
    userName: row.users?.name ?? undefined,
    content: row.content,
    rating: row.rating ?? null,
    status: row.status,
    createdAt: row.created_at,
  };
}

/**
 * List all feedback entries. Admin-only on the server side.
 * Throws on auth/network errors.
 */
export async function listFeedback(config: AppConfig, token: string): Promise<Feedback[]> {
  if (!token) {
    throw new Error('Authentication required to view feedback.');
  }

  let res: Response;
  try {
    res = await fetch(endpoint(config), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error('Network error. Please check your connection and try again.');
  }

  const data = await res.json().catch(() => ({})) as { feedbacks?: FeedbackRow[]; error?: string; demo?: boolean };
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' && data.error ? data.error : 'Failed to load feedback.');
  }
  const rows = Array.isArray(data.feedbacks) ? data.feedbacks : [];
  return rows.map(toFeedback);
}

/**
 * Update the status of a feedback entry via PATCH /api/feedback.
 * Throws on auth/network errors.
 */
export async function updateFeedbackStatus(
  config: AppConfig,
  id: string,
  status: FeedbackStatus,
  token: string,
): Promise<void> {
  if (!id) throw new Error('Feedback id is required.');
  if (!token) throw new Error('Authentication required to update feedback.');

  let res: Response;
  try {
    res = await fetch(endpoint(config), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id, status }),
    });
  } catch {
    throw new Error('Network error. Please check your connection and try again.');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(typeof data.error === 'string' && data.error ? data.error : 'Failed to update feedback.');
  }
}
