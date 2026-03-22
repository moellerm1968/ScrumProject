/**
 * agentRunner.js — Thin LLM wrapper for agent prompts
 *
 * Priority order for LLM backend:
 *   1. Ollama        (if OLLAMA_URL is set)         → local, no key needed
 *   2. GitHub CLI    (if GH_CLI_MODE is set)        → gh models run; bei Fehler 5-min Cooldown + Fallback
 *   3. Anthropic     (if ANTHROPIC_API_KEY is set)  → claude-haiku-4-5-20251001
 *   4. OpenAI        (if OPENAI_API_KEY is set)     → any OpenAI-style API
 *   (nichts konfiguriert)                          → Fehler
 *
 * Relevant env vars:
 *   OLLAMA_URL          e.g. http://localhost:11434
 *   OLLAMA_MODEL        default: llama3.2
 *   GH_CLI_MODE         '1' or 'true' → uses "gh models run" CLI
 *                       Bei Rate-Limit oder Fehler: 5 min Cooldown, dann Anthropic/OpenAI
 *   ANTHROPIC_API_KEY
 *   ANTHROPIC_MODEL     default: claude-haiku-4-5-20251001
 *   OPENAI_API_KEY
 *   OPENAI_API_URL      default: https://api.openai.com/v1/chat/completions
 *   LLM_MODEL           default: gpt-4o-mini  (used by GH CLI + OpenAI)
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config ──────────────────────────────────────────────────────────────────
const LLM_MODEL        = process.env.LLM_MODEL          || 'gpt-4o-mini';
const OLLAMA_URL       = process.env.OLLAMA_URL;
const ANTHROPIC_KEY    = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL  = process.env.ANTHROPIC_MODEL    || 'claude-haiku-4-5-20251001';
const OPENAI_KEY       = process.env.OPENAI_API_KEY;
const OPENAI_URL       = process.env.OPENAI_API_URL     || 'https://api.openai.com/v1/chat/completions';
const GH_CLI_MODE      = process.env.GH_CLI_MODE === '1' || process.env.GH_CLI_MODE === 'true';
const LLM_DELAY_MS     = parseInt(process.env.LLM_DELAY_MS ?? '5000', 10);

// ─── GH CLI Cooldown State ────────────────────────────────────────────────────
let ghCliCooldownUntil = 0; // ms-Timestamp — 0 = kein Cooldown aktiv

function _setGhCliCooldown(reason) {
  ghCliCooldownUntil = Date.now() + 5 * 60 * 1_000;
  console.warn(`[GH CLI] ⏸ Cooldown 5 min (bis ${new Date(ghCliCooldownUntil).toLocaleTimeString()}): ${String(reason).slice(0, 200)}`);
}

/** Gibt den Namen des aktuell aktiven LLM-Backends zurück (berücksichtigt GH-CLI-Cooldown). */
export function getLLMBackendName() {
  if (OLLAMA_URL) return `Ollama (${process.env.OLLAMA_MODEL || 'llama3.2'})`;
  if (GH_CLI_MODE) {
    if (Date.now() > ghCliCooldownUntil) return `GitHub Models CLI (${LLM_MODEL})`;
    const fallback = ANTHROPIC_KEY ? `Anthropic (${ANTHROPIC_MODEL})` : OPENAI_KEY ? `OpenAI (${LLM_MODEL})` : '–';
    return `GitHub Models CLI [Cooldown] → ${fallback}`;
  }
  if (ANTHROPIC_KEY) return `Anthropic (${ANTHROPIC_MODEL})`;
  if (OPENAI_KEY)    return `OpenAI (${LLM_MODEL})`;
  return 'Kein LLM konfiguriert';
}

// ─── Agent prompt loader ──────────────────────────────────────────────────────
/**
 * Reads an agent markdown file.
 * Looks first inside <workDir>/.github/agents/, then falls back to team/.
 */
export async function readAgentPrompt(workDir, agentFileName) {
  const inProject = join(workDir, '.github', 'agents', agentFileName);
  if (existsSync(inProject)) return readFileSync(inProject, 'utf-8');

  const inTeam = join(__dirname, '..', '..', 'team', agentFileName);
  if (existsSync(inTeam)) return readFileSync(inTeam, 'utf-8');

  return null;
}

// ─── Public LLM call ─────────────────────────────────────────────────────────
/**
 * @param {object} opts
 * @param {string} opts.systemPrompt
 * @param {string} opts.userMessage
 * @param {boolean} [opts.expectJSON=false]  hint for JSON response_format
 * @returns {Promise<string>}
 */
