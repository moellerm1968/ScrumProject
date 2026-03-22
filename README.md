# 🚀 ScrumBoard — KI-gestütztes Scrum-Projektmanagement

Ein vollständiges Scrum-Board mit integriertem KI-Agenten-Team, das automatisch User Stories, technische Anforderungen und Architekturdokumente generiert — und den Fortschritt live im Browser streamt.

---

## Überblick

ScrumBoard kombiniert ein klassisches Kanban-Board mit einem virtuellen Scrum-Team aus KI-Agenten. Sobald ein neues Feature angelegt wird, startet automatisch ein mehrstufiger Workflow:

```
Susi (Scrum Master)
  └─► Peter (Product Owner)       → generiert User Stories (US-001, US-002, …)
        └─► Tobias (Techn. PO)    → generiert Technische User Stories (TUS-001, …)
                                     + Architecture.md
              └─► Refinement      → jede Story wird einzeln verfeinert (status: refined)
```

Alle Zwischenstände werden **live per SSE** in die Feature-Detailseite gestreamt — kein Reload nötig.

---

## Features

| Bereich | Details |
|---|---|
| **Projektstruktur** | Projekte → Features → User Stories (dreistufige Hierarchie) |
| **Kanban-Board** | Spalten: `Neu · Verfeinert · In Bearbeitung · Erledigt` |
| **User Stories** | Automatisch numeriert (US-001…), mit Abnahmekriterien |
| **Technische Stories** | TUS-001…, gebunden an Component + verknüpfte US |
| **Architecture.md** | Pro Feature automatisch generiert und aktualisiert |
| **Agent Feed** | Echtzeit-SSE-Stream aller Agent-Aktivitäten (rechte Spalte) |
| **Live-Updates** | Feature-Detailseite aktualisiert sich per SSE während Agenten arbeiten |
| **LLM-Status** | Aktives Backend wird in der Fußzeile angezeigt (inkl. Cooldown-Info) |
| **Dateiablage** | Alle Artefakte landen in `PROJECTS_BASE_DIR/<projektId>/<featureId>/` |

---

## Tech-Stack

```
Frontend         React 18 · Vite 5 · Tailwind CSS 3 · React Router 6
Backend          Node.js (ESM) · Express 4 · dotenv
Persistierung    JSON-Dateien (keine Datenbank erforderlich)
Echtzeit         Server-Sent Events (SSE) — Agent Feed + Feature Live-Updates
KI-Agenten       Ollama (lokal) | GitHub Models CLI | Anthropic | OpenAI
Tests            Playwright
```

---

## Virtuelles Team

| Agent | Rolle | Aufgabe |
|---|---|---|
| **Susi** | Scrum Master | Orchestriert den Workflow, schreibt SM-Protokoll |
| **Peter** | Product Owner | Erstellt fachliche User Stories mit Abnahmekriterien |
| **Tobias** | Technischer PO | Erstellt technische Stories + Architecture.md |
| **Felix** | Frontend-Entwickler | Refinement & Umsetzung UI |
| **Bernd** | Backend-Entwickler | Refinement & Umsetzung API |
| **David** | Datenbank-Entwickler | Datenmodell & Migrationen |
| **Konstantin** | Cost & Budget Manager | Aufwandsschätzung & Budget-Controlling |

Die Agent-Prompts liegen in `team/*.Agent.md` und können projektspezifisch in `<workDir>/.github/agents/` überschrieben werden.

---

## LLM-Backend — Prioritätskette

Das Backend wählt automatisch das erste verfügbare LLM in dieser Reihenfolge:

```
1. Ollama          (wenn OLLAMA_URL gesetzt)
2. GitHub Models   (Standard, kostenlos via GITHUB_TOKEN / gh auth token)
                    ↳ Bei Fehler/Rate-Limit: 5 min Cooldown, dann weiter
3. Anthropic       (wenn ANTHROPIC_API_KEY gesetzt)
4. OpenAI          (wenn OPENAI_API_KEY gesetzt)
5. Fehler          (kein Backend konfiguriert)
```

