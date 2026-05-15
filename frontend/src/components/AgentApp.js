import React, { useState, useEffect, useCallback } from 'react';
import { agentLogin, getMyLeads, updateLeadAsAgent, getLeadMessagesAsAgent } from '../services/api';

// ── Constants ─────────────────────────────────────────────────────────────────
const SCORE_STYLES = {
  hot:         { bg: '#fff1f0', color: '#cf1322', border: '#ffa39e', label: '🔥 Hot' },
  warm:        { bg: '#fffbe6', color: '#d46b08', border: '#ffe58f', label: '🌡️ Warm' },
  cold:        { bg: '#e6f7ff', color: '#0958d9', border: '#91caff', label: '❄️ Cold' },
  unqualified: { bg: '#f5f5f5', color: '#595959', border: '#d9d9d9', label: '⚪ New' },
};
const STATUS_COLORS = {
  new: '#2f54eb', contacted: '#08979c', qualified: '#389e0d',
  assigned: '#d46b08', converted: '#531dab', lost: '#cf1322',
};
const FOLLOW_UP_OPTIONS = [
  { value: 'interested',          label: '✅ Interested' },
  { value: 'negotiating',         label: '🤝 Negotiating' },
  { value: 'follow_up_scheduled', label: '📅 Follow-up Scheduled' },
  { value: 'not_interested',      label: '❌ Not Interested' },
  { value: 'converted',           label: '🏆 Converted' },
];
const STATUS_OPTIONS = [
  { value: 'contacted',  label: 'Contacted' },
  { value: 'qualified',  label: 'Qualified' },
  { value: 'assigned',   label: 'Assigned' },
  { value: 'converted',  label: 'Converted' },
  { value: 'lost',       label: 'Lost' },
];

const TIMELINE_BONUS = { immediate: 25, '3_months': 15, '6_months': 8, '1_year': 0, exploring: -15 };
const BUDGET_BONUS   = (max) => { if (!max) return 0; if (max >= 50000000) return 20; if (max >= 20000000) return 15; if (max >= 10000000) return 10; if (max >= 5000000) return 5; return 0; };
const FOLLOWUP_BONUS = { negotiating: 25, interested: 15, follow_up_scheduled: 10, not_interested: -60 };

const agingLevel = (lead) => {
  const last = lead.wa_last_message_at || lead.updated_at || lead.created_at;
  if (!last) return 'none';
  const hrs = (Date.now() - new Date(last).getTime()) / 3600000;
  if (hrs > 168) return 'critical';
  if (hrs > 48)  return 'warning';
  if (hrs > 24)  return 'mild';
  return 'fresh';
};
const AGING_PENALTY = { critical: -25, warning: -12, mild: -5, fresh: 0, none: 0 };

const priorityScore = (lead) => {
  let score = lead.score_value || 0;
  score += TIMELINE_BONUS[lead.purchase_timeline] || 0;
  score += BUDGET_BONUS(lead.budget_max);
  score += FOLLOWUP_BONUS[lead.follow_up_status] || 0;
  score += AGING_PENALTY[agingLevel(lead)];
  return Math.max(0, Math.min(150, Math.round(score)));
};

const formatBudget = (val) => {
  if (!val) return null;
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

// ── Login Screen ──────────────────────────────────────────────────────────────
const LoginScreen = ({ onLogin }) => {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!phone || !pin) { setError('Enter phone and PIN'); return; }
    setLoading(true); setError('');
    try {
      const res = await agentLogin(phone, pin);
      onLogin(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Check your phone and PIN.');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #001529 0%, #003a70 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: '36px 28px', width: '100%', maxWidth: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🏠</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#001529' }}>Agent Portal</div>
          <div style={{ fontSize: 14, color: '#888', marginTop: 4 }}>Real Estate Lead Qualifier</div>
        </div>

        <form onSubmit={submit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>Phone Number</label>
            <input
              type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="9876543210"
              style={{ width: '100%', padding: '14px 16px', borderRadius: 10, border: '1.5px solid #d9d9d9', fontSize: 16, boxSizing: 'border-box', outline: 'none' }}
              onFocus={e => e.target.style.borderColor = '#1677ff'}
              onBlur={e => e.target.style.borderColor = '#d9d9d9'}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>PIN</label>
            <input
              type="password" value={pin} onChange={e => setPin(e.target.value)}
              placeholder="••••"
              inputMode="numeric"
              style={{ width: '100%', padding: '14px 16px', borderRadius: 10, border: '1.5px solid #d9d9d9', fontSize: 20, letterSpacing: 6, boxSizing: 'border-box', outline: 'none' }}
              onFocus={e => e.target.style.borderColor = '#1677ff'}
              onBlur={e => e.target.style.borderColor = '#d9d9d9'}
            />
          </div>
          {error && <div style={{ background: '#fff1f0', color: '#cf1322', border: '1px solid #ffa39e', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>{error}</div>}
          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '15px', background: loading ? '#aaa' : '#1677ff', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: 20, fontSize: 12, color: '#aaa', textAlign: 'center' }}>
          Contact your admin if you don't have a PIN
        </div>
      </div>
    </div>
  );
};

