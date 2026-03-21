import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import ProjectDetail from './pages/ProjectDetail';
import FeatureDetail from './pages/FeatureDetail';
import AgentFeed from './components/AgentFeed';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Header />
        <div className="flex-1 container mx-auto px-4 py-6 max-w-7xl flex gap-6">
          <main className="flex-1 min-w-0">
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
          <aside className="w-72 flex-shrink-0 bg-white border border-gray-200 rounded-lg p-4 sticky top-6 h-[calc(100vh-5rem)] flex flex-col">
            <AgentFeed />
          </aside>
        </div>
      </div>
    </BrowserRouter>
  );
}

