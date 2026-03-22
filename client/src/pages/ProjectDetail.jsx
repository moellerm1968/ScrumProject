import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api/scrumApi';
import KanbanBoard from '../components/KanbanBoard';
import Modal from '../components/Modal';

const FEATURE_STATUSES = [
  { key: 'new', label: 'New' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'implemented', label: 'Implemented' },
];

export default function ProjectDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingFeature, setEditingFeature] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '' });

  const fetchProject = useCallback(async () => {
    try {
      const data = await api.getProject(projectId);
      setProject(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const openCreate = () => {
    setEditingFeature(null);
    setFormData({ name: '', description: '' });
    setShowModal(true);
  };

  const openEdit = (feature) => {
    setEditingFeature(feature);
    setFormData({ name: feature.name, description: feature.description });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingFeature) {
        await api.updateFeature(projectId, editingFeature.id, formData);
      } else {
        await api.createFeature(projectId, formData);
      }
      setShowModal(false);
      fetchProject();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleStatusChange = async (feature, newStatus) => {
    try {
      await api.updateFeature(projectId, feature.id, { status: newStatus });
      fetchProject();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleDelete = async (feature) => {
    if (
      !window.confirm(
        `Feature "${feature.name}" wirklich löschen? Alle User Stories werden ebenfalls gelöscht.`
      )
    )
      return;
    try {
      await api.deleteFeature(projectId, feature.id);
      fetchProject();
    } catch (e) {
      alert(e.message);
    }
  };

  const renderCardContent = (feature) => (
    <div>
      <h4 className="font-semibold text-gray-800 mb-1 leading-snug">{feature.name}</h4>
      {feature.description && (
        <p className="text-sm text-gray-500 line-clamp-2 mb-2">{feature.description}</p>
      )}
      <div className="flex gap-3 text-xs text-gray-400 mt-2">
        <span>{feature.userStories?.length ?? 0} Stories</span>
        {feature.userStories?.length > 0 && (
          <>
            <span>·</span>
            <span>
              {feature.userStories.filter((s) => s.status === 'done').length}/
              {feature.userStories.length} done
            </span>
          </>
        )}
      </div>
    </div>
  );

  if (loading) return <div className="py-16 text-center text-gray-400">Lade...</div>;
  if (error)
    return <div className="py-16 text-center text-red-500">Fehler: {error}</div>;
  if (!project) return null;

  return (
    <div>
      {/* ── Breadcrumb ────────────────────────────────────────────────────────── */}
      <nav className="flex items-center gap-2 text-sm mb-4 flex-wrap">
        <Link to="/" className="text-indigo-400 hover:text-indigo-600 font-medium transition-colors">
          📁 Projekte
        </Link>
        <span className="text-gray-300">›</span>
        <span className="text-emerald-700 font-semibold">⚡ {project.name}</span>
      </nav>

      {/* ── Ebenen-Banner: Feature-Ebene ───────────────────────────────────── */}
      <div className="bg-emerald-700 text-white rounded-2xl px-6 py-5 mb-6 shadow-lg">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="bg-emerald-500 rounded-xl p-3 text-2xl leading-none">⚡</div>
            <div>
              <p className="text-xs font-semibold text-emerald-300 uppercase tracking-widest mb-0.5">Ebene 2 — Projekt</p>
              <h1 className="text-3xl font-extrabold leading-tight">{project.name}</h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-emerald-200 text-sm font-medium">
              {project.features?.length ?? 0} Features
            </span>
            <button
              onClick={openCreate}
              className="px-4 py-2 bg-white text-emerald-700 rounded-lg hover:bg-emerald-50 transition-colors text-sm font-semibold shadow"
            >
              + Neues Feature
            </button>
          </div>
        </div>
        {project.description && (
          <p className="text-emerald-100 text-sm mt-3 leading-relaxed">{project.description}</p>
        )}
      </div>

      <KanbanBoard
        items={project.features ?? []}
        statuses={FEATURE_STATUSES}
        onStatusChange={handleStatusChange}
        onEdit={openEdit}
        onDelete={handleDelete}
        onCardClick={(f) => navigate(`/projects/${projectId}/features/${f.id}`)}
        renderCardContent={renderCardContent}
      />

      {showModal && (
        <Modal
          title={editingFeature ? 'Feature bearbeiten' : 'Neues Feature'}
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmit}
          submitLabel={editingFeature ? 'Speichern' : 'Erstellen'}
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Feature-Name *
            </label>
            <input
              type="text"
              required
              autoFocus
              value={formData.name}
              onChange={(e) => setFormData((d) => ({ ...d, name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="z.B. User Authentication"
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
              rows={3}
              placeholder="Optionale Beschreibung..."
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
