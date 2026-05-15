import React, { useState, useEffect, useCallback } from 'react';
import {
  getLeads, getLeadStats, getAgents, assignLead, qualifyLead,
  getLeadMessages, ingestLead, createAgent, updateAgent, updateLead, deleteLead, setAgentPin
} from './services/api';

// ── Constants ─────────────────────────────────────────────────────────────────
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
const FOLLOW_UP_STYLES = {
  interested:          { bg: '#f6ffed', color: '#389e0d', label: '✅ Interested' },
  not_interested:      { bg: '#fff1f0', color: '#cf1322', label: '❌ Not Interested' },
  follow_up_scheduled: { bg: '#e6f4ff', color: '#1677ff', label: '📅 Follow-up Scheduled' },
  negotiating:         { bg: '#fff7e6', color: '#d46b08', label: '🤝 Negotiating' },
  converted:           { bg: '#f9f0ff', color: '#531dab', label: '🏆 Converted' },
};
const PIPELINE_COLS = [
  { key: 'new',       label: '🆕 New',       color: '#2f54eb' },
  { key: 'contacted', label: '📞 Contacted',  color: '#08979c' },
  { key: 'qualified', label: '✅ Qualified',  color: '#389e0d' },
  { key: 'assigned',  label: '👤 Assigned',   color: '#d46b08' },
  { key: 'converted', label: '🏆 Converted',  color: '#531dab' },
  { key: 'lost',      label: '❌ Lost',       color: '#cf1322' },
];

// ── Priority Score Formula ────────────────────────────────────────────────────
const TIMELINE_BONUS  = { immediate: 25, '3_months': 15, '6_months': 8, '1_year': 0, exploring: -15 };
const BUDGET_BONUS    = (max) => { if (!max) return 0; if (max >= 50000000) return 20; if (max >= 20000000) return 15; if (max >= 10000000) return 10; if (max >= 5000000) return 5; return 0; };
const FOLLOWUP_BONUS  = { negotiating: 25, interested: 15, follow_up_scheduled: 10, not_interested: -60 };
const AGING_PENALTY   = { critical: -25, warning: -12, mild: -5, fresh: 0, none: 0 };

const priorityScore = (lead) => {
  let score = lead.score_value || 0;
  score += TIMELINE_BONUS[lead.purchase_timeline] || 0;
  score += BUDGET_BONUS(lead.budget_max);
  score += FOLLOWUP_BONUS[lead.follow_up_status] || 0;
  score += AGING_PENALTY[agingLevel(lead)];
  return Math.max(0, Math.min(150, Math.round(score)));
};

const priorityLabel = (score) => {
  if (score >= 90) return { label: '🔴 Call Now',    color: '#cf1322', bg: '#fff1f0' };
  if (score >= 70) return { label: '🟠 Call Today',  color: '#d46b08', bg: '#fff7e6' };
  if (score >= 50) return { label: '🟡 This Week',   color: '#d4b106', bg: '#feffe6' };
  return               { label: '🟢 When Free',   color: '#389e0d', bg: '#f6ffed' };
};

// ── Helpers ───────────────────────────────────────────────────────────────────
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

const agingLevel = (lead) => {
  const last = lead.wa_last_message_at || lead.updated_at || lead.created_at;
  if (!last) return 'none';
  const hrs = (Date.now() - new Date(last).getTime()) / 3600000;
  if (hrs > 168) return 'critical'; // 7 days
  if (hrs > 48)  return 'warning';  // 48 hours
  if (hrs > 24)  return 'mild';     // 24 hours
  return 'fresh';
};

const AGING_COLORS = {
  critical: '#cf1322', warning: '#d46b08', mild: '#d4b106', fresh: '#52c41a', none: '#d9d9d9'
};
const AGING_LABELS = {
  critical: '🔴 7d+ no activity', warning: '🟡 48h+ no activity', mild: '🟡 24h+ no activity', fresh: '🟢 Active', none: ''
};

const Badge = ({ text, style }) => (
  <span style={{
    display: 'inline-block', padding: '2px 10px', borderRadius: 12,
    fontSize: 12, fontWeight: 600, border: `1px solid ${style.border || style.bg}`,
    background: style.bg, color: style.color, whiteSpace: 'nowrap',
  }}>{text}</span>
);

const btnStyle = (color, ghost = false) => ({
  background: ghost ? 'transparent' : color, color: ghost ? color : '#fff',
  border: `1px solid ${color}`, borderRadius: 6, padding: '4px 10px',
  fontSize: 12, cursor: 'pointer', fontWeight: 600,
});

// ── Stat Card ─────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, color, icon, onClick }) => (
  <div onClick={onClick} style={{
    background: '#fff', borderRadius: 12, padding: '18px 22px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)', flex: 1, minWidth: 120,
    borderLeft: `4px solid ${color}`, cursor: onClick ? 'pointer' : 'default',
  }}>
    <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
    <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
    <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{label}</div>
  </div>
);

