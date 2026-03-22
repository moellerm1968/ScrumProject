import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/scrumApi';
import KanbanBoard from '../components/KanbanBoard';
import Modal from '../components/Modal';

const PROJECT_STATUSES = [
  { key: 'new', label: 'New' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'closed', label: 'Closed' },
];

function countWords(str) {
  return (str || '').trim().split(/\s+/).filter(Boolean).length;
}

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '', directory: '' });
  const [formErrors, setFormErrors] = useState({});
  const [basePath, setBasePath] = useState('');
  const [confirmation, setConfirmation] = useState(null); // { project, team }
  const navigate = useNavigate();

  const fetchProjects = async () => {
    try {
      const data = await api.getProjects();
      setProjects(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
    api.getConfig().then((cfg) => setBasePath(cfg.basePath)).catch(() => {});
  }, []);  

  const openCreate = () => {
    setEditingProject(null);
    setFormData({ name: '', description: '', directory: '' });
    setFormErrors({});
    setShowModal(true);
  };

  const openEdit = (project) => {
    setEditingProject(project);
    setFormData({ name: project.name, description: project.description, directory: project.directory || '' });
    setFormErrors({});
    setShowModal(true);
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Projektname ist Pflicht.';
    if (countWords(formData.description) < 10)
      errors.description = `Mindestens 10 Wörter erforderlich (aktuell: ${countWords(formData.description)}).`;
    if (!editingProject) {
      if (!formData.directory.trim()) {
        errors.directory = 'Projektverzeichnis ist Pflicht.';
      } else if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(formData.directory.trim())) {
        errors.directory = 'Nur Buchstaben, Ziffern, "-" und "_". Kein "/" oder ".." erlaubt.';
      }
    }
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    try {
      if (editingProject) {
        await api.updateProject(editingProject.id, {
          name: formData.name,
          description: formData.description,
        });
        setShowModal(false);
        fetchProjects();
      } else {
        const result = await api.createProject(formData);
        setShowModal(false);
        fetchProjects();
        setConfirmation(result); // { project, team }
      }
    } catch (e) {
      setFormErrors({ server: e.message });
    }
  };

  const handleStatusChange = async (project, newStatus) => {
    try {
      await api.updateProject(project.id, { status: newStatus });
      fetchProjects();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleDelete = async (project) => {
    if (
      !window.confirm(
        `Projekt "${project.name}" wirklich löschen? Alle Features und User Stories werden ebenfalls gelöscht.`
      )
    )
      return;
    try {
      await api.deleteProject(project.id);
      fetchProjects();
    } catch (e) {
      alert(e.message);
    }
  };

  const renderCardContent = (project) => (
    <div>
      <h4 className="font-semibold text-gray-800 mb-1 leading-snug">{project.name}</h4>
      {project.description && (
        <p className="text-sm text-gray-500 line-clamp-2 mb-2">{project.description}</p>
      )}
      {project.directory && (
        <p className="text-xs text-indigo-400 font-mono mb-1 truncate">{project.directory}</p>
      )}
      <div className="flex gap-3 text-xs text-gray-400 mt-2">
        <span>{project.features?.length ?? 0} Features</span>
        <span>·</span>
        <span>
          {project.features?.reduce((s, f) => s + (f.userStories?.length ?? 0), 0) ?? 0}{' '}
          Stories
        </span>
      </div>
    </div>
  );

  if (loading)
    return <div className="py-16 text-center text-gray-400">Lade Projekte...</div>;
  if (error)
    return <div className="py-16 text-center text-red-500">Fehler: {error}</div>;

  return (
    <div>
      {/* ── Ebenen-Banner: Projekte ─────────────────────────────────────────────── */}
      <div className="bg-indigo-700 text-white rounded-2xl px-6 py-5 mb-6 shadow-lg">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-500 rounded-xl p-3 text-2xl leading-none">📁</div>
            <div>
              <p className="text-sm font-bold text-red-600 uppercase tracking-widest mb-0.5">Ebene 1 — Projekte</p>
              <h1 className="text-3xl font-extrabold leading-tight">Projekte</h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-indigo-200 text-sm font-medium">
              {projects.length} Projekt{projects.length !== 1 ? 'e' : ''}
            </span>
            <button
              onClick={openCreate}
              className="px-4 py-2 bg-white text-indigo-700 rounded-lg hover:bg-indigo-50 transition-colors text-sm font-semibold shadow"
            >
              + Neues Projekt
            </button>
          </div>
        </div>
      </div>

      <KanbanBoard
        items={projects}
        statuses={PROJECT_STATUSES}
        onStatusChange={handleStatusChange}
        onEdit={openEdit}
        onDelete={handleDelete}
        onCardClick={(p) => navigate(`/projects/${p.id}`)}
        renderCardContent={renderCardContent}
      />

      {showModal && (
        <Modal
          title={editingProject ? 'Projekt bearbeiten' : 'Neues Projekt'}
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmit}
          submitLabel={editingProject ? 'Speichern' : 'Erstellen'}
        >
          {formErrors.server && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
              {formErrors.server}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Projektname *
            </label>
            <input
              type="text"
              autoFocus
              value={formData.name}
              onChange={(e) => {
                setFormData((d) => ({ ...d, name: e.target.value }));
                setFormErrors((fe) => ({ ...fe, name: undefined }));
              }}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                formErrors.name ? 'border-red-400' : 'border-gray-300'
              }`}
              placeholder="z.B. E-Commerce Platform"
            />
            {formErrors.name && (
              <p className="text-xs text-red-500 mt-1">{formErrors.name}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Projektbeschreibung *{' '}
              <span className="text-gray-400 font-normal">(mind. 10 Wörter)</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => {
                setFormData((d) => ({ ...d, description: e.target.value }));
                setFormErrors((fe) => ({ ...fe, description: undefined }));
              }}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                formErrors.description ? 'border-red-400' : 'border-gray-300'
              }`}
              rows={3}
              placeholder="Beschreibe das Projekt in mindestens 10 Wörtern..."
            />
            <div className="flex justify-between mt-1">
              {formErrors.description ? (
                <p className="text-xs text-red-500">{formErrors.description}</p>
              ) : (
                <span />
              )}
              <p className={`text-xs ml-auto ${
                countWords(formData.description) >= 10 ? 'text-green-600' : 'text-gray-400'
              }`}>
                {countWords(formData.description)}/10 Wörter
              </p>
            </div>
          </div>
          {!editingProject && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Projektverzeichnis *
              </label>
              {basePath && (
                <p className="text-xs text-gray-400 mb-1 font-mono">
                  Basis: <span className="text-indigo-500">{basePath}/</span>
                </p>
              )}
              <input
                type="text"
                value={formData.directory}
                onChange={(e) => {
                  setFormData((d) => ({ ...d, directory: e.target.value }));
                  setFormErrors((fe) => ({ ...fe, directory: undefined }));
                }}
                className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  formErrors.directory ? 'border-red-400' : 'border-gray-300'
                }`}
                placeholder="mein-projekt"
              />
              {formErrors.directory ? (
                <p className="text-xs text-red-500 mt-1">{formErrors.directory}</p>
              ) : (
                <p className="text-xs text-gray-400 mt-1">
                  Nur Buchstaben, Ziffern, &ldquo;-&rdquo; und &ldquo;_&rdquo;. Wird direkt unter dem Basispfad angelegt.
                </p>
              )}
            </div>
          )}
        </Modal>
      )}

      {confirmation && (
        <ProjectCreatedConfirmation
          project={confirmation.project}
          team={confirmation.team}
          copilotCheck={confirmation.copilotCheck}
          basePath={basePath}
          onClose={() => setConfirmation(null)}
          onAddFeature={() => {
            setConfirmation(null);
            navigate(`/projects/${confirmation.project.id}`);
          }}
        />
      )}
    </div>
  );
}

// ─── Confirmation overlay ──────────────────────────────────────────────────────

const ROLE_ICON = {
  'Scrum Master': '🧭',
  'Product Owner': '🎯',
  'Frontend-Entwickler': '🖥️',
  'Backend-Entwickler': '⚙️',
  'Datenbank-Entwickler': '🗄️',
  'Cost & Budget Manager': '💰',
  'Technischer Product Owner': '🔧',
};

function roleIcon(role) {
  for (const [key, icon] of Object.entries(ROLE_ICON)) {
    if (role.includes(key)) return icon;
  }
  return '👤';
}

function ProjectCreatedConfirmation({ project, team, copilotCheck, basePath, onClose, onAddFeature }) {
  const copilotOk = copilotCheck?.ghInstalled && copilotCheck?.extensionInstalled && copilotCheck?.authenticated;
  const copilotProblems = [];
  if (copilotCheck) {
    if (!copilotCheck.ghInstalled)
      copilotProblems.push({ msg: 'GitHub CLI (gh) nicht gefunden.', fix: 'Installieren: https://cli.github.com/' });
    else if (!copilotCheck.extensionInstalled)
      copilotProblems.push({ msg: 'gh copilot Erweiterung fehlt.', fix: 'gh extension install github/gh-copilot' });
    if (copilotCheck.ghInstalled && !copilotCheck.authenticated)
      copilotProblems.push({ msg: 'Nicht bei GitHub angemeldet.', fix: 'gh auth login' });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg z-10 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-indigo-600 px-6 py-5 text-white flex-shrink-0">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-3xl">🚀</span>
            <div>
              <h2 className="text-xl font-bold">Projekt angelegt!</h2>
              <p className="text-indigo-200 text-sm">{project.name}</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          {/* Directory info */}
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <p className="text-sm font-medium text-green-800 mb-1">✅ Projektstruktur angelegt</p>
            <p className="text-xs text-green-700 font-mono break-all">
              {basePath}/{project.directory}/.github/agents/
            </p>
          </div>

          {/* Copilot CLI status */}
          {copilotCheck && (
            <div className={`rounded-lg border px-4 py-3 ${
              copilotOk
                ? 'bg-green-50 border-green-200'
                : 'bg-amber-50 border-amber-200'
            }`}>
              <p className={`text-sm font-semibold mb-2 ${
                copilotOk ? 'text-green-800' : 'text-amber-800'
              }`}>
                {copilotOk ? '✅ GitHub Copilot CLI bereit' : '⚠️ GitHub Copilot CLI – Setup erforderlich'}
              </p>
              {copilotOk && copilotCheck.details?.ghVersion && (
                <p className="text-xs text-green-700 font-mono">{copilotCheck.details.ghVersion}</p>
              )}
              {!copilotOk && copilotProblems.length > 0 && (
                <ul className="space-y-2">
                  {copilotProblems.map((p, i) => (
                    <li key={i} className="text-xs text-amber-800">
                      <span className="font-medium">• {p.msg}</span>
                      <br />
                      <span className="font-mono bg-amber-100 rounded px-1 py-0.5 mt-0.5 inline-block">{p.fix}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Team roster */}
          {team && team.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">
                👥 Dein Scrum-Team steht bereit:
              </p>
              <ul className="space-y-2">
                {team.map((m) => (
                  <li
                    key={m.file}
                    className="flex items-start gap-3 bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100"
                  >
                    <span className="text-xl leading-none mt-0.5">{roleIcon(m.role)}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{m.name}</p>
                      <p className="text-xs text-gray-500 leading-snug line-clamp-2">{m.role}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* CTA notice */}
          <p className="text-sm text-gray-600">
            {copilotOk || !copilotCheck
              ? 'Alles bereit – du kannst jetzt das erste Feature anlegen.'
              : 'Bitte richte zuerst die Copilot CLI ein, damit das Team Tasks ausführen kann.'}
          </p>
        </div>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 px-6 pb-5 pt-3 border-t flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Später
          </button>
          <button
            onClick={onAddFeature}
            className="px-5 py-2.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold transition-colors shadow-sm"
          >
            Erstes Feature anlegen →
          </button>
        </div>
      </div>
    </div>
  );
}
