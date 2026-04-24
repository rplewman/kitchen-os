import { useState, useEffect } from 'react';
import {
  getMeals, addMeal, updateMeal, deleteMeal,
  getRecipes, incrementCookCount,
} from './storage.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(iso) {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7)  return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Compute cook stats for a recipe from the meals log */
function recipeStats(recipeId, meals) {
  const cooks = meals
    .filter(m => m.recipeId === recipeId)
    .sort((a, b) => b.cookedAt.localeCompare(a.cookedAt));
  const upvotes   = cooks.filter(m => m.vote === 'up').length;
  const downvotes = cooks.filter(m => m.vote === 'down').length;
  const lastCook  = cooks[0] || null;
  const lastNote  = cooks.find(m => m.note) || null;
  return { cookCount: cooks.length, upvotes, downvotes, lastCook, lastNote, cooks };
}

// ── Sort Bar ───────────────────────────────────────────────────────────────

const SORTS = [
  { id: 'cooked', label: 'Most cooked' },
  { id: 'rated',  label: 'Top rated'   },
  { id: 'recent', label: 'Recent'      },
];

function SortBar({ sort, onChange }) {
  return (
    <div style={{ display:'flex', gap:6, padding:'0 16px 12px', overflowX:'auto' }}>
      {SORTS.map(s => (
        <button
          key={s.id}
          onClick={() => onChange(s.id)}
          style={{
            padding:'5px 14px', borderRadius:99, fontSize:13, fontWeight:600,
            whiteSpace:'nowrap', flexShrink:0, cursor:'pointer',
            background: sort === s.id ? 'var(--green)' : 'var(--card)',
            color:       sort === s.id ? '#fff'        : 'var(--text-muted)',
            border:      sort === s.id ? 'none' : '1.5px solid var(--border)',
          }}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

// ── Recipe Cook Card ───────────────────────────────────────────────────────

function RecipeCookCard({ recipe, stats, isTopDish, onTap }) {
  const { cookCount, upvotes, downvotes, lastCook, lastNote } = stats;

  return (
    <div
      className="card"
      onClick={onTap}
      style={{
        marginBottom:10, cursor:'pointer',
        borderLeft: isTopDish ? '4px solid var(--amber)' : '4px solid transparent',
      }}
    >
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          {/* Title */}
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
            {isTopDish && <span style={{ fontSize:15, flexShrink:0 }}>🏆</span>}
            <p style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'1.15rem', fontWeight:600,
              lineHeight:1.2, margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {recipe.title}
            </p>
          </div>

          {/* Cook count + attribution */}
          <p style={{ fontSize:12, color:'var(--text-muted)', margin:'3px 0' }}>
            🍳 Cooked {cookCount}×
            {lastCook && ` · Last by ${lastCook.addedBy}, ${timeAgo(lastCook.cookedAt)}`}
          </p>

          {/* Vote summary */}
          {(upvotes > 0 || downvotes > 0) && (
            <div style={{ display:'flex', gap:10, marginTop:4 }}>
              {upvotes   > 0 && <span style={{ fontSize:12, color:'#2e7d32' }}>👍 {upvotes}</span>}
              {downvotes > 0 && <span style={{ fontSize:12, color:'#c0392b' }}>👎 {downvotes}</span>}
            </div>
          )}

          {/* Last note preview */}
          {lastNote?.note && (
            <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:5, fontStyle:'italic',
              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              "{lastNote.note}"
            </p>
          )}
        </div>
        <span style={{ fontSize:18, color:'var(--border)', flexShrink:0 }}>›</span>
      </div>
    </div>
  );
}

// ── Cook Entry Row ─────────────────────────────────────────────────────────

function CookEntryRow({ meal, onVote, onDelete }) {
  const [confirm, setConfirm] = useState(false);

  return (
    <div style={{ padding:'12px 0', borderBottom:'1px solid var(--border)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontSize:13, fontWeight:600, margin:0 }}>
            {meal.addedBy} · {fmtDate(meal.cookedAt)}
          </p>
          {meal.note && (
            <p style={{ fontSize:13, color:'var(--text-muted)', margin:'4px 0 0', lineHeight:1.4, fontStyle:'italic' }}>
              "{meal.note}"
            </p>
          )}
        </div>

        {/* Vote + delete */}
        <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
          <button
            onClick={() => onVote(meal.id, meal.vote === 'up' ? null : 'up')}
            style={{
              background: meal.vote === 'up' ? '#e8f5e9' : 'var(--bg)',
              border: `1.5px solid ${meal.vote === 'up' ? '#4caf50' : 'var(--border)'}`,
              borderRadius:99, padding:'3px 9px', fontSize:13, cursor:'pointer',
            }}
          >👍</button>
          <button
            onClick={() => onVote(meal.id, meal.vote === 'down' ? null : 'down')}
            style={{
              background: meal.vote === 'down' ? '#fdecea' : 'var(--bg)',
              border: `1.5px solid ${meal.vote === 'down' ? '#e53935' : 'var(--border)'}`,
              borderRadius:99, padding:'3px 9px', fontSize:13, cursor:'pointer',
            }}
          >👎</button>

          {!confirm ? (
            <button onClick={() => setConfirm(true)}
              style={{ background:'none', border:'none', fontSize:15, cursor:'pointer',
                color:'var(--border)', padding:'0 4px', minHeight:'unset' }}>
              ✕
            </button>
          ) : (
            <div style={{ display:'flex', gap:4 }}>
              <button onClick={() => onDelete(meal.id)}
                style={{ background:'#c0392b', color:'#fff', border:'none', borderRadius:6,
                  padding:'3px 8px', fontSize:12, cursor:'pointer' }}>
                Del
              </button>
              <button onClick={() => setConfirm(false)}
                style={{ background:'none', border:'none', fontSize:12,
                  color:'var(--text-muted)', cursor:'pointer' }}>
                Keep
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Cook History Sheet ─────────────────────────────────────────────────────

function CookHistorySheet({ recipe, meals, user, onClose, onUpdate }) {
  const [showLogAnother, setShowLogAnother] = useState(false);

  const cooks = meals
    .filter(m => m.recipeId === recipe.id)
    .sort((a, b) => b.cookedAt.localeCompare(a.cookedAt));

  const upvotes   = cooks.filter(m => m.vote === 'up').length;
  const downvotes = cooks.filter(m => m.vote === 'down').length;

  function handleVote(mealId, vote) {
    updateMeal(mealId, { vote });
    onUpdate();
  }

  function handleDelete(mealId) {
    deleteMeal(mealId);
    onUpdate();
    if (cooks.length <= 1) onClose();
  }

  return (
    <div className="sheet-overlay" onClick={e => { if (e.target === e.currentTarget && !showLogAnother) onClose(); }}>
      <div className="sheet" style={{ maxHeight:'85vh', display:'flex', flexDirection:'column' }}>
        <div className="sheet-handle" />

        <div className="sheet-body" style={{ overflowY:'auto', flex:1 }}>
          {/* Recipe title + aggregate stats */}
          <p style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'1.7rem', fontWeight:600,
            lineHeight:1.2, marginBottom:6 }}>
            {recipe.title}
          </p>
          <div style={{ display:'flex', gap:12, marginBottom:16, flexWrap:'wrap' }}>
            <span style={{ fontSize:13, color:'var(--text-muted)' }}>
              🍳 Cooked {cooks.length}×
            </span>
            {upvotes   > 0 && <span style={{ fontSize:13, color:'#2e7d32' }}>👍 {upvotes}</span>}
            {downvotes > 0 && <span style={{ fontSize:13, color:'#c0392b' }}>👎 {downvotes}</span>}
          </div>

          {/* Individual cook entries */}
          {cooks.length === 0 ? (
            <p style={{ color:'var(--text-muted)', fontSize:14 }}>No cooks logged yet.</p>
          ) : (
            cooks.map(meal => (
              <CookEntryRow
                key={meal.id}
                meal={meal}
                onVote={handleVote}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>

        <div className="sheet-footer">
          <button className="btn-primary" style={{ width:'100%' }}
            onClick={() => setShowLogAnother(true)}>
            + Log another cook
          </button>
        </div>
      </div>

      {showLogAnother && (
        <LogCookSheet
          user={user}
          prefilledRecipe={recipe}
          onClose={() => setShowLogAnother(false)}
          onLogged={() => { setShowLogAnother(false); onUpdate(); }}
        />
      )}
    </div>
  );
}

// ── Log Cook Sheet ─────────────────────────────────────────────────────────

export function LogCookSheet({ user, prefilledRecipe, onClose, onLogged }) {
  const allRecipes = getRecipes();
  const [search,   setSearch]   = useState('');
  const [recipe,   setRecipe]   = useState(prefilledRecipe || null);
  const [note,     setNote]     = useState('');
  const [vote,     setVote]     = useState(null); // 'up' | 'down' | null
  const [freeName, setFreeName] = useState('');

  const filtered = search
    ? allRecipes.filter(r => r.title.toLowerCase().includes(search.toLowerCase()))
    : [];

  function handleSave() {
    const name = recipe ? recipe.title : freeName.trim();
    if (!name) return;
    addMeal({ name, recipeId: recipe?.id || null, addedBy: user, note: note.trim(), vote });
    if (recipe?.id) incrementCookCount(recipe.id);
    onLogged();
  }

  const canSave = !!(recipe || freeName.trim());

  return (
    <div className="sheet-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-body">
          <div className="sheet-title">Log a Cook</div>

          {/* Recipe — pre-filled or searchable */}
          <div className="field">
            <label>Recipe</label>
            {prefilledRecipe ? (
              <p style={{ fontSize:15, fontWeight:600, margin:0, color:'var(--text)' }}>
                {prefilledRecipe.title}
              </p>
            ) : recipe ? (
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:14, fontWeight:600, color:'var(--green)', flex:1 }}>✓ {recipe.title}</span>
                <button className="btn-ghost" style={{ fontSize:12 }}
                  onClick={() => { setRecipe(null); setSearch(''); }}>
                  Change
                </button>
              </div>
            ) : (
              <>
                <input type="text" placeholder="Search recipes…" value={search}
                  onChange={e => setSearch(e.target.value)} />
                {filtered.length > 0 && (
                  <div style={{ background:'var(--bg)', border:'1px solid var(--border)',
                    borderRadius:'var(--radius-sm)', marginTop:4, maxHeight:160, overflowY:'auto' }}>
                    {filtered.map(r => (
                      <button key={r.id}
                        style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 14px',
                          background:'transparent', border:'none', cursor:'pointer', fontSize:14 }}
                        onClick={() => { setRecipe(r); setSearch(''); }}>
                        {r.title}
                      </button>
                    ))}
                  </div>
                )}
                {search && filtered.length === 0 && (
                  <input type="text" placeholder="Enter meal name…" value={freeName}
                    onChange={e => setFreeName(e.target.value)} style={{ marginTop:8 }} />
                )}
              </>
            )}
          </div>

          {/* Vote */}
          <div className="field">
            <label>How was it?</label>
            <div style={{ display:'flex', gap:10 }}>
              {[['up', '👍 Great'], ['down', '👎 Meh']].map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setVote(vote === v ? null : v)}
                  style={{
                    flex:1, padding:'10px', borderRadius:'var(--radius-sm)', fontSize:14,
                    fontWeight:600, cursor:'pointer', border:'1.5px solid',
                    borderColor: vote === v ? (v === 'up' ? '#4caf50' : '#e53935') : 'var(--border)',
                    background:  vote === v ? (v === 'up' ? '#e8f5e9' : '#fdecea') : 'var(--card)',
                    color:'var(--text)',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div className="field" style={{ marginBottom:0 }}>
            <label>Notes (optional)</label>
            <textarea rows={2}
              placeholder="e.g. Great with sweet potatoes next time…"
              value={note} onChange={e => setNote(e.target.value)}
              style={{ resize:'none' }}
            />
          </div>
        </div>

        <div className="sheet-footer">
          <button className="btn-primary" style={{ width:'100%' }}
            onClick={handleSave} disabled={!canSave}>
            Log cook
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Tab ───────────────────────────────────────────────────────────────

export default function HallOfFameTab({ user, tick }) {
  const [meals,         setMeals]         = useState(() => getMeals());
  const [recipes,       setRecipes]       = useState(() => getRecipes());
  const [sort,          setSort]          = useState('cooked');
  const [showLog,       setShowLog]       = useState(false);
  const [historyRecipe, setHistoryRecipe] = useState(null);
  const [showUncooked,  setShowUncooked]  = useState(false);

  useEffect(() => { refresh(); }, [tick]); // eslint-disable-line

  function refresh() {
    setMeals(getMeals());
    setRecipes(getRecipes());
  }

  // Build per-recipe stats
  const recipeData = recipes.map(r => ({ recipe: r, stats: recipeStats(r.id, meals) }));
  const cooked     = recipeData.filter(d => d.stats.cookCount > 0);
  const uncooked   = recipeData.filter(d => d.stats.cookCount === 0);

  // Find dish of the house
  const maxCooks  = cooked.length > 0 ? Math.max(...cooked.map(d => d.stats.cookCount)) : 0;
  const topDishId = maxCooks > 1
    ? cooked.find(d => d.stats.cookCount === maxCooks)?.recipe.id
    : null;

  // Sort cooked recipes
  const sorted = [...cooked].sort((a, b) => {
    if (sort === 'cooked') {
      return b.stats.cookCount - a.stats.cookCount
          || a.recipe.title.localeCompare(b.recipe.title);
    }
    if (sort === 'rated') {
      const sa = a.stats.upvotes - a.stats.downvotes;
      const sb = b.stats.upvotes - b.stats.downvotes;
      return sb - sa || b.stats.cookCount - a.stats.cookCount;
    }
    // recent
    const da = a.stats.lastCook?.cookedAt || '';
    const db = b.stats.lastCook?.cookedAt || '';
    return db.localeCompare(da);
  });

  return (
    <div style={{ padding:'0 0 80px' }}>
      {/* Header */}
      <div style={{ padding:'20px 16px 8px' }}>
        <p style={{ fontSize:11, fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase',
          color:'var(--amber)', marginBottom:4 }}>
          The GRKN
        </p>
        <h1 style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'2.8rem', margin:'0 0 4px', lineHeight:1 }}>
          Cook Log
        </h1>
        {cooked.length > 0 && (
          <p style={{ fontSize:13, color:'var(--text-muted)', margin:'0 0 12px' }}>
            {meals.length} cook{meals.length !== 1 ? 's' : ''} logged · {cooked.length} recipe{cooked.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Sort bar */}
      {cooked.length > 0 && <SortBar sort={sort} onChange={setSort} />}

      {/* Empty state */}
      {cooked.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">🍳</div>
          <p>No cooks logged yet.<br />Tap + Log to record your first meal.</p>
        </div>
      )}

      {/* Cooked recipe cards */}
      <div style={{ padding:'0 16px' }}>
        {sorted.map(({ recipe, stats }) => (
          <RecipeCookCard
            key={recipe.id}
            recipe={recipe}
            stats={stats}
            isTopDish={recipe.id === topDishId}
            onTap={() => setHistoryRecipe(recipe)}
          />
        ))}
      </div>

      {/* Never tried section */}
      {uncooked.length > 0 && (
        <div style={{ padding:'8px 16px 0' }}>
          <button
            className="btn-ghost"
            style={{ fontSize:13, color:'var(--text-muted)', marginBottom:8 }}
            onClick={() => setShowUncooked(v => !v)}
          >
            {showUncooked ? '▾' : '▸'} Never tried ({uncooked.length})
          </button>
          {showUncooked && (
            <div style={{ opacity:0.55 }}>
              {uncooked.map(({ recipe }) => (
                <div key={recipe.id} className="card" style={{ marginBottom:8, padding:'10px 14px' }}>
                  <p style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'1.05rem', margin:0 }}>
                    {recipe.title}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* + Log button */}
      <div style={{ position:'fixed', bottom:'calc(var(--tab-bar-h) + 12px)', right:16, zIndex:'var(--z-fixed)' }}>
        <button
          className="btn-primary"
          onClick={() => setShowLog(true)}
          style={{ borderRadius:99, padding:'0 20px', fontSize:15, boxShadow:'var(--shadow-lg)' }}
        >
          + Log
        </button>
      </div>

      {/* Sheets */}
      {showLog && (
        <LogCookSheet
          user={user}
          onClose={() => setShowLog(false)}
          onLogged={() => { setShowLog(false); refresh(); }}
        />
      )}
      {historyRecipe && (
        <CookHistorySheet
          recipe={historyRecipe}
          meals={meals}
          user={user}
          onClose={() => setHistoryRecipe(null)}
          onUpdate={refresh}
        />
      )}
    </div>
  );
}