// ── Lead Update Sheet ─────────────────────────────────────────────────────────
const LeadSheet = ({ lead, token, onClose, onUpdated }) => {
  const [form, setForm] = useState({
    follow_up_status: lead.follow_up_status || '',
    status: lead.status || '',
    agent_notes: lead.agent_notes || '',
    expected_conversion_date: lead.expected_conversion_date ? lead.expected_conversion_date.slice(0, 10) : '',
  });
  const [saving, setSaving] = useState(false);
  const [messages, setMessages] = useState([]);
  const [tab, setTab] = useState('details');

  useEffect(() => {
    getLeadMessagesAsAgent(lead.id, token)
      .then(r => setMessages(r.data))
      .catch(() => {});
  }, [lead.id, token]);

  const save = async () => {
    setSaving(true);
    try {
      await updateLeadAsAgent(lead.id, form, token);
      onUpdated();
      onClose();
    } catch { setSaving(false); }
  };

  const scoreStyle = SCORE_STYLES[lead.score] || SCORE_STYLES.unqualified;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(0,0,0,0.5)' }} />

      {/* Sheet */}
      <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 -4px 24px rgba(0,0,0,0.15)' }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
          <div style={{ width: 40, height: 4, background: '#e0e0e0', borderRadius: 2 }} />
        </div>

        {/* Header */}
        <div style={{ padding: '12px 20px 0', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{lead.name}</div>
              <a href={`tel:${lead.phone}`} style={{ color: '#1677ff', fontSize: 14, textDecoration: 'none' }}>{lead.phone}</a>
            </div>
            <span style={{ background: scoreStyle.bg, color: scoreStyle.color, border: `1px solid ${scoreStyle.border}`, borderRadius: 8, padding: '4px 10px', fontSize: 13, fontWeight: 700 }}>{scoreStyle.label}</span>
          </div>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0 }}>
            {[['details', '📋 Details'], ['update', '✏️ Update'], ['chat', '💬 Chat']].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)} style={{ flex: 1, padding: '10px 0', background: 'none', border: 'none', borderBottom: tab === key ? '2px solid #1677ff' : '2px solid transparent', color: tab === key ? '#1677ff' : '#888', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          {/* Details tab */}
          {tab === 'details' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                {[
                  ['🏠 Type', lead.property_type],
                  ['🛏 BHK', lead.bhk_preference],
                  ['📍 Location', lead.location_preference],
                  ['💰 Budget', formatBudget(lead.budget_max)],
                  ['⏰ Timeline', lead.purchase_timeline],
                  ['🎯 Purpose', lead.purpose],
                  ['📊 Status', lead.status],
                  ['📅 Follow-up', lead.follow_up_status],
                ].map(([label, value]) => value ? (
                  <div key={label} style={{ background: '#fafafa', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
                  </div>
                ) : null)}
              </div>
              {lead.agent_notes && (
                <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 4 }}>MY NOTES</div>
                  <div style={{ fontSize: 14 }}>{lead.agent_notes}</div>
                </div>
              )}
              {lead.notes && (
                <div style={{ background: '#f0f5ff', border: '1px solid #adc6ff', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 4 }}>LEAD NOTES</div>
                  <div style={{ fontSize: 14 }}>{lead.notes}</div>
                </div>
              )}
              {/* Quick action buttons */}
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <a href={`tel:${lead.phone}`} style={{ flex: 1, display: 'block', background: '#52c41a', color: '#fff', borderRadius: 12, padding: '13px', textAlign: 'center', fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>📞 Call</a>
                <a href={`https://wa.me/${lead.phone.replace('+', '')}`} target="_blank" rel="noreferrer"
                  style={{ flex: 1, display: 'block', background: '#25d366', color: '#fff', borderRadius: 12, padding: '13px', textAlign: 'center', fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>
                  💬 WhatsApp
                </a>
              </div>
            </div>
          )}

          {/* Update tab */}
          {tab === 'update' && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#555', display: 'block', marginBottom: 8 }}>Follow-up Status</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {FOLLOW_UP_OPTIONS.map(o => (
                    <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: form.follow_up_status === o.value ? '#e6f4ff' : '#fafafa', border: `1.5px solid ${form.follow_up_status === o.value ? '#1677ff' : '#f0f0f0'}`, borderRadius: 10, cursor: 'pointer' }}>
                      <input type="radio" name="fup" value={o.value} checked={form.follow_up_status === o.value} onChange={() => setForm(f => ({ ...f, follow_up_status: o.value }))} style={{ accentColor: '#1677ff' }} />
                      <span style={{ fontSize: 14, fontWeight: form.follow_up_status === o.value ? 700 : 400 }}>{o.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#555', display: 'block', marginBottom: 8 }}>Lead Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #d9d9d9', fontSize: 14, background: '#fff' }}>
                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#555', display: 'block', marginBottom: 8 }}>Expected Close Date</label>
                <input type="date" value={form.expected_conversion_date} onChange={e => setForm(f => ({ ...f, expected_conversion_date: e.target.value }))}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #d9d9d9', fontSize: 14, boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#555', display: 'block', marginBottom: 8 }}>Notes</label>
                <textarea value={form.agent_notes} onChange={e => setForm(f => ({ ...f, agent_notes: e.target.value }))}
                  placeholder="Add notes about this lead…"
                  rows={4}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #d9d9d9', fontSize: 14, resize: 'none', boxSizing: 'border-box' }} />
              </div>

              <button onClick={save} disabled={saving}
                style={{ width: '100%', padding: '15px', background: saving ? '#aaa' : '#1677ff', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving…' : '✅ Save Update'}
              </button>
            </div>
          )}

          {/* Chat tab */}
          {tab === 'chat' && (
            <div>
              {messages.length === 0
                ? <div style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>No WhatsApp conversation yet</div>
                : messages.map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: m.direction === 'outbound' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
                    <div style={{
                      maxWidth: '78%', padding: '10px 14px', borderRadius: m.direction === 'outbound' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                      background: m.direction === 'outbound' ? '#dcf8c6' : '#fff',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)', fontSize: 14, lineHeight: 1.5,
                    }}>
                      <div>{m.text}</div>
                      <div style={{ fontSize: 10, color: '#aaa', marginTop: 4, textAlign: 'right' }}>{timeAgo(m.timestamp)}</div>
                    </div>
                  </div>
                ))
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Lead Card ─────────────────────────────────────────────────────────────────
const LeadCard = ({ lead, onSelect }) => {
  const pScore = priorityScore(lead);
  const scoreStyle = SCORE_STYLES[lead.score] || SCORE_STYLES.unqualified;
  const aging = agingLevel(lead);
  const AGING_COLOR = { critical: '#cf1322', warning: '#d46b08', mild: '#d4b106', fresh: '#52c41a', none: '#aaa' };
  const pColor = pScore >= 90 ? '#cf1322' : pScore >= 70 ? '#d46b08' : pScore >= 50 ? '#d4b106' : '#52c41a';

  return (
    <div onClick={() => onSelect(lead)}
      style={{ background: '#fff', borderRadius: 14, padding: '16px', marginBottom: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderLeft: `4px solid ${pColor}`, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
      onTouchStart={e => e.currentTarget.style.background = '#f5f5f5'}
      onTouchEnd={e => e.currentTarget.style.background = '#fff'}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{lead.name}</div>
          <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{lead.phone}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: pColor }}>{pScore}</div>
          <div style={{ fontSize: 10, color: pColor, fontWeight: 600 }}>priority</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ background: scoreStyle.bg, color: scoreStyle.color, border: `1px solid ${scoreStyle.border}`, borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>{scoreStyle.label}</span>
        <span style={{ background: '#f0f5ff', color: STATUS_COLORS[lead.status] || '#888', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>{lead.status}</span>
        {lead.follow_up_status && (
          <span style={{ background: '#f9f0ff', color: '#531dab', borderRadius: 6, padding: '2px 8px', fontSize: 12 }}>{lead.follow_up_status.replace(/_/g, ' ')}</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#666', flexWrap: 'wrap' }}>
        {lead.property_type && <span>🏠 {lead.property_type} {lead.bhk_preference || ''}</span>}
        {lead.location_preference && <span>📍 {lead.location_preference}</span>}
        {lead.budget_max && <span>💰 {formatBudget(lead.budget_max)}</span>}
      </div>

      {aging !== 'fresh' && (
        <div style={{ marginTop: 6, fontSize: 11, color: AGING_COLOR[aging], fontWeight: 600 }}>
          {{ critical: '⚠️ 7+ days inactive', warning: '⚠️ 48h+ inactive', mild: '⏳ 24h+ inactive' }[aging]}
        </div>
      )}
    </div>
  );
};

// ── Main Agent App ────────────────────────────────────────────────────────────
const AgentApp = ({ session, onLogout }) => {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('active');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMyLeads(session.token);
      setLeads(res.data.leads || []);
    } catch { /* token expired — handled by logout */ }
    finally { setLoading(false); }
  }, [session.token]);

  useEffect(() => { load(); }, [load]);

  const filtered = leads
    .filter(l => {
      if (filter === 'active') return !['converted', 'lost'].includes(l.status);
      if (filter === 'hot')    return l.score === 'hot';
      if (filter === 'converted') return l.status === 'converted';
      return true;
    })
    .sort((a, b) => priorityScore(b) - priorityScore(a));

  const atRisk = leads.filter(l => !['converted','lost'].includes(l.status) && ['critical','warning'].includes(agingLevel(l))).length;
  const hotCount = leads.filter(l => l.score === 'hot' && !['converted','lost'].includes(l.status)).length;

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', maxWidth: 480, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ background: '#001529', padding: '16px 20px', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>Hi, {session.name} 👋</div>
            <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>{session.specialization || 'Sales Agent'}</div>
          </div>
          <button onClick={onLogout} style={{ background: 'none', border: '1px solid #444', color: '#888', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>Logout</button>
        </div>

        {/* Stats strip */}
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          {[
            { label: 'My Leads', value: leads.filter(l => !['converted','lost'].includes(l.status)).length, color: '#1677ff' },
            { label: '🔥 Hot',    value: hotCount,  color: '#cf1322' },
            { label: '⚠️ At Risk', value: atRisk,   color: '#d46b08' },
            { label: '✅ Closed', value: leads.filter(l => l.status === 'converted').length, color: '#52c41a' },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '8px 6px', textAlign: 'center' }}>
              <div style={{ color: s.color, fontWeight: 800, fontSize: 18 }}>{s.value}</div>
              <div style={{ color: '#aaa', fontSize: 10, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ background: '#fff', display: 'flex', borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 108, zIndex: 99 }}>
        {[['active','📋 Active'], ['hot','🔥 Hot'], ['all','All'], ['converted','✅ Closed']].map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)} style={{ flex: 1, padding: '12px 4px', background: 'none', border: 'none', borderBottom: filter === key ? '3px solid #1677ff' : '3px solid transparent', color: filter === key ? '#1677ff' : '#888', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>{label}</button>
        ))}
      </div>

      {/* Lead list */}
      <div style={{ padding: '12px 14px' }}>
        {loading
          ? <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>Loading your leads…</div>
          : filtered.length === 0
            ? <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>No leads in this category</div>
            : filtered.map(lead => (
              <LeadCard key={lead.id} lead={lead} onSelect={setSelected} />
            ))}
      </div>

      {/* Refresh button */}
      <div style={{ padding: '0 14px 24px' }}>
        <button onClick={load} disabled={loading}
          style={{ width: '100%', padding: '13px', background: '#f0f2f5', border: '1px solid #d9d9d9', borderRadius: 12, fontSize: 14, color: '#666', cursor: 'pointer', fontWeight: 600 }}>
          {loading ? '⟳ Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      {/* Lead sheet */}
      {selected && (
        <LeadSheet
          lead={selected}
          token={session.token}
          onClose={() => setSelected(null)}
          onUpdated={load}
        />
      )}
    </div>
  );
};

// ── Root: Login gate ──────────────────────────────────────────────────────────
const TOKEN_KEY = 'agent_session';

const AgentRoot = () => {
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY)); } catch { return null; }
  });

  const handleLogin = (data) => {
    const s = { token: data.token, name: data.name, specialization: data.specialization, agent_id: data.agent_id };
    localStorage.setItem(TOKEN_KEY, JSON.stringify(s));
    setSession(s);
  };

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setSession(null);
  };

  if (!session) return <LoginScreen onLogin={handleLogin} />;
  return <AgentApp session={session} onLogout={handleLogout} />;
};

export default AgentRoot;
