#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/packages/frontend"
ENV_FILE="$FRONTEND_DIR/.env.local"
ENV_EXAMPLE="$FRONTEND_DIR/.env.example"

# ── Check .env.local ──────────────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  echo ""
  echo "⚠️  No .env.local found in packages/frontend/"
  echo ""
  echo "   Copy the example and fill in your AWS values:"
  echo "   cp packages/frontend/.env.example packages/frontend/.env.local"
  echo ""
  echo "   Values come from your CDK stack outputs (run ./deploy.sh to get them)."
  echo ""
  exit 1
fi

# Warn if any placeholder values are still present
if grep -q "XXXXXXXXX\|xxxxxxxxx" "$ENV_FILE" 2>/dev/null; then
  echo ""
  echo "⚠️  .env.local still contains placeholder values — update it with real CDK outputs."
  echo ""
fi

# ── Install deps if needed ────────────────────────────────────────────────────
if [[ ! -d "$SCRIPT_DIR/node_modules" ]]; then
  echo "📦  Installing dependencies…"
  npm install --prefix "$SCRIPT_DIR"
fi

# ── Start Vite dev server ─────────────────────────────────────────────────────
echo ""
echo "🎲  Starting D&D Dice Roller dev server…"
echo "    Frontend → http://localhost:5173"
echo "    Backend  → your deployed AWS API (see VITE_API_URL in .env.local)"
echo ""

cd "$FRONTEND_DIR"
exec npm run dev
