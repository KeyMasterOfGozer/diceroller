#!/usr/bin/env node
/**
 * Deploys the built frontend to S3 and invalidates the CloudFront cache.
 * Reads bucket name and distribution ID from CDK stack outputs automatically.
 *
 * Usage:
 *   npm run deploy                          (uses AWS_PROFILE env var or default)
 *   AWS_PROFILE=myprofile npm run deploy    (named profile)
 *   node scripts/deploy.mjs
 */
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '../dist');

// ── AWS profile ───────────────────────────────────────────────────────────────
// Save the caller's AWS_PROFILE so we can restore it when done.
const savedProfile = process.env.AWS_PROFILE;

// Read AWS_PROFILE from .env.local if defined there, and override the env var.
const envLocalPath = join(__dirname, '../.env.local');
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
    if (key === 'AWS_PROFILE' && val) {
      envLocalProfile = val;
      break;
    }
  }
}

if (envLocalProfile) {
  process.env.AWS_PROFILE = envLocalProfile;
  console.log(`🔑  AWS profile (from .env.local): ${envLocalProfile}`);
} else if (savedProfile) {
  console.log(`🔑  AWS profile (from environment): ${savedProfile}`);
}

const profile = process.env.AWS_PROFILE;
const profileFlag = profile ? ` --profile ${profile}` : '';

// ── Verify build output exists ────────────────────────────────────────────────
if (!existsSync(distDir)) {
  console.error('❌  dist/ not found — run `npm run build` first.');
  process.exit(1);
}

// aws() helper — always places --profile immediately after `aws` (global option position)
function aws(args) {
  return execSync(`aws${profileFlag} ${args}`, { encoding: 'utf8' });
}
function awsInherit(args) {
  execSync(`aws${profileFlag} ${args}`, { stdio: 'inherit' });
}

// ── Fetch CDK stack outputs ───────────────────────────────────────────────────
function getOutput(stackName, key) {
  const raw = aws(
    `cloudformation describe-stacks --stack-name ${stackName} ` +
    `--query "Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue" ` +
    `--output text`
  ).trim();
  if (!raw || raw === 'None') {
    console.error(`❌  Could not find CloudFormation output "${key}" in stack "${stackName}".`);
    process.exit(1);
  }
  return raw;
}

console.log('🔍  Fetching stack outputs…');
const bucketName     = getOutput('DiceRollerApp', 'BucketName');
const distributionId = getOutput('DiceRollerApp', 'CloudFrontDistributionId');

console.log(`📦  Bucket:       ${bucketName}`);
console.log(`🌐  Distribution: ${distributionId}`);

// ── Sync to S3 ────────────────────────────────────────────────────────────────
console.log('\n⬆️   Syncing dist/ → S3…');
awsInherit(
  `s3 sync "${distDir}" s3://${bucketName} --delete ` +
  `--cache-control "public,max-age=31536000,immutable" --exclude "index.html"`
);
// index.html must not be cached so the browser always gets the latest entry point
awsInherit(
  `s3 cp "${distDir}/index.html" s3://${bucketName}/index.html ` +
  `--cache-control "no-cache,no-store,must-revalidate"`
);

// ── Invalidate CloudFront ─────────────────────────────────────────────────────
console.log('\n🔄  Invalidating CloudFront cache…');
awsInherit(
  `cloudfront create-invalidation --distribution-id ${distributionId} --paths "/*"`
);

console.log('\n✅  Deploy complete!');
console.log('    https://diceroller.oldforest.net');

// ── Restore AWS_PROFILE ───────────────────────────────────────────────────────
if (envLocalProfile) {
  if (savedProfile === undefined) {
    delete process.env.AWS_PROFILE;
  } else {
    process.env.AWS_PROFILE = savedProfile;
  }
}
