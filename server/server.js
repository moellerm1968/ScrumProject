import 'dotenv/config'; // must be first – populates process.env before other imports read it
import express from 'express';
import cors from 'cors';
import { orchestratePoForFeature } from './agents/smOrchestrator.js';
import { sseSubscribe, sseUnsubscribe } from './agents/eventBus.js';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
} from 'fs';
import { join, dirname, resolve, basename } from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT_PORT = parseInt(process.env.CLIENT_PORT || '5173');
const DATA_DIR = join(__dirname, 'data');
const DATA_FILE = join(DATA_DIR, 'projects.json');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const PROJECTS_BASE_DIR =
  process.env.PROJECTS_BASE_DIR || '/home/moellerm/Programming/ProjectsByScrumTeam';
const TEAM_DIR = join(__dirname, '..', 'team');

app.use(cors({ origin: [`http://localhost:${CLIENT_PORT}`] }));
app.use(express.json());

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

function readData() {
  if (!existsSync(DATA_FILE)) {
    writeFileSync(DATA_FILE, '[]', 'utf-8');
    return [];
  }
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeData(data) {
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// Extract name + role from the first two heading lines of a team markdown file
function parseTeamMember(filePath) {
  try {
    const lines = readFileSync(filePath, 'utf-8').split('\n');
    // Headline: "# Name — Rolle" or "# Name - Rolle"
    const headline = lines.find((l) => l.startsWith('# '))?.replace(/^# /, '').trim() ?? '';
    const [namePart, ...roleParts] = headline.split(/\s[—–-]\s/);
    // Role sub-heading is typically the paragraph after "## Rolle"
    const roleIdx = lines.findIndex((l) => l.trim() === '## Rolle');
    const roleDesc =
      roleParts.join(' ').trim() ||
      (roleIdx !== -1 ? lines.slice(roleIdx + 1).find((l) => l.trim()) ?? '' : '');
    return { name: namePart.trim(), role: roleDesc.trim() };
  } catch {
    return null;
  }
}

// Copy all files from team/ into <workDir>/.github/agents/ and return team roster
function copyTeamFiles(workDir) {
  const agentsDir = join(workDir, '.github', 'agents');
  mkdirSync(agentsDir, { recursive: true });

  const files = readdirSync(TEAM_DIR).filter((f) => f.endsWith('.md'));
  const team = [];
  for (const file of files) {
    const src = join(TEAM_DIR, file);
    copyFileSync(src, join(agentsDir, file));
    const member = parseTeamMember(src);
    if (member) team.push({ file, ...member });
  }
  return team;
}

// Validate a directory name: must be a plain name (no slashes, no dots-dots)
function isValidDirName(name) {
  if (!name || typeof name !== 'string') return false;
  // Only allow alphanumeric, hyphen, underscore; no slashes, no dots
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name)) return false;
  // Defense-in-depth: resolved path must be a direct child of PROJECTS_BASE_DIR
  const resolved = resolve(PROJECTS_BASE_DIR, name);
  return resolved === join(PROJECTS_BASE_DIR, basename(name));
}

// ─── COPILOT CLI CHECK ───────────────────────────────────────────────────────
//
// Checks three things (per the GitHub Copilot CLI quickstart):
//   1. `gh` (GitHub CLI) is on PATH
//   2. `gh copilot` extension is installed  →  gh extension list
//   3. The CLI is authenticated            →  gh auth status
//
// Uses async execFile with stdio:'pipe' so it never blocks the event loop
// and never tries to interact with a TTY.
//
async function checkCopilotCli() {
  const opts = { encoding: 'utf-8', timeout: 6000 };
  const result = {
    ghInstalled: false,
    extensionInstalled: false,
    authenticated: false,
    details: {},
  };

  // 1 – gh binary present?
  try {
    const { stdout } = await execFileAsync('gh', ['--version'], opts);
    result.ghInstalled = true;
    result.details.ghVersion = stdout.trim().split('\n')[0];
  } catch (e) {
    result.details.ghError = `gh nicht gefunden. Installieren: https://cli.github.com/ (${e.code ?? e.message})`;
    return result;
  }

  // 2 – copilot extension installed?
  try {
    const { stdout } = await execFileAsync('gh', ['extension', 'list'], opts);
    result.extensionInstalled = stdout.toLowerCase().includes('copilot');
    if (!result.extensionInstalled) {
      result.details.extensionError =
        'gh copilot Erweiterung nicht gefunden. Installieren mit: gh extension install github/gh-copilot';
    }
  } catch (e) {
    result.details.extensionError = e.stderr?.trim() || e.message;
  }

  // 3 – authenticated?
  try {
    await execFileAsync('gh', ['auth', 'status'], opts);
    result.authenticated = true;
  } catch (e) {
    // gh auth status exits non-zero and writes to stderr when not logged in
    const msg = (e.stderr?.trim() || e.stdout?.trim() || e.message);
    result.details.authError = msg.toLowerCase().includes('not logged')
      ? 'Nicht authentifiziert. Anmelden mit: gh auth login'
      : msg || 'Nicht authentifiziert. Anmelden mit: gh auth login';
  }

  return result;
}

// ─── CONFIG ──────────────────────────────────────────────────────────────────

app.get('/api/config', (_req, res) => {
  res.json({ basePath: PROJECTS_BASE_DIR });
});

app.get('/api/copilot-check', async (_req, res) => {
  try {
    const check = await checkCopilotCli();
    res.json(check);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── PROJECTS ────────────────────────────────────────────────────────────────

app.get('/api/projects', (_req, res) => {
  res.json(readData());
});

app.post('/api/projects', async (req, res) => {
  try {
    const { name, description, directory } = req.body;

    if (!name?.trim())
      return res.status(400).json({ error: 'Name is required' });

    // Require at least 10 words in description
    const descTrimmed = description?.trim() || '';
    const wordCount = descTrimmed.split(/\s+/).filter(Boolean).length;
    if (wordCount < 10)
      return res.status(400).json({
        error: `Projektbeschreibung muss mindestens 10 Wörter enthalten (aktuell: ${wordCount}).`,
      });

    // Validate directory name
    const dirName = directory?.trim();
    if (!dirName)
      return res.status(400).json({ error: 'Projektverzeichnis ist Pflicht.' });
    if (!isValidDirName(dirName))
      return res.status(400).json({
        error:
          'Ungültiger Verzeichnisname. Erlaubt: Buchstaben, Ziffern, Bindestriche, Underscores. Keine Pfadtrenner oder ".." erlaubt.',
      });

    const workDir = join(PROJECTS_BASE_DIR, dirName);

    // Check that the directory does not already exist (unique per project)
    const projects = readData();
    if (projects.some((p) => p.directory === dirName))
      return res.status(409).json({
        error: `Verzeichnis "${dirName}" wird bereits von einem anderen Projekt verwendet.`,
      });

    // Create the work directory on disk
    try {
      mkdirSync(workDir, { recursive: true });
    } catch (err) {
      return res.status(500).json({
        error: `Verzeichnis konnte nicht erstellt werden: ${err.message}`,
      });
    }

    // Copy team files into <workDir>/.github/agents/
    let team = [];
    try {
      team = copyTeamFiles(workDir);
    } catch (err) {
      console.warn('Team-Dateien konnten nicht kopiert werden:', err.message);
    }

    const project = {
      id: uuidv4(),
      name: name.trim(),
      description: descTrimmed,
      directory: dirName,
      workDir,
      status: 'new',
      createdAt: new Date().toISOString(),
      features: [],
    };
    projects.push(project);
    writeData(projects);

    // Check Copilot CLI availability asynchronously (non-fatal)
    const copilotCheck = await checkCopilotCli();

    res.status(201).json({ project, team, copilotCheck });
  } catch (err) {
    console.error('POST /api/projects error:', err);
    res.status(500).json({ error: err.message || 'Interner Serverfehler' });
  }
});

app.get('/api/projects/:projectId', (req, res) => {
  const projects = readData();
  const project = projects.find((p) => p.id === req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

app.put('/api/projects/:projectId', (req, res) => {
  const projects = readData();
  const idx = projects.findIndex((p) => p.id === req.params.projectId);
  if (idx === -1) return res.status(404).json({ error: 'Project not found' });

  const { name, description, status } = req.body;
  if (name !== undefined && !name?.trim())
    return res.status(400).json({ error: 'Name cannot be empty' });

  projects[idx] = {
    ...projects[idx],
    ...(name !== undefined && { name: name.trim() }),
    ...(description !== undefined && { description: description.trim() }),
    ...(status !== undefined && { status }),
    updatedAt: new Date().toISOString(),
  };
  writeData(projects);
  res.json(projects[idx]);
});

app.delete('/api/projects/:projectId', (req, res) => {
  const projects = readData();
  const idx = projects.findIndex((p) => p.id === req.params.projectId);
  if (idx === -1) return res.status(404).json({ error: 'Project not found' });
  projects.splice(idx, 1);
  writeData(projects);
  res.status(204).end();
});

// ─── FEATURES ────────────────────────────────────────────────────────────────

app.post('/api/projects/:projectId/features', (req, res) => {
  const { name, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

  const projects = readData();
  const project = projects.find((p) => p.id === req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const feature = {
    id: uuidv4(),
    name: name.trim(),
    description: description?.trim() || '',
    status: 'new',
    createdAt: new Date().toISOString(),
    userStories: [],
    storiesStatus: 'pending', // SM starts PO immediately
  };
  project.features.push(feature);
  writeData(projects);
  res.status(201).json(feature);

  // Fire-and-forget: SM orchestrates PO to generate user stories
  setImmediate(() => _runPoOrchestration(project, feature));
});

// Helper: run SM→PO in background and persist result
async function _runPoOrchestration(project, feature) {
  try {
    const { stories, filePath, smDirective, technicalStories, architectureFile } =
      await orchestratePoForFeature({ project, feature });

    const all = readData();
    const proj = all.find((p) => p.id === project.id);
    const feat = proj?.features.find((f) => f.id === feature.id);
    if (feat) {
      feat.userStories       = stories;
      feat.technicalStories  = technicalStories;
      feat.storiesStatus     = 'ready';
      feat.storiesFile       = filePath;
      feat.smDirective       = smDirective;
      feat.architectureFile  = architectureFile;
      writeData(all);
    }
    console.log(
      `✅ SM→PO→TPO: ${stories.length} US + ${technicalStories.length} TUS für "${feature.name}"`,
    );
  } catch (err) {
    console.error(`❌ SM→PO Fehler für "${feature.name}":`, err.message);
    const all = readData();
    const proj = all.find((p) => p.id === project.id);
    const feat = proj?.features.find((f) => f.id === feature.id);
    if (feat) {
      feat.storiesStatus = 'error';
      feat.storiesError  = err.message;
      writeData(all);
    }
  }
}

// Manual re-trigger (e.g. after error or explicit regeneration)
app.post('/api/projects/:projectId/features/:featureId/generate-stories', (req, res) => {
  const projects = readData();
  const project  = projects.find((p) => p.id === req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const feature  = project.features.find((f) => f.id === req.params.featureId);
  if (!feature) return res.status(404).json({ error: 'Feature not found' });

  feature.storiesStatus = 'pending';
  delete feature.storiesError;
  writeData(projects);

  res.json({ message: 'Story-Generierung gestartet', storiesStatus: 'pending' });
  setImmediate(() => _runPoOrchestration(project, feature));
});

app.put('/api/projects/:projectId/features/:featureId', (req, res) => {
  const projects = readData();
  const project = projects.find((p) => p.id === req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const idx = project.features.findIndex((f) => f.id === req.params.featureId);
  if (idx === -1) return res.status(404).json({ error: 'Feature not found' });

  const { name, description, status } = req.body;
  if (name !== undefined && !name?.trim())
    return res.status(400).json({ error: 'Name cannot be empty' });

  project.features[idx] = {
    ...project.features[idx],
    ...(name !== undefined && { name: name.trim() }),
    ...(description !== undefined && { description: description.trim() }),
    ...(status !== undefined && { status }),
    updatedAt: new Date().toISOString(),
  };
  writeData(projects);
  res.json(project.features[idx]);
});

app.delete('/api/projects/:projectId/features/:featureId', (req, res) => {
  const projects = readData();
  const project = projects.find((p) => p.id === req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const idx = project.features.findIndex((f) => f.id === req.params.featureId);
  if (idx === -1) return res.status(404).json({ error: 'Feature not found' });

  project.features.splice(idx, 1);
  writeData(projects);
  res.status(204).end();
});

// ─── USER STORIES ─────────────────────────────────────────────────────────────

app.post('/api/projects/:projectId/features/:featureId/stories', (req, res) => {
  const { title, description, acceptanceCriteria, storyPoints } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

  const projects = readData();
  const project = projects.find((p) => p.id === req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const feature = project.features.find((f) => f.id === req.params.featureId);
  if (!feature) return res.status(404).json({ error: 'Feature not found' });

  const story = {
    id: uuidv4(),
    title: title.trim(),
    description: description?.trim() || '',
    acceptanceCriteria: acceptanceCriteria?.trim() || '',
    storyPoints: parseInt(storyPoints, 10) || 0,
    status: 'new',
    createdAt: new Date().toISOString(),
  };
  feature.userStories.push(story);
  writeData(projects);
  res.status(201).json(story);
});

app.put(
  '/api/projects/:projectId/features/:featureId/stories/:storyId',
  (req, res) => {
    const projects = readData();
    const project = projects.find((p) => p.id === req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const feature = project.features.find((f) => f.id === req.params.featureId);
    if (!feature) return res.status(404).json({ error: 'Feature not found' });

    const idx = feature.userStories.findIndex((s) => s.id === req.params.storyId);
    if (idx === -1) return res.status(404).json({ error: 'Story not found' });

    const { title, description, acceptanceCriteria, storyPoints, status } = req.body;
    if (title !== undefined && !title?.trim())
      return res.status(400).json({ error: 'Title cannot be empty' });

    feature.userStories[idx] = {
      ...feature.userStories[idx],
      ...(title !== undefined && { title: title.trim() }),
      ...(description !== undefined && { description: description.trim() }),
      ...(acceptanceCriteria !== undefined && {
        acceptanceCriteria: acceptanceCriteria.trim(),
      }),
      ...(storyPoints !== undefined && { storyPoints: parseInt(storyPoints, 10) || 0 }),
      ...(status !== undefined && { status }),
      updatedAt: new Date().toISOString(),
    };
    writeData(projects);
    res.json(feature.userStories[idx]);
  }
);

app.delete(
  '/api/projects/:projectId/features/:featureId/stories/:storyId',
  (req, res) => {
    const projects = readData();
    const project = projects.find((p) => p.id === req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const feature = project.features.find((f) => f.id === req.params.featureId);
    if (!feature) return res.status(404).json({ error: 'Feature not found' });

    const idx = feature.userStories.findIndex((s) => s.id === req.params.storyId);
    if (idx === -1) return res.status(404).json({ error: 'Story not found' });

    feature.userStories.splice(idx, 1);
    writeData(projects);
    res.status(204).end();
  }
);

// ─── TECHNICAL USER STORIES ──────────────────────────────────────────────────

app.post('/api/projects/:projectId/features/:featureId/technical-stories', (req, res) => {
  const { title, component, description, acceptanceCriteria, linkedStories } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

  const projects = readData();
  const project = projects.find((p) => p.id === req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const feature = project.features.find((f) => f.id === req.params.featureId);
  if (!feature) return res.status(404).json({ error: 'Feature not found' });

  if (!feature.technicalStories) feature.technicalStories = [];

  const tus = {
    id: uuidv4(),
    title: title.trim(),
    component: component?.trim() || '',
    description: description?.trim() || '',
    acceptanceCriteria: Array.isArray(acceptanceCriteria)
      ? acceptanceCriteria
      : acceptanceCriteria?.trim() ? [acceptanceCriteria.trim()] : [],
    linkedStories: Array.isArray(linkedStories)
      ? linkedStories
      : linkedStories?.trim() ? linkedStories.split(',').map((s) => s.trim()).filter(Boolean) : [],
    status: 'new',
    createdAt: new Date().toISOString(),
  };
  feature.technicalStories.push(tus);
  writeData(projects);
  res.status(201).json(tus);
});

app.put(
  '/api/projects/:projectId/features/:featureId/technical-stories/:tusId',
  (req, res) => {
    const projects = readData();
    const project = projects.find((p) => p.id === req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const feature = project.features.find((f) => f.id === req.params.featureId);
    if (!feature) return res.status(404).json({ error: 'Feature not found' });

    const idx = (feature.technicalStories ?? []).findIndex((s) => s.id === req.params.tusId);
    if (idx === -1) return res.status(404).json({ error: 'TUS not found' });

    const { title, component, description, acceptanceCriteria, linkedStories, status } = req.body;
    if (title !== undefined && !title?.trim())
      return res.status(400).json({ error: 'Title cannot be empty' });

    feature.technicalStories[idx] = {
      ...feature.technicalStories[idx],
      ...(title !== undefined && { title: title.trim() }),
      ...(component !== undefined && { component: component.trim() }),
      ...(description !== undefined && { description: description.trim() }),
      ...(acceptanceCriteria !== undefined && {
        acceptanceCriteria: Array.isArray(acceptanceCriteria)
          ? acceptanceCriteria
          : acceptanceCriteria.trim().split('\n').map((s) => s.trim()).filter(Boolean),
      }),
      ...(linkedStories !== undefined && {
        linkedStories: Array.isArray(linkedStories)
          ? linkedStories
          : linkedStories.split(',').map((s) => s.trim()).filter(Boolean),
      }),
      ...(status !== undefined && { status }),
      updatedAt: new Date().toISOString(),
    };
    writeData(projects);
    res.json(feature.technicalStories[idx]);
  }
);

app.delete(
  '/api/projects/:projectId/features/:featureId/technical-stories/:tusId',
  (req, res) => {
    const projects = readData();
    const project = projects.find((p) => p.id === req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const feature = project.features.find((f) => f.id === req.params.featureId);
    if (!feature) return res.status(404).json({ error: 'Feature not found' });

    const idx = (feature.technicalStories ?? []).findIndex((s) => s.id === req.params.tusId);
    if (idx === -1) return res.status(404).json({ error: 'TUS not found' });

    feature.technicalStories.splice(idx, 1);
    writeData(projects);
    res.status(204).end();
  }
);

// ─── SSE AGENT FEED ────────────────────────────────────────────────────────
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write('data: {"type":"connected"}\n\n');
  const id = sseSubscribe(res);
  req.on('close', () => sseUnsubscribe(id));
});

// ─── GLOBAL ERROR HANDLER ───────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Interner Serverfehler' });
});

app.listen(PORT, () => {
  console.log(`✅  ScrumBoard API running on http://localhost:${PORT}`);
});
