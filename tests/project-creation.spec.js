import { test, expect, request } from '@playwright/test';
import { randomBytes } from 'crypto';

// Generate a unique directory name for each test run to avoid conflicts
function uniqueDir() {
  return `test-${randomBytes(4).toString('hex')}`;
}

const VALID_DESCRIPTION =
  'Diese Anwendung soll den Scrum-Prozess digital abbilden und das Team bei der Planung unterstützen.';

// ─── Cleanup helper ────────────────────────────────────────────────────────────
// Deletes any projects whose directory name starts with "test-" via the API
async function cleanupTestProjects(apiContext) {
  const res = await apiContext.get('/api/projects');
  const projects = await res.json();
  for (const p of projects) {
    if (p.directory?.startsWith('test-')) {
      await apiContext.delete(`/api/projects/${p.id}`);
    }
  }
}

test.afterAll(async ({ playwright }) => {
  const apiContext = await request.newContext({ baseURL: 'http://localhost:3001' });
  await cleanupTestProjects(apiContext);
  await apiContext.dispose();
});

// ─── Suite: Dashboard ─────────────────────────────────────────────────────────

test.describe('Dashboard', () => {
  test('lädt korrekt und zeigt Projekte-Überschrift', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Projekte/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Neues Projekt/i })).toBeVisible();
  });

  test('Kanban-Board hat drei Spalten', async ({ page }) => {
    await page.goto('/');
    // The desktop grid has class md:grid-cols-3 — scope headings to that container
    // to avoid the hidden mobile duplicate columns triggering strict-mode errors.
    const desktopGrid = page.locator('.md\\:grid-cols-3');
    await expect(desktopGrid.getByRole('heading', { name: 'New', exact: true })).toBeVisible();
    await expect(desktopGrid.getByRole('heading', { name: 'In Progress', exact: true })).toBeVisible();
    await expect(desktopGrid.getByRole('heading', { name: 'Closed', exact: true })).toBeVisible();
  });
});

// ─── Suite: Neues-Projekt-Modal ───────────────────────────────────────────────

test.describe('Neues-Projekt-Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Neues Projekt/i }).click();
    await expect(page.getByRole('heading', { name: /Neues Projekt/i })).toBeVisible();
  });

  test('Modal öffnet sich und zeigt alle Felder', async ({ page }) => {
    await expect(page.getByPlaceholder(/E-Commerce Platform/i)).toBeVisible();
    await expect(page.getByPlaceholder(/mindestens 10 Wörtern/i)).toBeVisible();
    await expect(page.getByPlaceholder(/mein-projekt/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Erstellen/i })).toBeVisible();
  });

  test('Modal schließt sich beim Klick auf Abbrechen', async ({ page }) => {
    await page.getByRole('button', { name: /Abbrechen/i }).click();
    await expect(page.getByRole('heading', { name: /Neues Projekt/i })).not.toBeVisible();
  });

  test('Modal schließt sich beim Klick auf Backdrop', async ({ page }) => {
    // Click a corner of the viewport — definitely outside the centred dialog
    await page.mouse.click(10, 10);
    await expect(page.getByRole('heading', { name: /Neues Projekt/i })).not.toBeVisible();
  });

  test('Modal schließt sich beim Drücken von Escape', async ({ page }) => {
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: /Neues Projekt/i })).not.toBeVisible();
  });
});

// ─── Suite: Frontend-Validierung ──────────────────────────────────────────────

test.describe('Formular-Validierung (Frontend)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Neues Projekt/i }).click();
  });

  test('Fehlermeldung bei leerem Projektnamen', async ({ page }) => {
    await page.getByRole('button', { name: /Erstellen/i }).click();
    await expect(page.getByText(/Projektname ist Pflicht/i)).toBeVisible();
  });

  test('Fehlermeldung bei zu kurzer Beschreibung (< 10 Wörter)', async ({ page }) => {
    await page.getByPlaceholder(/E-Commerce Platform/i).fill('Mein Projekt');
    await page.getByPlaceholder(/mindestens 10 Wörtern/i).fill('Zu wenige Wörter hier');
    await page.getByPlaceholder(/mein-projekt/i).fill(uniqueDir());
    await page.getByRole('button', { name: /Erstellen/i }).click();
    await expect(page.getByText(/Mindestens 10 Wörter/i)).toBeVisible();
  });

  test('Wort-Zähler zeigt aktuellen Stand', async ({ page }) => {
    const textarea = page.getByPlaceholder(/mindestens 10 Wörtern/i);
    await textarea.fill('eins zwei drei');
    await expect(page.locator('p').filter({ hasText: /3\/10 Wörter/i })).toBeVisible();
  });

  test('Wort-Zähler wird grün ab 10 Wörtern', async ({ page }) => {
    const textarea = page.getByPlaceholder(/mindestens 10 Wörtern/i);
    await textarea.fill(VALID_DESCRIPTION);
    // Use a p-scoped filter — the counter is rendered as <p>, not <span>
    const counter = page.locator('p').filter({ hasText: /\d+\/10 Wörter/i });
    await expect(counter).toHaveClass(/text-green-600/);
  });

  test('Fehlermeldung bei Verzeichnisname mit Schrägstrich', async ({ page }) => {
    await page.getByPlaceholder(/E-Commerce Platform/i).fill('Mein Projekt');
    await page.getByPlaceholder(/mindestens 10 Wörtern/i).fill(VALID_DESCRIPTION);
    await page.getByPlaceholder(/mein-projekt/i).fill('../evil/path');
    await page.getByRole('button', { name: /Erstellen/i }).click();
    await expect(page.getByText(/Kein.*\/.*erlaubt|nicht.*erlaubt/i)).toBeVisible();
  });

  test('Fehlermeldung bei leerem Verzeichnisnamen', async ({ page }) => {
    await page.getByPlaceholder(/E-Commerce Platform/i).fill('Mein Projekt');
    await page.getByPlaceholder(/mindestens 10 Wörtern/i).fill(VALID_DESCRIPTION);
    await page.getByRole('button', { name: /Erstellen/i }).click();
    await expect(page.getByText(/Verzeichnis.*Pflicht/i)).toBeVisible();
  });

  test('Basispfad wird unter Verzeichnisfeld angezeigt', async ({ page }) => {
    // The basePath hint should be rendered once API/config response arrives
    await expect(page.getByText(/Basis:/i)).toBeVisible();
  });
});

