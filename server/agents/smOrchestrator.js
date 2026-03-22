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
export async function orchestratePoForFeature({ project, feature, onProgress }) {
  const { workDir } = project;
  const ctx = { projectName: project.name, featureName: feature.name, projectId: project.id, featureId: feature.id };

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
  await onProgress?.({ stories, technicalStories: [] });

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
  await onProgress?.({ stories, technicalStories });

  // ── Step 5: SM directs TPO to prioritize ALL items (US + TUS) together ──────
  const allItemCount = stories.length + technicalStories.length;
  emitAgentEvent({
    type: 'agent:start', agent: 'Susi', agentRole: 'Scrum Master', ...ctx,
    message: `Fordere Tobias (TPO) auf, alle ${allItemCount} Stories (${stories.length} US + ${technicalStories.length} TUS) gemeinsam zu priorisieren`,
  });

  const tpoPrioDirective = await callLLM({
    systemPrompt:
      smSystem +
      '\n\nSchreibe einen präzisen Auftrag (max. 4 Sätze) an Tobias (TPO). Kein Kommentar, nur der Auftrag.',
    userMessage:
      `Tobias soll ALLE ${allItemCount} Stories des Features „${feature.name}" in einer gemeinsamen Priorisierungsliste von 1 bis ${allItemCount} einordnen.\n` +
      `Dabei sind sowohl die ${stories.length} fachlichen User Stories (US) als auch die ${technicalStories.length} Technischen User Stories (TUS) enthalten.\n` +
      `Kriterien: technische Abhängigkeiten, Umsetzungseffizienz, Risikominimierung, fachlicher Wert.\n\n` +
      `User Stories (${stories.length}):\n${stories.map((s) => `- ${s.storyNumber} „${s.title}"`).join('\n')}\n\n` +
      `Technische User Stories (${technicalStories.length}):\n` +
      technicalStories.map((t) =>
        `- ${t.tusNumber} [${t.component}] „${t.title}" → bezieht sich auf: ${(t.linkedStories ?? []).join(', ') || '–'}`
      ).join('\n'),
  });

  emitAgentEvent({
    type: 'agent:done', agent: 'Susi', agentRole: 'Scrum Master', ...ctx,
    message: 'Priorisierungs-Direktive an Tobias (TPO) gesendet',
    details: tpoPrioDirective.slice(0, 220),
  });

  // ── Step 5a: TPO prioritizes ALL items (US + TUS) in one combined list ─────
  emitAgentEvent({
    type: 'agent:start', agent: 'Tobias', agentRole: 'Technischer Product Owner', ...ctx,
    message: `Priorisiere alle ${allItemCount} Stories (US + TUS) gemeinsam von Rang 1 bis ${allItemCount}`,
  });

  const tusOverview = technicalStories.map((t) => ({
    tusNumber: t.tusNumber,
    title: t.title,
    component: t.component,
    linkedStories: t.linkedStories ?? [],
  }));

  // Unified item list for LLM
  const allItemNumbers = [
    ...stories.map((s) => s.storyNumber),
    ...technicalStories.map((t) => t.tusNumber),
  ];

  const tpoPrioRaw = await callLLM({
    systemPrompt: tpoSystem + '\n\nAntworte ausschließlich mit einem JSON-Objekt.',
    userMessage:
      `Auftrag von Susi (SM):\n\n${tpoPrioDirective}\n\n` +
      `User Stories (X=${stories.length}):\n` +
      stories.map((s) => {
        const linked = technicalStories.filter((t) => t.linkedStories?.includes(s.storyNumber));
        return `  ${s.storyNumber} „${s.title}"${linked.length > 0 ? ` → TUS: ${linked.map((t) => t.tusNumber).join(', ')}` : ''}`;
      }).join('\n') + '\n\n' +
      `Technische User Stories (Y=${technicalStories.length}):\n` +
      tusOverview.map((t) =>
        `  ${t.tusNumber} [${t.component}] „${t.title}" → US: ${t.linkedStories.join(', ') || '–'}`
      ).join('\n') + '\n\n' +
      `Priorisiere ALLE ${allItemCount} Items (US und TUS gemischt) von Rang 1 bis ${allItemCount}. Rang 1 = höchste Priorität.\n` +
      `Verwende "itemNumber" für sowohl US-XXX als auch TUS-XXX Nummern.\n` +
      `Format:\n{\n  "prioritization": [\n    {"itemNumber":"US-001","rank":1,"reason":"<Begründung>"},\n    {"itemNumber":"TUS-001","rank":2,"reason":"<Begründung>"}\n  ]\n}`,
    expectJSON: true,
  });

  let tpoPrio;
  try {
    tpoPrio = extractJSON(tpoPrioRaw).prioritization ?? [];
  } catch (e) {
    tpoPrio = [];
  }
  // Ensure all items covered
  const coveredByTpo = new Set(tpoPrio.map((p) => p.itemNumber));
  allItemNumbers.forEach((num) => {
    if (!coveredByTpo.has(num))
      tpoPrio.push({ itemNumber: num, rank: tpoPrio.length + 1, reason: 'Standardreihenfolge' });
  });
  tpoPrio.sort((a, b) => a.rank - b.rank);
  tpoPrio.forEach((p, i) => { p.rank = i + 1; }); // normalize to 1..Z

  emitAgentEvent({
    type: 'agent:done', agent: 'Tobias', agentRole: 'Technischer Product Owner', ...ctx,
    message: `Priorisierung (${allItemCount} Items): ${tpoPrio.slice(0, 5).map((p) => `${p.itemNumber}(#${p.rank})`).join(', ')}…`,
    details: tpoPrio.map((p) => `#${p.rank} ${p.itemNumber}: ${p.reason}`).join(' · '),
  });

  // ── Step 6: SM directs PO to review the combined prioritization ────────────
  emitAgentEvent({
    type: 'agent:start', agent: 'Susi', agentRole: 'Scrum Master', ...ctx,
    message: 'Fordere Peter (PO) auf, die gemeinsame Priorisierung aus fachlicher Sicht zu prüfen',
  });

  const poPrioDirective = await callLLM({
    systemPrompt:
      smSystem +
      '\n\nSchreibe einen präzisen Auftrag (max. 4 Sätze) an Peter (PO). Kein Kommentar, nur der Auftrag.',
    userMessage:
      `Tobias (TPO) hat eine gemeinsame Priorisierung aller ${allItemCount} Stories erstellt (US und TUS in einer Liste):\n` +
      tpoPrio.map((p) => `  #${p.rank} ${p.itemNumber}: ${p.reason}`).join('\n') +
      `\n\nPeter soll prüfen, ob diese Reihenfolge den fachlichen Wert und die Businessziele maximiert.` +
      ` Falls nicht, soll er einen Gegenvorschlag mit Begründung für ALLE ${allItemCount} Items machen.`,
  });

  emitAgentEvent({
    type: 'agent:done', agent: 'Susi', agentRole: 'Scrum Master', ...ctx,
    message: 'Review-Auftrag an Peter (PO) gesendet',
    details: poPrioDirective.slice(0, 220),
  });

  // ── Step 6a: PO reviews the combined prioritization ───────────────────────
  emitAgentEvent({
    type: 'agent:start', agent: 'Peter', agentRole: 'Product Owner', ...ctx,
    message: `Prüfe gemeinsame Priorisierung aller ${allItemCount} Stories aus fachlicher Sicht`,
  });

  const poReviewRaw = await callLLM({
    systemPrompt: poSystem + '\n\nAntworte ausschließlich mit einem JSON-Objekt.',
    userMessage:
      `Auftrag von Susi (SM):\n\n${poPrioDirective}\n\n` +
      `Priorisierung von Tobias (${allItemCount} Items):\n` +
      tpoPrio.map((p) => {
        const us  = stories.find((s) => s.storyNumber === p.itemNumber);
        const tus = technicalStories.find((t) => t.tusNumber === p.itemNumber);
        const label = us ? `[US] „${us.title}"` : tus ? `[TUS/${tus.component}] „${tus.title}"` : '';
        return `#${p.rank} ${p.itemNumber} ${label} — ${p.reason}`;
      }).join('\n') +
      `\n\nFormat:\n` +
      `{\n  "agreed": true,\n  "comment": "Kurze Begründung (1-3 Sätze)"\n}\n` +
      `ODER bei Gegenvorschlag (alle ${allItemCount} Items aufführen):\n` +
      `{\n  "agreed": false,\n  "comment": "Begründung",\n  "prioritization": [\n    {"itemNumber":"US-001","rank":1,"reason":"<Begründung>"},\n    {"itemNumber":"TUS-001","rank":2,"reason":"<Begründung>"}\n  ]\n}`,
    expectJSON: true,
  });

  let poReview;
  try {
    poReview = extractJSON(poReviewRaw);
  } catch (e) {
    poReview = { agreed: true, comment: 'Einverstanden mit technischer Priorisierung.', prioritization: [] };
  }

  let finalPrio;
  let negotiationLog = '';

  if (poReview.agreed || !Array.isArray(poReview.prioritization) || poReview.prioritization.length === 0) {
    // ── Agreement ─────────────────────────────────────────────────────────
    finalPrio = tpoPrio;
    emitAgentEvent({
      type: 'agent:done', agent: 'Peter', agentRole: 'Product Owner', ...ctx,
      message: `✅ Einverstanden mit TPO-Priorisierung — ${poReview.comment || ''}`,
    });
  } else {
    // ── Disagreement → negotiation round ──────────────────────────────────
    emitAgentEvent({
      type: 'agent:done', agent: 'Peter', agentRole: 'Product Owner', ...ctx,
      message: `⚠️ Gegenvorschlag: ${poReview.comment || ''}`,
      details: poReview.prioritization.map((p) => `#${p.rank} ${p.itemNumber}: ${p.reason}`).join(' · '),
    });

    // Ensure PO prioritization covers all items
    const coveredByPo = new Set(poReview.prioritization.map((p) => p.itemNumber));
    allItemNumbers.forEach((num) => {
      if (!coveredByPo.has(num))
        poReview.prioritization.push({ itemNumber: num, rank: poReview.prioritization.length + 1, reason: 'Keine PO-Priorisierung' });
    });
    poReview.prioritization.sort((a, b) => a.rank - b.rank);
    poReview.prioritization.forEach((p, i) => { p.rank = i + 1; });

    // ── Step 7: TPO negotiates with PO ────────────────────────────────────
    emitAgentEvent({
      type: 'agent:start', agent: 'Tobias', agentRole: 'Technischer Product Owner', ...ctx,
      message: 'Einige mich mit Peter (PO) auf einen Kompromiss',
    });

    const negotiationRaw = await callLLM({
      systemPrompt: tpoSystem + '\n\nAntworte ausschließlich mit einem JSON-Objekt.',
      userMessage:
        `Peter (PO) hat einen Gegenvorschlag zur gemeinsamen Priorisierung gemacht.\n\n` +
        `PO-Kommentar: ${poReview.comment}\n` +
        `PO-Priorisierung:\n${poReview.prioritization.map((p) => `#${p.rank} ${p.itemNumber}: ${p.reason}`).join('\n')}\n\n` +
        `Deine technische Priorisierung:\n${tpoPrio.map((p) => `#${p.rank} ${p.itemNumber}: ${p.reason}`).join('\n')}\n\n` +
        `TUS-Überblick:\n${tusOverview.map((t) => `  ${t.tusNumber} [${t.component}] „${t.title}" → US: ${t.linkedStories.join(', ') || '–'}`).join('\n')}\n\n` +
        `Erstelle einen Kompromiss für ALLE ${allItemCount} Items. Verwende "itemNumber".\n` +
        `Format:\n{\n  "prioritization": [\n    {"itemNumber":"US-001","rank":1,"reason":"<Kompromiss>"},\n    {"itemNumber":"TUS-001","rank":2,"reason":"<Kompromiss>"}\n  ],\n  "comment": "Einigung in 1-2 Sätzen"\n}`,
      expectJSON: true,
    });

    let negotiatedPrio;
    try {
      const parsed = extractJSON(negotiationRaw);
      negotiatedPrio = parsed.prioritization ?? [];
      negotiationLog = parsed.comment || '';
    } catch (e) {
      // Fallback: average the ranks
      negotiatedPrio = allItemNumbers
        .map((num) => {
          const tpoRank = tpoPrio.find((p) => p.itemNumber === num)?.rank ?? 999;
          const poRank  = poReview.prioritization.find((p) => p.itemNumber === num)?.rank ?? 999;
          return { itemNumber: num, avgRank: (tpoRank + poRank) / 2 };
        })
        .sort((a, b) => a.avgRank - b.avgRank)
        .map((x, i) => ({ itemNumber: x.itemNumber, rank: i + 1, reason: 'Kompromiss (Rang-Mittelung)' }));
      negotiationLog = 'Einigung durch gleichgewichtete Rang-Mittelung.';
    }

    // Ensure full coverage
    const coveredByNeg = new Set(negotiatedPrio.map((p) => p.itemNumber));
    allItemNumbers.forEach((num) => {
      if (!coveredByNeg.has(num))
        negotiatedPrio.push({ itemNumber: num, rank: negotiatedPrio.length + 1, reason: 'Ergänzt' });
    });
    negotiatedPrio.sort((a, b) => a.rank - b.rank);
    negotiatedPrio.forEach((p, i) => { p.rank = i + 1; });
    finalPrio = negotiatedPrio;

    emitAgentEvent({
      type: 'agent:done', agent: 'Tobias', agentRole: 'Technischer Product Owner', ...ctx,
      message: `🤝 Einigung mit Peter: ${negotiationLog}`,
      details: finalPrio.map((p) => `#${p.rank} ${p.itemNumber}: ${p.reason}`).join(' · '),
    });
  }

  // ── Apply priorities to stories AND technicalStories ──────────────────────
  for (const story of stories) {
    const entry = finalPrio.find((p) => p.itemNumber === story.storyNumber);
    story.priority = entry?.rank ?? 999;
    story.priorityReason = entry?.reason ?? '';
  }
  for (const tus of technicalStories) {
    const entry = finalPrio.find((p) => p.itemNumber === tus.tusNumber);
    tus.priority = entry?.rank ?? 999;
    tus.priorityReason = entry?.reason ?? '';
  }
  stories.sort((a, b) => a.priority - b.priority);
  technicalStories.sort((a, b) => a.priority - b.priority);

  // ── Write Priorisierung.md ─────────────────────────────────────────────────
  const prioPath = join(featureDir, 'Priorisierung.md');
  writeFileSync(
    prioPath,
    _buildPrioMd({ project, feature, stories, technicalStories, tpoPrio, poReview, finalPrio, negotiationLog }),
    'utf-8',
  );

  emitAgentEvent({
    type: 'agent:done', agent: 'Susi', agentRole: 'Scrum Master', ...ctx,
    message: `Priorisierung abgeschlossen — Priorisierung.md geschrieben`,
    details: prioPath,
  });

  // ── Step 8: Refinement — Felix → Bernd → David (sequenziell) ──────────────
  const felixSystem  = (await readAgentPrompt(workDir, 'Felix_FrontendDeveloper.Agent.md'))  ?? 'Du bist Felix, Frontend-Entwickler.';
  const berndSystem  = (await readAgentPrompt(workDir, 'Bernd_BackendDeveloper.Agent.md'))   ?? 'Du bist Bernd, Backend-Entwickler.';
  const davidSystem  = (await readAgentPrompt(workDir, 'David_DatabaseDeveloper.Agent.md'))  ?? 'Du bist David, Datenbank-Entwickler.';

  // Iterate over ALL items in priority order (US + TUS interleaved)
  const allItemsSorted = finalPrio.map((p) => {
    const us  = stories.find((s) => s.storyNumber === p.itemNumber);
    const tus = technicalStories.find((t) => t.tusNumber === p.itemNumber);
    return us
      ? { kind: 'US',  item: us,  number: us.storyNumber,   title: us.title }
      : tus
      ? { kind: 'TUS', item: tus, number: tus.tusNumber,    title: tus.title }
      : null;
  }).filter(Boolean);

  for (const { kind, item, number, title } of allItemsSorted) {

    const storyContext =
      kind === 'US'
        ? `**${number} [US] „${title}"**\n` +
          `Als ${item.asA} möchte ich ${item.iWant}, damit ${item.soThat}\n` +
          `Abnahmekriterien:\n${(item.acceptanceCriteria ?? []).map((c) => `- ${c}`).join('\n')}`
        : `**${number} [TUS/${item.component}] „${title}"**\n` +
          `${item.description ?? ''}\n` +
          `Abnahmekriterien:\n${(item.acceptanceCriteria ?? []).map((c) => `- ${c}`).join('\n')}`;

    // ── 8a: Felix refines ───────────────────────────────────────────────────
    emitAgentEvent({
      type: 'agent:start', agent: 'Felix', agentRole: 'Frontend-Entwickler', ...ctx,
      message: `Refinement ${number}: Task-Liste und Story-Point-Schätzung erstellen`,
    });

    const felixRaw = await callLLM({
      systemPrompt: felixSystem + '\n\nAntworte ausschließlich mit einem JSON-Objekt.',
      userMessage:
        `Erstelle eine Aufgabenliste (Tasks) und schätze Story Points für folgende Story:\n\n${storyContext}\n\n` +
        `Aus deiner Perspektive als ${kind === 'US' ? 'Frontend-Entwickler' : 'Entwickler'}.\n` +
        `Story Points: Fibonacci (1,2,3,5,8,13,21).\n` +
        `Format:\n{\n  "tasks": ["Task 1", "Task 2"],\n  "storyPoints": 5,\n  "comment": "Kurze Begründung"\n}`,
      expectJSON: true,
    });

    let felixResult = { tasks: [], storyPoints: 0, comment: '' };
    try { felixResult = extractJSON(felixRaw); } catch (e) {}

    emitAgentEvent({
      type: 'agent:done', agent: 'Felix', agentRole: 'Frontend-Entwickler', ...ctx,
      message: `${number} → ${felixResult.storyPoints} SP, ${felixResult.tasks?.length ?? 0} Tasks`,
      details: felixResult.comment,
    });

    // ── 8b: Bernd refines ───────────────────────────────────────────────────
    emitAgentEvent({
      type: 'agent:start', agent: 'Bernd', agentRole: 'Backend-Entwickler', ...ctx,
      message: `Refinement ${number}: Task-Liste und Story-Point-Schätzung erstellen`,
    });

    const berndRaw = await callLLM({
      systemPrompt: berndSystem + '\n\nAntworte ausschließlich mit einem JSON-Objekt.',
      userMessage:
        `Felix hat folgende Tasks und SP-Schätzung für ${number} vorgeschlagen:\n` +
        `Tasks: ${(felixResult.tasks ?? []).map((t) => `- ${t}`).join('\n')}\n` +
        `SP-Schätzung Felix: ${felixResult.storyPoints} (${felixResult.comment})\n\n` +
        `Story:\n${storyContext}\n\n` +
        `Ergänze oder korrigiere die Task-Liste aus Backend-Perspektive und schätze Story Points.\n` +
        `Format:\n{\n  "tasks": ["Task 1", "Task 2"],\n  "storyPoints": 5,\n  "comment": "Kurze Begründung"\n}`,
      expectJSON: true,
    });

    let berndResult = { tasks: [], storyPoints: 0, comment: '' };
    try { berndResult = extractJSON(berndRaw); } catch (e) {}

    emitAgentEvent({
      type: 'agent:done', agent: 'Bernd', agentRole: 'Backend-Entwickler', ...ctx,
      message: `${number} → ${berndResult.storyPoints} SP, ${berndResult.tasks?.length ?? 0} Tasks`,
      details: berndResult.comment,
    });

    // ── 8c: David refines ───────────────────────────────────────────────────
    emitAgentEvent({
      type: 'agent:start', agent: 'David', agentRole: 'Datenbank-Entwickler', ...ctx,
      message: `Refinement ${number}: Task-Liste und Story-Point-Schätzung erstellen`,
    });

    const davidRaw = await callLLM({
      systemPrompt: davidSystem + '\n\nAntworte ausschließlich mit einem JSON-Objekt.',
      userMessage:
        `Felix (${felixResult.storyPoints} SP) und Bernd (${berndResult.storyPoints} SP) haben ${number} bereits geschätzt.\n` +
        `Kombinierte Task-Liste bisher:\n` +
        [...new Set([...(felixResult.tasks ?? []), ...(berndResult.tasks ?? [])])].map((t) => `- ${t}`).join('\n') +
        `\n\nStory:\n${storyContext}\n\n` +
        `Ergänze oder korrigiere die Task-Liste aus DB-Perspektive und schätze Story Points.\n` +
        `Format:\n{\n  "tasks": ["Task 1", "Task 2"],\n  "storyPoints": 5,\n  "comment": "Kurze Begründung"\n}`,
      expectJSON: true,
    });

    let davidResult = { tasks: [], storyPoints: 0, comment: '' };
    try { davidResult = extractJSON(davidRaw); } catch (e) {}

    emitAgentEvent({
      type: 'agent:done', agent: 'David', agentRole: 'Datenbank-Entwickler', ...ctx,
      message: `${number} → ${davidResult.storyPoints} SP, ${davidResult.tasks?.length ?? 0} Tasks`,
      details: davidResult.comment,
    });

    // ── Merge tasks (deduplicated) ──────────────────────────────────────────
    const mergedTasks = [...new Set([
      ...(felixResult.tasks ?? []),
      ...(berndResult.tasks ?? []),
      ...(davidResult.tasks ?? []),
    ])];

    // ── SP consensus ───────────────────────────────────────────────────────
    const spValues = [felixResult.storyPoints, berndResult.storyPoints, davidResult.storyPoints]
      .map(Number).filter((n) => n > 0);
    const spMin = Math.min(...spValues);
    const spMax = Math.max(...spValues);
    let finalSP = spValues.length > 0 ? Math.round(spValues.reduce((a, b) => a + b, 0) / spValues.length) : 1;
    let spConsensusLog = '';

    if (spMax > spMin * 1.5 && spValues.length > 1) {
      // Significant disagreement → Susi mediates
      emitAgentEvent({
        type: 'agent:start', agent: 'Susi', agentRole: 'Scrum Master', ...ctx,
        message: `⚠️ ${number}: SP-Schätzungen weichen ab (${spValues.join(' / ')}) — moderiere Einigung`,
      });

      const consensusRaw = await callLLM({
        systemPrompt: smSystem + '\n\nAntworte ausschließlich mit einem JSON-Objekt.',
        userMessage:
          `Bei ${number} „${title}" gibt es abweichende SP-Schätzungen:\n` +
          `  Felix: ${felixResult.storyPoints} SP — ${felixResult.comment}\n` +
          `  Bernd: ${berndResult.storyPoints} SP — ${berndResult.comment}\n` +
          `  David: ${davidResult.storyPoints} SP — ${davidResult.comment}\n\n` +
          `Als Scrum Master: Einige dich auf einen Wert (Fibonacci: 1,2,3,5,8,13,21) und begründe kurz.\n` +
          `Format:\n{\n  "storyPoints": 5,\n  "comment": "Begründung"\n}`,
        expectJSON: true,
      });

      try {
        const consensus = extractJSON(consensusRaw);
        finalSP = consensus.storyPoints ?? finalSP;
        spConsensusLog = consensus.comment ?? '';
      } catch (e) {
        spConsensusLog = 'Mittelwert-Einigung.';
      }

      emitAgentEvent({
        type: 'agent:done', agent: 'Susi', agentRole: 'Scrum Master', ...ctx,
        message: `🤝 ${number}: Einigung auf ${finalSP} SP — ${spConsensusLog}`,
      });
    } else {
      // Agree — use rounded average
      finalSP = spMax; // take the highest when they're close
      spConsensusLog = `Übereinstimmung (${spValues.join('/')}) → ${finalSP} SP`;
    }

    // ── Apply to item ──────────────────────────────────────────────────────
    item.tasks          = mergedTasks;
    item.storyPoints    = finalSP;
    item.spEstimates    = { felix: felixResult.storyPoints, bernd: berndResult.storyPoints, david: davidResult.storyPoints };
    item.spConsensus    = spConsensusLog;
    item.refinedBy      = 'Felix, Bernd, David';
    item.status         = 'refined';

    emitAgentEvent({
      type: 'agent:done', agent: 'Susi', agentRole: 'Scrum Master', ...ctx,
      message: `✅ ${number} refiniert: ${finalSP} SP, ${mergedTasks.length} Tasks — Status: refined`,
    });
    await onProgress?.({ stories, technicalStories });
  }

  // ── Write Userstories.md with tasks ───────────────────────────────────────
  writeFileSync(filePath, _buildMd({ project, feature, stories, smDirective }), 'utf-8');

  // ── Write Refinement.md ───────────────────────────────────────────────────
  const refinementPath = join(featureDir, 'Refinement.md');
  writeFileSync(refinementPath, _buildRefinementMd({ project, feature, allItemsSorted }), 'utf-8');

  emitAgentEvent({
    type: 'agent:done', agent: 'Susi', agentRole: 'Scrum Master', ...ctx,
    message: `Refinement abgeschlossen — Refinement.md geschrieben`,
    details: refinementPath,
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

  return { stories, filePath, smDirective, technicalStories, architectureFile: archPath, prioritizationFile: prioPath, refinementFile: refinementPath };
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
    if (s.storyPoints > 0) {
      lines.push('', `**Story Points:** ${s.storyPoints} SP  `);
    }
    if (Array.isArray(s.tasks) && s.tasks.length > 0) {
      lines.push('', '### Tasks', '');
      for (const t of s.tasks) lines.push(`- [ ] ${t}`);
    }
    lines.push('', '---', '');
  }

  return lines.join('\n');
}

// ─── Priorisierung Markdown builder ──────────────────────────────────────────

function _buildPrioMd({ project, feature, stories, technicalStories, tpoPrio, poReview, finalPrio, negotiationLog }) {
  const date = new Date().toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' });

  // Helper: find title + type label for any itemNumber
  const itemLabel = (itemNumber) => {
    const us  = stories.find((s) => s.storyNumber === itemNumber);
    if (us) return { title: us.title, type: 'US' };
    const tus = technicalStories.find((t) => t.tusNumber === itemNumber);
    if (tus) return { title: tus.title, type: `TUS/${tus.component}` };
    return { title: '', type: '?' };
  };

  const lines = [
    `# Priorisierung — ${feature.name}`,
    '',
    `**Projekt:** ${project.name}  `,
    `**Erstellt am:** ${date}  `,
    `**Gesamt:** ${finalPrio.length} Items (${stories.length} US + ${technicalStories.length} TUS), Rang 1\u2013${finalPrio.length}  `,
    '',
    '---',
    '',
    '## Ergebnis: Finale Priorisierung',
    '',
    '| Rang | Typ | Item | Begründung |',
    '|------|-----|------|------------|',
    ...finalPrio.map((p) => {
      const { title, type } = itemLabel(p.itemNumber);
      return `| ${p.rank} | ${type} | ${p.itemNumber} \u201e${title}" | ${p.reason} |`;
    }),
    '',
    '---',
    '',
    '## TPO-Priorisierung (Tobias \u2014 technische Sicht)',
    '',
    '| Rang | Typ | Item | Technische Begründung |',
    '|------|-----|------|-----------------------|',
    ...tpoPrio.map((p) => {
      const { title, type } = itemLabel(p.itemNumber);
      return `| ${p.rank} | ${type} | ${p.itemNumber} \u201e${title}" | ${p.reason} |`;
    }),
    '',
    '---',
    '',
    '## PO-Review (Peter \u2014 fachliche Sicht)',
    '',
    `**Ergebnis:** ${poReview?.agreed ? '\u2705 Einverstanden' : '\u26a0\ufe0f Gegenvorschlag'}  `,
    `**Kommentar:** ${poReview?.comment || '\u2013'}`,
  ];

  if (!poReview?.agreed && Array.isArray(poReview?.prioritization) && poReview.prioritization.length > 0) {
    lines.push('', '| Rang | Typ | Item | Fachliche Begründung |');
    lines.push('|------|-----|------|----------------------|');
    poReview.prioritization.forEach((p) => {
      const { title, type } = itemLabel(p.itemNumber);
      lines.push(`| ${p.rank} | ${type} | ${p.itemNumber} \u201e${title}" | ${p.reason} |`);
    });
  }

  if (negotiationLog) {
    lines.push('', '---', '', '## Einigung (Verhandlungsergebnis)', '', `> ${negotiationLog}`);
  }

  lines.push('', '---', '');
  return lines.join('\n');
}

// ─── Refinement Markdown builder ─────────────────────────────────────────────

function _buildRefinementMd({ project, feature, allItemsSorted }) {
  const date = new Date().toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' });

  const lines = [
    `# Refinement — ${feature.name}`,
    '',
    `**Projekt:** ${project.name}  `,
    `**Erstellt am:** ${date}  `,
    `**Refinement durch:** Felix (Frontend), Bernd (Backend), David (Datenbank)  `,
    `**Koordiniert von:** Susi (Scrum Master)  `,
    '',
    '---',
    '',
  ];

  for (const { kind, item, number, title } of allItemsSorted) {
    lines.push(`## #${item.priority} ${number} [${kind}${kind === 'TUS' ? '/' + item.component : ''}] — ${title}`, '');
    lines.push(`**Story Points:** ${item.storyPoints} SP  `);
    lines.push(`**Einzel-Schätzungen:** Felix ${item.spEstimates?.felix ?? '–'} / Bernd ${item.spEstimates?.bernd ?? '–'} / David ${item.spEstimates?.david ?? '–'}  `);
    if (item.spConsensus) lines.push(`**Einigung:** ${item.spConsensus}  `);
    lines.push('', '### Tasks', '');
    (item.tasks ?? []).forEach((t) => lines.push(`- [ ] ${t}`));
    lines.push('', '---', '');
  }

  return lines.join('\n');
}
