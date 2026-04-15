import { useState, useEffect, useCallback } from 'react';
import { getApiKey, setApiKey, getSettings, saveSettings, _registerPush } from './storage.js';
import { initSync, teardownSync, pushToFirebase, forceSyncFromFirebase, isFirebaseConfigured } from './sync.js';
import RecipesTab      from './RecipesTab.jsx';
import MealPlannerTab  from './MealPlannerTab.jsx';
import GroceryTab      from './GroceryTab.jsx';
import HallOfFameTab   from './HallOfFameTab.jsx';

const TABS = [
  { id: 'plan',    icon: '📅', label: 'Plan'     },
  { id: 'recipes', icon: '📖', label: 'Recipes'  },
  { id: 'grocery', icon: '🛒', label: 'Groceries'},
  { id: 'hof',     icon: '🏆', label: 'Hall'     },
];

const KNOWN_USERS = ['Rory', 'Devon'];

export default function App() {
  const [activeTab,      setActiveTab]      = useState('plan');
  const [user,           setUser]           = useState('');
  const [nameInput,      setNameInput]      = useState('');
  const [showSetup,      setShowSetup]      = useState(false);
  const [showApiKey,     setShowApiKey]     = useState(false);
  const [apiKeyInput,    setApiKeyInput]    = useState('');
  const [macrosEnabled,  setMacrosEnabled]  = useState(() => getSettings().macrosEnabled);
  // tick increments whenever Firebase pushes a remote change → tabs re-read localStorage
  const [tick, setTick] = useState(0);

  const bumpTick = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    // Wire up push-to-Firebase on every storage write
    _registerPush(pushToFirebase);

    // Start two-way Firebase sync
    initSync(bumpTick);

    // Re-pull from Firebase whenever the app comes back to the foreground
    // (handles mobile background → foreground, tab switching, etc.)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') forceSyncFromFirebase(bumpTick);
    };
    document.addEventListener('visibilitychange', handleVisibility);

    setShowSetup(true);
    setApiKeyInput(getApiKey());

    return () => {
      teardownSync();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [bumpTick]);

  function handleSelectUser(name) {
    setUser(name);
    setShowSetup(false);
    if (!getApiKey()) setShowApiKey(true);
  }

  function handleCustomUser() {
    const name = nameInput.trim();
    if (!name) return;
    handleSelectUser(name);
    setNameInput('');
  }

  function handleSaveApiKey() {
    setApiKey(apiKeyInput.trim());
    setShowApiKey(false);
  }

  function handleToggleMacros() {
    const next = !macrosEnabled;
    setMacrosEnabled(next);
    saveSettings({ macrosEnabled: next });
  }

  return (
    <>
      {/* ── Main content ── */}
      <div className="tab-content">
        {activeTab === 'plan'    && <MealPlannerTab user={user} tick={tick} macrosEnabled={macrosEnabled} />}
        {activeTab === 'recipes' && <RecipesTab     user={user} tick={tick} macrosEnabled={macrosEnabled} />}
        {activeTab === 'grocery' && <GroceryTab     user={user} tick={tick} />}
        {activeTab === 'hof'     && <HallOfFameTab  user={user} tick={tick} />}
      </div>

      {/* ── Bottom tab bar ── */}
      <nav className="tab-bar">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab-btn${activeTab === t.id ? ' active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            <span className="tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {/* ── Firebase sync status dot ── */}
      {isFirebaseConfigured && (
        <div title="Live sync active" style={{
          position:'fixed', top:'calc(env(safe-area-inset-top, 0px) + 16px)', left:16, zIndex:60,
          width:8, height:8, borderRadius:'50%', background:'#4caf50',
          boxShadow:'0 0 0 2px #fff',
        }} />
      )}

      {/* ── Settings button (top-right) ── */}
      {user && (
        <button
          className="btn-icon"
          style={{ position:'fixed', top:'calc(env(safe-area-inset-top, 0px) + 8px)', right:12, zIndex:60, fontSize:18, background:'var(--card)', boxShadow:'var(--shadow)' }}
          onClick={() => { setShowApiKey(true); setApiKeyInput(getApiKey()); }}
          title="Settings"
        >
          ⚙️
        </button>
      )}

      {/* ── Who are you? bottom sheet ── */}
      {showSetup && (
        <div className="sheet-overlay" onClick={e => { if (e.target === e.currentTarget && user) setShowSetup(false); }}>
          <div className="sheet">
            <div className="sheet-handle" />
            <div className="sheet-body">
              <div className="sheet-title">👋 Who's cooking today?</div>
              <p style={{ color:'var(--text-muted)', fontSize:14, marginBottom:20 }}>
                Your name is saved for this session so we know who added what.
              </p>

              <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:24 }}>
                {KNOWN_USERS.map(name => (
                  <button
                    key={name}
                    className="btn-primary"
                    style={{ fontSize:17, letterSpacing:0.5 }}
                    onClick={() => handleSelectUser(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <input
                  type="text"
                  placeholder="Someone else…"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCustomUser()}
                  style={{ flex:1 }}
                />
                <button className="btn-secondary" onClick={handleCustomUser} style={{ minWidth:80 }}>
                  Go
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── API Key / Settings bottom sheet ── */}
      {showApiKey && (
        <div className="sheet-overlay" onClick={e => { if (e.target === e.currentTarget) setShowApiKey(false); }}>
          <div className="sheet">
            <div className="sheet-handle" />
            <div className="sheet-body">
              <div className="sheet-title">⚙️ Settings</div>

              <div className="field">
                <label>Logged in as</label>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:16, fontWeight:600 }}>{user || '—'}</span>
                  <button className="btn-ghost" style={{ fontSize:13 }}
                    onClick={() => { setShowApiKey(false); setShowSetup(true); }}>
                    Switch user
                  </button>
                </div>
              </div>

              {/* Macro tracking toggle */}
              <div className="field">
                <label>Nutrition estimates</label>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                  background:'var(--bg)', border:'1.5px solid var(--border)', borderRadius:'var(--radius-sm)',
                  padding:'12px 14px' }}>
                  <div>
                    <p style={{ fontSize:14, fontWeight:500, margin:0 }}>Weekly macro gut-check</p>
                    <p style={{ fontSize:12, color:'var(--text-muted)', margin:'2px 0 0' }}>
                      Estimates protein, carbs, fat &amp; fibre per recipe
                    </p>
                  </div>
                  {/* Toggle switch */}
                  <div
                    onClick={handleToggleMacros}
                    style={{
                      width:44, height:26, borderRadius:13, flexShrink:0,
                      background: macrosEnabled ? 'var(--green)' : 'var(--border)',
                      position:'relative', cursor:'pointer',
                      transition:'background 0.2s',
                    }}
                  >
                    <div style={{
                      position:'absolute', top:3,
                      left: macrosEnabled ? 21 : 3,
                      width:20, height:20, borderRadius:'50%', background:'#fff',
                      boxShadow:'0 1px 4px rgba(0,0,0,0.2)',
                      transition:'left 0.2s',
                    }} />
                  </div>
                </div>
              </div>

              <div className="field">
                <label>Claude API Key</label>
                <div className="settings-notice">
                  Used for recipe extraction from URLs/photos and grocery categorisation.
                  Once saved it syncs to Firebase so both of you share the same key.
                  Get yours at console.anthropic.com.
                </div>
                <input
                  type="text"
                  placeholder="sk-ant-api…"
                  value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                />
              </div>

              {isFirebaseConfigured ? (
                <div style={{ background:'#e8f5e9', border:'1px solid #4caf50', borderRadius:'var(--radius-sm)',
                  padding:'10px 14px', fontSize:13, color:'#1b5e20', marginBottom:16 }}>
                  🟢 Live sync active — Rory and Devon share the same data in real time.
                </div>
              ) : (
                <div className="settings-notice">
                  ⚠️ Firebase not configured. Data is stored locally on this device only.
                  Add your Firebase config as VITE_FIREBASE_CONFIG in Render environment variables.
                </div>
              )}

              <button className="btn-primary" style={{ width:'100%' }} onClick={handleSaveApiKey}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
