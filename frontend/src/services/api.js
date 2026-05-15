import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8000',
  headers: { 'Content-Type': 'application/json' },
});

// ── Leads ─────────────────────────────────────────────────────────────────────
export const getLeads = (params = {}) => api.get('/leads/', { params });
export const getLead = (id) => api.get(`/leads/${id}`);
export const updateLead = (id, data) => api.put(`/leads/${id}`, data);
export const deleteLead = (id) => api.delete(`/leads/${id}`);
export const qualifyLead = (id) => api.post(`/leads/${id}/qualify`);
export const assignLead = (id, agentId) => api.post(`/leads/${id}/assign`, { agent_id: agentId });
export const getLeadMessages = (id) => api.get(`/leads/${id}/messages`);
export const getLeadStats = () => api.get('/leads/stats');
export const ingestLead = (data) => api.post('/leads/ingest', data);

// ── Agents ────────────────────────────────────────────────────────────────────
export const getAgents = (activeOnly = false) => api.get('/agents/', { params: { active_only: activeOnly } });
export const getAgent = (id) => api.get(`/agents/${id}`);
export const createAgent = (data) => api.post('/agents/', data);
export const updateAgent = (id, data) => api.put(`/agents/${id}`, data);
export const deactivateAgent = (id) => api.delete(`/agents/${id}`);
export const getAgentLeads = (id, status) => api.get(`/agents/${id}/leads`, { params: status ? { status } : {} });

// ── Auth ──────────────────────────────────────────────────────────────────────
export const agentLogin = (phone, pin) => api.post('/auth/login', { phone, pin });
export const setAgentPin = (agentId, pin) => api.post('/auth/set-pin', { agent_id: agentId, pin });
export const getMyLeads = (token) => api.get('/agents/me/leads', { headers: { Authorization: `Bearer ${token}` } });
export const updateLeadAsAgent = (id, data, token) => api.put(`/leads/${id}`, data, { headers: { Authorization: `Bearer ${token}` } });
export const getLeadMessagesAsAgent = (id, token) => api.get(`/leads/${id}/messages`, { headers: { Authorization: `Bearer ${token}` } });

export default api;
