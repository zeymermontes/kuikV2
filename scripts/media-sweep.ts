// Run the media sweep by hand against the linked project, from .env.local:
//
//   npx tsx --tsconfig tsconfig.test.json scripts/media-sweep.ts --dry   # report only
//   npx tsx --tsconfig tsconfig.test.json scripts/media-sweep.ts         # delete
//
// The weekly cron (app/api/cron/media-sweep) does the same in production.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]),
);
for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) process.env[k] ||= env[k];

async function main() {
  const { sweepMedia } = await import('../lib/media/sweep');
  const dryRun = process.argv.includes('--dry');
  const report = await sweepMedia({ dryRun });
  const mb = (report.bytes / 1e6).toFixed(1);
  console.log(`${dryRun ? 'would delete' : 'deleted'} ${report.orphans.length} of ${report.objects} objects (${mb} MB) across ${report.tenants} tenants; ${report.referenced} referenced`);
  for (const p of report.orphans.slice(0, 40)) console.log('  ', p);
  if (report.orphans.length > 40) console.log(`   … and ${report.orphans.length - 40} more`);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
