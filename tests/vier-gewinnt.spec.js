/**
 * vier-gewinnt.spec.js
 *
 * Fachlicher End-to-End-Test:
 *   1. Projekt "4 Gewinnt" anlegen
 *   2. Feature "4 Gewinnt MVP" anlegen
 *
 * Zwischen jedem Schritt gibt es eine kurze Pause, damit der Ablauf
 * im Browser gut nachvollziehbar ist.
 */
import { test, expect, request } from '@playwright/test';

const PROJECT_NAME  = '4 Gewinnt';
const PROJECT_DIR   = 'vier-gewinnt';
const FEATURE_NAME  = '4 Gewinnt MVP';
const PAUSE         = 1200; // ms Pause zwischen Schritten

const PROJECT_DESCRIPTION =
  'Ein klassisches Vier-Gewinnt-Spiel als Web-App. Zwei Spieler können abwechselnd Steine in ein ' +
  '6×7-Raster einwerfen. Wer zuerst vier Steine in einer Reihe hat, gewinnt die Partie.';

// ─── Vorbereinigung ───────────────────────────────────────────────────────────
// Löscht ein eventuell bereits vorhandenes "vier-gewinnt"-Projekt via API,
// damit der Test immer sauber von vorne beginnt.
test.beforeEach(async ({ playwright }) => {
  const api = await request.newContext({ baseURL: 'http://localhost:3001' });
  const res  = await api.get('/api/projects');
  const all  = await res.json();
  for (const p of all) {
    if (p.directory === PROJECT_DIR) {
      await api.delete(`/api/projects/${p.id}`);
    }
  }
  await api.dispose();
});

// ─── Nachbereinigung ──────────────────────────────────────────────────────────
// Optional: nach dem Test-Lauf das erzeugte Projekt wieder löschen,
// damit es bei erneutem Ausführen keine Konflikte gibt.
test.afterEach(async ({ playwright }) => {
  const api = await request.newContext({ baseURL: 'http://localhost:3001' });
  const res  = await api.get('/api/projects');
  const all  = await res.json();
  for (const p of all) {
    if (p.directory === PROJECT_DIR) {
      await api.delete(`/api/projects/${p.id}`);
    }
  }
  await api.dispose();
});

// ─── Haupt-Test ───────────────────────────────────────────────────────────────

test('4 Gewinnt: Projekt und erstes Feature anlegen', async ({ page }) => {
  test.setTimeout(60_000); // Pausen + API-Calls brauchen mehr als 30s

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

  await page.getByPlaceholder(/mein-projekt/i).fill(PROJECT_DIR);
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
  // Warten auf den grünen Ebene-2-Banner
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

  await page
    .getByPlaceholder(/Optionale Beschreibung/i)
    .fill(
      'Minimaler spielbarer Prototyp: Spielbrett 6×7, Spielerwechsel, Gewinn-Erkennung, ' +
      'einfaches UI ohne KI-Gegner.'
    );
  await page.waitForTimeout(PAUSE);

  // ── Schritt 8: Feature erstellen ──────────────────────────────────────────
  await page.getByRole('button', { name: /^Erstellen$/i }).click();

  // Modal schließt sich
  await expect(page.getByRole('heading', { name: /Neues Feature/i })).not.toBeVisible();
  await page.waitForTimeout(PAUSE);

  // ── Schritt 9: Feature ist im Kanban-Board sichtbar ───────────────────────
  // Scope auf das Desktop-Grid (.md:grid-cols-3), damit die versteckte
  // Mobile-Spalte (md:hidden) nicht als Treffer zählt.
  const kanbanGrid = page.locator('.md\\:grid-cols-3');
  const featureCard = kanbanGrid
    .locator('.bg-white.rounded-lg')
    .filter({ hasText: FEATURE_NAME });
  await expect(featureCard.first()).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(PAUSE);

  // ── Schritt 10: Feature-Detailseite öffnen ────────────────────────────────────────────
  // KanbanCard rendert ein "Öffnen →"-Label auf dem klickbaren Div.
  await featureCard.first().getByText('Öffnen →').click();

  await expect(page).toHaveURL(/\/projects\/.+\/features\/.+/);
  // Warten auf den gelben Ebene-3-Banner
  await expect(page.getByText(/Ebene 3/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('heading', { level: 1, name: FEATURE_NAME })).toBeVisible();
  await page.waitForTimeout(PAUSE);

  // ── Schritt 11: KI-Agent-Status prüfen ────────────────────────────────────────────────
  // Das Feature löst automatisch den SM→PO→TPO-Workflow aus.
  // Je nach LLM-Verfügbarkeit ist der Status pending, ready oder error.
  // Der Test prüft nur, dass EINE der drei Status-Anzeigen sichtbar ist,
  // damit er auch ohne konfigurierten LLM-Zugang besteht.
  const statusPending = page.getByText(/User Stories werden generiert/i);
  const statusReady   = page.getByText(/SM-Direktive/i);
  const statusError   = page.getByText(/Story-Generierung fehlgeschlagen/i);

  await expect(statusPending.or(statusReady).or(statusError))
    .toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(PAUSE);
});