Das aktive Backend wird in der **LLM-Status-Leiste** am unteren Bildschirmrand angezeigt. Während eines GitHub-Models-Cooldowns erscheint dort der Fallback (z. B. `Anthropic (claude-haiku…)`).

---

## Voraussetzungen

| Tool | Mindestversion | Wozu |
|---|---|---|
| **Node.js** | 18+ | Laufzeitumgebung |
| **npm** | 9+ | Paketverwaltung |
| **git** | beliebig | Versionskontrolle |
| **gh CLI** | beliebig | GitHub-Authentifizierung (für GitHub Models, optional) |

> **Hinweis:** `gh CLI` wird nur benötigt falls kein `GITHUB_TOKEN` gesetzt ist (`gh auth login`).
> Alternativ können Anthropic, OpenAI oder Ollama verwendet werden — kein `gh`-Login erforderlich.

---

## Installation

### Option A — Automatisch (empfohlen)

**Linux / macOS:**
```bash
chmod +x install.sh
./install.sh
```

**Windows (PowerShell als Admin):**
```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
.\install.ps1
```

Das Skript führt interaktiv durch folgende Schritte:
1. **Konfiguration** — Ports, LLM-Modell, Verzeichnisse
2. **Tool-Check** — Node, npm, git, gh CLI, Authentifizierung
3. **LLM-Auswahl** — GitHub Models CLI (Standard), Anthropic API-Key, OpenAI
4. **.env-Dateien** — werden automatisch generiert
5. **npm install** — alle Abhängigkeiten werden installiert

---

### Option B — Manuell

```bash
# 1. Abhängigkeiten installieren
npm run install:all

# 2. Backend konfigurieren
cp server/.env.example server/.env
# server/.env anpassen (Port, Verzeichnis, LLM-Konfiguration)

# 3. Frontend konfigurieren
cp client/.env.example client/.env

# 4. Dev-Server starten
npm run dev
```

---

## Konfiguration

### `server/.env`

```env
# Server
PORT=3001
PROJECTS_BASE_DIR=/home/user/ScrumProjects
CLIENT_PORT=5173                        # für CORS-Whitelist

# Modellname (für GitHub Models CLI und OpenAI)
LLM_MODEL=gpt-4o-mini

# Pause zwischen LLM-Anfragen in ms (verhindert Rate-Limits, Standard: 5000)
LLM_DELAY_MS=5000

# LLM-Option 1: GitHub Models via REST (Standard, kostenlos via GITHUB_TOKEN / gh auth token)
# GITHUB_TOKEN=ghp_...

# LLM-Option 2: Ollama (lokal, kein API-Key)
# OLLAMA_URL=http://localhost:11434
# OLLAMA_MODEL=llama3.2

# LLM-Option 3: Anthropic (Fallback bei Rate-Limits)
# ANTHROPIC_API_KEY=sk-ant-...
# ANTHROPIC_MODEL=claude-haiku-4-5-20251001

# LLM-Option 4: OpenAI-kompatible API
# OPENAI_API_KEY=sk-...
# OPENAI_API_URL=https://api.openai.com/v1/chat/completions
```

### `client/.env`

```env
VITE_PORT=5173
VITE_BACKEND_PORT=3001
```

---

## Starten

```bash
# Backend + Frontend gleichzeitig
npm run dev

# Einzeln:
npm run dev --prefix server     # → http://localhost:3001
npm run dev --prefix client     # → http://localhost:5173
```

---

## LLM-Backend konfigurieren

### GitHub Models REST (Standard, kostenlos)
```bash
gh auth login
# server/.env:
# GITHUB_TOKEN=ghp_...   # optional, sonst wird gh auth token verwendet
# LLM_MODEL=gpt-4o-mini
```

### Ollama (lokal, kein Internet)
```bash
ollama pull llama3.2
# server/.env:
# OLLAMA_URL=http://localhost:11434
# OLLAMA_MODEL=llama3.2
```

