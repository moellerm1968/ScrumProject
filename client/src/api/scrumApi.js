const API_BASE = '/api';

async function request(method, path, body) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    let errMsg = res.statusText;
    try {
      const errBody = await res.json();
      errMsg = errBody.error || errMsg;
    } catch {
      // use statusText fallback
    }
    throw new Error(errMsg);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // Config
  getConfig: () => request('GET', '/config'),

  // Projects
  getProjects: () => request('GET', '/projects'),
  getProject: (id) => request('GET', `/projects/${id}`),
  createProject: (data) => request('POST', '/projects', data),
  updateProject: (id, data) => request('PUT', `/projects/${id}`, data),
  deleteProject: (id) => request('DELETE', `/projects/${id}`),

  // Features
  createFeature: (projectId, data) =>
    request('POST', `/projects/${projectId}/features`, data),
  updateFeature: (projectId, featureId, data) =>
    request('PUT', `/projects/${projectId}/features/${featureId}`, data),
  deleteFeature: (projectId, featureId) =>
    request('DELETE', `/projects/${projectId}/features/${featureId}`),
  generateStories: (projectId, featureId) =>
    request('POST', `/projects/${projectId}/features/${featureId}/generate-stories`),

  // User Stories
  createStory: (projectId, featureId, data) =>
    request('POST', `/projects/${projectId}/features/${featureId}/stories`, data),
  updateStory: (projectId, featureId, storyId, data) =>
    request(
      'PUT',
      `/projects/${projectId}/features/${featureId}/stories/${storyId}`,
      data
    ),
  deleteStory: (projectId, featureId, storyId) =>
    request(
      'DELETE',
      `/projects/${projectId}/features/${featureId}/stories/${storyId}`
    ),

  // Technical User Stories
  createTus: (projectId, featureId, data) =>
    request('POST', `/projects/${projectId}/features/${featureId}/technical-stories`, data),
  updateTus: (projectId, featureId, tusId, data) =>
    request('PUT', `/projects/${projectId}/features/${featureId}/technical-stories/${tusId}`, data),
  deleteTus: (projectId, featureId, tusId) =>
    request('DELETE', `/projects/${projectId}/features/${featureId}/technical-stories/${tusId}`),
};
