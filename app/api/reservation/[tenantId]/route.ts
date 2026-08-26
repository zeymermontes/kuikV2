import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, clientIp, bucketKey } from '@/lib/rate-limit';
import { createReservation, type ReservationError } from '@/lib/reservations/create';

/** Public reservation request from the menu. Confirmed later by staff. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;

  // This route is public, unauthenticated and writes with the service role, so
  // the limiter is the only thing standing between it and a script.
  // Booking writes a durable row a human then has to deal with, so this is the
  // tightest budget of the four.
  // Two buckets: one per caller, one per tenant, because a botnet defeats the
  // first but still has to land everything on the same restaurant.
  const ip = clientIp(req);
  const [byIp, byTenant] = await Promise.all([
    rateLimit(bucketKey('res:ip', `${tenantId}:${ip}`, 60), 5, 60),
    rateLimit(bucketKey('res:tenant', tenantId, 60), 60, 60),
  ]);
  if (!byIp.ok || !byTenant.ok) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  let body: {
    customer_name?: string;
    phone?: string | null;
    party_size?: number;
    date?: string;
    time?: string;
    note?: string | null;
    branch_id?: string | null;
    area_id?: string | null;
    /** Honeypot: a real diner never fills a field they cannot see. */
    website?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Report success to a bot so it learns nothing, but write nothing.
  if (body.website) return NextResponse.json({ ok: true });

  const name = (body.customer_name ?? '').trim();
  if (!name || !body.date || !body.time) {
    return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 });
  }

  // Everything else — is the feature even on, which fields are mandatory, how
  // far ahead the public may book, whether the slot is full — is decided by
  // request_reservation(). This route used to skip all of it and insert
  // directly, so a restaurant could switch reservations off and still receive
  // them. The service-role client marks this caller as "the public".
  const result = await createReservation(createAdminClient(), {
    tenantId,
    branchId: body.branch_id ?? null,
    areaId: body.area_id ?? null,
    customerName: name,
    phone: (body.phone ?? '').trim() || null,
    partySize: Math.min(50, Math.max(1, Number(body.party_size) || 2)),
    date: body.date,
    time: body.time,
    note: (body.note ?? '').trim() || null,
    source: 'form',
  });

  if (result.ok) return NextResponse.json({ ok: true, id: result.id });

  const STATUS: Record<ReservationError, number> = {
    not_enabled: 404,
    unknown_tenant: 404,
    slot_full: 409,
    missing_fields: 400,
    phone_required: 400,
    note_required: 400,
    party_out_of_range: 400,
    too_soon: 400,
    too_far: 400,
    not_allowed: 403,
    failed: 500,
  };
  return NextResponse.json(
    { ok: false, error: result.error },
    { status: STATUS[result.error] },
  );
}
