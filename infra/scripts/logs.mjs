#!/usr/bin/env node
/**
 * Tail CloudWatch logs for any Dice Roller Lambda function.
 *
 * Usage (from repo root or infra/):
 *   node infra/scripts/logs.mjs              → interactive picker
 *   node infra/scripts/logs.mjs characters   → tail the characters Lambda
 *   node infra/scripts/logs.mjs dndbeyond    → tail the D&D Beyond Lambda
 *
 * Available names: characters, macros, sharing, dndbeyond, me, admin
 *
 * Reads AWS_PROFILE from packages/frontend/.env.local automatically.
 */
import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── AWS profile (same logic as deploy.mjs) ────────────────────────────────────
const envLocalPath = join(__dirname, '../../packages/frontend/.env.local');
let envLocalProfile;
if (existsSync(envLocalPath)) {
  for (const line of readFileSync(envLocalPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key === 'AWS_PROFILE' && val) { envLocalProfile = val; break; }
  }
}
if (envLocalProfile) process.env.AWS_PROFILE = envLocalProfile;

const profile = process.env.AWS_PROFILE;
const profileFlag = profile ? ` --profile ${profile}` : '';
if (profile) console.log(`🔑  AWS profile: ${profile}\n`);

// ── Discover Lambda function names from CloudFormation ────────────────────────
const STACK = 'DiceRollerApp';
const FRIENDLY = {
  MeFn:         'me',
  CharactersFn: 'characters',
  MacrosFn:     'macros',
  SharingFn:    'sharing',
  DndBeyondFn:  'dndbeyond',
  AdminFn:      'admin',
};

function getLambdas() {
  try {
    const raw = execSync(
      `aws${profileFlag} cloudformation describe-stack-resources ` +
      `--stack-name ${STACK} --query "StackResources[?ResourceType=='AWS::Lambda::Function']" ` +
      `--output json`,
      { encoding: 'utf8' }
    );
    const resources = JSON.parse(raw);
    const result = {};
    for (const r of resources) {
      const friendly = Object.entries(FRIENDLY).find(([k]) => r.LogicalResourceId.includes(k));
      if (friendly) result[friendly[1]] = r.PhysicalResourceId;
    }
    return result;
  } catch {
    console.error('❌  Could not list Lambda functions. Check your AWS profile and stack name.');
    process.exit(1);
  }
}

// ── Tail logs ─────────────────────────────────────────────────────────────────
function tailLogs(functionName) {
  const logGroup = `/aws/lambda/${functionName}`;
  console.log(`📋  Tailing: ${logGroup}`);
  console.log('    Press Ctrl+C to stop.\n');

  const args = ['logs', 'tail', logGroup, '--follow', '--format', 'short'];
  if (profile) args.unshift('--profile', profile);

  const proc = spawn('aws', args, { stdio: 'inherit' });
  proc.on('exit', code => process.exit(code ?? 0));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const lambdas = getLambdas();

  if (Object.keys(lambdas).length === 0) {
    console.error('❌  No Lambda functions found in stack. Has the app been deployed?');
    process.exit(1);
  }

  const arg = process.argv[2]?.toLowerCase();
  if (arg) {
    const fn = lambdas[arg];
    if (!fn) {
      console.error(`❌  Unknown function "${arg}". Available: ${Object.keys(lambdas).join(', ')}`);
      process.exit(1);
    }
    tailLogs(fn);
    return;
  }

  // Interactive picker
  const entries = Object.entries(lambdas);
  console.log('Available Lambda functions:\n');
  entries.forEach(([name, fn], i) => console.log(`  ${i + 1}. ${name.padEnd(12)} ${fn}`));
  console.log();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Pick a function (number or name): ', answer => {
    rl.close();
    const num = parseInt(answer, 10);
    let fn;
    if (!isNaN(num) && num >= 1 && num <= entries.length) {
      fn = entries[num - 1][1];
    } else {
      fn = lambdas[answer.toLowerCase()];
    }
    if (!fn) {
      console.error(`❌  Not found: "${answer}"`);
      process.exit(1);
    }
    tailLogs(fn);
  });
}

main();
