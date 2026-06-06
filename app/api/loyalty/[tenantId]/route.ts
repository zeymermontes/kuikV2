import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { LoyaltyProgram, LoyaltyCustomer } from '@/lib/database.types';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars

function makeCode(len = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

/**
 * Public loyalty endpoint. POST { phone, name? } → enrolls (or fetches) the
 * customer for this tenant and returns their card + the program config. Uses the
 * service-role client; anonymous visitors never touch the DB directly.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;
  let body: { phone?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const phone = (body.phone ?? '').replace(/\D/g, '');
  if (phone.length < 8) {
    return NextResponse.json({ error: 'invalid_phone' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: program } = await supabase
    .from('loyalty_program')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle<LoyaltyProgram>();

  if (!program || !program.enabled) {
    return NextResponse.json({ error: 'not_enabled' }, { status: 404 });
  }

  // Find existing member by phone.
  const { data: existing } = await supabase
    .from('loyalty_customers')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('phone', phone)
    .maybeSingle<LoyaltyCustomer>();

  let customer = existing;

  if (!customer) {
    // Create with a unique short code (retry a few times on collision).
    for (let i = 0; i < 5 && !customer; i++) {
      const { data, error } = await supabase
        .from('loyalty_customers')
        .insert({ tenant_id: tenantId, phone, name: body.name ?? null, code: makeCode() })
        .select('*')
        .maybeSingle<LoyaltyCustomer>();
      if (!error && data) customer = data;
    }
    if (!customer) {
      return NextResponse.json({ error: 'enroll_failed' }, { status: 500 });
    }
  } else if (body.name && !customer.name) {
    await supabase.from('loyalty_customers').update({ name: body.name }).eq('id', customer.id);
    customer.name = body.name;
  }

  return NextResponse.json({
    program: {
      type: program.type,
      stamps_needed: program.stamps_needed,
      reward_description: program.reward_description,
      points_for_reward: program.points_for_reward,
      points_reward_description: program.points_reward_description,
    },
    customer: {
      code: customer.code,
      name: customer.name,
      stamps: customer.stamps,
      points: customer.points,
    },
  });
}