### Anthropic
```bash
# server/.env:
# ANTHROPIC_API_KEY=sk-ant-...
# ANTHROPIC_MODEL=claude-haiku-4-5-20251001
```

### OpenAI
```bash
# server/.env:
# OPENAI_API_KEY=sk-...
# LLM_MODEL=gpt-4o
```

---

## Tests

```bash
# Alle Playwright-Tests ausführen
npm test

# Mit interaktiver UI
npm run test:ui

# HTML-Report öffnen
npm run test:report
```

> Beim ersten Ausführen muss Playwright die Browser einmalig herunterladen:
> `npx playwright install --with-deps`

---

## Projektstruktur

```
ScrumProject/
├── client/                    React-Frontend (Vite)
│   ├── src/
│   │   ├── App.jsx            Zweispaltiges Layout + SSE-Feed + LLM-Status-Leiste
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx        Projekt-Übersicht
│   │   │   ├── ProjectDetail.jsx    Features eines Projekts
│   │   │   └── FeatureDetail.jsx    Stories + Live-Updates via SSE
│   │   └── components/
│   │       ├── AgentFeed.jsx        Echtzeit-Ereignisanzeige
│   │       ├── KanbanBoard.jsx      Kanban mit Drag & Drop
│   │       └── …
│   └── .env.example
├── server/                    Express-Backend (ESM)
│   ├── server.js              REST-API + SSE-Endpoints
│   ├── agents/
│   │   ├── agentRunner.js     LLM-Kette (Ollama → GH CLI → Anthropic → OpenAI)
│   │   ├── smOrchestrator.js  SM → PO → TPO Workflow mit onProgress-Callback
│   │   └── eventBus.js        SSE-Event-Bus
│   └── .env.example
├── team/                      Agent-Prompt-Dateien (*.Agent.md)
├── tests/                     Playwright-Tests
│   ├── project-creation.spec.js
│   └── vier-gewinnt.spec.js
├── install.sh                 Installer Linux/macOS
├── install.ps1                Installer Windows
└── playwright.config.js
```

---

## Agent-Workflow im Detail

Nach dem Anlegen eines Features:

1. **Susi (SM)** liest Feature-Name und -Beschreibung, formuliert eine Direktive an Peter
2. **Peter (PO)** empfängt die Direktive, generiert 3–6 User Stories als JSON
   → gespeichert in `<PROJECTS_BASE_DIR>/<projektId>/<featureId>/Userstories.md`
   → **SSE `feature:update`** — Feature-Detailseite zeigt Stories sofort an
3. **Tobias (TPO)** liest alle User Stories, erstellt technische Stories (TUS) + `Architecture.md`
   → **SSE `feature:update`** — TUS erscheinen live
4. Für jede Story: **Refinement** durch die zuständigen Entwickler-Agenten
   → nach jeder Story: **SSE `feature:update`** mit `status: refined`
5. Alle Agent-Ereignisse laufen parallel über den **Agent Feed** (rechte Spalte)

**SSE-Event-Typen:**

| Typ | Bedeutung |
|---|---|
| `agent:start` | Agent beginnt seine Aufgabe |
| `agent:done` | Agent hat seine Aufgabe abgeschlossen |
| `agent:error` | Fehler bei einem Agenten |
| `feature:update` | Stories wurden aktualisiert → UI neu laden |

---

## API-Endpunkte (Auswahl)

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/api/projects` | Alle Projekte |
| `POST` | `/api/projects` | Neues Projekt anlegen |
| `GET` | `/api/projects/:id/features` | Features eines Projekts |
| `POST` | `/api/projects/:id/features` | Neues Feature → startet Agent-Workflow |
| `GET` | `/api/projects/:id/features/:fid` | Feature mit Stories |
| `GET` | `/api/events` | SSE-Stream (Agent Feed + Feature Live-Updates) |
| `GET` | `/api/llm-status` | Aktives LLM-Backend |

---

## Lizenz

MIT
