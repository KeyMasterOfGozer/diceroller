#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/infra"
FRONTEND_DIR="$SCRIPT_DIR/packages/frontend"

echo ""
echo "🚀  D&D Dice Roller — full deploy"
echo "════════════════════════════════════"

# ── 1. Install deps ───────────────────────────────────────────────────────────
echo ""
echo "📦  Installing dependencies…"
npm install --prefix "$SCRIPT_DIR" --silent

# ── 2. Deploy CDK stacks (bundles & deploys Lambda at the same time) ──────────
echo ""
echo "☁️   Deploying AWS infrastructure (CDK)…"
echo "    This bundles and deploys all Lambda functions."
echo ""
cd "$INFRA_DIR"
npm run deploy -- --require-approval never

# ── 3. Build frontend ─────────────────────────────────────────────────────────
echo ""
echo "🔨  Building frontend…"
cd "$FRONTEND_DIR"

ENV_FILE="$FRONTEND_DIR/.env.local"
if [[ ! -f "$ENV_FILE" ]]; then
  echo ""
  echo "⚠️  No .env.local found — frontend will be built with placeholder env vars."
  echo "   Copy packages/frontend/.env.example to packages/frontend/.env.local"
  echo "   and fill in the CDK stack outputs before building."
  echo ""
fi

npm run build

# ── 4. Sync frontend to S3 + invalidate CloudFront ───────────────────────────
echo ""
echo "⬆️   Uploading frontend to S3 and invalidating CloudFront…"
node "$FRONTEND_DIR/scripts/deploy.mjs"

echo ""
echo "════════════════════════════════════"
echo "✅  Deploy complete!"
echo ""
echo "   Frontend: https://diceroller.oldforest.net"
echo "   API:      check VITE_API_URL in packages/frontend/.env.local"
echo ""
echo "   If this was a first deploy, copy the CDK outputs into .env.local:"
echo "     packages/frontend/.env.local"
echo ""
