import axios from 'axios';
import { mockBusinessServices, mockAssets, mockRecoveryEvents, mockSOE } from './mockData';

const BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const api = axios.create({ baseURL: BASE, withCredentials: true });

// Enable mock mode for development
const MOCK_MODE = import.meta.env.MODE === 'development';

// Inject JWT from localStorage on every request
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('restore_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// Auto logout on 401 & fallback to mock data on errors
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401 && !window.location.pathname.startsWith('/login')) {
      localStorage.removeItem('restore_token');
      window.location.href = '/login';
      return Promise.reject(err);
    }

    // Fall back to mock data if backend is unavailable
    if (MOCK_MODE && err.config) {
      const { method, url, data: reqData } = err.config;

      // Mock login
      if (url?.includes('/auth/login')) {
        try {
          const body = JSON.parse(reqData || '{}');
          const email = body.email;
          const tier = email?.includes('admin') ? 'ADMIN' : email?.includes('commander') ? 'SILVER' : 'BRONZE';
          return Promise.resolve({
            data: {
              data: {
                token: 'mock-token-' + Date.now(),
                user: {
                  id: 'mock-user-' + Date.now(),
                  email,
                  displayName: email?.split('@')[0] || 'User',
                  tier,
                },
              },
            },
            status: 200,
          });
        } catch {
          return Promise.reject(err);
        }
      }

      if (method === 'get') {
        // Return mock data for GET requests
        if (url?.includes('/business-services') && !url?.includes('/assets')) {
          return Promise.resolve({
            data: { data: mockBusinessServices },
            status: 200,
          });
        }
        if (url?.includes('/assets') && !url?.includes('dependencies')) {
          return Promise.resolve({
            data: { data: mockAssets },
            status: 200,
          });
        }
        if (url?.includes('/events') && !url?.includes('/soe') && !url?.includes('/gantt')) {
          return Promise.resolve({
            data: { data: mockRecoveryEvents },
            status: 200,
          });
        }
        if (url?.includes('/soe')) {
          return Promise.resolve({
            data: { data: mockSOE },
            status: 200,
          });
        }
        if (url?.includes('/audit')) {
          return Promise.resolve({
            data: { data: [] },
            status: 200,
          });
        }
        if (url?.includes('/connectors')) {
          return Promise.resolve({
            data: { data: [] },
            status: 200,
          });
        }
      }
    }

    return Promise.reject(err);
  }
);

// ── Typed API helpers ──────────────────────────────────────────────────────

export const authApi = {
  login:  (email: string, password: string) => api.post('/auth/login', { email, password }),
  me:     () => api.get('/auth/me'),
};

export const eventsApi = {
  list:         (params?: { status?: string; rehearsal?: boolean }) => api.get('/events', { params }),
  get:          (id: string) => api.get(`/events/${id}`),
  create:       (body: unknown) => api.post('/events', body),
  getSoe:       (id: string) => api.get(`/events/${id}/soe`),
  getGantt:     (id: string) => api.get(`/events/${id}/gantt`),
  updateStep:   (eventId: string, stepId: string, body: unknown) => api.patch(`/events/${eventId}/steps/${stepId}`, body),
  addEvidence:  (eventId: string, stepId: string, body: unknown) => api.post(`/events/${eventId}/steps/${stepId}/evidence`, body),
};

export const assetsApi = {
  list:         () => api.get('/assets'),
  create:       (body: unknown) => api.post('/assets', body),
  blastRadius:  (id: string) => api.post(`/assets/${id}/blast-radius`),
};

export const servicesApi = {
  list: () => api.get('/business-services'),
};

export const dashboardApi = {
  executive: () => api.get('/dashboard/executive'),
};

export const rehearsalsApi = {
  create: (body: unknown) => api.post('/rehearsals', body),
  start:  (id: string) => api.post(`/rehearsals/${id}/start`),
  report: (id: string) => api.get(`/rehearsals/${id}/report`),
};

export const auditApi = {
  list: (params?: unknown) => api.get('/audit', { params }),
};

export const connectorsApi = {
  list:   () => api.get('/connectors'),
  ingest: (connectorId: string) => api.post('/runbooks/ingest', { connectorId }),
};

// ── SSE hook ───────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useSSE(eventId?: string) {
  const qc = useQueryClient();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('restore_token');
    if (!token) return;

    const params = new URLSearchParams();
    if (eventId) params.set('eventId', eventId);
    // Pass token as query param for SSE (EventSource doesn't support headers)
    params.set('token', token);

    const url = `${BASE}/stream?${params}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('step_changed', () => {
      qc.invalidateQueries({ queryKey: ['soe', eventId] });
      qc.invalidateQueries({ queryKey: ['gantt', eventId] });
    });

    es.addEventListener('health_changed', () => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      qc.invalidateQueries({ queryKey: ['business-services'] });
    });

    es.addEventListener('ttfr_update', (e) => {
      const data = JSON.parse(e.data);
      qc.setQueryData(['ttfr', eventId], data);
    });

    es.addEventListener('confidence_update', (e) => {
      const data = JSON.parse(e.data);
      qc.setQueryData(['confidence', eventId], data);
    });

    es.onerror = () => {
      // SSE will auto-reconnect — this is expected on disconnect
    };

    return () => { es.close(); esRef.current = null; };
  }, [eventId, qc]);
}