export async function callLLM({ systemPrompt, userMessage, expectJSON = false }) {
  const preview = userMessage.length > 120 ? userMessage.slice(0, 120) + '…' : userMessage;
  const t0 = Date.now();
  const opts = { systemPrompt, userMessage, expectJSON };

  // ─── Backend-Kette aufbauen (Priorität 1→4) ──────────────────────────────
  const ghCliReady = GH_CLI_MODE && Date.now() > ghCliCooldownUntil;
  const chain = [
    OLLAMA_URL    && { id: 'ollama',    label: `Ollama (${process.env.OLLAMA_MODEL || 'llama3.2'})`, fn: _ollama,      retry: true  },
    ghCliReady    && { id: 'ghcli',     label: `GitHub Models CLI (${LLM_MODEL})`,                    fn: _ghModelsCLI, retry: false },
    ANTHROPIC_KEY && { id: 'anthropic', label: `Anthropic (${ANTHROPIC_MODEL})`,                      fn: _anthropic,   retry: true  },
    OPENAI_KEY    && { id: 'openai',    label: `OpenAI (${LLM_MODEL})`,                               fn: _openai,      retry: true  },
  ].filter(Boolean);

  if (chain.length === 0) {
    throw new Error(
      'Kein LLM konfiguriert. Bitte OLLAMA_URL, GH_CLI_MODE, ANTHROPIC_API_KEY oder OPENAI_API_KEY setzen.',
    );
  }

  let lastErr;
  for (const backend of chain) {
    console.log(`\n[LLM →] ${backend.label}  expectJSON=${expectJSON}`);
    console.log(`        ${preview}`);
    try {
      const result = backend.retry
        ? await _callWithRetry(() => backend.fn(opts))
        : await backend.fn(opts);

      const resPreview = result.length > 120 ? result.slice(0, 120) + '…' : result;
      console.log(`[LLM ✓] ${Date.now() - t0} ms  → ${resPreview}`);

      if (LLM_DELAY_MS > 0) {
        console.log(`[LLM ⏳] Warte ${LLM_DELAY_MS} ms (LLM_DELAY_MS)`);
        await new Promise((r) => setTimeout(r, LLM_DELAY_MS));
      }
      return result;
    } catch (err) {
      console.log(`[LLM ✗] ${backend.label} nach ${Date.now() - t0} ms: ${err.message}`);
      lastErr = err;
      if (backend.id === 'ghcli') {
        _setGhCliCooldown(err.message);
        console.warn('[GH CLI] Weiter mit nächstem Backend…');
        continue; // Fallthrough zu Anthropic / OpenAI
      }
      throw err; // alle anderen Backends: Fehler direkt weitergeben
    }
  }

  // Hierher gelangt man nur wenn ghcli das einzige konfigurierte Backend war und scheitert
  throw lastErr ?? new Error('Alle konfigurierten LLM-Backends sind fehlgeschlagen.');
}

// ─── Retry wrapper for 429 Rate Limit ────────────────────────────────────────
async function _callWithRetry(fn, maxRetries = 6) {
  const BASE_WAIT_MS = 5_000;   // 5 s Startwert
  const MAX_WAIT_MS  = 300_000; // 5 min Obergrenze

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const is429 = err.message?.includes('429') || err.message?.includes('RateLimitReached');
      if (!is429 || attempt === maxRetries) throw err;

      // Exponential Backoff: 5s, 10s, 20s, 40s, 80s, 160s (max 5 min)
      const waitMs = Math.min(BASE_WAIT_MS * Math.pow(2, attempt), MAX_WAIT_MS);
      const waitSec = Math.round(waitMs / 1000);
      console.warn(`⏳ Rate-Limit (429) — warte ${waitSec}s (Backoff), dann Versuch ${attempt + 2}/${maxRetries + 1}…`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

// ─── Backends ────────────────────────────────────────────────────────────────
async function _post(url, headers, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`LLM ${res.status}: ${txt.slice(0, 400)}`);
  }
  return res.json();
}

// gh models run <model> --system-prompt <...> --no-interactive  (stdin = userMessage)
async function _ghModelsCLI({ systemPrompt, userMessage, expectJSON }) {
  const sysPrompt = expectJSON
    ? systemPrompt + '\n\nAntwort NUR als gültiges JSON-Objekt, ohne Markdown-Blöcke.'
    : systemPrompt;
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      'gh',
      ['models', 'run', LLM_MODEL, '--system-prompt', sysPrompt, '--no-interactive'],
      { encoding: 'utf-8', timeout: 90_000, input: userMessage, maxBuffer: 10 * 1024 * 1024 },
    ));
  } catch (err) {
    throw new Error(`gh models CLI: ${err.message.slice(0, 400)}`);
  }
  return stdout.trim();
}

async function _openai({ systemPrompt, userMessage, expectJSON }) {
  const data = await _post(
    OPENAI_URL,
    { Authorization: `Bearer ${OPENAI_KEY}` },
    {
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage },
      ],
      ...(expectJSON && { response_format: { type: 'json_object' } }),
    },
  );
  return data.choices?.[0]?.message?.content ?? '';
}

async function _anthropic({ systemPrompt, userMessage, expectJSON }) {
  const sysPrompt = expectJSON
    ? systemPrompt + '\n\nAntwort NUR als gültiges JSON-Objekt, ohne Markdown-Blöcke.'
    : systemPrompt;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':    'application/json',
      'x-api-key':       ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      system: sysPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`LLM ${res.status}: ${txt.slice(0, 400)}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

async function _ollama({ systemPrompt, userMessage, expectJSON }) {
  const model = process.env.OLLAMA_MODEL || 'llama3.2';
  const data = await _post(
    `${OLLAMA_URL}/api/chat`,
    {},
    {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage },
      ],
      stream: false,
      ...(expectJSON && { format: 'json' }),
    },
  );
  return data.message?.content ?? '';
}
