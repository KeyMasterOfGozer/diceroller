#!/usr/bin/env node
/**
 * Deploys the built frontend to S3 and invalidates the CloudFront cache.
 * Reads bucket name and distribution ID from CDK stack outputs automatically.
 *
 * Usage:
 *   npm run deploy          (from packages/frontend)
 *   node scripts/deploy.mjs
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '../dist');

// ── Verify build output exists ────────────────────────────────────────────────
if (!existsSync(distDir)) {
  console.error('❌  dist/ not found — run `npm run build` first.');
  process.exit(1);
}

// ── Fetch CDK stack outputs ───────────────────────────────────────────────────
function getOutput(stackName, key) {
  const raw = execSync(
    `aws cloudformation describe-stacks --stack-name ${stackName} ` +
    `--query "Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue" ` +
    `--output text`,
    { encoding: 'utf8' }
  ).trim();
  if (!raw || raw === 'None') {
    console.error(`❌  Could not find CloudFormation output "${key}" in stack "${stackName}".`);
    process.exit(1);
  }
  return raw;
}

console.log('🔍  Fetching stack outputs…');
const bucketName    = getOutput('DiceRollerApp', 'BucketName');
const distributionId = getOutput('DiceRollerApp', 'CloudFrontDistributionId');

console.log(`📦  Bucket:       ${bucketName}`);
console.log(`🌐  Distribution: ${distributionId}`);

// ── Sync to S3 ────────────────────────────────────────────────────────────────
console.log('\n⬆️   Syncing dist/ → S3…');
execSync(
  `aws s3 sync "${distDir}" s3://${bucketName} --delete --cache-control "public,max-age=31536000,immutable" ` +
  `--exclude "index.html"`,
  { stdio: 'inherit' }
);
// index.html must not be cached so the browser always gets the latest entry point
execSync(
  `aws s3 cp "${distDir}/index.html" s3://${bucketName}/index.html ` +
  `--cache-control "no-cache,no-store,must-revalidate"`,
  { stdio: 'inherit' }
);

// ── Invalidate CloudFront ─────────────────────────────────────────────────────
console.log('\n🔄  Invalidating CloudFront cache…');
execSync(
  `aws cloudfront create-invalidation --distribution-id ${distributionId} --paths "/*"`,
  { stdio: 'inherit' }
);

console.log('\n✅  Deploy complete!');
console.log('    https://diceroller.oldforest.net');
