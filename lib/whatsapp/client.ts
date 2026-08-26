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
}

export class GraphApiError extends Error {
  constructor(
    readonly status: number,
    readonly graph: GraphError,
  ) {
    super(graph.message || `Graph API ${status}`);
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
