/**
 * smOrchestrator.js — Scrum Master orchestrates Product Owner
 *
 * Flow:
 *   1. SM (Susi) reads the feature and writes a directive for the PO
 *   2. PO (Peter) receives the directive and generates User Stories (JSON)
 *   3. Stories are numbered sequentially at project level (US-001, US-002, …)
 *   4. Stories written to  <workDir>/<featureId>/Userstories.md
 *   5. SM-Protokoll written/appended to  <workDir>/sm-protocol.md
 */

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { readAgentPrompt, callLLM } from './agentRunner.js';
import { emitAgentEvent } from './eventBus.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Count all user stories across all features in a project → next serial number */
function nextStorySerial(project) {
  return project.features.reduce((sum, f) => sum + (f.userStories?.length || 0), 0) + 1;
}

function storyNumber(n) {
  return `US-${String(n).padStart(3, '0')}`;
}

/** Count all technical user stories across all features → next serial number */
function nextTusSerial(project) {
  return project.features.reduce((sum, f) => sum + (f.technicalStories?.length || 0), 0) + 1;
}

function tusNumber(n) {
  return `TUS-${String(n).padStart(3, '0')}`;
}

function extractJSON(raw) {
  const start = raw.indexOf('{');
  const end   = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Kein JSON-Objekt in der PO-Antwort gefunden.');
  return JSON.parse(raw.slice(start, end + 1));
}

// ─── Main orchestration entry point ──────────────────────────────────────────

/**
 * Runs SM → PO workflow for a newly created feature.
 *
 * @returns {{ stories: object[], filePath: string, smDirective: string }}
 */
