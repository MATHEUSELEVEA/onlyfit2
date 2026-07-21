#!/usr/bin/env bash
# Build do Vite e sincroniza os assets gerados com o app iOS Capacitor.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env && ! -f .env.local ]]; then
  echo "Aviso: sem .env — o build Vite pode falhar sem VITE_SUPABASE_*." >&2
fi

echo "→ npm run build"
npm run build

echo "→ npx cap sync ios"
npx cap sync ios

# Garante que o bundle nativo recebeu os assets web.
if [[ ! -f ios/App/App/public/index.html ]]; then
  echo "Erro: ios/App/App/public/index.html não foi gerado." >&2
  exit 1
fi

echo "Pronto. Abra ios/App/App.xcworkspace no Xcode."
