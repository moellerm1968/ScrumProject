/**
 * vier-gewinnt.spec.js
 *
 * Fachlicher End-to-End-Test: Neues Projekt + Feature über die GUI anlegen.
 * Projektdaten stammen aus projects.json (02ac8ea7 / b8e64973),
 * werden aber als frisches Projekt in einem eigenen, durchnummerierten
 * Verzeichnis angelegt (vier-gewinnt-001, vier-gewinnt-002, …).
 *
 * Projekt-Vorlage : 4 Gewinnt          (02ac8ea7-6741-4c67-b9ed-4a5086150c0b)
 * Feature-Vorlage : Baut mir ein MVP   (b8e64973-92b3-4f42-898b-14ddb43fbbef)
 */
import { test, expect, request } from '@playwright/test';

// ─── Feste Testdaten (aus projects.json übernommen) ──────────────────────────
const PROJECT_NAME        = '4 Gewinnt';
const PROJECT_DESCRIPTION = 'Ein Spiel für 2 Personen das allen Spass macht und die Logikfähigkeiten fordert';
const FEATURE_NAME        = 'Baut mir ein erstes MVP';
const FEATURE_DESCRIPTION = 'MVP soll die grundsätzliche Struktur des Projektes herstellen und einen ersten Eindruck zur GUI vermitteln';
const PAUSE               = 1200; // ms Pause zwischen Schritten
const DIR_PREFIX          = 'vier-gewinnt-';

// Laufzeit-Verzeichnis – wird in beforeEach gesetzt
let testDir = '';

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

