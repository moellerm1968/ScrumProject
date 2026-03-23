/**
 * eventBus.js — Simple in-memory SSE broadcaster
 *
 * Usage in any agent/orchestrator:
 *   import { emitAgentEvent } from './eventBus.js';
 *   emitAgentEvent({ type: 'agent:start', agent: 'Susi', ... });
 */

// Active SSE response objects keyed by a unique client id
const clients = new Map();

/** Register a new SSE connection */
export function sseSubscribe(res) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  clients.set(id, res);
  return id;
}

/** Remove an SSE connection */
export function sseUnsubscribe(id) {
  clients.delete(id);
}

/**
 * Emit an agent activity event to all connected clients.
 *
 * @param {{
 *   type: 'agent:start' | 'agent:done' | 'agent:error' | 'llm:backend',
 *   agent?: string,
 *   agentRole?: string,
 *   projectName?: string,
 *   featureName?: string,
 *   message?: string,
 *   details?: string,
 *   backend?: string
 * }} event
 */
export function emitAgentEvent(event) {
  const payload = JSON.stringify({ ...event, timestamp: new Date().toISOString() });
  for (const [id, res] of clients) {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch {
      clients.delete(id);
    }
  }
}
