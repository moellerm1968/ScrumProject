import { useRef, useState, useCallback, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import ProjectDetail from './pages/ProjectDetail';
import FeatureDetail from './pages/FeatureDetail';
import AgentFeed from './components/AgentFeed';

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 900;
const SIDEBAR_DEFAULT = 320;
const BACKEND_PORT = import.meta.env.VITE_BACKEND_PORT || '3001';

export default function App() {
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [llmBackend, setLlmBackend] = useState('…');
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  // Fetch active LLM backend name and poll every 30s (shows cooldown state)
  useEffect(() => {
    const fetchStatus = () =>
      fetch(`http://localhost:${BACKEND_PORT}/api/llm-status`)
        .then(r => r.json())
        .then(d => setLlmBackend(d.backend ?? '–'))
        .catch(() => setLlmBackend('nicht erreichbar'));
    fetchStatus();
    const id = setInterval(fetchStatus, 30_000);
    return () => clearInterval(id);
  }, []);

  const onDividerMouseDown = useCallback((e) => {
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }, [sidebarWidth]);

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragging.current) return;
      // moving left → sidebar grows, moving right → sidebar shrinks
      const delta = startX.current - e.clientX;
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWidth.current + delta));
      setSidebarWidth(next);
    };
    const onMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Header />
        <div className="flex-1 flex gap-0">
          <main className="flex-1 min-w-0 p-4">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/projects/:projectId" element={<ProjectDetail />} />
              <Route
                path="/projects/:projectId/features/:featureId"
                element={<FeatureDetail />}
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>

          {/* ── Draggable divider ── */}
          <div
            onMouseDown={onDividerMouseDown}
            className="w-1.5 flex-shrink-0 bg-gray-200 hover:bg-indigo-400 active:bg-indigo-500 cursor-col-resize transition-colors"
            title="Breite anpassen"
          />

          <aside
            style={{ width: sidebarWidth }}
            className="flex-shrink-0 bg-white border-l border-gray-200 p-4 sticky top-0 h-screen flex flex-col"
          >
            <AgentFeed />
          </aside>
        </div>

        {/* ── LLM-Status-Zeile ── */}
        <footer className="sticky bottom-0 z-50 bg-gray-800 text-gray-300 text-xs px-4 py-1 flex items-center gap-2 border-t border-gray-700">
          <span className="text-gray-500">🤖 LLM:</span>
          <span className="font-mono text-green-400">{llmBackend}</span>
        </footer>
      </div>
    </BrowserRouter>
  );
}

