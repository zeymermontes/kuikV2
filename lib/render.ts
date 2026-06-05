import 'server-only';

const RENDER_API = 'https://api.render.com/v1';

function headers() {
  return {
    Authorization: `Bearer ${process.env.RENDER_API_KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

const serviceId = () => process.env.RENDER_SERVICE_ID!;

/** Returns true if Render is configured (otherwise the flow is manual). */
export function renderConfigured(): boolean {
  return Boolean(process.env.RENDER_API_KEY && process.env.RENDER_SERVICE_ID);
}

/** Register a custom domain on the Render web service. Idempotent-ish. */
export async function addRenderDomain(name: string): Promise<void> {
  if (!renderConfigured()) return;
  const res = await fetch(`${RENDER_API}/services/${serviceId()}/custom-domains`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name }),
  });
  // 409 = already added; treat as success.
  if (!res.ok && res.status !== 409) {
    throw new Error(`Render addDomain failed: ${res.status}`);
  }
}

/** Ask Render whether the domain's DNS + SSL are verified. */
export async function isRenderDomainVerified(name: string): Promise<boolean> {
  if (!renderConfigured()) return false;
  const res = await fetch(
    `${RENDER_API}/services/${serviceId()}/custom-domains/${encodeURIComponent(name)}`,
    { headers: headers(), cache: 'no-store' },
  );
  if (!res.ok) return false;
  const data = (await res.json()) as { verificationStatus?: string };
  return data.verificationStatus === 'verified';
}

/** Remove a custom domain from the Render service. */
export async function removeRenderDomain(name: string): Promise<void> {
  if (!renderConfigured()) return;
  await fetch(
    `${RENDER_API}/services/${serviceId()}/custom-domains/${encodeURIComponent(name)}`,
    { method: 'DELETE', headers: headers() },
  );
}
