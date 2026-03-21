/**
 * agentRunner.js — Thin LLM wrapper for agent prompts
 *
 * Priority order for LLM backend:
 *   1. Ollama (if OLLAMA_URL is set)             → local, no key needed
 *   2. OpenAI-compatible (if OPENAI_API_KEY set) → any OpenAI-style API
 *   3. GitHub Models (default)                   → free tier via gh auth token
 *
 * Relevant env vars:
 *   OLLAMA_URL        e.g. http://localhost:11434
 *   OLLAMA_MODEL      default: llama3.2
 *   OPENAI_API_KEY
 *   OPENAI_API_URL    default: https://api.openai.com/v1/chat/completions
 *   LLM_MODEL         default: gpt-4o-mini  (used by GitHub Models + OpenAI)
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config ──────────────────────────────────────────────────────────────────
const LLM_MODEL    = process.env.LLM_MODEL      || 'gpt-4o-mini';
const OLLAMA_URL   = process.env.OLLAMA_URL;
const OPENAI_KEY   = process.env.OPENAI_API_KEY;
const OPENAI_URL   = process.env.OPENAI_API_URL  || 'https://api.openai.com/v1/chat/completions';
const GH_MODELS    = 'https://models.inference.ai.azure.com/chat/completions';

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
  if (OLLAMA_URL)  return _ollama({ systemPrompt, userMessage, expectJSON });
  if (OPENAI_KEY)  return _openai({ systemPrompt, userMessage, expectJSON });
  return _githubModels({ systemPrompt, userMessage, expectJSON });
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

async function _githubModels({ systemPrompt, userMessage, expectJSON }) {
  let token;
  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'token'], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    token = stdout.trim();
  } catch {
    throw new Error(
      'Kein GitHub-Token gefunden. Bitte "gh auth login" ausführen oder OPENAI_API_KEY / OLLAMA_URL setzen.',
    );
  }

  const data = await _post(
    GH_MODELS,
    { Authorization: `Bearer ${token}` },
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
