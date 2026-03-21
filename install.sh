#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  ScrumBoard – Installations-Skript (Linux / macOS)
# ─────────────────────────────────────────────────────────────────────────────
# Kein set -e: Tool-Checks dürfen fehlschlagen ohne das Skript abzubrechen.
set -uo pipefail

# ── Farben ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "  ${GREEN}✅ $*${RESET}"; }
fail() { echo -e "  ${RED}❌ $*${RESET}"; }
warn() { echo -e "  ${YELLOW}⚠️  $*${RESET}"; }
info() { echo -e "  ${CYAN}ℹ️  $*${RESET}"; }
head() { echo -e "\n${BOLD}${YELLOW}── $* ─────────────────────────────────────${RESET}"; }

# ── Hilfsfunktionen ───────────────────────────────────────────────────────────
ask() {
  local prompt="$1" default="$2" varname="$3"
  read -rp "  ${prompt} [${default}]: " _val
  eval "${varname}=\"${_val:-${default}}\""
}

ask_secret() {
  local prompt="$1" varname="$2"
  read -rsp "  ${prompt} (leer = nicht nutzen): " _val
  echo
  eval "${varname}=\"${_val}\""
}

confirm() {
  read -rp "  $1 [J/n]: " _c
  [[ "${_c:-J}" =~ ^[Jj] ]]
}

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════╗"
echo "║      🚀  ScrumBoard – Installation           ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${RESET}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ═════════════════════════════════════════════════════════════════════════════
head "1 / 4  Konfiguration"
# ═════════════════════════════════════════════════════════════════════════════

ask "Backend-Port"   "3001" BACKEND_PORT
ask "Frontend-Port"  "5173" FRONTEND_PORT

echo ""
echo -e "  ${BOLD}LLM-Backend:${RESET}"
echo "    1) gpt-4o-mini   (GitHub Models – Standard, kostenlos)"
echo "    2) gpt-4o        (GitHub Models – leistungsstärker)"
echo "    3) llama3.2      (Ollama – lokal, kein API-Key)"
echo "    4) Eigene Eingabe"
read -rp "  Auswahl [1]: " _llm_choice
case "${_llm_choice:-1}" in
  2) LLM_MODEL="gpt-4o" ;;
  3) LLM_MODEL="llama3.2" ;;
  4) ask "Modellname" "gpt-4o-mini" LLM_MODEL ;;
  *) LLM_MODEL="gpt-4o-mini" ;;
esac
ok "Modell: ${LLM_MODEL}"

echo ""
read -rp "  Ollama-URL (leer = nicht nutzen, z.B. http://localhost:11434): " OLLAMA_URL
ask_secret "OpenAI API Key" OPENAI_API_KEY

echo ""
ask "Basisverzeichnis für neue Projekte" "${HOME}/ScrumProjects" PROJECTS_BASE_DIR
mkdir -p "${PROJECTS_BASE_DIR}" && ok "Verzeichnis erstellt: ${PROJECTS_BASE_DIR}" \
  || warn "Konnte Verzeichnis nicht erstellen – bitte manuell anlegen: ${PROJECTS_BASE_DIR}"

# ═════════════════════════════════════════════════════════════════════════════
head "2 / 4  Tool-Check"
# ═════════════════════════════════════════════════════════════════════════════

HAS_NODE=false; HAS_NPM=false; HAS_GH=false; HAS_COPILOT=false; HAS_AUTH=false

# Node.js
if command -v node &>/dev/null; then
  NODE_VER=$(node --version)
  ok "node ${NODE_VER}"
  HAS_NODE=true
  # Mindestanforderung Node 18
  NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v\([0-9]*\).*/\1/')
  [[ "$NODE_MAJOR" -lt 18 ]] && warn "Node.js 18 oder neuer empfohlen (aktuell: ${NODE_VER})"
else
  fail "node nicht gefunden → https://nodejs.org/"
fi

# npm
if command -v npm &>/dev/null; then
  ok "npm $(npm --version)"
  HAS_NPM=true
else
  fail "npm nicht gefunden (wird mit Node.js installiert)"
fi

# git
command -v git &>/dev/null && ok "git $(git --version | awk '{print $3}')" \
  || warn "git nicht gefunden → https://git-scm.com/"

