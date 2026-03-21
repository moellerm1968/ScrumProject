# 🚀 ScrumBoard — KI-gestütztes Scrum-Projektmanagement

Ein vollständiges Scrum-Board mit integriertem KI-Agenten-Team, das automatisch User Stories, technische Anforderungen und Architekturdokumente generiert.

---

## Überblick

ScrumBoard kombiniert ein klassisches Kanban-Board mit einem virtuellen Scrum-Team aus KI-Agenten. Sobald ein neues Feature angelegt wird, startet automatisch ein mehrstufiger Workflow:

```
Susi (Scrum Master)
  └─► Peter (Product Owner)       → generiert User Stories (US-001, US-002, …)
        └─► Tobias (Techn. PO)    → generiert Technische User Stories (TUS-001, …)
                                     + Architecture.md
```

Der gesamte Agent-Workflow wird live im integrierten **Agent Feed** (rechte Spalte) angezeigt.

---

## Features

| Bereich | Details |
|---|---|
| **Projektstruktur** | Projekte → Features → User Stories (dreistufige Hierarchie) |
| **Kanban-Board** | Spalten: `Neu · Verfeinert · In Bearbeitung · Erledigt` |
| **User Stories** | Automatisch numeriert (US-001…), mit Abnahmekriterien |
| **Technische Stories** | TUS-001…, gebunden an Component + verknüpfte US |
| **Architecture.md** | Pro Feature automatisch generiert und aktualisiert |
| **Agent Feed** | Echtzeit-SSE-Stream aller Agent-Aktivitäten |
| **Dateiablage** | Alle Artefakte landen in `PROJECTS_BASE_DIR/<projektId>/<featureId>/` |

---

## Tech-Stack

```
Frontend         React 18 · Vite 5 · Tailwind CSS 3 · React Router 6
Backend          Node.js (ESM) · Express 4 · dotenv
Persistierung    JSON-Dateien (keine Datenbank erforderlich)
Echtzeit         Server-Sent Events (SSE)
KI-Agenten       GitHub Models (gpt-4o-mini) | OpenAI | Ollama (lokal)
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

## Voraussetzungen

| Tool | Mindestversion | Wozu |
|---|---|---|
| **Node.js** | 18+ | Laufzeitumgebung |
| **npm** | 9+ | Paketverwaltung |
| **git** | beliebig | Versionskontrolle |
| **gh CLI** | beliebig | GitHub Models (Standard-LLM) |
| **gh copilot** Extension | – | via `gh extension install github/gh-copilot` |

> **Hinweis:** `gh CLI` und die Copilot-Extension werden nur für den GitHub-Models-Betrieb benötigt.  
> Alternativ können OpenAI oder Ollama (lokal) verwendet werden — dann ist kein `gh`-Login erforderlich.

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

Das Skript führt interaktiv durch 4 Phasen:
1. **Konfiguration** — Ports, LLM-Modell, Verzeichnisse
2. **Tool-Check** — Node, npm, git, gh CLI, Authentifizierung
3. **.env-Dateien** — werden automatisch aus den Eingaben generiert
4. **npm install** — alle Abhängigkeiten werden installiert

---

### Option B — Manuell

```bash
# 1. Abhängigkeiten installieren
npm run install:all

# 2. Backend konfigurieren
cp server/.env.example server/.env
# server/.env anpassen (Port, Verzeichnis, LLM-Modell)

# 3. Frontend konfigurieren
cp client/.env.example client/.env
# client/.env anpassen (Ports)

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
CLIENT_PORT=5173                      # für CORS-Whitelist

# LLM – Priorität: OLLAMA_URL > OPENAI_API_KEY > GitHub Models
LLM_MODEL=gpt-4o-mini

# Option A: Ollama (lokal, kein API-Key)
# OLLAMA_URL=http://localhost:11434
# OLLAMA_MODEL=llama3.2

# Option B: OpenAI-kompatible API
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
# Backend + Frontend gleichzeitig (mit farbiger Log-Ausgabe)
npm run dev

# Einzeln:
npm run dev --prefix server     # → http://localhost:3001
npm run dev --prefix client     # → http://localhost:5173
```

---

## LLM-Backend wählen

### GitHub Models (Standard, kostenlos)
```bash
gh auth login
# LLM_MODEL=gpt-4o-mini  (in server/.env)
```

### Ollama (lokal, kein Internet)
```bash
ollama pull llama3.2
# server/.env:
# OLLAMA_URL=http://localhost:11434
# OLLAMA_MODEL=llama3.2
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
├── client/                  React-Frontend (Vite)
│   ├── src/
│   │   ├── App.jsx          Zweispaltiges Layout + SSE-Feed
│   │   ├── pages/           ProjectList, FeatureDetail, …
│   │   └── components/      KanbanBoard, AgentFeed, …
│   └── .env.example
├── server/                  Express-Backend (ESM)
│   ├── server.js            REST-API + SSE-Endpoint
│   ├── agents/
│   │   ├── agentRunner.js   LLM-Wrapper (GitHub/OpenAI/Ollama)
│   │   ├── smOrchestrator.js  SM → PO → TPO Workflow
│   │   └── eventBus.js      SSE-Event-Bus
│   └── .env.example
├── team/                    Agent-Prompt-Dateien (*.Agent.md)
├── tests/                   Playwright-Tests
├── install.sh               Installer Linux/macOS
├── install.ps1              Installer Windows
└── playwright.config.js
```

---

## Agent-Workflow im Detail

Nach dem Anlegen eines Features:

1. **Susi (SM)** liest Feature-Name und -Beschreibung, formuliert eine Direktive an Peter
2. **Peter (PO)** empfängt die Direktive, generiert 3–6 User Stories als JSON  
   → gespeichert in `<PROJECTS_BASE_DIR>/<projektId>/<featureId>/Userstories.md`
3. **Tobias (TPO)** liest alle User Stories, erstellt technische Stories (TUS) + `Architecture.md`
4. Alle Schritte werden über SSE live an den **Agent Feed** im Browser gestreamt

Jedes Event enthält: `agent`, `agentRole`, `type` (`agent:start` | `agent:done` | `agent:error`), `message`, `timestamp`.

---

## Lizenz

MIT
