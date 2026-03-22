import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/scrumApi';
import KanbanBoard from '../components/KanbanBoard';
import Modal from '../components/Modal';

const STORY_STATUSES = [
  { key: 'new', label: 'New' },
  { key: 'refined', label: 'Refined' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
];

const SP_OPTIONS = [1, 2, 3, 5, 8, 13, 21];

const TUS_STATUSES = [
  { key: 'new',         label: 'New' },
  { key: 'refined',    label: 'Refined' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'done',        label: 'Done' },
];

const COMPONENT_OPTIONS = ['Frontend', 'Backend', 'Datenbank', 'API', 'Infrastruktur', 'Sonstige'];

const EMPTY_TUS_FORM = {
  title: '',
  component: 'Backend',
  description: '',
  acceptanceCriteria: '',
  linkedStories: '',
};

const EMPTY_FORM = {
  title: '',
  description: '',
  acceptanceCriteria: '',
  storyPoints: 3,
};

export default function FeatureDetail() {
  const { projectId, featureId } = useParams();
  const [project, setProject] = useState(null);
  const [feature, setFeature] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingStory, setEditingStory] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const [showTusModal, setShowTusModal] = useState(false);
  const [editingTus, setEditingTus] = useState(null);
  const [tusFormData, setTusFormData] = useState(EMPTY_TUS_FORM);

  const fetchData = useCallback(async () => {
    try {
      const proj = await api.getProject(projectId);
      setProject(proj);
      const feat = proj.features.find((f) => f.id === featureId);
      if (!feat) throw new Error('Feature nicht gefunden');
      setFeature(feat);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, featureId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll every 4 s while SM→PO is working
  useEffect(() => {
    if (feature?.storiesStatus !== 'pending') return;
    const id = setInterval(fetchData, 4000);
    return () => clearInterval(id);
  }, [feature?.storiesStatus, fetchData]);

  const handleGenerateStories = async () => {
    try {
      await api.generateStories(projectId, featureId);
      fetchData();
    } catch (e) {
      alert(e.message);
    }
  };

  const openEdit = (story) => {
    setEditingStory(story);
    setFormData({
      title: story.title,
      description: story.description,
      acceptanceCriteria: story.acceptanceCriteria,
      storyPoints: story.storyPoints,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!editingStory) return; // User Stories werden nur vom KI-Agenten erstellt
    try {
      await api.updateStory(projectId, featureId, editingStory.id, formData);
      setShowModal(false);
      fetchData();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleStatusChange = async (story, newStatus) => {
    try {
      await api.updateStory(projectId, featureId, story.id, { status: newStatus });
      fetchData();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleDelete = async (story) => {
    if (!window.confirm(`User Story "${story.title}" wirklich löschen?`)) return;
    try {
      await api.deleteStory(projectId, featureId, story.id);
      fetchData();
    } catch (e) {
      alert(e.message);
    }
  };

  const openCreateTus = () => {
    setEditingTus(null);
    setTusFormData(EMPTY_TUS_FORM);
    setShowTusModal(true);
  };

  const openEditTus = (tus) => {
    setEditingTus(tus);
    setTusFormData({
      title:              tus.title,
      component:          tus.component,
      description:        tus.description,
      acceptanceCriteria: Array.isArray(tus.acceptanceCriteria)
        ? tus.acceptanceCriteria.join('\n')
        : tus.acceptanceCriteria || '',
      linkedStories: Array.isArray(tus.linkedStories)
        ? tus.linkedStories.join(', ')
        : tus.linkedStories || '',
    });
    setShowTusModal(true);
  };

  const handleTusSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...tusFormData,
      acceptanceCriteria: tusFormData.acceptanceCriteria
        .split('\n').map((s) => s.trim()).filter(Boolean),
      linkedStories: tusFormData.linkedStories
        .split(',').map((s) => s.trim()).filter(Boolean),
    };
    try {
      if (editingTus) {
        await api.updateTus(projectId, featureId, editingTus.id, payload);
      } else {
        await api.createTus(projectId, featureId, payload);
      }
      setShowTusModal(false);
      fetchData();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleTusStatusChange = async (tus, newStatus) => {
    try {
      await api.updateTus(projectId, featureId, tus.id, { status: newStatus });
      fetchData();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleTusDelete = async (tus) => {
    if (!window.confirm(`Technische Story "${tus.title}" wirklich löschen?`)) return;
    try {
      await api.deleteTus(projectId, featureId, tus.id);
      fetchData();
    } catch (e) {
      alert(e.message);
    }
  };

  const renderCardContent = (story) => (
    // ... existing story card
    <div>
      {/* Story number badge (AI-generated) */}
      {story.storyNumber && (
        <span className="inline-block text-xs font-bold bg-indigo-100 text-indigo-700 rounded px-1.5 py-0.5 mb-1.5">
          {story.storyNumber}
        </span>
      )}
      <h4 className="font-semibold text-gray-800 text-sm mb-1 leading-snug">
        {story.title}
      </h4>

      {/* Structured format (AI-generated) */}
      {story.asA ? (
        <p className="text-xs text-gray-500 italic mb-1.5 line-clamp-2">
          Als {story.asA} möchte ich {story.iWant}…
        </p>
      ) : (
        story.description && (
          <p className="text-xs text-gray-500 line-clamp-2 mb-2">{story.description}</p>
        )
      )}

      {/* Acceptance criteria */}
      {Array.isArray(story.acceptanceCriteria) && story.acceptanceCriteria.length > 0 ? (
        <div className="text-xs text-gray-500 bg-gray-50 rounded p-2 mb-2 border border-gray-100">
          <span className="text-green-600 font-medium">AC: </span>
          {story.acceptanceCriteria[0]}
          {story.acceptanceCriteria.length > 1 && (
            <span className="text-gray-400"> +{story.acceptanceCriteria.length - 1} weitere</span>
          )}
        </div>
      ) : (
        story.acceptanceCriteria && (
          <div className="text-xs text-gray-500 bg-gray-50 rounded p-2 mb-2 line-clamp-2 border border-gray-100">
            <span className="text-green-600 font-medium">AC: </span>
            {story.acceptanceCriteria}
          </div>
        )
      )}

      <div className="flex items-center gap-2 mt-1">
        {story.storyPoints > 0 && (
          <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 rounded px-2 py-0.5 font-semibold">
            {story.storyPoints} SP
          </span>
        )}
        {story.generatedBy && (
          <span className="text-xs text-gray-300">{story.generatedBy}</span>
        )}
      </div>
    </div>
  );

  const renderTusCardContent = (tus) => (
    <div>
      <div className="flex items-center gap-1 mb-1.5 flex-wrap">
        {tus.tusNumber && (
          <span className="inline-block text-xs font-bold bg-purple-100 text-purple-700 rounded px-1.5 py-0.5">
            {tus.tusNumber}
          </span>
        )}
        {tus.component && (
          <span className="inline-block text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
            {tus.component}
          </span>
        )}
      </div>
      <h4 className="font-semibold text-gray-800 text-sm mb-1 leading-snug">{tus.title}</h4>
      {tus.description && (
        <p className="text-xs text-gray-500 line-clamp-2 mb-2">{tus.description}</p>
      )}
      {Array.isArray(tus.acceptanceCriteria) && tus.acceptanceCriteria.length > 0 && (
        <div className="text-xs text-gray-500 bg-gray-50 rounded p-2 mb-2 border border-gray-100">
          <span className="text-purple-600 font-medium">AC: </span>
          {tus.acceptanceCriteria[0]}
          {tus.acceptanceCriteria.length > 1 && (
            <span className="text-gray-400"> +{tus.acceptanceCriteria.length - 1} weitere</span>
          )}
        </div>
      )}
      {Array.isArray(tus.linkedStories) && tus.linkedStories.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {tus.linkedStories.map((s) => (
            <span key={s} className="text-xs bg-indigo-50 text-indigo-500 rounded px-1.5 py-0.5 border border-indigo-100">
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  if (loading) return <div className="py-16 text-center text-gray-400">Lade...</div>;
  if (error)
    return <div className="py-16 text-center text-red-500">Fehler: {error}</div>;
  if (!project || !feature) return null;

  const totalSP = feature.userStories?.reduce((s, u) => s + (u.storyPoints || 0), 0) ?? 0;
  const doneSP =
    feature.userStories
      ?.filter((u) => u.status === 'done')
      .reduce((s, u) => s + (u.storyPoints || 0), 0) ?? 0;

  return (
    <div>
      {/* ── Breadcrumb ────────────────────────────────────────────────────────── */}
      <nav className="flex items-center gap-2 text-sm mb-4 flex-wrap">
        <Link to="/" className="text-indigo-400 hover:text-indigo-600 font-medium transition-colors">
          📁 Projekte
        </Link>
        <span className="text-gray-300">›</span>
        <Link to={`/projects/${projectId}`} className="text-emerald-600 hover:text-emerald-700 font-medium transition-colors">
          ⚡ {project.name}
        </Link>
        <span className="text-gray-300">›</span>
        <span className="text-amber-700 font-semibold">📌 {feature.name}</span>
      </nav>

      {/* ── Ebenen-Banner: User-Story-Ebene ───────────────────────────────────── */}
      <div className="bg-amber-600 text-white rounded-2xl px-6 py-5 mb-6 shadow-lg">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="bg-amber-400 rounded-xl p-3 text-2xl leading-none">📌</div>
            <div>
              <p className="text-sm font-bold text-red-600 uppercase tracking-widest mb-0.5">Ebene 3 — Feature</p>
              <h1 className="text-3xl font-extrabold leading-tight">{feature.name}</h1>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-4 text-sm text-amber-100 font-medium">
              <span>{feature.userStories?.length ?? 0} Stories</span>
              <span>Gesamt: {totalSP} SP</span>
              {totalSP > 0 && (
                <span>Fertig: {doneSP} SP ({Math.round((doneSP / totalSP) * 100)}%)</span>
              )}
            </div>
            <p className="text-xs text-amber-200">User Stories werden vom KI-Team generiert</p>
          </div>
        </div>
        {feature.description && (
          <p className="text-amber-100 text-sm mt-3 leading-relaxed">{feature.description}</p>
        )}
      </div>

      {/* SM→PO orchestration status banner */}
      {feature.storiesStatus === 'pending' && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-6 text-sm text-blue-800">
          <svg className="animate-spin h-4 w-4 text-blue-500 flex-shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          <div>
            <span className="font-semibold">Susi (SM)</span> koordiniert{' '}
            <span className="font-semibold">Peter (PO)</span> — User Stories werden generiert…
          </div>
        </div>
      )}

      {feature.storiesStatus === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6 text-sm text-red-700">
          <p className="font-semibold mb-1">❌ Story-Generierung fehlgeschlagen</p>
          <p className="text-xs text-red-500 mb-2 font-mono break-all">{feature.storiesError}</p>
          <button
            onClick={handleGenerateStories}
            className="px-3 py-1 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700 transition-colors"
          >
            Erneut versuchen
          </button>
        </div>
      )}

      {feature.storiesStatus === 'ready' && feature.smDirective && (
        <details className="mb-6 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold text-green-800">
            ✅ SM-Direktive (Susi → Peter)
          </summary>
          <p className="mt-2 text-green-700 text-xs whitespace-pre-wrap">{feature.smDirective}</p>
          {feature.storiesFile && (
            <p className="mt-1 text-xs text-green-500 font-mono">{feature.storiesFile}</p>
          )}
          {feature.architectureFile && (
            <p className="mt-1 text-xs text-blue-500 font-mono">
              🏗️ Architecture.md: {feature.architectureFile}
            </p>
          )}
        </details>
      )}

      <KanbanBoard
        items={feature.userStories ?? []}
        statuses={STORY_STATUSES}
        onStatusChange={handleStatusChange}
        onEdit={openEdit}
        onDelete={handleDelete}
        onCardClick={null}
        renderCardContent={renderCardContent}
      />

      {/* ── Technische User Stories ──────────────────────────────────────────────── */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-700">Technische User Stories</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {feature.technicalStories?.length ?? 0} TUS
              {feature.technicalStories?.length > 0 && (
                <span className="ml-2 text-purple-400">
                  — erstellt von Tobias (TPO)
                </span>
              )}
            </p>
          </div>
          <button
            onClick={openCreateTus}
            className="flex-shrink-0 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
          >
            + Neue TUS
          </button>
        </div>
        <KanbanBoard
          items={feature.technicalStories ?? []}
          statuses={TUS_STATUSES}
          onStatusChange={handleTusStatusChange}
          onEdit={openEditTus}
          onDelete={handleTusDelete}
          onCardClick={null}
          renderCardContent={renderTusCardContent}
        />
      </div>

      {showModal && editingStory && (
        <Modal
          title="User Story bearbeiten"
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmit}
          submitLabel="Speichern"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titel *</label>
            <input
              type="text"
              required
              autoFocus
              value={formData.title}
              onChange={(e) => setFormData((d) => ({ ...d, title: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Als Nutzer möchte ich..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Beschreibung
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData((d) => ({ ...d, description: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              rows={2}
              placeholder="Weitere Details..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Akzeptanzkriterien
            </label>
            <textarea
              value={formData.acceptanceCriteria}
              onChange={(e) =>
                setFormData((d) => ({ ...d, acceptanceCriteria: e.target.value }))
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              rows={2}
              placeholder="Gegeben... Wenn... Dann..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Story Points
            </label>
            <div className="flex gap-2 flex-wrap">
              {SP_OPTIONS.map((sp) => (
                <button
                  key={sp}
                  type="button"
                  onClick={() => setFormData((d) => ({ ...d, storyPoints: sp }))}
                  className={`w-10 h-10 rounded-lg text-sm font-semibold border transition-colors ${
                    formData.storyPoints === sp
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-600'
                  }`}
                >
                  {sp}
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {showTusModal && (
        <Modal
          title={editingTus ? 'TUS bearbeiten' : 'Neue Technische User Story'}
          onClose={() => setShowTusModal(false)}
          onSubmit={handleTusSubmit}
          submitLabel={editingTus ? 'Speichern' : 'Erstellen'}
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titel *</label>
            <input
              type="text"
              required
              autoFocus
              value={tusFormData.title}
              onChange={(e) => setTusFormData((d) => ({ ...d, title: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Technische Aufgabe..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Komponente</label>
            <select
              value={tusFormData.component}
              onChange={(e) => setTusFormData((d) => ({ ...d, component: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {COMPONENT_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label>
            <textarea
              value={tusFormData.description}
              onChange={(e) => setTusFormData((d) => ({ ...d, description: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              rows={2}
              placeholder="Technische Details..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Akzeptanzkriterien{' '}
              <span className="font-normal text-gray-400">(je Zeile ein Kriterium)</span>
            </label>
            <textarea
              value={tusFormData.acceptanceCriteria}
              onChange={(e) => setTusFormData((d) => ({ ...d, acceptanceCriteria: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              rows={2}
              placeholder="Unit Tests vorhanden&#10;Response time &lt; 200ms"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Verknüpfte Stories{' '}
              <span className="font-normal text-gray-400">(z.B. US-001, US-002)</span>
            </label>
            <input
              type="text"
              value={tusFormData.linkedStories}
              onChange={(e) => setTusFormData((d) => ({ ...d, linkedStories: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="US-001, US-002"
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