export async function orchestratePoForFeature({ project, feature }) {
  const { workDir } = project;
  const ctx = { projectName: project.name, featureName: feature.name };

  // ── Step 1: Scrum Master writes directive ──────────────────────────────────
  emitAgentEvent({
    type: 'agent:start', agent: 'Susi', agentRole: 'Scrum Master', ...ctx,
    message: `Neues Feature „${feature.name}" — formuliere Direktive für Peter (PO)`,
  });

  const smSystem = (await readAgentPrompt(workDir, 'Susi_ScrumMaster.Agent.md')) ??
    'Du bist Susi, Scrum Master. Du koordinierst den Scrum-Prozess.';

  const smDirective = await callLLM({
    systemPrompt:
      smSystem +
      '\n\nSchreibe jetzt einen präzisen, kurzen Auftrag (max. 5 Sätze) an Peter (Product Owner), ' +
      'damit er User Stories mit Abnahmekriterien erstellt. Kein Kommentar, nur der Auftrag.',
    userMessage:
      `Neues Feature wurde dem Backlog hinzugefügt.\n\n` +
      `Feature: **${feature.name}**\n` +
      `Beschreibung: ${feature.description || '(keine Beschreibung)'}\n\n` +
      `Projekt: ${project.name}\n` +
      `Projektbeschreibung: ${project.description}`,
  });

  // ── Step 2: Product Owner creates User Stories ─────────────────────────────
  emitAgentEvent({
    type: 'agent:done', agent: 'Susi', agentRole: 'Scrum Master', ...ctx,
    message: 'Direktive fertig — Peter (PO) übernimmt',
    details: smDirective.slice(0, 220),
  });

  emitAgentEvent({
    type: 'agent:start', agent: 'Peter', agentRole: 'Product Owner', ...ctx,
    message: `Erstelle User Stories mit Abnahmekriterien für „${feature.name}"`,
  });

  const poSystem = (await readAgentPrompt(workDir, 'Peter_ProductOwner.Agent.md')) ??
    'Du bist Peter, Product Owner. Du formulierst fachliche User Stories.';

  const startSerial = nextStorySerial(project);

  const poRaw = await callLLM({
    systemPrompt:
      poSystem +
      '\n\nAntworte ausschließlich mit einem JSON-Objekt – kein Text davor oder danach.',
    userMessage:
      `Auftrag von Scrum Master Susi:\n\n${smDirective}\n\n` +
      `Feature: **${feature.name}**\n` +
      `Beschreibung: ${feature.description || '(keine)'}\n\n` +
      `Projekt: ${project.name}\n` +
      `Projektbeschreibung: ${project.description}\n\n` +
      `Erstelle 2–5 User Stories. Die erste erhält die laufende Nummer ${startSerial}.\n\n` +
      `Verwende genau dieses JSON-Format:\n` +
      `{\n  "stories": [\n` +
      `    {\n` +
      `      "title": "Kurztitel der Story",\n` +
      `      "asA": "Nutzerrolle (z.B. 'registrierter Nutzer')",\n` +
      `      "iWant": "was der Nutzer tun/erreichen möchte",\n` +
      `      "soThat": "welchen Mehrwert oder Nutzen er hat",\n` +
      `      "acceptanceCriteria": [\n` +
      `        "Abnahmekriterium 1",\n` +
      `        "Abnahmekriterium 2"\n` +
      `      ]\n` +
      `    }\n  ]\n}`,
    expectJSON: true,
  });

  // ── Parse + enrich ─────────────────────────────────────────────────────────
  let rawStories;
  try {
    rawStories = extractJSON(poRaw).stories ?? [];
  } catch (e) {
    throw new Error(`PO-JSON konnte nicht geparst werden: ${e.message}\n\nRohantwort: ${poRaw.slice(0, 600)}`);
  }

  if (!Array.isArray(rawStories) || rawStories.length === 0) {
    throw new Error('PO hat keine Stories zurückgegeben (leeres stories-Array).');
  }

  const stories = rawStories.map((s, i) => ({
    id:              uuidv4(),
    storyNumber:     storyNumber(startSerial + i),
    title:           String(s.title    ?? '').trim(),
    asA:             String(s.asA      ?? '').trim(),
    iWant:           String(s.iWant    ?? '').trim(),
    soThat:          String(s.soThat   ?? '').trim(),
    // Keep a flat description for backward compat with existing UI rendering
    description:     `Als ${s.asA} möchte ich ${s.iWant}, damit ${s.soThat}.`,
    acceptanceCriteria: Array.isArray(s.acceptanceCriteria)
      ? s.acceptanceCriteria.map(String)
      : [],
    storyPoints:     0,
    status:          'new',
    createdAt:       new Date().toISOString(),
    generatedBy:     'Peter (Product Owner)',
    coordinatedBy:   'Susi (Scrum Master)',
  }));

  // ── Write <workDir>/<featureId>/Userstories.md ─────────────────────────────
  emitAgentEvent({
    type: 'agent:done', agent: 'Peter', agentRole: 'Product Owner', ...ctx,
    message: `${stories.length} User Stories erstellt: ${stories.map((s) => s.storyNumber).join(', ')}`,
    details: stories.map((s) => `${s.storyNumber} ${s.title}`).join(' · '),
  });

  const featureDir = join(workDir, feature.featureDir ?? feature.id);
  if (!existsSync(featureDir)) mkdirSync(featureDir, { recursive: true });

  const filePath = join(featureDir, 'Userstories.md');
  writeFileSync(filePath, _buildMd({ project, feature, stories, smDirective }), 'utf-8');
  emitAgentEvent({
    type: 'agent:done', agent: 'Susi', agentRole: 'Scrum Master', ...ctx,
    message: `Backlog-Eintrag abgeschlossen — Userstories.md geschrieben`,
    details: filePath,
  });

  // ── Step 3: Technical Product Owner — Architecture.md ────────────────────
  emitAgentEvent({
    type: 'agent:start', agent: 'Tobias', agentRole: 'Technischer Product Owner', ...ctx,
    message: `Analysiere Feature „${feature.name}" — erstelle/aktualisiere Architecture.md`,
  });

  const tpoSystem = (await readAgentPrompt(workDir, 'Tobias_TechnicalProductOwner.Agent.md')) ??
    'Du bist Tobias, Technischer Product Owner. Du wählst die einfachste sinnvolle Architektur und definierst technische Anforderungen.';

  const archPath = join(workDir, 'Architecture.md');
  const existingArch = existsSync(archPath) ? readFileSync(archPath, 'utf-8') : null;

  const archContent = await callLLM({
    systemPrompt:
      tpoSystem +
      '\n\nErstelle oder aktualisiere die Architecture.md. ' +
      'Wähle die technisch am wenigsten aufwendige Architektur. ' +
      'Schreibe ausschließlich Markdown — kein JSON, kein Text außerhalb des Dokuments.',
    userMessage:
      (existingArch ? `Bestehende Architecture.md:\n\n${existingArch}\n\n---\n\n` : '') +
      `Neues Feature: **${feature.name}**\n` +
      `Beschreibung: ${feature.description || '(keine)'}\n\n` +
      `Fachliche User Stories:\n` +
      stories.map((s) => `- ${s.storyNumber} „${s.title}": Als ${s.asA} möchte ich ${s.iWant}`).join('\n') +
      `\n\nProjekt: ${project.name}\nProjektbeschreibung: ${project.description}\n\n` +
      (existingArch
        ? 'Integriere das neue Feature in die bestehende Architektur. Passe nur die relevanten Abschnitte an.'
        : 'Erstelle Architecture.md mit Abschnitten: Übersicht, Tech-Stack, Komponenten, Datenhaltung, API. Wähle den einfachsten sinnvollen Ansatz.'),
  });

  writeFileSync(archPath, archContent, 'utf-8');

  emitAgentEvent({
    type: 'agent:done', agent: 'Tobias', agentRole: 'Technischer Product Owner', ...ctx,
    message: existingArch ? 'Architecture.md aktualisiert' : 'Architecture.md neu erstellt',
    details: archPath,
  });

  // ── Step 4: TPO creates Technical User Stories (TUS) ──────────────────────
  emitAgentEvent({
    type: 'agent:start', agent: 'Tobias', agentRole: 'Technischer Product Owner', ...ctx,
    message: `Erstelle technische User Stories (TUS) für „${feature.name}"`,
  });

  const startTusSerial = nextTusSerial(project);

  const tusRaw = await callLLM({
    systemPrompt:
      tpoSystem +
      '\n\nAntworte ausschließlich mit einem JSON-Objekt – kein Text davor oder danach.',
    userMessage:
      `Feature: **${feature.name}**\n` +
      `Beschreibung: ${feature.description || '(keine)'}\n\n` +
      `Fachliche User Stories:\n` +
      stories.map((s) => `- ${s.storyNumber} „${s.title}"`).join('\n') +
      `\n\nArchitektur-Kontext:\n${archContent.slice(0, 1200)}\n\n` +
      `Erstelle 2–5 technische User Stories. Die erste erhält die laufende Nummer ${startTusSerial}.\n\n` +
      `Verwende genau dieses JSON-Format:\n` +
      `{\n  "technicalStories": [\n` +
      `    {\n` +
      `      "title": "Kurztitel der technischen Aufgabe",\n` +
      `      "component": "Frontend|Backend|Datenbank|API|Infrastruktur",\n` +
      `      "description": "Technische Beschreibung der Implementierungsaufgabe",\n` +
      `      "linkedStories": ["US-001"],\n` +
      `      "acceptanceCriteria": ["Technisches Abnahmekriterium"]\n` +
      `    }\n  ]\n}`,
    expectJSON: true,
  });

  let rawTus;
  try {
    rawTus = extractJSON(tusRaw).technicalStories ?? [];
  } catch (e) {
    throw new Error(`TPO-JSON konnte nicht geparst werden: ${e.message}\n\nRohantwort: ${tusRaw.slice(0, 600)}`);
  }

  if (!Array.isArray(rawTus) || rawTus.length === 0) {
    throw new Error('TPO hat keine technischen Stories zurückgegeben (leeres technicalStories-Array).');
  }

  const technicalStories = rawTus.map((s, i) => ({
    id:                 uuidv4(),
    tusNumber:          tusNumber(startTusSerial + i),
    title:              String(s.title        ?? '').trim(),
    component:          String(s.component    ?? '').trim(),
    description:        String(s.description  ?? '').trim(),
    linkedStories:      Array.isArray(s.linkedStories)      ? s.linkedStories.map(String)      : [],
    acceptanceCriteria: Array.isArray(s.acceptanceCriteria) ? s.acceptanceCriteria.map(String) : [],
    status:             'new',
    createdAt:          new Date().toISOString(),
    generatedBy:        'Tobias (Technischer Product Owner)',
  }));

  emitAgentEvent({
    type: 'agent:done', agent: 'Tobias', agentRole: 'Technischer Product Owner', ...ctx,
    message: `${technicalStories.length} TUS erstellt: ${technicalStories.map((s) => s.tusNumber).join(', ')}`,
    details: technicalStories.map((s) => `${s.tusNumber} [${s.component}] ${s.title}`).join(' · '),
  });

  // ── Append to SM protocol ──────────────────────────────────────────────────
  const protocolPath = join(workDir, 'sm-protocol.md');
  const header = existsSync(protocolPath) ? '' : '# Scrum Master Protokoll\n\n';
  appendFileSync(
    protocolPath,
    header +
      `## ${new Date().toISOString().slice(0, 10)} — Feature: ${feature.name}\n\n` +
      `**Feature-ID:** \`${feature.id}\`  \n` +
      `**Fachliche Stories:** ${stories.length} (${stories.map((s) => s.storyNumber).join(', ')})  \n` +
      `**Technische Stories:** ${technicalStories.length} (${technicalStories.map((s) => s.tusNumber).join(', ')})  \n\n` +
      `### SM-Direktive\n\n> ${smDirective.replace(/\n/g, '\n> ')}\n\n---\n\n`,
    'utf-8',
  );

  return { stories, filePath, smDirective, technicalStories, architectureFile: archPath };
}

// ─── Markdown builder ─────────────────────────────────────────────────────────

function _buildMd({ project, feature, stories, smDirective }) {
  const date = new Date().toLocaleDateString('de-DE', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const lines = [
    `# User Stories — ${feature.name}`,
    '',
    `**Projekt:** ${project.name}  `,
    `**Feature-ID:** \`${feature.id}\`  `,
    `**Erstellt am:** ${date}  `,
    `**Erstellt von:** Peter (Product Owner)  `,
    `**Koordiniert von:** Susi (Scrum Master)  `,
    '',
    '---',
    '',
    '## SM-Direktive',
    '',
    `> ${smDirective.replace(/\n/g, '\n> ')}`,
    '',
    '---',
    '',
  ];

  for (const s of stories) {
    lines.push(`## ${s.storyNumber} — ${s.title}`, '');
    lines.push(`**Als** ${s.asA}  `);
    lines.push(`**möchte ich** ${s.iWant}  `);
    lines.push(`**damit** ${s.soThat}  `);
    lines.push('', '### Abnahmekriterien', '');
    for (const ac of s.acceptanceCriteria) lines.push(`- [ ] ${ac}`);
    lines.push('', '---', '');
  }

  return lines.join('\n');
}
