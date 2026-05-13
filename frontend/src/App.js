import React, { useState, useEffect, useCallback } from 'react';
import { getLeads, getLeadStats, getAgents, assignLead, qualifyLead, getLeadMessages, ingestLead, createAgent, updateAgent } from './services/api';

// ── Helpers ───────────────────────────────────────────────────────────────────
const SCORE_STYLES = {
  hot:         { bg: '#fff1f0', color: '#cf1322', border: '#ffa39e', label: '🔥 Hot' },
  warm:        { bg: '#fffbe6', color: '#d46b08', border: '#ffe58f', label: '🌡️ Warm' },
  cold:        { bg: '#e6f7ff', color: '#0958d9', border: '#91caff', label: '❄️ Cold' },
  unqualified: { bg: '#f5f5f5', color: '#595959', border: '#d9d9d9', label: '⚪ New' },
};

const STATUS_STYLES = {
  new:        { bg: '#f0f5ff', color: '#2f54eb' },
  contacted:  { bg: '#e6fffb', color: '#08979c' },
  qualified:  { bg: '#f6ffed', color: '#389e0d' },
  assigned:   { bg: '#fff7e6', color: '#d46b08' },
  converted:  { bg: '#f9f0ff', color: '#531dab' },
  lost:       { bg: '#fff1f0', color: '#cf1322' },
};