// ── Lead Timeline ─────────────────────────────────────────────────────────────
const LeadTimeline = ({ lead, messages }) => {
  const events = [];

  events.push({ time: lead.created_at, icon: '🌱', label: 'Lead created', sub: `via ${lead.source}`, color: '#1677ff' });

  if (messages.length > 0) {
    const first = messages.find(m => m.direction === 'outbound');
    if (first) events.push({ time: first.timestamp, icon: '💬', label: 'WhatsApp conversation started', color: '#08979c' });
  }

  const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound');
  if (lastInbound) events.push({ time: lastInbound.timestamp, icon: '📨', label: 'Last reply from lead', color: '#389e0d' });

  if (lead.score && lead.score !== 'unqualified')
    events.push({ time: lead.updated_at, icon: '🎯', label: `Scored: ${lead.score.toUpperCase()} (${lead.score_value}/100)`, color: lead.score === 'hot' ? '#cf1322' : lead.score === 'warm' ? '#d46b08' : '#0958d9' });

  if (lead.assigned_at)
    events.push({ time: lead.assigned_at, icon: '👤', label: `Assigned to ${lead.assigned_agent_name || 'agent'}`, color: '#d46b08' });

  if (lead.follow_up_status)
    events.push({ time: lead.updated_at, icon: '📋', label: `Follow-up: ${FOLLOW_UP_STYLES[lead.follow_up_status]?.label || lead.follow_up_status}`, color: '#722ed1' });

  if (lead.agent_notes)
    events.push({ time: lead.updated_at, icon: '📝', label: 'Agent notes added', sub: lead.agent_notes.slice(0, 60) + (lead.agent_notes.length > 60 ? '…' : ''), color: '#d4b106' });

  if (lead.expected_conversion_date)
    events.push({ time: lead.expected_conversion_date, icon: '🎯', label: 'Expected conversion date', sub: new Date(lead.expected_conversion_date).toLocaleDateString(), color: '#531dab', future: new Date(lead.expected_conversion_date) > new Date() });

  if (lead.status === 'converted')
    events.push({ time: lead.updated_at, icon: '🏆', label: 'Lead converted!', color: '#531dab' });
  if (lead.status === 'lost')
    events.push({ time: lead.updated_at, icon: '❌', label: 'Lead marked lost', color: '#cf1322' });

  events.sort((a, b) => new Date(a.time) - new Date(b.time));

  return (
    <div style={{ marginTop: 20 }}>
      <h3 style={{ marginBottom: 14, fontSize: 15 }}>🕐 Activity Timeline</h3>
      <div style={{ position: 'relative', paddingLeft: 24 }}>
        <div style={{ position: 'absolute', left: 8, top: 0, bottom: 0, width: 2, background: '#f0f0f0' }} />
        {events.map((ev, i) => (
          <div key={i} style={{ position: 'relative', marginBottom: 16 }}>
            <div style={{ position: 'absolute', left: -20, top: 2, width: 14, height: 14, borderRadius: '50%', background: ev.future ? '#f5f5f5' : ev.color, border: `2px solid ${ev.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8 }} />
            <div style={{ background: '#fafafa', borderRadius: 8, padding: '8px 12px', border: '1px solid #f0f0f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{ev.icon} {ev.label}</span>
                <span style={{ fontSize: 11, color: '#aaa' }}>{timeAgo(ev.time)}</span>
              </div>
              {ev.sub && <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>{ev.sub}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Filters Panel ─────────────────────────────────────────────────────────────
const FiltersPanel = ({ filters, setFilters, agents }) => {
  const sel = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  const inputStyle = { padding: '7px 12px', borderRadius: 8, border: '1px solid #d9d9d9', fontSize: 13 };
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
      <input placeholder="🔍 Search name / phone…" value={filters.search}
        onChange={e => sel('search', e.target.value)} style={{ ...inputStyle, width: 200 }} />
      <select value={filters.status} onChange={e => sel('status', e.target.value)} style={inputStyle}>
        <option value="">All Statuses</option>
        {['new','contacted','qualified','assigned','converted','lost'].map(s =>
          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
      </select>
      <select value={filters.score} onChange={e => sel('score', e.target.value)} style={inputStyle}>
        <option value="">All Scores</option>
        {['hot','warm','cold','unqualified'].map(s =>
          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
      </select>
      <select value={filters.follow_up_status} onChange={e => sel('follow_up_status', e.target.value)} style={inputStyle}>
        <option value="">All Follow-ups</option>
        <option value="interested">✅ Interested</option>
        <option value="not_interested">❌ Not Interested</option>
        <option value="follow_up_scheduled">📅 Follow-up Scheduled</option>
        <option value="negotiating">🤝 Negotiating</option>
        <option value="converted">🏆 Converted</option>
      </select>
      <select value={filters.agent_id} onChange={e => sel('agent_id', e.target.value)} style={inputStyle}>
        <option value="">All Agents</option>
        {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <select value={filters.source} onChange={e => sel('source', e.target.value)} style={inputStyle}>
        <option value="">All Sources</option>
        {['website','google_form','facebook_ads','99acres','magicbricks','manual','other'].map(s =>
          <option key={s} value={s}>{s}</option>)}
      </select>
      <select value={filters.budget} onChange={e => sel('budget', e.target.value)} style={inputStyle}>
        <option value="">Any Budget</option>
        <option value="0-5000000">Below ₹50L</option>
        <option value="5000000-10000000">₹50L – ₹1Cr</option>
        <option value="10000000-20000000">₹1Cr – ₹2Cr</option>
        <option value="20000000-50000000">₹2Cr – ₹5Cr</option>
        <option value="50000000-999999999">Above ₹5Cr</option>
      </select>
      <input placeholder="📍 Location" value={filters.location}
        onChange={e => sel('location', e.target.value)} style={{ ...inputStyle, width: 130 }} />
      <button onClick={() => setFilters({ search:'',status:'',score:'',source:'',agent_id:'',follow_up_status:'',budget:'',location:'' })}
        style={{ ...inputStyle, background: '#f5f5f5', cursor: 'pointer' }}>✕ Clear</button>
    </div>
  );
};

// ── Lead Row ──────────────────────────────────────────────────────────────────
const LeadRow = ({ lead, agents, onAssign, onQualify, onSelect, onDelete }) => {
  const score  = SCORE_STYLES[lead.score] || SCORE_STYLES.unqualified;
  const status = STATUS_STYLES[lead.status] || STATUS_STYLES.new;
  const fuStyle = lead.follow_up_status ? FOLLOW_UP_STYLES[lead.follow_up_status] : null;
  const aging = agingLevel(lead);
  const isActive = !['converted','lost'].includes(lead.status);

  return (
    <tr style={{ borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }} onClick={() => onSelect(lead)}>
      <td style={{ padding: '11px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isActive && <div title={AGING_LABELS[aging]} style={{ width: 8, height: 8, borderRadius: '50%', background: AGING_COLORS[aging], flexShrink: 0 }} />}
          <div>
            <div style={{ fontWeight: 600 }}>{lead.name}</div>
            <div style={{ fontSize: 11, color: '#888' }}>{lead.phone}</div>
            <div style={{ fontSize: 11, color: '#aaa' }}>{lead.source}</div>
          </div>
        </div>
      </td>
      <td style={{ padding: '11px 8px' }}>
        <Badge text={score.label} style={score} />
        <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{lead.score_value}/100</div>
      </td>
      <td style={{ padding: '11px 8px' }}>
        <Badge text={lead.status} style={status} />
        {fuStyle && <div style={{ marginTop: 4 }}><Badge text={fuStyle.label} style={fuStyle} /></div>}
      </td>
      <td style={{ padding: '11px 8px', fontSize: 13 }}>
        <div>{lead.property_type || '—'} {lead.bhk_preference ? `· ${lead.bhk_preference}` : ''}</div>
        <div style={{ color: '#888', fontSize: 12 }}>{lead.location_preference || '—'}</div>
      </td>
      <td style={{ padding: '11px 8px', fontSize: 13 }}>{formatBudget(lead.budget_max)}</td>
      <td style={{ padding: '11px 8px', fontSize: 13 }}>
        {lead.assigned_agent_name
          ? <span style={{ color: '#389e0d' }}>✓ {lead.assigned_agent_name}</span>
          : <span style={{ color: '#aaa' }}>Unassigned</span>}
        {lead.expected_conversion_date &&
          <div style={{ fontSize: 11, color: '#d46b08', marginTop: 2 }}>
            🎯 {new Date(lead.expected_conversion_date).toLocaleDateString()}
          </div>}
      </td>
      <td style={{ padding: '11px 8px', fontSize: 12 }}>
        <div style={{ color: '#666' }}>{timeAgo(lead.created_at)}</div>
        {isActive && aging !== 'fresh' && <div style={{ color: AGING_COLORS[aging], fontSize: 11, marginTop: 2 }}>{AGING_LABELS[aging]}</div>}
      </td>
      <td style={{ padding: '11px 8px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
          {lead.score === 'unqualified' && (
            <button onClick={async (e) => { e.stopPropagation(); await onQualify(lead.id); }} style={btnStyle('#1677ff')}>Score</button>
          )}
          {!lead.assigned_agent_id && lead.score !== 'unqualified' && (
            <select onChange={e => { e.stopPropagation(); e.target.value && onAssign(lead.id, e.target.value); }}
              defaultValue="" style={{ fontSize: 12, padding: '3px 6px', borderRadius: 6, border: '1px solid #d9d9d9' }}>
              <option value="">Assign…</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          <button onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete ${lead.name}?`)) onDelete(lead.id); }}
            style={btnStyle('#ff4d4f', true)}>✕</button>
        </div>
      </td>
    </tr>
  );
};

// ── Follow-up Section ─────────────────────────────────────────────────────────
const FollowUpSection = ({ lead, onSave }) => {
  const [form, setForm] = useState({
    follow_up_status: lead.follow_up_status || '',
    expected_conversion_date: lead.expected_conversion_date ? lead.expected_conversion_date.split('T')[0] : '',
    agent_notes: lead.agent_notes || '',
    status: lead.status || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateLead(lead.id, form);
      setSaved(true);
      onSave();
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  const selStyle = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d9d9d9', fontSize: 13 };
  const field = (label, children) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#666', display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );

  return (
    <div style={{ background: '#fafafa', borderRadius: 10, padding: 16, marginTop: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: '#001529' }}>📋 Agent Follow-up</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {field('Lead Status', (
          <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={selStyle}>
            {['new','contacted','qualified','assigned','converted','lost'].map(s =>
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        ))}
        {field('Follow-up Outcome', (
          <select value={form.follow_up_status} onChange={e => setForm(f => ({ ...f, follow_up_status: e.target.value }))} style={selStyle}>
            <option value="">— Select —</option>
            <option value="interested">✅ Interested</option>
            <option value="not_interested">❌ Not Interested</option>
            <option value="follow_up_scheduled">📅 Follow-up Scheduled</option>
            <option value="negotiating">🤝 Negotiating</option>
            <option value="converted">🏆 Converted</option>
          </select>
        ))}
        {field('Expected Conversion Date', (
          <input type="date" value={form.expected_conversion_date}
            onChange={e => setForm(f => ({ ...f, expected_conversion_date: e.target.value }))} style={selStyle} />
        ))}
      </div>
      {field('Agent Notes', (
        <textarea value={form.agent_notes}
          onChange={e => setForm(f => ({ ...f, agent_notes: e.target.value }))}
          placeholder="Notes after call / site visit / follow-up…"
          style={{ ...selStyle, minHeight: 72, resize: 'vertical' }} />
      ))}
      <button onClick={save} disabled={saving}
        style={{ background: saved ? '#52c41a' : '#1677ff', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
        {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Follow-up'}
      </button>
    </div>
  );
};

// ── Edit Lead Modal ───────────────────────────────────────────────────────────
const EditLeadModal = ({ lead, onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: lead.name || '', phone: lead.phone || '', email: lead.email || '',
    property_type: lead.property_type || '', bhk_preference: lead.bhk_preference || '',
    location_preference: lead.location_preference || '',
    budget_min: lead.budget_min || '', budget_max: lead.budget_max || '',
    purchase_timeline: lead.purchase_timeline || '', purpose: lead.purpose || '',
    notes: lead.notes || '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try { await updateLead(lead.id, form); onSaved(); onClose(); }
    catch { alert('Save failed'); }
    finally { setSaving(false); }
  };

  const field = (label, key, type = 'text') => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>{label}</label>
      <input type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d9d9d9', fontSize: 14 }} />
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ marginBottom: 20 }}>✏️ Edit Lead — {lead.name}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          {field('Full Name', 'name')}{field('Phone', 'phone')}
          {field('Email', 'email', 'email')}{field('Property Type', 'property_type')}
          {field('BHK Preference', 'bhk_preference')}{field('Location Preference', 'location_preference')}
          {field('Budget Min (₹)', 'budget_min', 'number')}{field('Budget Max (₹)', 'budget_max', 'number')}
          {field('Purchase Timeline', 'purchase_timeline')}{field('Purpose', 'purpose')}
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Notes</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d9d9d9', fontSize: 14, minHeight: 60, resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #d9d9d9', background: '#fff', cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ background: '#1677ff', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontWeight: 700, cursor: 'pointer' }}>
            {saving ? 'Saving…' : '✓ Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Lead Detail Modal ─────────────────────────────────────────────────────────
const LeadModal = ({ lead, agents, onClose, onAssign, onQualify, onDelete, onRefresh }) => {
  const [messages, setMessages] = useState([]);
  const [showEdit, setShowEdit] = useState(false);
  const [activeTab, setActiveTab] = useState('timeline');
  const score = SCORE_STYLES[lead.score] || SCORE_STYLES.unqualified;
  const fuStyle = lead.follow_up_status ? FOLLOW_UP_STYLES[lead.follow_up_status] : null;

  useEffect(() => {
    getLeadMessages(lead.id).then(r => setMessages(r.data)).catch(() => {});
  }, [lead.id]);

  const tabBtn = (key, label) => (
    <button onClick={() => setActiveTab(key)} style={{
      padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
      background: activeTab === key ? '#1677ff' : '#f5f5f5',
      color: activeTab === key ? '#fff' : '#666',
    }}>{label}</button>
  );

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: 740, maxHeight: '93vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: AGING_COLORS[agingLevel(lead)] }} />
                <h2 style={{ margin: 0 }}>{lead.name}</h2>
              </div>
              <div style={{ color: '#888', fontSize: 13, marginTop: 2 }}>{lead.phone} · {lead.email || 'No email'} · {lead.source}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowEdit(true)} style={btnStyle('#1677ff', true)}>✏️ Edit</button>
              <button onClick={() => { if (window.confirm(`Delete ${lead.name}?`)) { onDelete(lead.id); onClose(); } }} style={btnStyle('#ff4d4f', true)}>🗑️ Delete</button>
              <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>✕</button>
            </div>
          </div>

          {/* Badges */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <Badge text={score.label} style={score} />
            <Badge text={`${lead.score_value}/100`} style={{ bg: '#f5f5f5', color: '#333', border: '#d9d9d9' }} />
            <Badge text={lead.status} style={STATUS_STYLES[lead.status] || STATUS_STYLES.new} />
            {fuStyle && <Badge text={fuStyle.label} style={fuStyle} />}
            <Badge text={lead.source} style={{ bg: '#f0f5ff', color: '#2f54eb', border: '#adc6ff' }} />
            {agingLevel(lead) !== 'fresh' && !['converted','lost'].includes(lead.status) &&
              <Badge text={AGING_LABELS[agingLevel(lead)]} style={{ bg: '#fff', color: AGING_COLORS[agingLevel(lead)], border: AGING_COLORS[agingLevel(lead)] }} />}
          </div>

          {/* Details Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
            {[
              ['Property Type', lead.property_type],['BHK', lead.bhk_preference],
              ['Location', lead.location_preference],['Budget', formatBudget(lead.budget_max)],
              ['Timeline', lead.purchase_timeline],['Purpose', lead.purpose],
              ['Assigned To', lead.assigned_agent_name || 'Unassigned'],
              ['Expected Close', lead.expected_conversion_date ? new Date(lead.expected_conversion_date).toLocaleDateString() : '—'],
              ['Created', timeAgo(lead.created_at)],
            ].map(([k, v]) => (
              <div key={k} style={{ background: '#fafafa', borderRadius: 8, padding: '8px 12px' }}>
                <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5 }}>{k}</div>
                <div style={{ fontWeight: 600, marginTop: 2, fontSize: 13 }}>{v || '—'}</div>
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            {lead.score === 'unqualified' && (
              <button onClick={() => { onQualify(lead.id); }} style={{ ...btnStyle('#1677ff'), padding: '7px 14px' }}>🎯 Run Scoring</button>
            )}
            {!lead.assigned_agent_id && (
              <select onChange={e => e.target.value && onAssign(lead.id, e.target.value)} defaultValue=""
                style={{ fontSize: 13, padding: '6px 12px', borderRadius: 8, border: '1px solid #d9d9d9', cursor: 'pointer' }}>
                <option value="">👤 Assign to Agent…</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
          </div>

          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {tabBtn('timeline', '🕐 Timeline')}
            {tabBtn('followup', '📋 Follow-up')}
            {tabBtn('whatsapp', `💬 WhatsApp (${messages.length})`)}
          </div>

          {/* Timeline Tab */}
          {activeTab === 'timeline' && <LeadTimeline lead={lead} messages={messages} />}

          {/* Follow-up Tab */}
          {activeTab === 'followup' && (
            <>
              <FollowUpSection lead={lead} onSave={onRefresh} />
              {lead.agent_notes && (
                <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 8, padding: 12, marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#d46b08', marginBottom: 4 }}>📝 Latest Agent Notes</div>
                  <div style={{ fontSize: 13 }}>{lead.agent_notes}</div>
                </div>
              )}
            </>
          )}

          {/* WhatsApp Tab */}
          {activeTab === 'whatsapp' && (
            <div>
              <h3 style={{ marginBottom: 12, fontSize: 15 }}>💬 WhatsApp Conversation</h3>
              {messages.length === 0
                ? <div style={{ color: '#aaa', fontSize: 13 }}>No messages yet</div>
                : (
                  <div style={{ maxHeight: 320, overflowY: 'auto', background: '#f0f2f5', borderRadius: 10, padding: 12 }}>
                    {messages.map(m => (
                      <div key={m.id} style={{ display: 'flex', justifyContent: m.direction === 'outbound' ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                        <div style={{ background: m.direction === 'outbound' ? '#dcf8c6' : '#fff', borderRadius: 10, padding: '8px 12px', maxWidth: '75%', fontSize: 13, boxShadow: '0 1px 2px rgba(0,0,0,0.1)', whiteSpace: 'pre-wrap' }}>
                          {m.text}
                          <div style={{ fontSize: 10, color: '#aaa', marginTop: 4, textAlign: 'right' }}>{new Date(m.timestamp).toLocaleTimeString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}
        </div>
      </div>
      {showEdit && <EditLeadModal lead={lead} onClose={() => setShowEdit(false)} onSaved={onRefresh} />}
    </>
  );
};

// ── Pipeline (Kanban) View ────────────────────────────────────────────────────
const PipelineView = ({ leads, agents, onSelect, onStatusChange }) => {
  const grouped = PIPELINE_COLS.reduce((acc, col) => {
    acc[col.key] = leads.filter(l => l.status === col.key);
    return acc;
  }, {});

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 16 }}>
      <div style={{ display: 'flex', gap: 14, minWidth: 900 }}>
        {PIPELINE_COLS.map(col => {
          const colLeads = grouped[col.key] || [];
          const totalBudget = colLeads.reduce((s, l) => s + (l.budget_max || 0), 0);
          return (
            <div key={col.key} style={{ flex: 1, minWidth: 200 }}>
              {/* Column Header */}
              <div style={{ background: col.color, borderRadius: '10px 10px 0 0', padding: '10px 14px', color: '#fff' }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{col.label}</div>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
                  {colLeads.length} leads {totalBudget > 0 ? `· ${formatBudget(totalBudget)}` : ''}
                </div>
              </div>
              {/* Cards */}
              <div style={{ background: '#f5f7fa', borderRadius: '0 0 10px 10px', padding: 10, minHeight: 200, maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
                {colLeads.length === 0
                  ? <div style={{ color: '#ccc', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No leads</div>
                  : colLeads.map(lead => {
                    const score = SCORE_STYLES[lead.score] || SCORE_STYLES.unqualified;
                    const aging = agingLevel(lead);
                    return (
                      <div key={lead.id} onClick={() => onSelect(lead)}
                        style={{ background: '#fff', borderRadius: 10, padding: 12, marginBottom: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', cursor: 'pointer', borderLeft: `3px solid ${score.color}`, transition: 'box-shadow 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'}
                        onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)'}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{lead.name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {aging !== 'fresh' && col.key !== 'converted' && col.key !== 'lost' &&
                              <div title={AGING_LABELS[aging]} style={{ width: 7, height: 7, borderRadius: '50%', background: AGING_COLORS[aging] }} />}
                            <Badge text={score.label} style={score} />
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>
                          {lead.property_type || '—'} {lead.bhk_preference ? `· ${lead.bhk_preference}` : ''}
                          {lead.location_preference ? ` · ${lead.location_preference}` : ''}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#389e0d' }}>{formatBudget(lead.budget_max)}</span>
                          <span style={{ fontSize: 11, color: '#aaa' }}>{lead.assigned_agent_name || 'Unassigned'}</span>
                        </div>
                        {lead.expected_conversion_date && (
                          <div style={{ fontSize: 11, color: '#d46b08', marginTop: 4 }}>
                            🎯 Close: {new Date(lead.expected_conversion_date).toLocaleDateString()}
                          </div>
                        )}
                        {/* Move to next stage */}
                        {col.key !== 'converted' && col.key !== 'lost' && (
                          <div style={{ marginTop: 8, display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                            <select defaultValue="" onChange={e => { if (e.target.value) onStatusChange(lead.id, e.target.value); e.target.value = ''; }}
                              style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid #e0e0e0', flex: 1, color: '#666' }}>
                              <option value="">Move to…</option>
                              {PIPELINE_COLS.filter(c => c.key !== col.key).map(c =>
                                <option key={c.key} value={c.key}>{c.label}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Call Queue View ───────────────────────────────────────────────────────────
const CallQueueView = ({ leads, agents, onSelect }) => {
  const [agentFilter, setAgentFilter] = useState('');

  const activeLead = leads.filter(l => !['converted', 'lost', 'new'].includes(l.status) || l.score !== 'unqualified');
  const filtered = agentFilter
    ? activeLead.filter(l => String(l.assigned_agent_id) === agentFilter)
    : activeLead;

  const ranked = [...filtered]
    .filter(l => !['converted', 'lost'].includes(l.status))
    .map(l => ({ ...l, _priority: priorityScore(l) }))
    .sort((a, b) => b._priority - a._priority);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>📞 Priority Call Queue</h2>
          <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
            Leads ranked by conversion probability — who to call first today
          </div>
        </div>
        <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
          style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #d9d9d9', fontSize: 13 }}>
          <option value="">All Agents</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {/* Priority Legend */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {[['🔴 Call Now (90+)', '#cf1322', '#fff1f0'], ['🟠 Call Today (70+)', '#d46b08', '#fff7e6'], ['🟡 This Week (50+)', '#d4b106', '#feffe6'], ['🟢 When Free (<50)', '#389e0d', '#f6ffed']].map(([label, color, bg]) => (
          <div key={label} style={{ background: bg, border: `1px solid ${color}`, borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 600, color }}>{label}</div>
        ))}
      </div>

      {ranked.length === 0
        ? <div style={{ background: '#fff', borderRadius: 12, padding: 40, textAlign: 'center', color: '#aaa' }}>No active leads in queue</div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ranked.map((lead, idx) => {
              const pScore = lead._priority;
              const pLabel = priorityLabel(pScore);
              const score = SCORE_STYLES[lead.score] || SCORE_STYLES.unqualified;
              const fuStyle = lead.follow_up_status ? FOLLOW_UP_STYLES[lead.follow_up_status] : null;
              const aging = agingLevel(lead);

              return (
                <div key={lead.id} onClick={() => onSelect(lead)}
                  style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, borderLeft: `4px solid ${pLabel.color}` }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)'}>

                  {/* Rank */}
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: pLabel.bg, color: pLabel.color, fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {idx + 1}
                  </div>

                  {/* Lead info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{lead.name}</span>
                      <span style={{ fontSize: 13, color: '#888' }}>{lead.phone}</span>
                      <Badge text={score.label} style={score} />
                      {fuStyle && <Badge text={fuStyle.label} style={fuStyle} />}
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#666', flexWrap: 'wrap' }}>
                      <span>🏠 {lead.property_type || '—'} {lead.bhk_preference || ''}</span>
                      <span>📍 {lead.location_preference || '—'}</span>
                      <span>💰 {formatBudget(lead.budget_max)}</span>
                      <span>⏰ {lead.purchase_timeline || '—'}</span>
                      {lead.assigned_agent_name && <span>👤 {lead.assigned_agent_name}</span>}
                    </div>
                    {lead.agent_notes && (
                      <div style={{ fontSize: 12, color: '#d46b08', marginTop: 4, fontStyle: 'italic' }}>
                        📝 {lead.agent_notes.slice(0, 80)}{lead.agent_notes.length > 80 ? '…' : ''}
                      </div>
                    )}
                    {aging !== 'fresh' && <div style={{ fontSize: 11, color: AGING_COLORS[aging], marginTop: 2 }}>{AGING_LABELS[aging]}</div>}
                  </div>

                  {/* Priority Score */}
                  <div style={{ textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: pLabel.color }}>{pScore}</div>
                    <div style={{ fontSize: 11, color: pLabel.color, fontWeight: 600 }}>{pLabel.label}</div>
                    {lead.expected_conversion_date && (
                      <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                        🎯 {new Date(lead.expected_conversion_date).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
};

// ── Analytics View ─────────────────────────────────────────────────────────────
const AnalyticsView = ({ leads, agents }) => {
  // Source quality
  const sources = [...new Set(leads.map(l => l.source))].filter(Boolean);
  const sourceStats = sources.map(src => {
    const srcLeads = leads.filter(l => l.source === src);
    const qualified = srcLeads.filter(l => l.score !== 'unqualified');
    const hot = srcLeads.filter(l => l.score === 'hot').length;
    const warm = srcLeads.filter(l => l.score === 'warm').length;
    const converted = srcLeads.filter(l => l.status === 'converted').length;
    const avgScore = qualified.length ? Math.round(qualified.reduce((s, l) => s + (l.score_value || 0), 0) / qualified.length) : 0;
    return { src, total: srcLeads.length, hot, warm, converted, avgScore, convRate: srcLeads.length ? Math.round((converted / srcLeads.length) * 100) : 0 };
  }).sort((a, b) => b.avgScore - a.avgScore);

  // Agent performance
  const agentStats = agents.map(agent => {
    const agentLeads = leads.filter(l => l.assigned_agent_id === agent.id);
    const converted = agentLeads.filter(l => l.status === 'converted').length;
    const hot = agentLeads.filter(l => l.score === 'hot').length;
    const atRisk = agentLeads.filter(l => !['converted','lost'].includes(l.status) && ['critical','warning'].includes(agingLevel(l))).length;
    const avgPriority = agentLeads.length ? Math.round(agentLeads.reduce((s, l) => s + priorityScore(l), 0) / agentLeads.length) : 0;
    return { ...agent, agentLeads: agentLeads.length, converted, hot, atRisk, avgPriority, convRate: agentLeads.length ? Math.round((converted / agentLeads.length) * 100) : 0 };
  }).sort((a, b) => b.convRate - a.convRate);

  // Funnel
  const funnel = [
    { label: 'Total Leads',  value: leads.length,                                              color: '#1677ff' },
    { label: 'Contacted',    value: leads.filter(l => l.status !== 'new').length,              color: '#08979c' },
    { label: 'Qualified',    value: leads.filter(l => l.score !== 'unqualified').length,       color: '#389e0d' },
    { label: 'Assigned',     value: leads.filter(l => l.assigned_agent_id).length,            color: '#d46b08' },
    { label: 'Hot Leads',    value: leads.filter(l => l.score === 'hot').length,               color: '#cf1322' },
    { label: 'Converted',    value: leads.filter(l => l.status === 'converted').length,       color: '#531dab' },
  ];
  const maxFunnel = funnel[0].value || 1;

  // Score distribution
  const scoreBreakdown = [
    { label: '🔥 Hot',  count: leads.filter(l => l.score === 'hot').length,         color: '#cf1322' },
    { label: '🌡️ Warm', count: leads.filter(l => l.score === 'warm').length,        color: '#d46b08' },
    { label: '❄️ Cold', count: leads.filter(l => l.score === 'cold').length,        color: '#0958d9' },
    { label: '⚪ New',  count: leads.filter(l => l.score === 'unqualified').length,  color: '#aaa'    },
  ];

  const card = (title, children) => (
    <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 20 }}>
      <h3 style={{ margin: '0 0 18px 0', fontSize: 16, color: '#001529' }}>{title}</h3>
      {children}
    </div>
  );

  return (
    <div>
      <h2 style={{ margin: '0 0 20px 0' }}>📊 Analytics & Insights</h2>

      {/* Conversion Funnel */}
      {card('🔽 Lead Funnel', (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {funnel.map(({ label, value, color }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 130, fontSize: 13, color: '#666', textAlign: 'right', flexShrink: 0 }}>{label}</div>
              <div style={{ flex: 1, background: '#f5f5f5', borderRadius: 6, overflow: 'hidden', height: 28 }}>
                <div style={{ width: `${(value / maxFunnel) * 100}%`, background: color, height: '100%', borderRadius: 6, minWidth: value > 0 ? 28 : 0, display: 'flex', alignItems: 'center', paddingLeft: 8, transition: 'width 0.5s' }}>
                  <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{value}</span>
                </div>
              </div>
              <div style={{ width: 40, fontSize: 12, color: '#aaa' }}>{maxFunnel > 0 ? Math.round((value / maxFunnel) * 100) : 0}%</div>
            </div>
          ))}
        </div>
      ))}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

        {/* Score Distribution */}
        {card('🎯 Lead Score Breakdown', (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {scoreBreakdown.map(({ label, count, color }) => (
              <div key={label} style={{ flex: 1, minWidth: 80, textAlign: 'center', background: '#fafafa', borderRadius: 10, padding: '14px 10px', border: `2px solid ${color}20` }}>
                <div style={{ fontSize: 26, fontWeight: 800, color }}>{count}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{label}</div>
                <div style={{ fontSize: 11, color: '#aaa' }}>{leads.length ? Math.round((count / leads.length) * 100) : 0}%</div>
              </div>
            ))}
          </div>
        ))}

        {/* At Risk Summary */}
        {card('⚠️ Leads At Risk', (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: '🔴 7+ days no activity', count: leads.filter(l => !['converted','lost'].includes(l.status) && agingLevel(l) === 'critical').length, color: '#cf1322' },
              { label: '🟡 48h+ no activity',    count: leads.filter(l => !['converted','lost'].includes(l.status) && agingLevel(l) === 'warning').length,  color: '#d46b08' },
              { label: '🟡 24h+ no activity',    count: leads.filter(l => !['converted','lost'].includes(l.status) && agingLevel(l) === 'mild').length,     color: '#d4b106' },
              { label: '🔥 Hot but uncontacted', count: leads.filter(l => l.score === 'hot' && l.status === 'new').length,                                   color: '#cf1322' },
            ].map(({ label, count, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: count > 0 ? '#fafafa' : '#f9f9f9', borderRadius: 8, border: `1px solid ${count > 0 ? color + '40' : '#f0f0f0'}` }}>
                <span style={{ fontSize: 13, color: count > 0 ? color : '#aaa' }}>{label}</span>
                <span style={{ fontWeight: 800, fontSize: 18, color: count > 0 ? color : '#ccc' }}>{count}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Source Quality Matrix */}
      {card('📥 Lead Quality by Source — Where to invest your budget', (
        sourceStats.length === 0
          ? <div style={{ color: '#aaa', fontSize: 13 }}>No data yet</div>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  {['Source', 'Total', '🔥 Hot', '🌡️ Warm', 'Avg Score', 'Converted', 'Conv %', 'Quality'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', borderBottom: '2px solid #f0f0f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sourceStats.map(s => {
                  const quality = s.avgScore >= 70 ? { label: '⭐⭐⭐ Excellent', color: '#389e0d' } : s.avgScore >= 50 ? { label: '⭐⭐ Good', color: '#d46b08' } : s.avgScore >= 30 ? { label: '⭐ Average', color: '#d4b106' } : { label: '— Poor', color: '#aaa' };
                  return (
                    <tr key={s.src} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{s.src}</td>
                      <td style={{ padding: '10px 12px' }}>{s.total}</td>
                      <td style={{ padding: '10px 12px', color: '#cf1322', fontWeight: 600 }}>{s.hot}</td>
                      <td style={{ padding: '10px 12px', color: '#d46b08', fontWeight: 600 }}>{s.warm}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 700 }}>{s.avgScore}/100</td>
                      <td style={{ padding: '10px 12px', color: '#531dab', fontWeight: 600 }}>{s.converted}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: s.convRate > 10 ? '#389e0d' : s.convRate > 5 ? '#d46b08' : '#888' }}>{s.convRate}%</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, fontWeight: 600, color: quality.color }}>{quality.label}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
      ))}

      {/* Agent Performance */}
      {card('👥 Agent Performance Leaderboard', (
        agentStats.length === 0
          ? <div style={{ color: '#aaa', fontSize: 13 }}>No agent data yet</div>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  {['Rank', 'Agent', 'Assigned', '🔥 Hot', 'Converted', 'Conv %', 'At Risk', 'Avg Priority', 'Status'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', borderBottom: '2px solid #f0f0f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agentStats.map((a, idx) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 800, color: idx === 0 ? '#d4b106' : idx === 1 ? '#888' : idx === 2 ? '#d46b08' : '#aaa' }}>
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 700 }}>{a.name}</div>
                      <div style={{ fontSize: 11, color: '#888' }}>{a.specialization || 'General'}</div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>{a.agentLeads}</td>
                    <td style={{ padding: '10px 12px', color: '#cf1322', fontWeight: 600 }}>{a.hot}</td>
                    <td style={{ padding: '10px 12px', color: '#531dab', fontWeight: 600 }}>{a.converted}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: a.convRate > 15 ? '#389e0d' : a.convRate > 5 ? '#d46b08' : '#888' }}>{a.convRate}%</td>
                    <td style={{ padding: '10px 12px', color: a.atRisk > 0 ? '#cf1322' : '#aaa', fontWeight: a.atRisk > 0 ? 700 : 400 }}>{a.atRisk}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 700 }}>{a.avgPriority}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ background: a.is_active ? '#f6ffed' : '#f5f5f5', color: a.is_active ? '#389e0d' : '#aaa', border: `1px solid ${a.is_active ? '#b7eb8f' : '#d9d9d9'}`, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                        {a.is_active ? '● Active' : '○ Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
      ))}
    </div>
  );
};

// ── Forecast View ─────────────────────────────────────────────────────────────
const ForecastView = ({ leads, agents }) => {
  const now = new Date();

  // Deal value: midpoint of budget range, or whichever side exists
  const dealValue = (lead) => {
    const lo = lead.budget_min || 0;
    const hi = lead.budget_max || 0;
    if (lo && hi) return (lo + hi) / 2;
    return hi || lo || 0;
  };

  // Probability from priority score (0–150 → 0–1, capped at 0.90)
  const probability = (lead) => Math.min(priorityScore(lead) / 150, 0.90);

  // Build month buckets: current + next 3
  const months = Array.from({ length: 4 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleString('default', { month: 'long', year: 'numeric' }),
      short: d.toLocaleString('default', { month: 'short' }),
      start: d,
      end: new Date(d.getFullYear(), d.getMonth() + 1, 0),
    };
  });

  // Scheduled leads — have an expected_conversion_date
  const scheduled = leads.filter(l =>
    !['lost'].includes(l.status) && l.expected_conversion_date && dealValue(l) > 0
  );

  // Unscheduled hot/warm leads — no date set but high priority
  const unscheduled = leads.filter(l =>
    !['converted', 'lost'].includes(l.status) &&
    !l.expected_conversion_date &&
    (l.score === 'hot' || l.score === 'warm') &&
    dealValue(l) > 0
  ).sort((a, b) => priorityScore(b) - priorityScore(a));

  const monthData = months.map(m => {
    const mLeads = scheduled.filter(l => {
      const d = new Date(l.expected_conversion_date);
      return d >= m.start && d <= m.end;
    });
    const pipeline = mLeads.reduce((s, l) => s + dealValue(l), 0);
    const weighted = mLeads.reduce((s, l) => s + dealValue(l) * probability(l), 0);
    const converted = mLeads.filter(l => l.status === 'converted').length;
    return { ...m, leads: mLeads, count: mLeads.length, pipeline, weighted, converted };
  });

  const totalPipeline = monthData.reduce((s, m) => s + m.pipeline, 0);
  const totalWeighted = monthData.reduce((s, m) => s + m.weighted, 0);
  const maxPipeline = Math.max(...monthData.map(m => m.pipeline), 1);

  // Agent-level forecast
  const agentForecast = agents.map(agent => {
    const aLeads = scheduled.filter(l => l.assigned_agent_id === agent.id);
    const pipeline = aLeads.reduce((s, l) => s + dealValue(l), 0);
    const weighted = aLeads.reduce((s, l) => s + dealValue(l) * probability(l), 0);
    return { ...agent, count: aLeads.length, pipeline, weighted };
  }).filter(a => a.pipeline > 0).sort((a, b) => b.pipeline - a.pipeline);

  const card = (title, children) => (
    <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 20 }}>
      <h3 style={{ margin: '0 0 18px 0', fontSize: 16, color: '#001529' }}>{title}</h3>
      {children}
    </div>
  );

  const crore = (v) => v >= 10000000 ? `₹${(v / 10000000).toFixed(2)} Cr` : v >= 100000 ? `₹${(v / 100000).toFixed(1)} L` : v > 0 ? `₹${v.toLocaleString()}` : '—';

  return (
    <div>
      <h2 style={{ margin: '0 0 6px 0' }}>💰 Revenue Forecast</h2>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
        Probability-weighted projections based on expected conversion dates and priority scores
      </div>

      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: '4-Month Pipeline',    value: crore(totalPipeline), sub: `${scheduled.length} scheduled deals`, color: '#1677ff' },
          { label: 'Weighted Forecast',   value: crore(totalWeighted), sub: 'Risk-adjusted expected revenue', color: '#389e0d' },
          { label: 'This Month',          value: crore(monthData[0]?.pipeline || 0), sub: `${monthData[0]?.count || 0} deals closing`, color: '#cf1322' },
          { label: 'Unscheduled Hot/Warm',value: unscheduled.length, sub: 'leads need a close date', color: '#d46b08', isCount: true },
        ].map(({ label, value, sub, color, isCount }) => (
          <div key={label} style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderTop: `4px solid ${color}` }}>
            <div style={{ fontSize: 12, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
            <div style={{ fontSize: isCount ? 32 : 22, fontWeight: 800, color, margin: '8px 0 4px' }}>{value}</div>
            <div style={{ fontSize: 12, color: '#aaa' }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Month-by-month bars */}
      {card('📅 Monthly Pipeline & Weighted Forecast', (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {monthData.map((m, i) => (
            <div key={m.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ fontWeight: 700, color: i === 0 ? '#cf1322' : '#001529' }}>
                  {i === 0 ? '🎯 ' : ''}{m.label}
                  {m.converted > 0 && <span style={{ marginLeft: 8, color: '#531dab', fontWeight: 600 }}>({m.converted} closed)</span>}
                </span>
                <span style={{ color: '#888' }}>{m.count} deals · Pipeline: <strong>{crore(m.pipeline)}</strong> · Weighted: <strong style={{ color: '#389e0d' }}>{crore(m.weighted)}</strong></span>
              </div>
              {/* Pipeline bar */}
              <div style={{ background: '#f5f5f5', borderRadius: 6, height: 24, overflow: 'hidden', marginBottom: 4, position: 'relative' }}>
                <div style={{ width: `${(m.pipeline / maxPipeline) * 100}%`, background: i === 0 ? '#cf1322' : '#1677ff', height: '100%', borderRadius: 6, minWidth: m.pipeline > 0 ? 4 : 0, transition: 'width 0.5s' }} />
                {m.pipeline > 0 && (
                  <div style={{ position: 'absolute', left: 10, top: 4, fontSize: 12, fontWeight: 700, color: '#fff', mixBlendMode: 'difference' }}>{crore(m.pipeline)}</div>
                )}
              </div>
              {/* Weighted bar */}
              <div style={{ background: '#f5f5f5', borderRadius: 6, height: 16, overflow: 'hidden', position: 'relative' }}>
                <div style={{ width: `${(m.weighted / maxPipeline) * 100}%`, background: '#52c41a', height: '100%', borderRadius: 6, minWidth: m.weighted > 0 ? 4 : 0, transition: 'width 0.6s', opacity: 0.85 }} />
                {m.weighted > 0 && (
                  <div style={{ position: 'absolute', left: 10, top: 1, fontSize: 11, fontWeight: 700, color: '#fff', mixBlendMode: 'difference' }}>{crore(m.weighted)}</div>
                )}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#888', marginTop: 4 }}>
            <span><span style={{ display: 'inline-block', width: 12, height: 8, background: '#1677ff', borderRadius: 2, marginRight: 4 }} />Full pipeline (sum of deal values)</span>
            <span><span style={{ display: 'inline-block', width: 12, height: 8, background: '#52c41a', borderRadius: 2, marginRight: 4 }} />Weighted forecast (probability-adjusted)</span>
          </div>
        </div>
      ))}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* This month's deals table */}
        {card(`🎯 Deals Closing This Month (${monthData[0]?.label})`, (
          monthData[0]?.leads.length === 0
            ? <div style={{ color: '#aaa', fontSize: 13 }}>No deals scheduled to close this month. Set expected conversion dates on your leads.</div>
            : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    {['Lead', 'Score', 'Deal Value', 'Probability', 'Weighted', 'Agent', 'Close Date'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', borderBottom: '2px solid #f0f0f0', textAlign: 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...monthData[0].leads].sort((a, b) => dealValue(b) - dealValue(a)).map(lead => {
                    const dv = dealValue(lead);
                    const prob = probability(lead);
                    const scoreStyle = SCORE_STYLES[lead.score] || SCORE_STYLES.unqualified;
                    return (
                      <tr key={lead.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ fontWeight: 600 }}>{lead.name}</div>
                          <div style={{ fontSize: 11, color: '#888' }}>{lead.phone}</div>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{ background: scoreStyle.bg, color: scoreStyle.color, border: `1px solid ${scoreStyle.border}`, borderRadius: 4, padding: '2px 6px', fontSize: 11, fontWeight: 600 }}>{scoreStyle.label}</span>
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 700 }}>{crore(dv)}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{ color: prob >= 0.7 ? '#389e0d' : prob >= 0.5 ? '#d46b08' : '#888', fontWeight: 700 }}>{Math.round(prob * 100)}%</span>
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: '#389e0d' }}>{crore(dv * prob)}</td>
                        <td style={{ padding: '8px 10px', color: '#666' }}>{lead.assigned_agent_name || '—'}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12, color: '#1677ff', fontWeight: 600 }}>
                          {lead.expected_conversion_date ? new Date(lead.expected_conversion_date).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
        ))}

        {/* Unscheduled hot leads */}
        {card('⚡ High-Priority Leads Missing Close Date', (
          unscheduled.length === 0
            ? <div style={{ color: '#aaa', fontSize: 13 }}>All high-priority leads have close dates set.</div>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 12, color: '#d46b08', marginBottom: 4 }}>
                  ⚠️ These leads are hot/warm but have no expected conversion date — they're invisible to your forecast.
                </div>
                {unscheduled.slice(0, 8).map(lead => {
                  const dv = dealValue(lead);
                  const pScore = priorityScore(lead);
                  const scoreStyle = SCORE_STYLES[lead.score] || SCORE_STYLES.unqualified;
                  return (
                    <div key={lead.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{lead.name}</div>
                        <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                          {lead.assigned_agent_name || 'Unassigned'} · {lead.location_preference || '—'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ background: scoreStyle.bg, color: scoreStyle.color, border: `1px solid ${scoreStyle.border}`, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{scoreStyle.label}</span>
                        <span style={{ fontWeight: 700, color: '#1677ff' }}>{crore(dv)}</span>
                        <span style={{ fontWeight: 700, color: pScore >= 70 ? '#cf1322' : '#d46b08', fontSize: 13 }}>P{pScore}</span>
                      </div>
                    </div>
                  );
                })}
                {unscheduled.length > 8 && (
                  <div style={{ fontSize: 12, color: '#888', textAlign: 'center' }}>+ {unscheduled.length - 8} more</div>
                )}
              </div>
            )
        ))}
      </div>

      {/* Agent forecast */}
      {agentForecast.length > 0 && card('👥 Agent Contribution to Forecast', (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#fafafa' }}>
              {['Agent', 'Scheduled Deals', 'Pipeline Value', 'Weighted Forecast', 'Avg Probability', '% of Total'].map(h => (
                <th key={h} style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', borderBottom: '2px solid #f0f0f0', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agentForecast.map(a => (
              <tr key={a.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '10px 12px', fontWeight: 700 }}>{a.name}</td>
                <td style={{ padding: '10px 12px' }}>{a.count}</td>
                <td style={{ padding: '10px 12px', fontWeight: 700 }}>{crore(a.pipeline)}</td>
                <td style={{ padding: '10px 12px', fontWeight: 700, color: '#389e0d' }}>{crore(a.weighted)}</td>
                <td style={{ padding: '10px 12px', color: '#666' }}>{a.count > 0 ? Math.round((a.weighted / a.pipeline) * 100) : 0}%</td>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, background: '#f0f0f0', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                      <div style={{ width: `${totalPipeline > 0 ? (a.pipeline / totalPipeline) * 100 : 0}%`, background: '#1677ff', height: '100%', borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#666', minWidth: 32 }}>{totalPipeline > 0 ? Math.round((a.pipeline / totalPipeline) * 100) : 0}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
};

// ── Insights View ─────────────────────────────────────────────────────────────
const InsightsView = ({ leads }) => {
  const qualified = leads.filter(l => l.score !== 'unqualified');
  const converted = leads.filter(l => l.status === 'converted');

  // ── Helpers ────────────────────────────────────────────────────────────────
  const convRate = (subset) =>
    subset.length ? Math.round((subset.filter(l => l.status === 'converted').length / subset.length) * 100) : 0;

  const hotRate = (subset) =>
    subset.length ? Math.round((subset.filter(l => l.score === 'hot').length / subset.length) * 100) : 0;

  const avgDaysToClose = (subset) => {
    const closed = subset.filter(l => l.status === 'converted' && l.created_at && l.updated_at);
    if (!closed.length) return null;
    const avg = closed.reduce((s, l) => s + (new Date(l.updated_at) - new Date(l.created_at)) / 86400000, 0) / closed.length;
    return Math.round(avg);
  };

  // ── Location analysis ──────────────────────────────────────────────────────
  const locationMap = {};
  leads.forEach(l => {
    const loc = (l.location_preference || '').trim();
    if (!loc) return;
    // Split on commas/slashes to handle multi-area entries
    loc.split(/[,\/]/).forEach(part => {
      const key = part.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
      if (!key || key.length < 2) return;
      if (!locationMap[key]) locationMap[key] = [];
      locationMap[key].push(l);
    });
  });
  const locationStats = Object.entries(locationMap)
    .map(([loc, ls]) => ({
      loc,
      count: ls.length,
      hot: ls.filter(l => l.score === 'hot').length,
      conv: ls.filter(l => l.status === 'converted').length,
      convRate: convRate(ls),
      hotRate: hotRate(ls),
      avgBudget: ls.filter(l => l.budget_max).length
        ? Math.round(ls.filter(l => l.budget_max).reduce((s, l) => s + l.budget_max, 0) / ls.filter(l => l.budget_max).length)
        : 0,
    }))
    .filter(s => s.count >= 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // ── Property type analysis ─────────────────────────────────────────────────
  const propMap = {};
  leads.forEach(l => {
    const key = (l.property_type || 'Unknown').trim();
    if (!propMap[key]) propMap[key] = [];
    propMap[key].push(l);
  });
  const propStats = Object.entries(propMap)
    .map(([type, ls]) => ({
      type,
      count: ls.length,
      hot: ls.filter(l => l.score === 'hot').length,
      conv: ls.filter(l => l.status === 'converted').length,
      convRate: convRate(ls),
      avgBudget: ls.filter(l => l.budget_max).length
        ? Math.round(ls.filter(l => l.budget_max).reduce((s, l) => s + l.budget_max, 0) / ls.filter(l => l.budget_max).length)
        : 0,
      avgDays: avgDaysToClose(ls),
    }))
    .sort((a, b) => b.count - a.count);

  // ── BHK preference ─────────────────────────────────────────────────────────
  const bhkMap = {};
  leads.forEach(l => {
    const key = (l.bhk_preference || 'Not specified').trim();
    if (!bhkMap[key]) bhkMap[key] = [];
    bhkMap[key].push(l);
  });
  const bhkStats = Object.entries(bhkMap)
    .map(([bhk, ls]) => ({ bhk, count: ls.length, hot: ls.filter(l => l.score === 'hot').length, conv: convRate(ls) }))
    .sort((a, b) => b.count - a.count);

  // ── Budget range buckets ────────────────────────────────────────────────────
  const BUDGET_BUCKETS = [
    { label: 'Under ₹50L',    min: 0,        max: 5000000   },
    { label: '₹50L – ₹1Cr',  min: 5000000,  max: 10000000  },
    { label: '₹1Cr – ₹2Cr',  min: 10000000, max: 20000000  },
    { label: '₹2Cr – ₹5Cr',  min: 20000000, max: 50000000  },
    { label: 'Above ₹5Cr',   min: 50000000, max: Infinity   },
  ];
  const budgetStats = BUDGET_BUCKETS.map(b => {
    const ls = leads.filter(l => l.budget_max && l.budget_max >= b.min && l.budget_max < b.max);
    return { ...b, count: ls.length, hot: ls.filter(l => l.score === 'hot').length, convRate: convRate(ls) };
  }).filter(b => b.count > 0);

  // ── Timeline urgency ───────────────────────────────────────────────────────
  const TIMELINE_LABELS = { immediate: '🔥 Immediate', '3_months': '📅 3 Months', '6_months': '🗓 6 Months', '1_year': '🕐 1 Year', exploring: '🔍 Exploring' };
  const timelineMap = {};
  leads.forEach(l => {
    const key = l.purchase_timeline || 'unknown';
    if (!timelineMap[key]) timelineMap[key] = [];
    timelineMap[key].push(l);
  });
  const timelineStats = Object.entries(timelineMap)
    .map(([t, ls]) => ({ timeline: TIMELINE_LABELS[t] || t, count: ls.length, hot: ls.filter(l => l.score === 'hot').length, convRate: convRate(ls) }))
    .sort((a, b) => b.count - a.count);

  // ── Purpose split ──────────────────────────────────────────────────────────
  const selfUse = leads.filter(l => l.purpose === 'self_use').length;
  const investment = leads.filter(l => l.purpose === 'investment').length;
  const purposeTotal = selfUse + investment;

  // ── Smart recommendations ──────────────────────────────────────────────────
  const insights = [];

  // Top location
  if (locationStats[0]) {
    const top = locationStats[0];
    insights.push({ icon: '📍', color: '#1677ff', bg: '#e6f4ff',
      text: `<strong>${top.loc}</strong> is your hottest location — ${top.count} leads requesting it${top.hot > 0 ? `, ${top.hot} are Hot` : ''}. Prioritise inventory and site visits here.` });
  }

  // Best converting location
  const bestConvLoc = [...locationStats].filter(l => l.conv > 0).sort((a, b) => b.convRate - a.convRate)[0];
  if (bestConvLoc && bestConvLoc.convRate > 0 && bestConvLoc.loc !== locationStats[0]?.loc) {
    insights.push({ icon: '🏆', color: '#389e0d', bg: '#f6ffed',
      text: `<strong>${bestConvLoc.loc}</strong> has your best conversion rate at <strong>${bestConvLoc.convRate}%</strong>. Focus follow-ups here for fastest closures.` });
  }

  // Top property type
  if (propStats[0]) {
    const top = propStats[0];
    insights.push({ icon: '🏠', color: '#531dab', bg: '#f9f0ff',
      text: `<strong>${top.type}</strong> is the most enquired property type (${top.count} leads). ${top.convRate > 0 ? `Conversion rate: ${top.convRate}%.` : 'No conversions yet — review pricing or follow-up cadence.'}` });
  }

  // Best budget bucket
  const bestBudget = [...budgetStats].filter(b => b.convRate > 0).sort((a, b) => b.convRate - a.convRate)[0];
  if (bestBudget) {
    insights.push({ icon: '💰', color: '#d46b08', bg: '#fff7e6',
      text: `Leads in the <strong>${bestBudget.label}</strong> range close at <strong>${bestBudget.convRate}%</strong> — your sweet spot. Ensure agents prioritise this segment.` });
  }

  // Immediate timeline
  const immediate = timelineMap['immediate'];
  if (immediate && immediate.length > 0) {
    const hotImmediate = immediate.filter(l => l.score === 'hot' && !['converted','lost'].includes(l.status));
    if (hotImmediate.length > 0) {
      insights.push({ icon: '⚡', color: '#cf1322', bg: '#fff1f0',
        text: `<strong>${hotImmediate.length} hot leads</strong> need to buy immediately. These should be called <strong>today</strong> — every day of delay is a deal lost.` });
    }
  }

  // Investment vs self-use
  if (investment > selfUse && investment > 0) {
    insights.push({ icon: '📈', color: '#1677ff', bg: '#e6f4ff',
      text: `<strong>${Math.round((investment / purposeTotal) * 100)}% of your buyers are investors</strong>. Promote rental yield data and appreciation trends to accelerate decisions.` });
  } else if (selfUse > investment && selfUse > 0) {
    insights.push({ icon: '🏡', color: '#389e0d', bg: '#f6ffed',
      text: `<strong>${Math.round((selfUse / purposeTotal) * 100)}% are end-users</strong> (self-use). Emphasise school proximity, connectivity and possession timelines in pitches.` });
  }

  // Stale hot leads
  const staleHot = leads.filter(l => l.score === 'hot' && !['converted','lost'].includes(l.status) && agingLevel(l) === 'critical');
  if (staleHot.length > 0) {
    insights.push({ icon: '⚠️', color: '#cf1322', bg: '#fff1f0',
      text: `<strong>${staleHot.length} hot lead${staleHot.length > 1 ? 's' : ''}</strong> ${staleHot.length > 1 ? 'have' : 'has'} gone 7+ days without contact. These are at high risk of going cold — reassign or call today.` });
  }

  // Days to close
  const avgDays = avgDaysToClose(leads);
  if (avgDays !== null) {
    const benchmark = avgDays <= 30 ? 'excellent' : avgDays <= 60 ? 'average' : 'slow';
    const benchmarkColor = avgDays <= 30 ? '#389e0d' : avgDays <= 60 ? '#d46b08' : '#cf1322';
    insights.push({ icon: '⏱️', color: benchmarkColor, bg: '#fafafa',
      text: `Average deal cycle is <strong>${avgDays} days</strong> — <strong style="color:${benchmarkColor}">${benchmark}</strong> for real estate. ${avgDays > 60 ? 'Consider tightening follow-up frequency to shorten the cycle.' : 'Keep up the momentum.'}` });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const crore = (v) => {
    if (!v) return '—';
    if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)} Cr`;
    return `₹${(v / 100000).toFixed(0)} L`;
  };

  const card = (title, subtitle, children) => (
    <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 20 }}>
      <div style={{ marginBottom: 18 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: '#001529' }}>{title}</h3>
        {subtitle && <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  );

  const maxLocCount = locationStats[0]?.count || 1;
  const maxPropCount = propStats[0]?.count || 1;

  return (
    <div>
      <h2 style={{ margin: '0 0 6px 0' }}>🔍 Market Insights</h2>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
        Pattern analysis from your lead pipeline — updated in real time as leads are added and qualified
      </div>

      {/* Smart Recommendations */}
      {card('💡 Smart Recommendations', 'Auto-generated from your current pipeline data', (
        insights.length === 0
          ? <div style={{ color: '#aaa', fontSize: 13 }}>Add and qualify more leads to unlock insights.</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {insights.map((ins, i) => (
                <div key={i} style={{ display: 'flex', gap: 14, padding: '12px 16px', background: ins.bg, border: `1px solid ${ins.color}25`, borderRadius: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{ins.icon}</span>
                  <div style={{ fontSize: 14, color: '#333', lineHeight: 1.55 }} dangerouslySetInnerHTML={{ __html: ins.text }} />
                </div>
              ))}
            </div>
          )
      ))}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Location demand */}
        {card('📍 Location Demand Map', 'Top areas by number of enquiries', (
          locationStats.length === 0
            ? <div style={{ color: '#aaa', fontSize: 13 }}>No location data yet. Data populates as leads complete the WhatsApp questionnaire.</div>
            : locationStats.map(s => (
              <div key={s.loc} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                  <span style={{ fontWeight: 700 }}>{s.loc}</span>
                  <span style={{ color: '#888', fontSize: 12 }}>
                    {s.count} leads
                    {s.hot > 0 && <span style={{ color: '#cf1322', fontWeight: 700, marginLeft: 6 }}>· {s.hot} 🔥</span>}
                    {s.conv > 0 && <span style={{ color: '#531dab', fontWeight: 600, marginLeft: 6 }}>· {s.conv} closed</span>}
                    {s.avgBudget > 0 && <span style={{ color: '#1677ff', marginLeft: 6 }}>· avg {crore(s.avgBudget)}</span>}
                  </span>
                </div>
                <div style={{ background: '#f5f5f5', borderRadius: 6, height: 22, overflow: 'hidden', position: 'relative' }}>
                  {/* Demand bar */}
                  <div style={{ width: `${(s.count / maxLocCount) * 100}%`, background: '#1677ff', height: '100%', borderRadius: 6, minWidth: 4, transition: 'width 0.4s' }} />
                  {/* Hot overlay */}
                  {s.hot > 0 && (
                    <div style={{ position: 'absolute', left: 0, top: 0, width: `${(s.hot / maxLocCount) * 100}%`, background: '#cf1322', height: '100%', borderRadius: 6, opacity: 0.7 }} />
                  )}
                  {s.conv > 0 && (
                    <div style={{ position: 'absolute', right: 8, top: 3, fontSize: 11, fontWeight: 700, color: '#531dab' }}>{s.convRate}% conv</div>
                  )}
                </div>
              </div>
            ))
        ))}

        {/* Property type performance */}
        {card('🏠 Property Type Performance', 'What types of deals are winning', (
          propStats.filter(p => p.type !== 'Unknown').length === 0
            ? <div style={{ color: '#aaa', fontSize: 13 }}>No property type data yet.</div>
            : propStats.filter(p => p.type !== 'Unknown').map(s => (
              <div key={s.type} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                  <span style={{ fontWeight: 700 }}>{s.type}</span>
                  <span style={{ color: '#888', fontSize: 12 }}>
                    {s.count} leads
                    {s.hot > 0 && <span style={{ color: '#cf1322', fontWeight: 700, marginLeft: 6 }}>· {s.hot} 🔥</span>}
                    {s.convRate > 0 && <span style={{ color: '#531dab', fontWeight: 600, marginLeft: 6 }}>· {s.convRate}% conv</span>}
                    {s.avgDays !== null && <span style={{ color: '#888', marginLeft: 6 }}>· {s.avgDays}d avg close</span>}
                    {s.avgBudget > 0 && <span style={{ color: '#1677ff', marginLeft: 6 }}>· {crore(s.avgBudget)}</span>}
                  </span>
                </div>
                <div style={{ background: '#f5f5f5', borderRadius: 6, height: 22, overflow: 'hidden' }}>
                  <div style={{ width: `${(s.count / maxPropCount) * 100}%`, background: s.convRate >= 20 ? '#389e0d' : s.convRate >= 10 ? '#d46b08' : '#1677ff', height: '100%', borderRadius: 6, minWidth: 4, transition: 'width 0.4s' }} />
                </div>
              </div>
            ))
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>

        {/* BHK split */}
        {card('🛏 BHK Preference Split', 'Most requested configurations', (
          bhkStats.filter(b => b.bhk !== 'Not specified').length === 0
            ? <div style={{ color: '#aaa', fontSize: 13 }}>No BHK data yet.</div>
            : bhkStats.filter(b => b.bhk !== 'Not specified').map(s => (
              <div key={s.bhk} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#fafafa', borderRadius: 8, marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{s.bhk}</span>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {s.hot > 0 && <span style={{ fontSize: 11, color: '#cf1322', fontWeight: 700 }}>{s.hot} 🔥</span>}
                  {s.conv > 0 && <span style={{ fontSize: 11, color: '#531dab', fontWeight: 600 }}>{s.conv}% conv</span>}
                  <span style={{ fontWeight: 800, fontSize: 16, color: '#1677ff', minWidth: 24, textAlign: 'right' }}>{s.count}</span>
                </div>
              </div>
            ))
        ))}

        {/* Budget sweet spots */}
        {card('💰 Budget Range Demand', 'Which price points drive most enquiries', (
          budgetStats.length === 0
            ? <div style={{ color: '#aaa', fontSize: 13 }}>No budget data yet.</div>
            : budgetStats.map(s => (
              <div key={s.label} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{s.label}</span>
                  <span style={{ color: '#888' }}>{s.count} leads{s.hot > 0 ? ` · ${s.hot} 🔥` : ''}{s.convRate > 0 ? ` · ${s.convRate}% conv` : ''}</span>
                </div>
                <div style={{ background: '#f5f5f5', borderRadius: 5, height: 18, overflow: 'hidden' }}>
                  <div style={{ width: `${(s.count / (budgetStats[0]?.count || 1)) * 100}%`, background: s.convRate >= 20 ? '#389e0d' : s.convRate >= 10 ? '#d46b08' : '#1677ff', height: '100%', borderRadius: 5, minWidth: 4 }} />
                </div>
              </div>
            ))
        ))}

        {/* Purchase timeline + purpose */}
        {card('⏰ Buyer Urgency & Purpose', 'Timeline and intent breakdown', (
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#555', marginBottom: 10 }}>Purchase Timeline</div>
            {timelineStats.filter(t => t.timeline !== 'unknown').map(s => (
              <div key={s.timeline} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#fafafa', borderRadius: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 13 }}>{s.timeline}</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {s.hot > 0 && <span style={{ fontSize: 11, color: '#cf1322', fontWeight: 700 }}>{s.hot} 🔥</span>}
                  {s.convRate > 0 && <span style={{ fontSize: 11, color: '#531dab' }}>{s.convRate}% conv</span>}
                  <span style={{ fontWeight: 800, color: '#1677ff' }}>{s.count}</span>
                </div>
              </div>
            ))}
            {purposeTotal > 0 && (
              <>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#555', margin: '14px 0 10px' }}>Buyer Intent</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {selfUse > 0 && (
                    <div style={{ flex: selfUse, background: '#e6f4ff', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                      <div style={{ fontWeight: 800, fontSize: 20, color: '#1677ff' }}>{selfUse}</div>
                      <div style={{ fontSize: 12, color: '#888' }}>🏡 Self Use</div>
                      <div style={{ fontSize: 11, color: '#aaa' }}>{Math.round((selfUse / purposeTotal) * 100)}%</div>
                    </div>
                  )}
                  {investment > 0 && (
                    <div style={{ flex: investment, background: '#f6ffed', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                      <div style={{ fontWeight: 800, fontSize: 20, color: '#389e0d' }}>{investment}</div>
                      <div style={{ fontSize: 12, color: '#888' }}>📈 Investment</div>
                      <div style={{ fontSize: 11, color: '#aaa' }}>{Math.round((investment / purposeTotal) * 100)}%</div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Top demand combos */}
      {card('🏆 Top Demand Combinations', 'Most requested property + location + BHK combos (your best inventory to source)', (() => {
        const comboMap = {};
        leads.forEach(l => {
          if (!l.property_type && !l.location_preference) return;
          const key = [l.bhk_preference, l.property_type, l.location_preference].filter(Boolean).join(' · ');
          if (!key) return;
          if (!comboMap[key]) comboMap[key] = { key, count: 0, hot: 0, conv: 0 };
          comboMap[key].count++;
          if (l.score === 'hot') comboMap[key].hot++;
          if (l.status === 'converted') comboMap[key].conv++;
        });
        const combos = Object.values(comboMap).sort((a, b) => b.hot - a.hot || b.count - a.count).slice(0, 8);
        return combos.length === 0
          ? <div style={{ color: '#aaa', fontSize: 13 }}>Not enough data yet. Qualify more leads to see demand patterns.</div>
          : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {combos.map((c, i) => (
                <div key={c.key} style={{ background: i === 0 ? '#fff7e6' : '#fafafa', border: `1px solid ${i === 0 ? '#ffd591' : '#f0f0f0'}`, borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: '#d46b08', minWidth: 20 }}>#{i + 1}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{c.key}</div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                      {c.count} enquiries
                      {c.hot > 0 && <span style={{ color: '#cf1322', fontWeight: 700, marginLeft: 6 }}>{c.hot} 🔥</span>}
                      {c.conv > 0 && <span style={{ color: '#531dab', fontWeight: 600, marginLeft: 6 }}>{c.conv} closed</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
      })())}
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
    try { await ingestLead({ ...form, source: 'manual' }); onAdded(); onClose(); }
    catch { setError('Failed to add lead'); }
    finally { setLoading(false); }
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
        {field('Full Name *', 'name')}{field('Phone Number *', 'phone')}
        {field('Email', 'email', 'email')}{field('Property Type', 'property_type')}
        {field('Preferred Location', 'location_preference')}{field('Notes', 'notes')}
        {error && <div style={{ color: '#cf1322', marginBottom: 12, fontSize: 13 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #d9d9d9', background: '#fff', cursor: 'pointer' }}>Cancel</button>
          <button onClick={submit} disabled={loading} style={{ background: '#52c41a', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontWeight: 700, cursor: 'pointer' }}>
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
  const [pinModal, setPinModal] = useState(null); // agent object
  const [pinValue, setPinValue] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '', whatsapp_number: '', specialization: '', areas_covered: '', max_leads: 20 });

  const load = useCallback(() => { getAgents(false).then(r => setAgents(r.data)).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    try {
      await createAgent(form); setShowAdd(false);
      setForm({ name: '', phone: '', email: '', whatsapp_number: '', specialization: '', areas_covered: '', max_leads: 20 });
      load();
    } catch { alert('Failed to create agent'); }
  };

  const savePin = async () => {
    if (!pinValue || pinValue.length < 4) { alert('PIN must be at least 4 digits'); return; }
    try {
      await setAgentPin(pinModal.id, pinValue);
      alert(`✅ PIN set for ${pinModal.name}. They can now log in at /agent`);
      setPinModal(null); setPinValue('');
    } catch (e) { alert(e.response?.data?.detail || 'Failed to set PIN'); }
  };

  const portalUrl = `${window.location.origin}/agent`;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0 }}>👥 Sales Agents ({agents.length})</h2>
          <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
            Agent portal: <a href={portalUrl} target="_blank" rel="noreferrer" style={{ color: '#1677ff' }}>{portalUrl}</a>
          </div>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ background: '#52c41a', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 700, cursor: 'pointer' }}>+ Add Agent</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {agents.map(a => (
          <div key={a.id} style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', opacity: a.is_active ? 1 : 0.6, borderLeft: `4px solid ${a.is_active ? '#52c41a' : '#d9d9d9'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{a.name}</div>
                <div style={{ fontSize: 12, color: '#888' }}>{a.phone}</div>
              </div>
              <button onClick={async () => { await updateAgent(a.id, { is_active: !a.is_active }); load(); }}
                style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, cursor: 'pointer', background: a.is_active ? '#fff1f0' : '#f6ffed', color: a.is_active ? '#cf1322' : '#389e0d', border: `1px solid ${a.is_active ? '#ffa39e' : '#b7eb8f'}` }}>
                {a.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
            <div style={{ marginTop: 10, fontSize: 13 }}>
              <div style={{ color: '#666' }}>🏠 {a.specialization || 'General'}</div>
              <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>📍 {a.areas_covered || 'All areas'}</div>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
              {[['Active', a.active_lead_count,'#1677ff'],['Total',a.total_leads_assigned,'#52c41a'],['Conv%',`${a.conversion_rate}%`,'#722ed1'],['Cap',a.max_leads,'#fa8c16']].map(([lbl,val,col]) => (
                <div key={lbl} style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 18, color: col }}>{val}</div>
                  <div style={{ fontSize: 11, color: '#aaa' }}>{lbl}</div>
                </div>
              ))}
            </div>
            <button onClick={() => { setPinModal(a); setPinValue(''); }}
              style={{ marginTop: 12, width: '100%', padding: '7px', borderRadius: 8, border: '1px solid #d9d9d9', background: '#f0f5ff', color: '#1677ff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              🔑 Set Agent PIN
            </button>
          </div>
        ))}
      </div>

      {/* Set PIN modal */}
      {pinModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setPinModal(null)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 6px' }}>🔑 Set PIN — {pinModal.name}</h3>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>Agent will use their phone + this PIN to log in at <strong>/agent</strong></div>
            <input
              type="password" inputMode="numeric" placeholder="Enter 4–6 digit PIN"
              value={pinValue} onChange={e => setPinValue(e.target.value)}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #d9d9d9', fontSize: 20, letterSpacing: 8, textAlign: 'center', boxSizing: 'border-box', marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setPinModal(null)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #d9d9d9', background: '#fff', cursor: 'pointer' }}>Cancel</button>
              <button onClick={savePin} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: '#1677ff', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>✓ Save PIN</button>
            </div>
          </div>
        </div>
      )}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowAdd(false)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: 20 }}>➕ Add Agent</h2>
            {[['Name *','name'],['Phone *','phone'],['Email','email'],['WhatsApp Number','whatsapp_number'],['Specialization','specialization'],['Areas Covered','areas_covered']].map(([label, key]) => (
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
              <button onClick={submit} style={{ background: '#52c41a', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontWeight: 700, cursor: 'pointer' }}>✓ Create Agent</button>
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
  const [allLeads, setAllLeads] = useState([]); // unfiltered for pipeline
  const [stats, setStats] = useState(null);
  const [agents, setAgents] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [showAddLead, setShowAddLead] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ search:'',status:'',score:'',source:'',agent_id:'',follow_up_status:'',budget:'',location:'' });

  const buildParams = useCallback(() => {
    const p = {};
    if (filters.search) p.search = filters.search;
    if (filters.status) p.status = filters.status;
    if (filters.score) p.score = filters.score;
    if (filters.source) p.source = filters.source;
    if (filters.agent_id) p.agent_id = filters.agent_id;
    if (filters.follow_up_status) p.follow_up_status = filters.follow_up_status;
    if (filters.location) p.location = filters.location;
    if (filters.budget) { const [bmin, bmax] = filters.budget.split('-'); p.budget_min = bmin; p.budget_max = bmax; }
    return p;
  }, [filters]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [leadsRes, allLeadsRes, statsRes, agentsRes] = await Promise.all([
        getLeads(buildParams()),
        getLeads({ limit: 200 }),
        getLeadStats(),
        getAgents(false),
      ]);
      setLeads(leadsRes.data.leads || []);
      setAllLeads(allLeadsRes.data.leads || []);
      setStats(statsRes.data);
      setAgents(agentsRes.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [buildParams]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAssign = async (leadId, agentId) => {
    try { await assignLead(leadId, parseInt(agentId)); loadData(); }
    catch { alert('Assignment failed'); }
  };
  const handleQualify = async (leadId) => {
    try {
      const res = await qualifyLead(leadId); loadData();
      const { score, label } = res.data;
      alert(`✅ Scored: ${label?.toUpperCase()} (${score}/100)${score === 0 ? '\n\nNo conversation data yet.' : ''}`);
    } catch { alert('Qualification failed'); }
  };
  const handleDelete = async (leadId) => {
    try { await deleteLead(leadId); loadData(); }
    catch { alert('Delete failed'); }
  };
  const handleStatusChange = async (leadId, newStatus) => {
    try { await updateLead(leadId, { status: newStatus }); loadData(); }
    catch { alert('Status update failed'); }
  };

  // Aging stats
  const atRiskCount = allLeads.filter(l => !['converted','lost'].includes(l.status) && ['critical','warning'].includes(agingLevel(l))).length;

  const tabBtn = (key, label) => (
    <button onClick={() => setTab(key)} style={{
      color: tab === key ? '#1890ff' : '#aaa', background: 'none', border: 'none',
      borderBottom: tab === key ? '3px solid #1890ff' : '3px solid transparent',
      padding: '16px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer',
    }}>{label}</button>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      {/* Header */}
      <div style={{ background: '#001529', padding: '0 32px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ color: '#fff', fontWeight: 800, fontSize: 18, padding: '16px 0', marginRight: 16 }}>🏠 RE Lead Qualifier</div>
        {tabBtn('leads', '📋 Leads')}
        {tabBtn('pipeline', '🗂️ Pipeline')}
        {tabBtn('queue', '📞 Call Queue')}
        {tabBtn('analytics', '📊 Analytics')}
        {tabBtn('forecast', '💰 Forecast')}
        {tabBtn('insights', '🔍 Insights')}
        {tabBtn('agents', '👥 Agents')}
        <div style={{ marginLeft: 'auto', color: '#aaa', fontSize: 12 }}>
          {loading ? '⟳ Refreshing…' : `Updated: ${new Date().toLocaleTimeString()}`}
        </div>
      </div>

      <div style={{ padding: '24px 32px' }}>

        {/* Stats Row — shown on leads + pipeline tabs */}
        {(tab === 'leads' || tab === 'pipeline') && stats && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <StatCard label="Total Leads"  value={stats.total_leads}          color="#1677ff" icon="📋" />
            <StatCard label="🔥 Hot"       value={stats.by_score?.hot || 0}   color="#cf1322" icon="🔥"
              onClick={() => { setTab('leads'); setFilters(f => ({ ...f, score: 'hot' })); }} />
            <StatCard label="🌡️ Warm"      value={stats.by_score?.warm || 0}  color="#d46b08" icon="🌡️"
              onClick={() => { setTab('leads'); setFilters(f => ({ ...f, score: 'warm' })); }} />
            <StatCard label="❄️ Cold"      value={stats.by_score?.cold || 0}  color="#0958d9" icon="❄️"
              onClick={() => { setTab('leads'); setFilters(f => ({ ...f, score: 'cold' })); }} />
            <StatCard label="Assigned"     value={stats.by_status?.assigned || 0} color="#d46b08" icon="👤" />
            <StatCard label="Converted"    value={stats.by_status?.converted || 0} color="#531dab" icon="✅" />
            {atRiskCount > 0 &&
              <StatCard label="⚠️ At Risk"  value={atRiskCount} color="#cf1322" icon="⏰"
                onClick={() => { setTab('leads'); setFilters(f => ({ ...f, score: '', status: '' })); }} />}
          </div>
        )}

        {/* Leads Tab */}
        {tab === 'leads' && (
          <>
            <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <FiltersPanel filters={filters} setFilters={setFilters} agents={agents} />
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={loadData} style={{ background: '#1677ff', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>↻ Refresh</button>
                <button onClick={() => setShowAddLead(true)} style={{ background: '#52c41a', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13, marginLeft: 'auto' }}>+ Add Lead</button>
              </div>
            </div>
            <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fafafa', borderBottom: '2px solid #f0f0f0' }}>
                    {['Lead','Score','Status','Requirements','Budget','Agent / Close','Time','Actions'].map(h => (
                      <th key={h} style={{ padding: '11px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.length === 0
                    ? <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>{loading ? 'Loading…' : 'No leads found.'}</td></tr>
                    : leads.map(lead => (
                        <LeadRow key={lead.id} lead={lead} agents={agents}
                          onAssign={handleAssign} onQualify={handleQualify}
                          onSelect={setSelectedLead} onDelete={handleDelete} />
                      ))}
                </tbody>
              </table>
              <div style={{ padding: '10px 16px', borderTop: '1px solid #f0f0f0', fontSize: 13, color: '#888' }}>
                Showing {leads.length} leads {Object.values(filters).some(Boolean) ? '(filtered)' : ''}
              </div>
            </div>
          </>
        )}

        {/* Pipeline Tab */}
        {tab === 'pipeline' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 14, color: '#666' }}>
                Click a card to view details · Use <strong>"Move to…"</strong> to change stage
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={loadData} style={{ background: '#1677ff', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>↻ Refresh</button>
                <button onClick={() => setShowAddLead(true)} style={{ background: '#52c41a', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>+ Add Lead</button>
              </div>
            </div>
            <PipelineView leads={allLeads} agents={agents} onSelect={setSelectedLead} onStatusChange={handleStatusChange} />
          </>
        )}

        {/* Call Queue Tab */}
        {tab === 'queue' && (
          <CallQueueView leads={allLeads} agents={agents} onSelect={setSelectedLead} />
        )}

        {/* Analytics Tab */}
        {tab === 'analytics' && (
          <AnalyticsView leads={allLeads} agents={agents} />
        )}

        {/* Forecast Tab */}
        {tab === 'forecast' && (
          <ForecastView leads={allLeads} agents={agents} />
        )}

        {/* Insights Tab */}
        {tab === 'insights' && (
          <InsightsView leads={allLeads} agents={agents} />
        )}

        {/* Agents Tab */}
        {tab === 'agents' && <AgentsTab />}
      </div>

      {selectedLead && (
        <LeadModal lead={selectedLead} agents={agents}
          onClose={() => setSelectedLead(null)}
          onAssign={(id, agentId) => { handleAssign(id, agentId); setSelectedLead(null); }}
          onQualify={handleQualify}
          onDelete={handleDelete}
          onRefresh={loadData} />
      )}
      {showAddLead && <AddLeadModal onClose={() => setShowAddLead(false)} onAdded={loadData} />}
    </div>
  );
}
