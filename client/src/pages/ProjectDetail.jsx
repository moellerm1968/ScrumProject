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
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4 flex-wrap">
        <Link to="/" className="hover:text-indigo-600 transition-colors">
          Projekte
        </Link>
        <span className="text-gray-300">›</span>
        <span className="text-gray-800 font-medium">{project.name}</span>
      </nav>

      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{project.name}</h1>
          {project.description && (
            <p className="text-gray-500 text-sm mt-1">{project.description}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">
            {project.features?.length ?? 0} Features
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex-shrink-0 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
        >
          + Neues Feature
        </button>
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
