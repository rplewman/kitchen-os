import { useState, useEffect } from 'react';
import {
  getBudgetEntries, addBudgetEntry, deleteBudgetEntry,
  getBudgetSettings, saveBudgetSettings,
  getISOWeekKey, getMondayOfWeek, getAdjacentWeekKey,
} from './storage.js';

// ── Constants ──────────────────────────────────────────────────────────────

const PRESET_STORES = ["Trader Joe's", 'Whole Foods', 'Costco', 'Target', 'Other'];

const STORE_COLORS = {
  "Trader Joe's": '#d32f2f',
  'Whole Foods':  '#1b5e20',
  'Costco':       '#0d47a1',
  'Target':       '#b71c1c',
  'Other':        '#6a1b9a',
};

function storeColor(store) {
  return STORE_COLORS[store] || '#555';
}

// ── Date helpers ───────────────────────────────────────────────────────────

function currentMonthKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

function monthKeyFromWeek(weekKey) {
  const monday = getMondayOfWeek(weekKey);
  return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatMonthKey(mk) {
  const [y, m] = mk.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1))
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function adjacentMonth(mk, delta) {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function weekLabel(weekKey) {
  const monday = getMondayOfWeek(weekKey);
  return monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// Last n ISO week keys, returned oldest-first
function getRecentWeeks(n) {
  const weeks = [];
  let wk = getISOWeekKey();
  for (let i = 0; i < n; i++) { weeks.push(wk); wk = getAdjacentWeekKey(wk, -1); }
  return weeks.reverse();
}

function selectWeeks(n) {
  // For the week dropdown (newest first)
  const weeks = [];
  let wk = getISOWeekKey();
  for (let i = 0; i < n; i++) { weeks.push(wk); wk = getAdjacentWeekKey(wk, -1); }
  return weeks;
}

function fmt(n) {
  return `$${n.toFixed(2).replace(/\.00$/, '')}`;
}

// ── Venmo Request Sheet ────────────────────────────────────────────────────

function VenmoRequestSheet({ targetName, targetVenmo, amount, weekLabel, onClose }) {
  const half = (amount / 2).toFixed(2);
  const deepLink = `venmo://paycharge?txn=charge&recipients=${encodeURIComponent(targetVenmo)}&amount=${half}&note=${encodeURIComponent(`Groceries ${weekLabel} - your half`)}`;
  const webLink  = `https://venmo.com/paycharge?txn=charge&recipients=${encodeURIComponent(targetVenmo)}&amount=${half}&note=${encodeURIComponent(`Groceries ${weekLabel} - your half`)}`;

  return (
    <div className="sheet-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-body" style={{ textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:8 }}>💸</div>
          <div className="sheet-title" style={{ marginBottom:4 }}>Request {targetName}</div>
          <p style={{ fontSize:14, color:'var(--text-muted)', marginBottom:24 }}>
            Week of {weekLabel}
          </p>
          <div style={{
            fontFamily:'Cormorant Garamond,serif', fontSize:'3.5rem', fontWeight:700,
            lineHeight:1, marginBottom:8, color:'var(--text)',
          }}>
            ${half}
          </div>
          <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:32 }}>
            half of ${amount.toFixed(2)} total
          </p>

          {/* Primary: deep link (opens Venmo app) */}
          <a
            href={deepLink}
            style={{
              display:'block', background:'#008CFF', color:'#fff',
              textDecoration:'none', borderRadius:'var(--radius-sm)',
              padding:'14px', fontSize:16, fontWeight:700, marginBottom:12,
            }}
          >
            Open in Venmo app
          </a>

          {/* Fallback: web link */}
          <a
            href={webLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display:'block', background:'var(--bg)', color:'var(--text)',
              textDecoration:'none', borderRadius:'var(--radius-sm)',
              border:'1.5px solid var(--border)',
              padding:'13px', fontSize:15, fontWeight:500, marginBottom:8,
            }}
          >
            Open Venmo in browser
          </a>

          <button className="btn-ghost" style={{ width:'100%', marginTop:4 }} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function fmtShort(n) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

// ── Spending bar chart ─────────────────────────────────────────────────────

function SpendingChart({ entries, weeklyTarget }) {
  const weeks = getRecentWeeks(8);

  const weekTotals = weeks.map(wk => ({
    weekKey: wk,
    label: weekLabel(wk),
    total: entries.filter(e => e.weekKey === wk).reduce((s, e) => s + (e.amount || 0), 0),
  }));

  const maxRaw = Math.max(...weekTotals.map(w => w.total), weeklyTarget || 0, 1);
  const yMax   = Math.ceil(maxRaw / 25) * 25; // round up to nearest $25

  const VW = 340, VH = 165;
  const ML = 40, MR = 8, MT = 16, MB = 30;
  const chartW = VW - ML - MR;
  const chartH = VH - MT - MB;
  const n      = weeks.length;
  const slot   = chartW / n;
  const barW   = slot * 0.58;

  const xc  = i  => ML + i * slot + slot / 2;
  const yOf = val => MT + chartH - (Math.min(val, yMax) / yMax) * chartH;

  const yTicks = [0, Math.round(yMax / 2 / 25) * 25, yMax].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {/* Grid lines + Y labels */}
      {yTicks.map(v => (
        <g key={v}>
          <line x1={ML} y1={yOf(v)} x2={VW - MR} y2={yOf(v)}
            stroke="var(--border)" strokeWidth={0.6} />
          <text x={ML - 4} y={yOf(v) + 3.5} textAnchor="end"
            fontSize={9} fill="var(--text-muted)">
            {fmtShort(v)}
          </text>
        </g>
      ))}

      {/* Weekly budget target line */}
      {weeklyTarget > 0 && weeklyTarget <= yMax && (
        <g>
          <line x1={ML} y1={yOf(weeklyTarget)} x2={VW - MR} y2={yOf(weeklyTarget)}
            stroke="var(--amber)" strokeWidth={1.2} strokeDasharray="5 3" />
          <text x={VW - MR} y={yOf(weeklyTarget) - 3} textAnchor="end"
            fontSize={8} fill="var(--amber)">
            target
          </text>
        </g>
      )}

      {/* Bars */}
      {weekTotals.map((wt, i) => {
        const isEmpty = wt.total === 0;
        const isOver  = weeklyTarget > 0 && wt.total > weeklyTarget;
        const isCurrent = wt.weekKey === getISOWeekKey();
        const color   = isEmpty ? 'var(--border)' : isOver ? 'var(--amber)' : 'var(--green)';
        const barH    = isEmpty ? 2 : Math.max(4, (wt.total / yMax) * chartH);
        const by      = isEmpty ? MT + chartH - 2 : yOf(wt.total);

        return (
          <g key={wt.weekKey}>
            <rect x={xc(i) - barW / 2} y={by} width={barW} height={barH}
              rx={3} fill={color} opacity={isEmpty ? 0.25 : isCurrent ? 1 : 0.75} />
            {!isEmpty && wt.total > 0 && (
              <text x={xc(i)} y={by - 3} textAnchor="middle"
                fontSize={8} fill={color} fontWeight={isCurrent ? 700 : 400}>
                {fmtShort(wt.total)}
              </text>
            )}
            {/* X label */}
            <text x={xc(i)} y={VH - MB + 14} textAnchor="middle"
              fontSize={8.5} fill={isCurrent ? 'var(--text)' : 'var(--text-muted)'}
              fontWeight={isCurrent ? 700 : 400}>
              {wt.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Add Spend Sheet ────────────────────────────────────────────────────────

function AddSpendSheet({ user, onClose, onAdded }) {
  const dropdownWeeks = selectWeeks(8);
  const [weekKey,    setWeekKey]    = useState(getISOWeekKey());
  const [store,      setStore]      = useState("Trader Joe's");
  const [customStore,setCustomStore]= useState('');
  const [amount,     setAmount]     = useState('');
  const [note,       setNote]       = useState('');

  const resolvedStore = store === 'Other' ? customStore.trim() : store;

  function handleSave() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0 || !resolvedStore) return;
    addBudgetEntry({
      weekKey,
      monthKey: monthKeyFromWeek(weekKey),
      store: resolvedStore,
      amount: amt,
      note: note.trim(),
      addedBy: user,
    });
    onAdded();
    onClose();
  }

  return (
    <div className="sheet-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-body">
          <div className="sheet-title">Log Spending</div>

          {/* Store */}
          <div className="field">
            <label>Store</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom: store === 'Other' ? 10 : 0 }}>
              {PRESET_STORES.map(s => (
                <button
                  key={s}
                  onClick={() => setStore(s)}
                  style={{
                    padding:'6px 14px', borderRadius:99, fontSize:13, fontWeight:600,
                    minHeight:36, border:'1.5px solid var(--border)',
                    background: store === s ? storeColor(s) : 'var(--card)',
                    color: store === s ? '#fff' : 'var(--text-muted)',
                    transition:'background 0.15s, color 0.15s',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            {store === 'Other' && (
              <input type="text" placeholder="Store name…" value={customStore}
                onChange={e => setCustomStore(e.target.value)} style={{ marginTop:8 }} />
            )}
          </div>

          {/* Week */}
          <div className="field">
            <label>Week</label>
            <select value={weekKey} onChange={e => setWeekKey(e.target.value)}>
              {dropdownWeeks.map(wk => (
                <option key={wk} value={wk}>
                  {wk === getISOWeekKey() ? `This week (${weekLabel(wk)})` : weekLabel(wk)}
                </option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div className="field">
            <label>Amount spent ($)</label>
            <div style={{ position:'relative' }}>
              <span style={{
                position:'absolute', left:14, top:'50%', transform:'translateY(-50%)',
                fontSize:16, color:'var(--text-muted)', pointerEvents:'none',
              }}>$</span>
              <input
                type="number" step="0.01" min="0" placeholder="0.00"
                value={amount} onChange={e => setAmount(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                style={{ paddingLeft:28 }}
              />
            </div>
          </div>

          {/* Note */}
          <div className="field" style={{ marginBottom:0 }}>
            <label>Note (optional)</label>
            <input type="text" placeholder="e.g. Weekly shop, stocked up on pantry…"
              value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>

        <div className="sheet-footer">
          <button className="btn-primary" style={{ width:'100%' }}
            onClick={handleSave}
            disabled={!amount || parseFloat(amount) <= 0 || !resolvedStore}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Set Budget Target Sheet ────────────────────────────────────────────────

function SetBudgetSheet({ current, currentDevonVenmo, currentRoryVenmo, onClose, onSaved }) {
  const [value,       setValue]       = useState(current ? String(current) : '');
  const [devonVenmo,  setDevonVenmo]  = useState(currentDevonVenmo || '');
  const [roryVenmo,   setRoryVenmo]   = useState(currentRoryVenmo || '');

  function handleSave() {
    const n = parseFloat(value);
    saveBudgetSettings({
      monthlyTarget: n > 0 ? n : null,
      devonVenmo: devonVenmo.trim().replace(/^@/, ''),
      roryVenmo:  roryVenmo.trim().replace(/^@/, ''),
    });
    onSaved();
    onClose();
  }

  function handleClear() {
    saveBudgetSettings({ monthlyTarget: null });
    onSaved();
    onClose();
  }

  return (
    <div className="sheet-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-body">
          <div className="sheet-title">Budget Settings</div>
          <p style={{ fontSize:14, color:'var(--text-muted)', marginBottom:20, lineHeight:1.5 }}>
            Set a monthly grocery target. A dashed line will appear on the chart
            and you'll see a progress bar showing how close you are.
          </p>
          <div className="field">
            <label>Monthly target ($)</label>
            <div style={{ position:'relative' }}>
              <span style={{
                position:'absolute', left:14, top:'50%', transform:'translateY(-50%)',
                fontSize:16, color:'var(--text-muted)', pointerEvents:'none',
              }}>$</span>
              <input
                type="number" step="1" min="0" placeholder="e.g. 400"
                value={value} onChange={e => setValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                style={{ paddingLeft:28 }}
                autoFocus
              />
            </div>
          </div>
          <div className="field">
            <label>Devon's Venmo username</label>
            <div style={{ position:'relative' }}>
              <span style={{
                position:'absolute', left:14, top:'50%', transform:'translateY(-50%)',
                fontSize:14, color:'var(--text-muted)', pointerEvents:'none',
              }}>@</span>
              <input
                type="text" placeholder="devon"
                value={devonVenmo} onChange={e => setDevonVenmo(e.target.value)}
                style={{ paddingLeft:28 }}
              />
            </div>
          </div>
          <div className="field" style={{ marginBottom:0 }}>
            <label>Rory's Venmo username</label>
            <div style={{ position:'relative' }}>
              <span style={{
                position:'absolute', left:14, top:'50%', transform:'translateY(-50%)',
                fontSize:14, color:'var(--text-muted)', pointerEvents:'none',
              }}>@</span>
              <input
                type="text" placeholder="rory"
                value={roryVenmo} onChange={e => setRoryVenmo(e.target.value)}
                style={{ paddingLeft:28 }}
              />
            </div>
            <p style={{ fontSize:12, color:'var(--text-muted)', margin:'8px 0 0', lineHeight:1.4 }}>
              Whoever did the shop can request the other for half.
            </p>
          </div>
        </div>
        <div className="sheet-footer">
          <div style={{ display:'flex', gap:8 }}>
            {current && (
              <button className="btn-ghost" style={{ color:'#c0392b', flex:1 }} onClick={handleClear}>
                Remove target
              </button>
            )}
            <button className="btn-primary" style={{ flex:2 }} onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Tab ───────────────────────────────────────────────────────────────

export default function BudgetTab({ user, tick }) {
  const [entries,     setEntries]     = useState(() => getBudgetEntries());
  const [settings,    setSettings]    = useState(() => getBudgetSettings());
  const [viewMonth,   setViewMonth]   = useState(currentMonthKey());
  const [showAdd,     setShowAdd]     = useState(false);
  const [showBudget,  setShowBudget]  = useState(false);
  const [venmoSheet,  setVenmoSheet]  = useState(null); // { weekKey, weekTotal, stores }

  useEffect(() => { setEntries(getBudgetEntries()); setSettings(getBudgetSettings()); }, [tick]);

  function refresh() {
    setEntries(getBudgetEntries());
    setSettings(getBudgetSettings());
  }

  const { monthlyTarget, devonVenmo, roryVenmo } = settings;

  // Whoever is logged in can request the other person
  const targetVenmo = user === 'Rory' ? devonVenmo : user === 'Devon' ? roryVenmo : '';
  const targetName  = user === 'Rory' ? 'Devon'    : user === 'Devon' ? 'Rory'    : '';
  const weeklyTarget = monthlyTarget ? monthlyTarget / 4.33 : null;

  // Entries for the viewed month
  const monthEntries = entries.filter(e => e.monthKey === viewMonth);
  const monthTotal   = monthEntries.reduce((s, e) => s + (e.amount || 0), 0);

  // Weeks with entries in this month, newest first
  const monthWeeks = [...new Set(monthEntries.map(e => e.weekKey))]
    .sort((a, b) => b.localeCompare(a));

  // Weekly average for the month
  const weekCount   = monthWeeks.length;
  const weeklyAvg   = weekCount > 0 ? monthTotal / weekCount : 0;

  // Trend: current week vs last week
  const thisWeek     = getISOWeekKey();
  const lastWeek     = getAdjacentWeekKey(thisWeek, -1);
  const thisWeekAmt  = entries.filter(e => e.weekKey === thisWeek).reduce((s, e) => s + e.amount, 0);
  const lastWeekAmt  = entries.filter(e => e.weekKey === lastWeek).reduce((s, e) => s + e.amount, 0);
  const trendDelta   = thisWeekAmt - lastWeekAmt;

  // Per-store breakdown for this month
  const storeMap = {};
  monthEntries.forEach(e => {
    storeMap[e.store] = (storeMap[e.store] || 0) + e.amount;
  });
  const storeBreakdown = Object.entries(storeMap)
    .sort((a, b) => b[1] - a[1]);

  // Budget progress
  const progressPct   = monthlyTarget ? Math.min(100, (monthTotal / monthlyTarget) * 100) : 0;
  const isOverBudget  = monthlyTarget && monthTotal > monthlyTarget;

  const isCurrentMonth = viewMonth === currentMonthKey();

  return (
    <div style={{ padding:'0 0 24px' }}>
      {/* ── Header ── */}
      <div style={{ padding:'20px 16px 12px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h1 style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'2rem', margin:0 }}>Budget</h1>
          <button className="btn-ghost" style={{ fontSize:13, color:'var(--amber)' }}
            onClick={() => setShowBudget(true)}>
            {monthlyTarget ? `Target: ${fmt(monthlyTarget)}/mo` : 'Set budget'}
          </button>
        </div>

        {/* Month navigation */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          background:'var(--card)', borderRadius:'var(--radius-sm)', padding:'10px 14px',
          boxShadow:'var(--shadow)' }}>
          <button onClick={() => setViewMonth(m => adjacentMonth(m, -1))}
            style={{ background:'none', border:'none', fontSize:20, cursor:'pointer',
              color:'var(--text-muted)', padding:'0 4px', minHeight:'unset' }}>
            ‹
          </button>
          <div style={{ textAlign:'center' }}>
            <p style={{ fontSize:13, fontWeight:600, color:'var(--text-muted)', margin:'0 0 2px',
              textTransform:'uppercase', letterSpacing:'0.05em' }}>
              {formatMonthKey(viewMonth)}
            </p>
            <p style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'2rem', fontWeight:600,
              margin:0, lineHeight:1, color: isOverBudget ? '#c0392b' : 'var(--text)' }}>
              {fmt(monthTotal)}
            </p>
            {weekCount > 0 && (
              <p style={{ fontSize:12, color:'var(--text-muted)', margin:'4px 0 0' }}>
                {weekCount} week{weekCount !== 1 ? 's' : ''} · avg {fmt(weeklyAvg)}/wk
                {isCurrentMonth && lastWeekAmt > 0 && (
                  <span style={{ marginLeft:6, color: trendDelta > 0 ? '#c0392b' : '#2e7d32', fontWeight:600 }}>
                    {trendDelta > 0 ? '↑' : '↓'} {fmt(Math.abs(trendDelta))} vs last wk
                  </span>
                )}
              </p>
            )}
          </div>
          <button onClick={() => setViewMonth(m => adjacentMonth(m, 1))}
            disabled={isCurrentMonth}
            style={{ background:'none', border:'none', fontSize:20, cursor:'pointer',
              color: isCurrentMonth ? 'var(--border)' : 'var(--text-muted)',
              padding:'0 4px', minHeight:'unset' }}>
            ›
          </button>
        </div>

        {/* Budget progress bar */}
        {monthlyTarget > 0 && (
          <div style={{ marginTop:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:12,
              color:'var(--text-muted)', marginBottom:4 }}>
              <span>{fmt(monthTotal)} spent</span>
              <span>{isOverBudget
                ? <span style={{ color:'#c0392b', fontWeight:600 }}>{fmt(monthTotal - monthlyTarget)} over budget</span>
                : <span>{fmt(monthlyTarget - monthTotal)} remaining</span>
              }</span>
            </div>
            <div style={{ height:8, background:'var(--border)', borderRadius:99, overflow:'hidden' }}>
              <div style={{
                height:'100%', borderRadius:99, transition:'width 0.4s ease',
                width:`${progressPct}%`,
                background: isOverBudget ? '#c0392b' : progressPct > 85 ? 'var(--amber)' : 'var(--green)',
              }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Chart ── */}
      <div style={{ padding:'0 16px 4px' }}>
        <p style={{ fontSize:12, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase',
          letterSpacing:'0.06em', margin:'0 0 8px' }}>
          Last 8 weeks
          {weeklyTarget > 0 && <span style={{ color:'var(--amber)', marginLeft:6 }}>
            — target {fmt(weeklyTarget)}/wk
          </span>}
        </p>
        <div style={{ background:'var(--card)', borderRadius:'var(--radius)', padding:'12px 4px 8px',
          boxShadow:'var(--shadow)' }}>
          <SpendingChart entries={entries} weeklyTarget={weeklyTarget} />
        </div>
      </div>

      {/* ── Store breakdown ── */}
      {storeBreakdown.length > 1 && (
        <div style={{ padding:'16px 16px 0' }}>
          <p style={{ fontSize:12, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase',
            letterSpacing:'0.06em', margin:'0 0 10px' }}>
            By store — {formatMonthKey(viewMonth)}
          </p>
          <div style={{ background:'var(--card)', borderRadius:'var(--radius)',
            boxShadow:'var(--shadow)', overflow:'hidden' }}>
            {storeBreakdown.map(([store, total], i) => {
              const pct = (total / monthTotal) * 100;
              return (
                <div key={store} style={{ padding:'10px 14px',
                  borderBottom: i < storeBreakdown.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ display:'flex', justifyContent:'space-between',
                    alignItems:'center', marginBottom:5 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:10, height:10, borderRadius:'50%',
                        background: storeColor(store), flexShrink:0 }} />
                      <span style={{ fontSize:14, fontWeight:500 }}>{store}</span>
                    </div>
                    <span style={{ fontSize:14, fontWeight:600 }}>{fmt(total)}</span>
                  </div>
                  <div style={{ height:4, background:'var(--border)', borderRadius:99, overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:99,
                      width:`${pct}%`, background: storeColor(store), opacity:0.8 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Weekly entries for this month ── */}
      <div style={{ padding:'16px 16px 0' }}>
        <p style={{ fontSize:12, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase',
          letterSpacing:'0.06em', margin:'0 0 10px' }}>
          {formatMonthKey(viewMonth)}
        </p>

        {monthWeeks.length === 0 ? (
          <div className="empty-state" style={{ padding:'32px 0' }}>
            <div className="empty-icon" style={{ fontSize:40 }}>🧾</div>
            <p>No spending logged for {formatMonthKey(viewMonth)}.<br />
              {isCurrentMonth && 'Tap + Log to add your first entry.'}
            </p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {monthWeeks.map(wk => {
              const weekEntries = monthEntries.filter(e => e.weekKey === wk);
              const weekTotal   = weekEntries.reduce((s, e) => s + e.amount, 0);
              const isThisWeek  = wk === thisWeek;
              return (
                <div key={wk} style={{ background:'var(--card)', borderRadius:'var(--radius)',
                  boxShadow:'var(--shadow)', overflow:'hidden' }}>
                  {/* Week header */}
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                    padding:'10px 14px', borderBottom:'1px solid var(--border)',
                    background: isThisWeek ? 'var(--amber-light)' : 'transparent' }}>
                    <span style={{ fontSize:13, fontWeight:600,
                      color: isThisWeek ? 'var(--amber)' : 'var(--text-muted)' }}>
                      {isThisWeek ? 'This week · ' : ''}{weekLabel(wk)}
                    </span>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      {targetVenmo && weekTotal > 0 && (
                        <button
                          onClick={() => setVenmoSheet({ wk, weekTotal })}
                          style={{
                            background:'#008CFF', color:'#fff', border:'none',
                            borderRadius:99, padding:'4px 10px', fontSize:12,
                            fontWeight:600, cursor:'pointer', flexShrink:0,
                          }}
                        >
                          Request {targetName} {fmt(weekTotal / 2)}
                        </button>
                      )}
                      <span style={{ fontSize:15, fontWeight:700 }}>{fmt(weekTotal)}</span>
                    </div>
                  </div>
                  {/* Individual entries */}
                  {weekEntries.map((entry, i) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      isLast={i === weekEntries.length - 1}
                      onDelete={() => { deleteBudgetEntry(entry.id); refresh(); }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add button ── */}
      <div style={{ position:'fixed', bottom:'calc(var(--tab-bar-h) + 12px)', right:16,
        zIndex:'var(--z-fixed)' }}>
        <button
          className="btn-primary"
          onClick={() => setShowAdd(true)}
          style={{ borderRadius:99, padding:'0 20px', fontSize:15, boxShadow:'var(--shadow-lg)' }}
        >
          + Log
        </button>
      </div>

      {/* ── Sheets ── */}
      {showAdd && (
        <AddSpendSheet user={user} onClose={() => setShowAdd(false)} onAdded={refresh} />
      )}
      {showBudget && (
        <SetBudgetSheet
          current={monthlyTarget}
          currentDevonVenmo={devonVenmo}
          currentRoryVenmo={roryVenmo}
          onClose={() => setShowBudget(false)}
          onSaved={refresh}
        />
      )}
      {venmoSheet && (
        <VenmoRequestSheet
          targetName={targetName}
          targetVenmo={targetVenmo}
          amount={venmoSheet.weekTotal}
          weekLabel={weekLabel(venmoSheet.wk)}
          onClose={() => setVenmoSheet(null)}
        />
      )}
    </div>
  );
}

// ── Entry row ──────────────────────────────────────────────────────────────

function EntryRow({ entry, isLast, onDelete }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
      borderBottom: isLast ? 'none' : '1px solid var(--border)' }}>
      <div style={{ width:8, height:8, borderRadius:'50%', flexShrink:0,
        background: storeColor(entry.store) }} />
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ fontSize:14, fontWeight:500, margin:0 }}>{entry.store}</p>
        {entry.note && (
          <p style={{ fontSize:12, color:'var(--text-muted)', margin:'2px 0 0',
            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {entry.note}
          </p>
        )}
      </div>
      <span style={{ fontSize:15, fontWeight:600, flexShrink:0 }}>{fmt(entry.amount)}</span>
      {!confirm ? (
        <button onClick={() => setConfirm(true)}
          style={{ background:'none', border:'none', fontSize:16, cursor:'pointer',
            color:'var(--border)', padding:'0 4px', minHeight:'unset', flexShrink:0 }}>
          ✕
        </button>
      ) : (
        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
          <button onClick={onDelete}
            style={{ background:'#c0392b', color:'#fff', border:'none', borderRadius:6,
              padding:'3px 8px', fontSize:12, cursor:'pointer' }}>
            Delete
          </button>
          <button onClick={() => setConfirm(false)}
            style={{ background:'none', border:'none', fontSize:12, color:'var(--text-muted)',
              cursor:'pointer' }}>
            Keep
          </button>
        </div>
      )}
    </div>
  );
}
