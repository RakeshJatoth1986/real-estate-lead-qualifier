import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8000',
  headers: { 'Content-Type': 'application/json' },
});

// ── Leads ─────────────────────────────────────────────────────────────────────
export const getLeads = (params = {}) => api.get('/leads/', { params });
export const getLead = (id) => api.get(`/leads/${id}`);
export const updateLead = (id, data) => api.put(`/leads/${id}`, data);
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

export default api;