// ─── Suite: Projektanlage (Happy Path) ───────────────────────────────────────

test.describe('Projektanlage – Happy Path', () => {
  test('Neues Projekt wird angelegt – Bestätigungs-Dialog erscheint', async ({ page }) => {
    const dir = uniqueDir();
    await page.goto('/');
    await page.getByRole('button', { name: /Neues Projekt/i }).click();

    await page.getByPlaceholder(/E-Commerce Platform/i).fill('Playwright Test Projekt');
    await page.getByPlaceholder(/mindestens 10 Wörtern/i).fill(VALID_DESCRIPTION);
    await page.getByPlaceholder(/mein-projekt/i).fill(dir);

    await page.getByRole('button', { name: /Erstellen/i }).click();

    // Confirmation dialog should appear
    await expect(page.getByText(/Projekt angelegt!/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Projektstruktur angelegt/i)).toBeVisible();
    // Scope to the confirmation card (.max-w-lg) to avoid matching hidden Kanban card elements
    await expect(page.locator('.max-w-lg').getByText(new RegExp(dir))).toBeVisible();
  });

  test('Bestätigungs-Dialog zeigt Team-Mitglieder', async ({ page }) => {
    const dir = uniqueDir();
    await page.goto('/');
    await page.getByRole('button', { name: /Neues Projekt/i }).click();

    await page.getByPlaceholder(/E-Commerce Platform/i).fill('Team-Test Projekt');
    await page.getByPlaceholder(/mindestens 10 Wörtern/i).fill(VALID_DESCRIPTION);
    await page.getByPlaceholder(/mein-projekt/i).fill(dir);

    await page.getByRole('button', { name: /Erstellen/i }).click();

    await expect(page.getByText(/Scrum-Team steht bereit/i)).toBeVisible({ timeout: 15_000 });
    // At least one team member name should appear
    await expect(
      page.getByText(/Susi|Peter|Felix|Bernd|David|Tobias|Konstantin/i).first()
    ).toBeVisible();
  });

  test('Klick auf "Erstes Feature anlegen" navigiert zur Projekt-Detailseite', async ({
    page,
  }) => {
    const dir = uniqueDir();
    await page.goto('/');
    await page.getByRole('button', { name: /Neues Projekt/i }).click();

    await page.getByPlaceholder(/E-Commerce Platform/i).fill('Navigation Test');
    await page.getByPlaceholder(/mindestens 10 Wörtern/i).fill(VALID_DESCRIPTION);
    await page.getByPlaceholder(/mein-projekt/i).fill(dir);

    await page.getByRole('button', { name: /Erstellen/i }).click();
    await expect(page.getByText(/Projekt angelegt!/i)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /Erstes Feature anlegen/i }).click();

    // Should navigate to /projects/:id
    await expect(page).toHaveURL(/\/projects\/.+/);
    await expect(page.getByRole('button', { name: /Neues Feature/i })).toBeVisible();
  });

  test('Duplikat-Verzeichnis wird vom Server abgelehnt', async ({ page, request: apiReq }) => {
    // First: create a project via API directly to set up the duplicate
    const dir = uniqueDir();
    const firstRes = await apiReq.post('http://localhost:3001/api/projects', {
      data: {
        name: 'Erster Eintrag',
        description: VALID_DESCRIPTION,
        directory: dir,
      },
    });
    expect(firstRes.ok()).toBeTruthy();

    // Second: try to create with same directory in UI
    await page.goto('/');
    await page.getByRole('button', { name: /Neues Projekt/i }).click();

    await page.getByPlaceholder(/E-Commerce Platform/i).fill('Duplikat Projekt');
    await page.getByPlaceholder(/mindestens 10 Wörtern/i).fill(VALID_DESCRIPTION);
    await page.getByPlaceholder(/mein-projekt/i).fill(dir);

    await page.getByRole('button', { name: /Erstellen/i }).click();

    await expect(page.getByText(/bereits.*verwendet|Duplikat/i)).toBeVisible({ timeout: 10_000 });
  });
});

// ─── Suite: Mobile Responsiveness ────────────────────────────────────────────

test.describe('Mobile Ansicht', () => {
  test.use({ viewport: { width: 390, height: 844 } }); // iPhone 14 dimensions

  test('Dashboard lädt auf mobilem Viewport', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Projekte/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Neues Projekt/i })).toBeVisible();
  });

  test('Tab-Navigation ist sichtbar auf Mobilgeräten', async ({ page }) => {
    await page.goto('/');
    // On mobile the tabbed layout should be visible instead of 3 columns
    await expect(page.getByRole('button', { name: /New/i })).toBeVisible();
  });

  test('Modal ist auf Mobilgeräten bedienbar', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Neues Projekt/i }).click();
    await expect(page.getByRole('heading', { name: /Neues Projekt/i })).toBeVisible();
    await expect(page.getByPlaceholder(/E-Commerce Platform/i)).toBeVisible();
  });
});