const formatBudget = (val) => {
  if (!val) return 'N/A';
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)} Cr`;
  return `₹${(val / 100000).toFixed(0)} L`;
};

const timeAgo = (dateStr) => {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const Badge = ({ text, style }) => (
  <span style={{
    display: 'inline-block', padding: '2px 10px', borderRadius: 12,
    fontSize: 12, fontWeight: 600, border: `1px solid ${style.border || style.bg}`,
    background: style.bg, color: style.color,
  }}>{text}</span>
);

// ── Stat Card ─────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, color, icon }) => (
  <div style={{
    background: '#fff', borderRadius: 12, padding: '20px 24px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)', flex: 1, minWidth: 140,
    borderLeft: `4px solid ${color}`,
  }}>
    <div style={{ fontSize: 28, marginBottom: 4 }}>{icon}</div>
    <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
    <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{label}</div>
  </div>
);

// ── Lead Row ──────────────────────────────────────────────────────────────────
const LeadRow = ({ lead, agents, onAssign, onQualify, onSelect }) => {
  const score = SCORE_STYLES[lead.score] || SCORE_STYLES.unqualified;
  const status = STATUS_STYLES[lead.status] || STATUS_STYLES.new;
  return (
    <tr style={{ borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}
        onClick={() => onSelect(lead)}>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ fontWeight: 600 }}>{lead.name}</div>
        <div style={{ fontSize: 12, color: '#888' }}>{lead.phone}</div>
      </td>
      <td style={{ padding: '12px 8px' }}>
        <Badge text={score.label} style={score} />
        <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{lead.score_value}/100</div>
      </td>
      <td style={{ padding: '12px 8px' }}>
        <Badge text={lead.status} style={status} />
      </td>
      <td style={{ padding: '12px 8px', fontSize: 13 }}>
        <div>{lead.property_type || '—'} {lead.bhk_preference ? `· ${lead.bhk_preference}` : ''}</div>
        <div style={{ color: '#888', fontSize: 12 }}>{lead.location_preference || '—'}</div>
      </td>
      <td style={{ padding: '12px 8px', fontSize: 13 }}>{formatBudget(lead.budget_max)}</td>
      <td style={{ padding: '12px 8px', fontSize: 13 }}>
        {lead.assigned_agent_name
          ? <span style={{ color: '#389e0d' }}>✓ {lead.assigned_agent_name}</span>
          : <span style={{ color: '#aaa' }}>Unassigned</span>}
      </td>
      <td style={{ padding: '12px 8px', fontSize: 12, color: '#aaa' }}>{timeAgo(lead.created_at)}</td>
      <td style={{ padding: '12px 8px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 6 }}>
          {lead.score === 'unqualified' && (
            <button onClick={() => onQualify(lead.id)} style={btnStyle('#1677ff')}>Score</button>
          )}
          {!lead.assigned_agent_id && lead.score !== 'unqualified' && (
            <select onChange={e => e.target.value && onAssign(lead.id, e.target.value)}
              defaultValue="" style={{ fontSize: 12, padding: '3px 6px', borderRadius: 6, border: '1px solid #d9d9d9' }}>
              <option value="">Assign…</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
        </div>
      </td>
    </tr>
  );
};

const btnStyle = (color) => ({
  background: color, color: '#fff', border: 'none', borderRadius: 6,
  padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 600,
});

// ── Lead Detail Modal ─────────────────────────────────────────────────────────
const LeadModal = ({ lead, agents, onClose, onAssign, onQualify }) => {
  const [messages, setMessages] = useState([]);
  const score = SCORE_STYLES[lead.score] || SCORE_STYLES.unqualified;

  useEffect(() => {
    getLeadMessages(lead.id).then(r => setMessages(r.data)).catch(() => {});
  }, [lead.id]);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 32, width: 680,
        maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0 }}>{lead.name}</h2>
            <div style={{ color: '#888', fontSize: 14 }}>{lead.phone} · {lead.email || 'No email'}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <Badge text={score.label} style={score} />
          <Badge text={`Score: ${lead.score_value}/100`} style={{ bg: '#f5f5f5', color: '#333', border: '#d9d9d9' }} />
          <Badge text={lead.status} style={STATUS_STYLES[lead.status] || STATUS_STYLES.new} />
          <Badge text={`Source: ${lead.source}`} style={{ bg: '#f0f5ff', color: '#2f54eb', border: '#adc6ff' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          {[
            ['Property Type', lead.property_type],
            ['BHK', lead.bhk_preference],
            ['Location', lead.location_preference],
            ['Budget', formatBudget(lead.budget_max)],
            ['Timeline', lead.purchase_timeline],
            ['Purpose', lead.purpose],
            ['Assigned To', lead.assigned_agent_name || 'Unassigned'],
            ['Lead Source', lead.source],
          ].map(([k, v]) => (
            <div key={k} style={{ background: '#fafafa', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5 }}>{k}</div>
              <div style={{ fontWeight: 600, marginTop: 2 }}>{v || '—'}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {lead.score === 'unqualified' && (
            <button onClick={() => { onQualify(lead.id); onClose(); }} style={btnStyle('#1677ff')}>
              🎯 Run Qualification
            </button>
          )}
          {!lead.assigned_agent_id && (
            <select onChange={e => e.target.value && onAssign(lead.id, e.target.value)}
              defaultValue=""
              style={{ fontSize: 13, padding: '6px 12px', borderRadius: 8, border: '1px solid #d9d9d9', cursor: 'pointer' }}>
              <option value="">👤 Assign to Agent…</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name} ({a.specialization || 'General'})</option>)}
            </select>
          )}
        </div>

        {/* WhatsApp Conversation */}
        <div>
          <h3 style={{ marginBottom: 12, fontSize: 15 }}>💬 WhatsApp Conversation ({messages.length} messages)</h3>
          {messages.length === 0
            ? <div style={{ color: '#aaa', fontSize: 13 }}>No messages yet</div>
            : (
              <div style={{ maxHeight: 260, overflowY: 'auto', background: '#f0f2f5', borderRadius: 10, padding: 12 }}>
                {messages.map(m => (
                  <div key={m.id} style={{
                    display: 'flex', justifyContent: m.direction === 'outbound' ? 'flex-end' : 'flex-start',
                    marginBottom: 8,
                  }}>
                    <div style={{
                      background: m.direction === 'outbound' ? '#dcf8c6' : '#fff',
                      borderRadius: 10, padding: '8px 12px', maxWidth: '75%',
                      fontSize: 13, boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                      whiteSpace: 'pre-wrap',
                    }}>
                      {m.text}
                      <div style={{ fontSize: 10, color: '#aaa', marginTop: 4, textAlign: 'right' }}>
                        {new Date(m.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  );
};

// ── Add Lead Modal ────────────────────────────────────────────────────────────
const AddLeadModal = ({ onClose, onAdded }) => {
  const [form, setForm] = useState({ name: '', phone: '', email: '', property_type: '', location_preference: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!form.name || !form.phone) { setError('Name and phone are required'); return; }
    setLoading(true);
    try {
      await ingestLead({ ...form, source: 'manual' });
      onAdded();
      onClose();
    } catch (e) {
      setError('Failed to add lead');
    } finally {
      setLoading(false);
    }
  };

  const field = (label, key, type = 'text') => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>{label}</label>
      <input type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d9d9d9', fontSize: 14 }} />
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ marginBottom: 20 }}>➕ Add Lead Manually</h2>
        {field('Full Name *', 'name')}
        {field('Phone Number *', 'phone')}
        {field('Email', 'email', 'email')}
        {field('Property Type', 'property_type')}
        {field('Preferred Location', 'location_preference')}
        {field('Notes', 'notes')}
        {error && <div style={{ color: '#cf1322', marginBottom: 12, fontSize: 13 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #d9d9d9', background: '#fff', cursor: 'pointer' }}>Cancel</button>
          <button onClick={submit} disabled={loading} style={btnStyle('#52c41a')}>
            {loading ? 'Adding…' : '✓ Add Lead'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Agents Tab ────────────────────────────────────────────────────────────────
const AgentsTab = () => {
  const [agents, setAgents] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', whatsapp_number: '', specialization: '', areas_covered: '', max_leads: 20 });

  const load = useCallback(() => {
    getAgents(false).then(r => setAgents(r.data)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    try {
      await createAgent(form);
      setShowAdd(false);
      setForm({ name: '', phone: '', email: '', whatsapp_number: '', specialization: '', areas_covered: '', max_leads: 20 });
      load();
    } catch (e) { alert('Failed to create agent'); }
  };

  const toggleActive = async (agent) => {
    await updateAgent(agent.id, { is_active: !agent.is_active });
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>👥 Sales Agents ({agents.length})</h2>
        <button onClick={() => setShowAdd(true)} style={btnStyle('#52c41a')}>+ Add Agent</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {agents.map(a => (
          <div key={a.id} style={{
            background: '#fff', borderRadius: 12, padding: 20,
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            opacity: a.is_active ? 1 : 0.6,
            borderLeft: `4px solid ${a.is_active ? '#52c41a' : '#d9d9d9'}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{a.name}</div>
                <div style={{ fontSize: 12, color: '#888' }}>{a.phone}</div>
              </div>
              <button onClick={() => toggleActive(a)} style={{
                fontSize: 11, padding: '3px 8px', borderRadius: 6, cursor: 'pointer',
                background: a.is_active ? '#fff1f0' : '#f6ffed',
                color: a.is_active ? '#cf1322' : '#389e0d',
                border: `1px solid ${a.is_active ? '#ffa39e' : '#b7eb8f'}`,
              }}>
                {a.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
            <div style={{ marginTop: 10, fontSize: 13 }}>
              <div style={{ color: '#666' }}>🏠 {a.specialization || 'General'}</div>
              <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>📍 {a.areas_covered || 'All areas'}</div>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 18, color: '#1677ff' }}>{a.active_lead_count}</div>
                <div style={{ fontSize: 11, color: '#aaa' }}>Active</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 18, color: '#52c41a' }}>{a.total_leads_assigned}</div>
                <div style={{ fontSize: 11, color: '#aaa' }}>Total</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 18, color: '#722ed1' }}>{a.conversion_rate}%</div>
                <div style={{ fontSize: 11, color: '#aaa' }}>Conv.</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 18, color: '#fa8c16' }}>{a.max_leads}</div>
                <div style={{ fontSize: 11, color: '#aaa' }}>Cap</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowAdd(false)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: 20 }}>➕ Add Agent</h2>
            {[['Name *', 'name'], ['Phone *', 'phone'], ['Email', 'email'], ['WhatsApp Number', 'whatsapp_number'], ['Specialization', 'specialization'], ['Areas Covered (comma separated)', 'areas_covered']].map(([label, key]) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>{label}</label>
                <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d9d9d9', fontSize: 14 }} />
              </div>
            ))}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Max Leads</label>
              <input type="number" value={form.max_leads} onChange={e => setForm(f => ({ ...f, max_leads: parseInt(e.target.value) }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d9d9d9', fontSize: 14 }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #d9d9d9', background: '#fff', cursor: 'pointer' }}>Cancel</button>
              <button onClick={submit} style={btnStyle('#52c41a')}>✓ Create Agent</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('leads');
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [agents, setAgents] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [showAddLead, setShowAddLead] = useState(false);
  const [filters, setFilters] = useState({ status: '', score: '', search: '' });
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.score) params.score = filters.score;
      if (filters.search) params.search = filters.search;
      const [leadsRes, statsRes, agentsRes] = await Promise.all([
        getLeads(params),
        getLeadStats(),
        getAgents(false),
      ]);
      setLeads(leadsRes.data.leads || []);
      setStats(statsRes.data);
      setAgents(agentsRes.data || []);
    } catch (e) {
      console.error('Failed to load data', e);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAssign = async (leadId, agentId) => {
    try {
      await assignLead(leadId, parseInt(agentId));
      loadData();
    } catch (e) { alert('Assignment failed'); }
  };

  const handleQualify = async (leadId) => {
    try {
      await qualifyLead(leadId);
      loadData();
    } catch (e) { alert('Qualification failed'); }
  };

  const tabStyle = (t) => ({
    padding: '10px 24px', cursor: 'pointer', fontWeight: 600, fontSize: 14,
    borderBottom: tab === t ? '3px solid #1677ff' : '3px solid transparent',
    color: tab === t ? '#1677ff' : '#666',
    background: 'none', border: 'none', borderBottom: tab === t ? '3px solid #1677ff' : '3px solid transparent',
  });

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      {/* Header */}
      <div style={{ background: '#001529', padding: '0 32px', display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{ color: '#fff', fontWeight: 800, fontSize: 18, padding: '16px 0', marginRight: 16 }}>
          🏠 RE Lead Qualifier
        </div>
        {['leads', 'agents'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            ...tabStyle(t),
            color: tab === t ? '#1890ff' : '#aaa',
            borderBottom: tab === t ? '3px solid #1890ff' : '3px solid transparent',
            padding: '16px 20px',
          }}>
            {t === 'leads' ? '📋 Leads' : '👥 Agents'}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', color: '#aaa', fontSize: 12 }}>
          {loading ? '⟳ Refreshing…' : `Last updated: ${new Date().toLocaleTimeString()}`}
        </div>
      </div>

      <div style={{ padding: '24px 32px' }}>
        {tab === 'leads' && (
          <>
            {/* Stats Row */}
            {stats && (
              <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
                <StatCard label="Total Leads" value={stats.total_leads} color="#1677ff" icon="📋" />
                <StatCard label="🔥 Hot" value={stats.by_score?.hot || 0} color="#cf1322" icon="🔥" />
                <StatCard label="🌡️ Warm" value={stats.by_score?.warm || 0} color="#d46b08" icon="🌡️" />
                <StatCard label="❄️ Cold" value={stats.by_score?.cold || 0} color="#0958d9" icon="❄️" />
                <StatCard label="Assigned" value={stats.by_status?.assigned || 0} color="#d46b08" icon="👤" />
                <StatCard label="Converted" value={stats.by_status?.converted || 0} color="#531dab" icon="✅" />
              </div>
            )}

            {/* Filters + Add Button */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <input placeholder="🔍 Search name or phone…" value={filters.search}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #d9d9d9', fontSize: 14, width: 240 }} />
              <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d9d9d9', fontSize: 14 }}>
                <option value="">All Statuses</option>
                {['new','contacted','qualified','assigned','converted','lost'].map(s =>
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
              <select value={filters.score} onChange={e => setFilters(f => ({ ...f, score: e.target.value }))}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d9d9d9', fontSize: 14 }}>
                <option value="">All Scores</option>
                {['hot','warm','cold','unqualified'].map(s =>
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
              <button onClick={loadData} style={{ ...btnStyle('#1677ff'), padding: '8px 16px' }}>↻ Refresh</button>
              <button onClick={() => setShowAddLead(true)} style={{ ...btnStyle('#52c41a'), padding: '8px 16px', marginLeft: 'auto' }}>
                + Add Lead
              </button>
            </div>

            {/* Leads Table */}
            <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fafafa', borderBottom: '2px solid #f0f0f0' }}>
                    {['Lead', 'Score', 'Status', 'Requirements', 'Budget', 'Agent', 'Time', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.length === 0
                    ? <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>
                        {loading ? 'Loading leads…' : 'No leads found. Add a lead or run the seed script.'}
                      </td></tr>
                    : leads.map(lead => (
                        <LeadRow key={lead.id} lead={lead} agents={agents}
                          onAssign={handleAssign} onQualify={handleQualify}
                          onSelect={setSelectedLead} />
                      ))
                  }
                </tbody>
              </table>
              <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', fontSize: 13, color: '#888' }}>
                Showing {leads.length} leads
              </div>
            </div>
          </>
        )}

        {tab === 'agents' && <AgentsTab />}
      </div>

      {/* Modals */}
      {selectedLead && (
        <LeadModal lead={selectedLead} agents={agents}
          onClose={() => setSelectedLead(null)}
          onAssign={(id, agentId) => { handleAssign(id, agentId); setSelectedLead(null); }}
          onQualify={(id) => { handleQualify(id); setSelectedLead(null); }} />
      )}
      {showAddLead && (
        <AddLeadModal onClose={() => setShowAddLead(false)} onAdded={loadData} />
      )}
    </div>
  );
}
