import axios from 'axios';

const TOKEN_KEY = 'lifelink.token';
export const apiOrigin = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || '';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export const api = axios.create({
  // Falls back to the Vite dev proxy when VITE_API_URL is unset.
  baseURL: `${apiOrigin}/api`,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;

    // A dead API behind the dev proxy arrives as a 5xx with no usable body.
    // Say what is actually wrong rather than "status code 500".
    const serverDown =
      error.code === 'ERR_NETWORK' ||
      (status >= 500 && !error.response?.data?.message);

    const message =
      error.response?.data?.message ||
      (serverDown
        ? import.meta.env.PROD
          ? apiOrigin
            ? `Cannot reach the deployed API at ${apiOrigin}. Check that the Render service is live and its CLIENT_URL exactly matches this Vercel site.`
            : 'Cannot reach the API because VITE_API_URL is not set in Vercel. Add your Render service URL, then redeploy the frontend.'
          : 'Cannot reach the API server. Make sure it is running (npm run dev from the project root).'
        : error.message);

    // An expired or revoked token — drop it and let the router bounce to /login.
    if (status === 401 && tokenStore.get()) {
      tokenStore.clear();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login?expired=1');
      }
    }

    return Promise.reject(
      Object.assign(new Error(message), {
        status,
        details: error.response?.data?.details,
      })
    );
  }
);

/** Endpoint map — keeps URL strings out of the components. */
export const endpoints = {
  auth: {
    register: (body) => api.post('/auth/register', body),
    login: (body) => api.post('/auth/login', body),
    me: () => api.get('/auth/me'),
    updateProfile: (body) => api.patch('/auth/me', body),
    changePassword: (body) => api.patch('/auth/password', body),
  },
  donors: {
    publicStats: () => api.get('/donors/stats/public'),
    search: (params) => api.get('/donors', { params }),
    get: (id) => api.get(`/donors/${id}`),
    dashboard: () => api.get('/donors/me/dashboard'),
    setAvailability: (isAvailable) => api.patch('/donors/me/availability', { isAvailable }),
  },
  requests: {
    create: (body) => api.post('/requests', body),
    mine: () => api.get('/requests/mine'),
    feed: () => api.get('/requests/feed'),
    get: (id) => api.get(`/requests/${id}`),
    respond: (id, action) => api.patch(`/requests/${id}/respond`, { action }),
    cancel: (id) => api.patch(`/requests/${id}/cancel`),
    fulfil: (id, body) => api.post(`/requests/${id}/fulfil`, body),
  },
  reco: {
    list: (params) => api.get('/recommendations', { params }),
    explain: () => api.get('/recommendations/explain'),
  },
  chat: {
    conversations: () => api.get('/chat/conversations'),
    start: (body) => api.post('/chat/conversations', body),
    messages: (id, params) => api.get(`/chat/conversations/${id}/messages`, { params }),
    send: (id, body) => api.post(`/chat/conversations/${id}/messages`, { body }),
  },
  admin: {
    stats: () => api.get('/admin/stats'),
    users: (params) => api.get('/admin/users', { params }),
    updateUser: (id, body) => api.patch(`/admin/users/${id}`, body),
    deleteUser: (id) => api.delete(`/admin/users/${id}`),
    requests: (params) => api.get('/admin/requests', { params }),
    recordDonation: (body) => api.post('/admin/donations', body),
    report: (params) => api.get('/admin/reports', { params }),
    reportCsvUrl: (params) =>
      `${apiOrigin}/api/admin/reports?${new URLSearchParams({
        ...params,
        format: 'csv',
      })}`,
  },
};
