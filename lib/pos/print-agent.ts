import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PrintAgent } from '@/lib/database.types';

// The print agent (print-agent/) authenticates with a bearer token minted when
// a manager adds it in the dashboard. Only its sha256 is stored, so a database
// read never yields a usable token; the plain token is shown once and lives in
// the agent's config file.

export function newAgentToken(): string {
  return `kpa_${randomBytes(32).toString('base64url')}`;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** The agent behind a request, or null. Bumps last_seen (throttled) so the dashboard can show it online. */
export async function authenticateAgent(req: Request): Promise<PrintAgent | null> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token.startsWith('kpa_') || token.length < 20) return null;

  const supabase = createAdminClient();
  const { data } = await supabase.from('print_agents').select('*').eq('token_hash', hashToken(token)).maybeSingle();
  const agent = data as PrintAgent | null;
  if (!agent) return null;

  const seen = agent.last_seen_at ? Date.parse(agent.last_seen_at) : 0;
  const platform = req.headers.get('x-kuik-agent-platform');
  const version = req.headers.get('x-kuik-agent-version');
  if (Date.now() - seen > 20_000 || (version && version !== agent.version)) {
    await supabase
      .from('print_agents')
      .update({
        last_seen_at: new Date().toISOString(),
        platform: platform ?? agent.platform,
        version: version ?? agent.version,
        updated_at: new Date().toISOString(),
      })
      .eq('id', agent.id);
  }
  return agent;
}
