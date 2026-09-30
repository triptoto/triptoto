#!/usr/bin/env node
/**
 * Grant or revoke complimentary lifetime Tripto Plus for a signed-in account.
 *
 * Usage:
 *   node scripts/grant-triptoplus.mjs --email member@example.com --note "Partner"
 *   node scripts/grant-triptoplus.mjs --email member@example.com --revoke
 *
 * This is deliberately a local operator command. It requires the existing
 * Cloudflare login and never exposes a public endpoint that could grant Plus.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
const valueFor = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? String(args[index + 1] ?? '') : '';
};
const email = valueFor('--email').trim().toLowerCase();
const note = valueFor('--note').trim().slice(0, 500);
const revoke = args.includes('--revoke');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: node scripts/grant-triptoplus.mjs --email member@example.com [--note "Partner"] [--revoke]');
  process.exit(1);
}

const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;
const d1 = (command) => execFileSync('npx', ['wrangler', 'd1', 'execute', 'tripto-db', '--remote', '--json', '--command', command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const lookupSql = `
  SELECT id FROM users WHERE lower(primary_email)=${sqlString(email)} AND deleted_at IS NULL
  UNION
  SELECT u.id FROM users u JOIN auth_identities ai ON ai.user_id=u.id
  WHERE lower(ai.email)=${sqlString(email)} AND u.deleted_at IS NULL
  LIMIT 2`;
const lookup = JSON.parse(d1(lookupSql));
const rows = lookup?.[0]?.results ?? [];
if (rows.length !== 1 || !rows[0]?.id) {
  console.error(rows.length ? `More than one account matches ${email}; resolve the duplicate before granting access.` : `No signed-in Tripto account found for ${email}.`);
  process.exit(1);
}
const userId = String(rows[0].id);
const now = Date.now();
if (revoke) {
  d1(`UPDATE tripto_plus_lifetime_grants SET revoked_at=${now} WHERE user_id=${sqlString(userId)} AND revoked_at IS NULL`);
  console.log(`Revoked lifetime Tripto Plus for ${email}.`);
} else {
  d1(`INSERT INTO tripto_plus_lifetime_grants(id,user_id,source,note,granted_by,created_at,revoked_at)
    VALUES (${sqlString(randomUUID())},${sqlString(userId)},'manual',${note ? sqlString(note) : 'NULL'},'operator',${now},NULL)
    ON CONFLICT(user_id) DO UPDATE SET source='manual',note=excluded.note,granted_by='operator',created_at=excluded.created_at,revoked_at=NULL`);
  console.log(`Granted lifetime Tripto Plus to ${email}.`);
}
