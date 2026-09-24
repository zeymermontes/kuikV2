import 'server-only';

/**
 * Thin fetch wrapper over Meta's Graph API. No SDK: this codebase keeps its
 * dependency list short, and the surface we need is four endpoints.
 */

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v23.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export interface GraphError {
  code?: number;
  message?: string;
  error_subcode?: number;
  error_data?: { details?: string };
  /** The sentence Meta wrote for a person; `message` is often just "Invalid parameter". */
  error_user_title?: string;
  error_user_msg?: string;
}

/** The most useful sentence in a Graph error, for showing to the owner. */
export function graphErrorText(graph: GraphError, status?: number): string {
  const msg = graph.error_user_msg || graph.error_data?.details || graph.message || (status ? `Graph API ${status}` : 'Graph API error');
  return graph.error_user_title ? `${graph.error_user_title}: ${msg}` : msg;
}

export class GraphApiError extends Error {
  constructor(
    readonly status: number,
    readonly graph: GraphError,
  ) {
    super(graphErrorText(graph, status));
    this.name = 'GraphApiError';
  }
  /** Meta's numeric code, which is what the send layer branches on. */
  get code(): number | undefined {
    return this.graph.code;
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { token: string },
): Promise<T> {
  const { token, ...rest } = init;
  const res = await fetch(`${GRAPH}/${path}`, {
    ...rest,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(rest.headers ?? {}),
    },
    // Never let a hung Graph call hold a webhook worker open.
    signal: rest.signal ?? AbortSignal.timeout(15_000),
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new GraphApiError(res.status, json.error ?? {});
  return json as T;
}

export function graphGet<T>(path: string, token: string): Promise<T> {
  return request<T>(path, { method: 'GET', token });
}

export function graphPost<T>(path: string, token: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', token, body: JSON.stringify(body) });
}

export function graphDelete<T>(path: string, token: string): Promise<T> {
  return request<T>(path, { method: 'DELETE', token });
}

/**
 * Exchange the Embedded Signup code for an access token.
 * Uses the app secret, so this may only ever run server-side.
 */
export async function exchangeCode(code: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_META_APP_ID ?? '',
    client_secret: process.env.META_APP_SECRET ?? '',
    code,
  });
  const res = await fetch(`${GRAPH}/oauth/access_token?${params}`, {
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new GraphApiError(res.status, json.error ?? { message: 'no access_token' });
  }
  return json.access_token as string;
}

/**
 * Point the app's webhooks at this business's account.
 *
 * Skipping this is the single most common reason a WhatsApp integration
 * "receives nothing" — and it fails silently, because everything else about
 * the connection looks fine.
 */
export function subscribeApp(wabaId: string, token: string): Promise<{ success?: boolean }> {
  return graphPost(`${wabaId}/subscribed_apps`, token, {});
}

export function unsubscribeApp(wabaId: string, token: string): Promise<{ success?: boolean }> {
  return graphDelete(`${wabaId}/subscribed_apps`, token);
}

export interface PhoneNumberInfo {
  id: string;
  display_phone_number: string;
  verified_name?: string;
  quality_rating?: string;
  messaging_limit_tier?: string;
  code_verification_status?: string;
}

export function getPhoneNumber(phoneNumberId: string, token: string): Promise<PhoneNumberInfo> {
  const fields = 'id,display_phone_number,verified_name,quality_rating,messaging_limit_tier,code_verification_status';
  return graphGet(`${phoneNumberId}?fields=${fields}`, token);
}

/**
 * Register a number for Cloud API messaging. Only for a number that is NOT on
 * the WhatsApp Business app: under Coexistence this call would migrate it off
 * the phone. The PIN becomes (or must match) the number's two-step code.
 */
export function registerPhoneNumber(phoneNumberId: string, token: string, pin: string): Promise<{ success?: boolean }> {
  return graphPost(`${phoneNumberId}/register`, token, { messaging_product: 'whatsapp', pin });
}

// ── Message templates ───────────────────────────────────────────────────────

const TEMPLATE_FIELDS = 'id,name,status,category,language,components,rejected_reason';

/**
 * Every template on the account. Meta pages at 100; a restaurant rarely has
 * that many, but the loop follows `paging.next` a few times so a big account
 * does not silently lose the tail of its list.
 */
export async function listMessageTemplates<T>(wabaId: string, token: string): Promise<T[]> {
  const out: T[] = [];
  let path: string | null = `${wabaId}/message_templates?fields=${TEMPLATE_FIELDS}&limit=100`;
  for (let page = 0; path && page < 5; page++) {
    const res: { data?: T[]; paging?: { next?: string; cursors?: { after?: string } } } = await graphGet(path, token);
    out.push(...(res.data ?? []));
    const after = res.paging?.next ? res.paging.cursors?.after : undefined;
    path = after ? `${wabaId}/message_templates?fields=${TEMPLATE_FIELDS}&limit=100&after=${encodeURIComponent(after)}` : null;
  }
  return out;
}

export function createMessageTemplate(
  wabaId: string,
  token: string,
  body: { name: string; category: string; language: string; components: unknown[] },
): Promise<{ id: string; status: string; category: string }> {
  return graphPost(`${wabaId}/message_templates`, token, body);
}

/** Replaces the content; only a rejected/paused/flagged template accepts this from the API. */
export function editMessageTemplate(
  templateId: string,
  token: string,
  body: { category?: string; components: unknown[] },
): Promise<{ success?: boolean }> {
  return graphPost(templateId, token, body);
}

/** By name every language goes; with `hsmId` only that one. */
export function deleteMessageTemplate(wabaId: string, token: string, name: string, hsmId?: string): Promise<{ success?: boolean }> {
  const q = new URLSearchParams({ name });
  if (hsmId) q.set('hsm_id', hsmId);
  return graphDelete(`${wabaId}/message_templates?${q}`, token);
}