# gh CLI – 3-stufiger Check:
#   (1) gh-Binary vorhanden?
#   (2) gh copilot-Erweiterung installiert?
#   (3) Bei GitHub angemeldet (gh auth status)?
if command -v gh &>/dev/null; then
  GH_VER=$(gh --version 2>/dev/null | head -1)
  ok "gh CLI – ${GH_VER}"
  HAS_GH=true

  # Copilot-Erweiterung
  if gh extension list 2>/dev/null | grep -qi copilot; then
    ok "gh copilot-Erweiterung installiert"
    HAS_COPILOT=true
  else
    fail "gh copilot-Erweiterung fehlt"
    if confirm "Jetzt installieren? (gh extension install github/gh-copilot)"; then
      gh extension install github/gh-copilot && HAS_COPILOT=true && ok "gh copilot installiert"
    else
      info "Später installieren: gh extension install github/gh-copilot"
    fi
  fi

  # Authentifizierung
  if gh auth status &>/dev/null 2>&1; then
    GH_USER=$(gh api user --jq '.login' 2>/dev/null || echo "unbekannt")
    ok "Bei GitHub angemeldet als: ${GH_USER}"
    HAS_AUTH=true
  else
    fail "Nicht bei GitHub angemeldet"
    if confirm "Jetzt anmelden? (gh auth login)"; then
      gh auth login && HAS_AUTH=true && ok "Anmeldung erfolgreich"
    else
      warn "GitHub-Anmeldung erforderlich damit LLM-Agents funktionieren: gh auth login"
    fi
  fi
else
  fail "gh CLI nicht gefunden → https://cli.github.com/"
  info "Ohne gh CLI funktionieren die LLM-Agents nur mit OPENAI_API_KEY oder OLLAMA_URL"
fi

# ═════════════════════════════════════════════════════════════════════════════
head "3 / 4  .env-Dateien erstellen"
# ═════════════════════════════════════════════════════════════════════════════

# server/.env
{
  echo "# ScrumBoard Backend – automatisch generiert von install.sh"
  echo "PORT=${BACKEND_PORT}"
  echo "PROJECTS_BASE_DIR=${PROJECTS_BASE_DIR}"
  echo "CLIENT_PORT=${FRONTEND_PORT}"
  echo ""
  echo "# LLM-Konfiguration"
  echo "LLM_MODEL=${LLM_MODEL}"
  [[ -n "${OLLAMA_URL:-}" ]]   && echo "OLLAMA_URL=${OLLAMA_URL}"
  [[ -n "${OPENAI_API_KEY:-}" ]] && echo "OPENAI_API_KEY=${OPENAI_API_KEY}"
} > server/.env
ok "server/.env geschrieben"

# client/.env
{
  echo "# ScrumBoard Frontend – automatisch generiert von install.sh"
  echo "VITE_PORT=${FRONTEND_PORT}"
  echo "VITE_BACKEND_PORT=${BACKEND_PORT}"
} > client/.env
ok "client/.env geschrieben"

# ═════════════════════════════════════════════════════════════════════════════
head "4 / 4  Abhängigkeiten installieren"
# ═════════════════════════════════════════════════════════════════════════════

if $HAS_NPM; then
  npm run install:all
  ok "npm install abgeschlossen"
else
  warn "npm nicht gefunden – bitte manuell ausführen: npm run install:all"
fi

# ── Zusammenfassung ───────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════╗"
echo "║  🎉  Installation abgeschlossen!             ║"
echo "║                                              ║"
printf "║  Start:  %-37s║\n" "npm run dev"
printf "║  Backend:  http://localhost:%-17s║\n" "${BACKEND_PORT}"
printf "║  Frontend: http://localhost:%-17s║\n" "${FRONTEND_PORT}"
echo "║                                              ║"
if ! $HAS_GH; then
echo "║  ⚠️  gh CLI fehlt – LLM-Agents inaktiv       ║"
fi
if $HAS_GH && ! $HAS_AUTH; then
echo "║  ⚠️  gh auth login erforderlich              ║"
fi
echo "╚══════════════════════════════════════════════╝"
echo -e "${RESET}"
