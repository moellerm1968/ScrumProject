#Requires -Version 5.1
<#
.SYNOPSIS
    ScrumBoard – Installationsskript für Windows (PowerShell)
.DESCRIPTION
    Konfiguriert Ports und LLM, prüft benötigte Tools (Node, gh CLI, Copilot)
    und erstellt die .env-Dateien.
.EXAMPLE
    .\install.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Hilfsfunktionen ───────────────────────────────────────────────────────────
function Write-Ok($msg)   { Write-Host "  ✅ $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "  ❌ $msg" -ForegroundColor Red }
function Write-Warn($msg) { Write-Host "  ⚠️  $msg" -ForegroundColor Yellow }
function Write-Info($msg) { Write-Host "  ℹ️  $msg" -ForegroundColor Cyan }
function Write-Head($msg) { Write-Host "`n── $msg " -ForegroundColor Yellow -NoNewline; Write-Host ("─" * (44 - $msg.Length)) -ForegroundColor Yellow }

function Ask-Input {
    param([string]$Prompt, [string]$Default)
    $val = Read-Host "  $Prompt [$Default]"
    if ([string]::IsNullOrWhiteSpace($val)) { $Default } else { $val.Trim() }
}

function Ask-Secret {
    param([string]$Prompt)
    $val = Read-Host "  $Prompt (leer = nicht nutzen)"
    $val.Trim()
}

function Confirm-Action {
    param([string]$Prompt)
    $val = Read-Host "  $Prompt [J/n]"
    return ($val -eq '' -or $val -match '^[Jj]')
}

function Test-Tool {
    param([string]$Name, [string]$Hint)
    if (Get-Command $Name -ErrorAction SilentlyContinue) {
        Write-Ok "$Name gefunden"
        return $true
    } else {
        Write-Fail "$Name nicht gefunden → $Hint"
        return $false
    }
}

# ── Banner ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║      🚀  ScrumBoard – Installation           ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# ══════════════════════════════════════════════════════════════════════════════
Write-Head "1 / 4  Konfiguration"
# ══════════════════════════════════════════════════════════════════════════════

$BackendPort  = Ask-Input "Backend-Port"  "3001"
$FrontendPort = Ask-Input "Frontend-Port" "5173"

Write-Host ""
Write-Host "  LLM-Backend:" -ForegroundColor White
Write-Host "    1) gpt-4o-mini   (GitHub Models – Standard, kostenlos)"
Write-Host "    2) gpt-4o        (GitHub Models – leistungsstärker)"
Write-Host "    3) llama3.2      (Ollama – lokal, kein API-Key)"
Write-Host "    4) Eigene Eingabe"
$llmChoice = Read-Host "  Auswahl [1]"
$LlmModel = switch ($llmChoice) {
    '2' { 'gpt-4o' }
    '3' { 'llama3.2' }
    '4' { Ask-Input "Modellname" "gpt-4o-mini" }
    default { 'gpt-4o-mini' }
}
Write-Ok "Modell: $LlmModel"

Write-Host ""
$OllamaUrl  = Ask-Secret "Ollama-URL (z.B. http://localhost:11434)"
$OpenAiKey  = Ask-Secret "OpenAI API Key"

Write-Host ""
$DefaultBase     = Join-Path $env:USERPROFILE "ScrumProjects"
$ProjectsBaseDir = Ask-Input "Basisverzeichnis für neue Projekte" $DefaultBase

if (-not (Test-Path $ProjectsBaseDir)) {
    try {
        New-Item -ItemType Directory -Path $ProjectsBaseDir -Force | Out-Null
        Write-Ok "Verzeichnis erstellt: $ProjectsBaseDir"
    } catch {
        Write-Warn "Konnte Verzeichnis nicht erstellen – bitte manuell anlegen: $ProjectsBaseDir"
    }
} else {
    Write-Ok "Verzeichnis vorhanden: $ProjectsBaseDir"
}

# ══════════════════════════════════════════════════════════════════════════════
Write-Head "2 / 4  Tool-Check"
# ══════════════════════════════════════════════════════════════════════════════

$HasNode = $false; $HasNpm = $false; $HasGh = $false
$HasCopilot = $false; $HasAuth = $false

# Node.js
if (Get-Command 'node' -ErrorAction SilentlyContinue) {
    $nodeVer = (node --version 2>$null)
    Write-Ok "node $nodeVer"
    $HasNode = $true
    $nodeMajor = [int]($nodeVer -replace 'v(\d+).*','$1')
    if ($nodeMajor -lt 18) { Write-Warn "Node.js 18 oder neuer empfohlen (aktuell: $nodeVer)" }
} else {
    Write-Fail "node nicht gefunden → https://nodejs.org/"
}

# npm
if (Test-Tool 'npm' 'wird mit Node.js installiert') { $HasNpm = $true }

# git
Test-Tool 'git' 'https://git-scm.com/' | Out-Null

# gh CLI – 3-stufiger Check:
#   (1) gh-Binary vorhanden?
#   (2) gh copilot-Erweiterung installiert?
#   (3) Bei GitHub angemeldet (gh auth status)?
if (Get-Command 'gh' -ErrorAction SilentlyContinue) {
    $ghVer = (gh --version 2>$null | Select-Object -First 1)
    Write-Ok "gh CLI – $ghVer"
    $HasGh = $true

    # Copilot-Erweiterung
    $extList = (gh extension list 2>$null) -join "`n"
    if ($extList -match 'copilot') {
        Write-Ok "gh copilot-Erweiterung installiert"
        $HasCopilot = $true
    } else {
        Write-Fail "gh copilot-Erweiterung fehlt"
        if (Confirm-Action "Jetzt installieren? (gh extension install github/gh-copilot)") {
            gh extension install github/gh-copilot
            $HasCopilot = $true
            Write-Ok "gh copilot installiert"
        } else {
            Write-Info "Später installieren: gh extension install github/gh-copilot"
        }
    }

    # Authentifizierung
    $authOut = gh auth status 2>&1
    if ($LASTEXITCODE -eq 0) {
        $ghUser = (gh api user --jq '.login' 2>$null) -replace "`n",''
        Write-Ok "Bei GitHub angemeldet als: $ghUser"
        $HasAuth = $true
    } else {
        Write-Fail "Nicht bei GitHub angemeldet"
        if (Confirm-Action "Jetzt anmelden? (gh auth login)") {
            gh auth login
            $HasAuth = $true
            Write-Ok "Anmeldung erfolgreich"
        } else {
            Write-Warn "GitHub-Anmeldung erforderlich damit LLM-Agents funktionieren: gh auth login"
        }
    }
} else {
    Write-Fail "gh CLI nicht gefunden → https://cli.github.com/"
    Write-Info "Ohne gh CLI funktionieren LLM-Agents nur mit OPENAI_API_KEY oder OLLAMA_URL"
}

# ══════════════════════════════════════════════════════════════════════════════
Write-Head "3 / 4  .env-Dateien erstellen"
# ══════════════════════════════════════════════════════════════════════════════

$serverLines = @(
    "# ScrumBoard Backend – automatisch generiert von install.ps1",
    "PORT=$BackendPort",
    "PROJECTS_BASE_DIR=$ProjectsBaseDir",
    "CLIENT_PORT=$FrontendPort",
    "",
    "# LLM-Konfiguration",
    "LLM_MODEL=$LlmModel"
)
if (-not [string]::IsNullOrWhiteSpace($OllamaUrl)) { $serverLines += "OLLAMA_URL=$OllamaUrl" }
if (-not [string]::IsNullOrWhiteSpace($OpenAiKey)) { $serverLines += "OPENAI_API_KEY=$OpenAiKey" }

Set-Content -Path "server\.env" -Value ($serverLines -join "`n") -Encoding UTF8
Write-Ok "server\.env geschrieben"

$clientLines = @(
    "# ScrumBoard Frontend – automatisch generiert von install.ps1",
    "VITE_PORT=$FrontendPort",
    "VITE_BACKEND_PORT=$BackendPort"
)
Set-Content -Path "client\.env" -Value ($clientLines -join "`n") -Encoding UTF8
Write-Ok "client\.env geschrieben"

# ══════════════════════════════════════════════════════════════════════════════
Write-Head "4 / 4  Abhängigkeiten installieren"
# ══════════════════════════════════════════════════════════════════════════════

if ($HasNpm) {
    npm run install:all
    Write-Ok "npm install abgeschlossen"
} else {
    Write-Warn "npm nicht gefunden – bitte manuell ausführen: npm run install:all"
}

# ── Zusammenfassung ───────────────────────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  🎉  Installation abgeschlossen!             ║" -ForegroundColor Cyan
Write-Host "║                                              ║" -ForegroundColor Cyan
Write-Host "║  Start:    npm run dev                       ║" -ForegroundColor Cyan
Write-Host ("║  Backend:  http://localhost:{0,-19}║" -f "$BackendPort") -ForegroundColor Cyan
Write-Host ("║  Frontend: http://localhost:{0,-19}║" -f "$FrontendPort") -ForegroundColor Cyan
Write-Host "║                                              ║" -ForegroundColor Cyan
if (-not $HasGh)   { Write-Host "║  ⚠️  gh CLI fehlt – LLM-Agents inaktiv       ║" -ForegroundColor Yellow }
if (-not $HasAuth) { Write-Host "║  ⚠️  gh auth login erforderlich              ║" -ForegroundColor Yellow }
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