/** Nächste freie Nummer: liest alle Projekte und wählt max(existierende) + 1 */
async function nextTestDir() {
  const api = await request.newContext({ baseURL: 'http://localhost:3001' });
  const res  = await api.get('/api/projects');
  const all  = await res.json();
  await api.dispose();

  const nums = all
    .map(p => p.directory?.match(new RegExp(`^${DIR_PREFIX}(\\d+)$`)))
    .filter(Boolean)
    .map(m => parseInt(m[1], 10));

  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${DIR_PREFIX}${String(next).padStart(3, '0')}`;
}

/** Löscht das Testprojekt mit dem aktuellen testDir */
async function deleteTestProject() {
  if (!testDir) return;
  const api = await request.newContext({ baseURL: 'http://localhost:3001' });
  const res  = await api.get('/api/projects');
  const all  = await res.json();
  for (const p of all) {
    if (p.directory === testDir) {
      await api.delete(`/api/projects/${p.id}`);
    }
  }
  await api.dispose();
}

/**
 * Pollt die REST-API alle 5 s, bis das Feature:
 *   - storiesStatus === 'ready'   (User Stories + Priorisierung fertig)
 *   - refinementFile gesetzt      (Refinement Step 8 abgeschlossen)
 * Gibt das fertige Feature-Objekt zurück oder wirft nach timeoutMs.
 */
async function waitForFeatureRefined(projectId, featureName, timeoutMs = 600_000) {
  const api   = await request.newContext({ baseURL: 'http://localhost:3001' });
  const start = Date.now();
  const POLL  = 5_000;

  try {
    while (Date.now() - start < timeoutMs) {
      const res  = await api.get(`/api/projects/${projectId}`);
      const proj = await res.json();
      const feat = proj.features?.find(f => f.name === featureName);

      const elapsed = Math.round((Date.now() - start) / 1000);
      const status  = feat?.storiesStatus ?? '?';
      const refined = feat?.refinementFile ? 'ja' : 'nein';
      console.log(`[Poll ${elapsed}s] storiesStatus=${status}  refinementFile=${refined}`);

      if (feat?.storiesStatus === 'ready' && feat?.refinementFile) {
        return feat;
      }
      await new Promise(r => setTimeout(r, POLL));
    }
    throw new Error(`Timeout: Feature "${featureName}" nicht refined nach ${timeoutMs / 1000}s`);
  } finally {
    await api.dispose();
  }
}

// ─── Vor- / Nachbereinigung ───────────────────────────────────────────────────
test.beforeEach(async () => {
  testDir = await nextTestDir();
});

test.afterEach(deleteTestProject);

// ─── Haupt-Test ───────────────────────────────────────────────────────────────

test('4 Gewinnt: Projekt und erstes Feature anlegen', async ({ page }) => {
  test.setTimeout(660_000); // 11 min: LLM-Aufrufe (Steps 1-8) können mehrere Minuten brauchen

  // ── Schritt 1: Dashboard öffnen ──────────────────────────────────────────
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Projekte/i })).toBeVisible();
  await page.waitForTimeout(PAUSE);

  // ── Schritt 2: "Neues Projekt"-Modal öffnen ──────────────────────────────
  await page.getByRole('button', { name: /Neues Projekt/i }).click();
  await expect(page.getByRole('heading', { name: /Neues Projekt/i })).toBeVisible();
  await page.waitForTimeout(PAUSE);

  // ── Schritt 3: Projektdaten eingeben ─────────────────────────────────────
  await page.getByPlaceholder(/E-Commerce Platform/i).fill(PROJECT_NAME);
  await page.waitForTimeout(PAUSE / 2);

  await page.getByPlaceholder(/mindestens 10 Wörtern/i).fill(PROJECT_DESCRIPTION);
  await page.waitForTimeout(PAUSE / 2);

  await page.getByPlaceholder(/mein-projekt/i).fill(testDir);
  await page.waitForTimeout(PAUSE);

  // ── Schritt 4: Projekt erstellen ─────────────────────────────────────────
  await page.getByRole('button', { name: /^Erstellen$/i }).click();

  // Bestätigungs-Dialog abwarten
  await expect(page.getByText(/Projekt angelegt!/i)).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(PAUSE);

  // Team-Mitglieder sollten sichtbar sein
  await expect(
    page.getByText(/Susi|Peter|Tobias|Felix|Bernd|David|Konstantin/i).first()
  ).toBeVisible();
  await page.waitForTimeout(PAUSE);

  // ── Schritt 5: Zur Projekt-Detailseite navigieren ─────────────────────────
  await page.getByRole('button', { name: /Erstes Feature anlegen/i }).click();

  await expect(page).toHaveURL(/\/projects\/.+/);
  await expect(page.getByText(/Ebene 2/i)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: PROJECT_NAME })).toBeVisible();
  await page.waitForTimeout(PAUSE);

  // ── Schritt 6: "Neues Feature"-Modal öffnen ───────────────────────────────
  await page.getByRole('button', { name: /Neues Feature/i }).click();
  await expect(page.getByRole('heading', { name: /Neues Feature/i })).toBeVisible();
  await page.waitForTimeout(PAUSE);

  // ── Schritt 7: Feature-Daten eingeben ────────────────────────────────────
  await page.getByPlaceholder(/User Authentication/i).fill(FEATURE_NAME);
  await page.waitForTimeout(PAUSE / 2);

  await page.getByPlaceholder(/Optionale Beschreibung/i).fill(FEATURE_DESCRIPTION);
  await page.waitForTimeout(PAUSE);

  // ── Schritt 8: Feature erstellen ──────────────────────────────────────────
  await page.getByRole('button', { name: /^Erstellen$/i }).click();

  await expect(page.getByRole('heading', { name: /Neues Feature/i })).not.toBeVisible();
  await page.waitForTimeout(PAUSE);

  // ── Schritt 9: Feature ist im Kanban-Board sichtbar ───────────────────────
  const kanbanGrid  = page.locator('.md\\:grid-cols-3');
  const featureCard = kanbanGrid
    .locator('.bg-white.rounded-lg')
    .filter({ hasText: FEATURE_NAME });
  await expect(featureCard.first()).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(PAUSE);

  // ── Schritt 10: Feature-Detailseite öffnen ────────────────────────────────
  await featureCard.first().getByText('Öffnen →').click();

  await expect(page).toHaveURL(/\/projects\/.+\/features\/.+/);
  await expect(page.getByText(/Ebene 3/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('heading', { level: 1, name: FEATURE_NAME })).toBeVisible();
  await page.waitForTimeout(PAUSE);

  // Projekt-ID aus der aktuellen URL extrahieren
  const urlMatch = page.url().match(/\/projects\/([^/]+)\/features\//);
  const projectId = urlMatch?.[1];
  if (!projectId) throw new Error('Projekt-ID nicht in URL gefunden: ' + page.url());

  // ── Schritt 11: Warten bis alle User Stories erstellt UND refined wurden ──
  // Pollt die REST-API alle 5 s:
  //   storiesStatus === 'ready'  →  User Stories + Priorisierung fertig (Steps 1-7)
  //   refinementFile gesetzt     →  Refinement abgeschlossen (Step 8)
  console.log(`\n[Test] Warte auf vollständiges Refinement für Projekt ${projectId}…`);
  const refinedFeature = await waitForFeatureRefined(projectId, FEATURE_NAME);
  console.log(`[Test] Feature refined ✓  (${refinedFeature.userStories?.length ?? 0} US, refinementFile: ${refinedFeature.refinementFile})`);

  // Seite neu laden, damit die aktuellen Daten sichtbar sind
  await page.reload();
  await expect(page.getByText(/Ebene 3/i)).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(PAUSE);

  // ── Schritt 12: Refinement-Ergebnis in der UI prüfen ─────────────────────
  // SM-Direktive muss sichtbar sein (storiesStatus = 'ready')
  await expect(page.getByText(/SM-Direktive/i)).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(PAUSE);

  // Refinement-Datei-Link muss sichtbar sein
  await expect(page.getByText(/Refinement/i).first()).toBeVisible();
  await page.waitForTimeout(PAUSE);

  // Story-Fehler-Banner darf NICHT vorhanden sein
  await expect(page.getByText(/Story-Generierung fehlgeschlagen/i)).not.toBeVisible();
});
