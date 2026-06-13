#!/usr/bin/env node
/**
 * CDK deploy wrapper — reads AWS_PROFILE from packages/frontend/.env.local
 * before invoking `cdk deploy`, then restores the original value when done.
 *
 * Usage (from repo root or infra/):
 *   npm run deploy            (from infra/)
 *   npm run deploy:app        (DiceRollerApp stack only)
 *   npm run deploy:stateful   (DiceRollerStateful stack only)
 */
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── AWS profile ───────────────────────────────────────────────────────────────
const savedProfile = process.env.AWS_PROFILE;

// Read AWS_PROFILE from packages/frontend/.env.local
const envLocalPath = join(__dirname, '../../packages/frontend/.env.local');
let envLocalProfile;
if (existsSync(envLocalPath)) {
  const lines = readFileSync(envLocalPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key === 'AWS_PROFILE' && val) { envLocalProfile = val; break; }
  }
}

if (envLocalProfile) {
  process.env.AWS_PROFILE = envLocalProfile;
  console.log(`🔑  AWS profile (from .env.local): ${envLocalProfile}`);
} else if (savedProfile) {
  console.log(`🔑  AWS profile (from environment): ${savedProfile}`);
} else {
  console.log('🔑  AWS profile: default');
}

// ── CDK deploy ────────────────────────────────────────────────────────────────
// The stacks/flags to deploy are passed as CLI args, e.g.:
//   node deploy.mjs --all --require-approval never
//   node deploy.mjs DiceRollerApp --require-approval never
const cdkArgs = process.argv.slice(2).join(' ') || '--all --require-approval never';

try {
  execSync(`npx cdk deploy ${cdkArgs}`, {
    stdio: 'inherit',
    cwd: join(__dirname, '..'),   // run from infra/ so cdk.json is found
  });
} finally {
  // ── Restore AWS_PROFILE ─────────────────────────────────────────────────────
  if (envLocalProfile) {
    if (savedProfile === undefined) {
      delete process.env.AWS_PROFILE;
    } else {
      process.env.AWS_PROFILE = savedProfile;
    }
  }
}
