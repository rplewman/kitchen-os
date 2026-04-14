import { useState, useEffect } from 'react';
import {
  getMeals, addMeal, deleteMeal,
  getRankings, getUserRanking, insertIntoRanking, removeFromRanking,
  getRecipes, incrementCookCount,
} from './storage.js';

// ── Ranking helpers ────────────────────────────────────────────────────────

/** Average position (0-based) across all users who have ranked a meal. Returns Infinity if unranked. */
function avgPosition(mealId, rankings) {
  const positions = Object.values(rankings)
    .map(rank => rank.indexOf(mealId))
    .filter(p => p !== -1);
  if (!positions.length) return Infinity;
  return positions.reduce((a,b) => a+b, 0) / positions.length;
}

/** Build combined ranked list: meals sorted by avg position across all users */
function buildCombinedRanking(meals, rankings) {
  return [...meals].sort((a,b) => avgPosition(a.id, rankings) - avgPosition(b.id, rankings));
}

function timeAgo(iso) {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7)  return `${days}d ago`;
  if (days < 30) return `${Math.floor(days/7)}w ago`;
  return `${Math.floor(days/30)}mo ago`;
}

// ── Binary Ranking Flow ────────────────────────────────────────────────────

/**
 * Runs a binary insertion sort step.
 * State: { lo, hi, mid } indices into the current user ranking array.
 * Returns next comparison or { done: true, index }.
 */
function makeBinaryState(rankLength) {
  return { lo: 0, hi: rankLength, mid: Math.floor(rankLength / 2) };
}

function binaryStep(state, better, rankLength) {
  const { lo, hi, mid } = state;
  let newLo = lo, newHi = hi;
  if (better) {
    // new meal is better → insert before mid → search upper half
    newHi = mid;
  } else {
    // worse → insert after mid → search lower half
    newLo = mid + 1;
  }
  const newMid = Math.floor((newLo + newHi) / 2);
  if (newLo >= newHi) return { done: true, index: newLo };
  return { lo: newLo, hi: newHi, mid: newMid };
}

function stepsRemaining(lo, hi) {
  const range = hi - lo;
  if (range <= 1) return 0;
  return Math.ceil(Math.log2(range));
}

// ── Log Meal Sheet ─────────────────────────────────────────────────────────

function LogMealSheet({ user, onClose, onLogged }) {
  const recipes = getRecipes();
  const [step,        setStep]        = useState('form'); // 'form' | 'compare'
  const [mealName,    setMealName]    = useState('');
  const [recipeId,    setRecipeId]    = useState('');
  const [notes,       setNotes]       = useState('');
  const [recipeSearch,setRecipeSearch]= useState('');
  const [newMeal,     setNewMeal]     = useState(null);
  const [binState,    setBinState]    = useState(null);
  const [userRank,    setUserRank]    = useState(null); // snapshot of rank at start
  const meals = getMeals();

  function handleLog() {
    const name = mealName.trim() || (recipeId ? recipes.find(r=>r.id===recipeId)?.title : '');
    if (!name) return;

    // Increment cook count if linked
    if (recipeId) incrementCookCount(recipeId);

    const meal = addMeal({ name, recipeId: recipeId || null, addedBy: user, notes });
    setNewMeal(meal);

    // Start binary ranking
    const rank = getUserRanking(user);
    setUserRank([...rank]);

    if (rank.length === 0) {
      // First meal — insert at 0
      insertIntoRanking(user, meal.id, 0);
      onLogged();
      onClose();
      return;
    }

    setBinState(makeBinaryState(rank.length));
    setStep('compare');
  }

  function handleCompare(better) {
    if (!binState || !newMeal) return;
    const result = binaryStep(binState, better, userRank.length);
    if (result.done) {
      insertIntoRanking(user, newMeal.id, result.index);
      onLogged();
      onClose();
    } else {
      setBinState(result);
    }
  }

  const filteredRecipes = recipes.filter(r =>
    !recipeSearch || r.title.toLowerCase().includes(recipeSearch.toLowerCase())
  );

  if (step === 'compare' && binState && newMeal) {
    const compareMealId = userRank[binState.mid];
    const compareMeal   = meals.find(m => m.id === compareMealId);
    const stepsLeft     = stepsRemaining(binState.lo, binState.hi);

    return (
      <div className="sheet-overlay">
        <div className="sheet">
          <div className="sheet-handle" />
          <div className="sheet-body">
            <div className="sheet-title">Rank it 🏆</div>
            <p style={{ color:'var(--text-muted)', fontSize:13, marginBottom:20 }}>
              {stepsLeft > 0 ? `~${stepsLeft} comparison${stepsLeft!==1?'s':''} left` : 'Last comparison'}
            </p>

            <p style={{ fontWeight:500, fontSize:15, marginBottom:6, color:'var(--text-muted)' }}>Was</p>
            <div className="card" style={{ marginBottom:16, borderLeft:'4px solid var(--amber)', background:'var(--amber-light)' }}>
              <p style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'1.3rem', fontWeight:600 }}>
                {newMeal.name}
              </p>
            </div>

            <p style={{ fontWeight:500, fontSize:15, marginBottom:6, color:'var(--text-muted)' }}>better or worse than</p>
            <div className="card" style={{ marginBottom:24 }}>
              <p style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'1.3rem', fontWeight:600 }}>
                {compareMeal?.name || '?'}
              </p>
              {compareMeal?.cookedAt && (
                <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>
                  Cooked {timeAgo(compareMeal.cookedAt)}
                </p>
              )}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <button
                className="btn-primary"
                style={{ fontSize:17, minHeight:56, background:'var(--green)' }}
                onClick={() => handleCompare(true)}
              >
                👍 Better
              </button>
              <button
                style={{ fontSize:17, minHeight:56, background:'var(--bg)', border:'2px solid var(--border)',
                  borderRadius:'var(--radius-sm)', color:'var(--text)', cursor:'pointer' }}
                onClick={() => handleCompare(false)}
              >
                👎 Worse
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sheet-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-body">
          <div className="sheet-title">Log a Meal</div>

          {/* Link to recipe (optional) */}
          <div className="field">
            <label>Link to recipe (optional)</label>
            <input type="text" placeholder="Search recipes…" value={recipeSearch}
              onChange={e => setRecipeSearch(e.target.value)} />
            {recipeSearch.length > 0 && (
              <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)',
                marginTop:4, maxHeight:180, overflowY:'auto' }}>
                {filteredRecipes.map(r => (
                  <button key={r.id}
                    style={{
                      display:'block', width:'100%', textAlign:'left', padding:'10px 14px',
                      background: recipeId===r.id ? 'var(--amber-light)' : 'transparent',
                      border:'none', cursor:'pointer', fontSize:14,
                    }}
                    onClick={() => {
                      setRecipeId(r.id);
                      setMealName(r.title);
                      setRecipeSearch('');
                    }}
                  >
                    {r.title}
                  </button>
                ))}
                {filteredRecipes.length === 0 && (
                  <p style={{ padding:'10px 14px', fontSize:13, color:'var(--text-muted)' }}>No matches</p>
                )}
              </div>
            )}
            {recipeId && (
              <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
                <span style={{ fontSize:13, color:'var(--green)', fontWeight:500 }}>
                  ✓ {recipes.find(r=>r.id===recipeId)?.title}
                </span>
                <button className="btn-ghost" style={{ fontSize:12, padding:'0 6px', minHeight:28 }}
                  onClick={() => { setRecipeId(''); }}>
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Meal name */}
          <div className="field">
            <label>Meal name {recipeId ? '(pre-filled)' : '*'}</label>
            <input type="text" placeholder="What did you cook?" value={mealName}
              onChange={e => setMealName(e.target.value)} />
          </div>

          {/* Notes */}
          <div className="field">
            <label>Notes (optional)</label>
            <textarea rows={2} placeholder="Any thoughts?" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <button className="btn-amber" style={{ width:'100%' }} onClick={handleLog}
            disabled={!mealName.trim() && !recipeId}>
            Log &amp; Rank →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Ranked entry card ──────────────────────────────────────────────────────

function MealEntryCard({ rank, meal, rankings, onDelete }) {
  const [confirm, setConfirm] = useState(false);
  const recipes   = getRecipes();
  const recipe    = meal.recipeId ? recipes.find(r => r.id === meal.recipeId) : null;

  const userPositions = Object.entries(rankings)
    .map(([name, arr]) => {
      const pos = arr.indexOf(meal.id);
      return pos !== -1 ? { name, pos: pos + 1 } : null;
    })
    .filter(Boolean);

  function handleDelete() {
    // Remove from all rankings
    Object.keys(rankings).forEach(u => removeFromRanking(u, meal.id));
    deleteMeal(meal.id);
    onDelete(meal.id);
    setConfirm(false);
  }

  return (
    <div className="card" style={{ marginBottom:10, borderLeft:'4px solid var(--amber)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
        <div style={{ display:'flex', gap:12, alignItems:'flex-start', flex:1 }}>
          {/* Rank badge */}
          <div style={{
            minWidth:36, height:36, borderRadius:'50%', background:'var(--green)',
            color:'#fff', display:'flex', alignItems:'center', justifyContent:'center',
            fontWeight:700, fontSize:15, flexShrink:0,
          }}>
            {rank}
          </div>
          <div style={{ flex:1 }}>
            <p style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'1.15rem', fontWeight:600, lineHeight:1.2 }}>
              {meal.name}
            </p>
            {meal.notes && (
              <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{meal.notes}</p>
            )}
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:6 }}>
              {recipe && (
                <span className="pill pill-cook" style={{ fontSize:11 }}>
                  🍳 {recipe.cookCount || 1}×
                </span>
              )}
              {meal.cookedAt && (
                <span style={{ fontSize:11, color:'var(--text-muted)' }}>
                  {timeAgo(meal.cookedAt)}
                </span>
              )}
              <span style={{ fontSize:11, color:'var(--text-muted)' }}>by {meal.addedBy}</span>
            </div>

            {/* Individual ranks */}
            {userPositions.length > 0 && (
              <div style={{ display:'flex', gap:8, marginTop:6, flexWrap:'wrap' }}>
                {userPositions.map(up => (
                  <span key={up.name} style={{ fontSize:11, color:'var(--text-muted)' }}>
                    {up.name}: #{up.pos}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {!confirm ? (
          <button className="btn-ghost" style={{ fontSize:16, padding:'0 8px', color:'var(--text-muted)', flexShrink:0 }}
            onClick={() => setConfirm(true)}>
            ⋯
          </button>
        ) : (
          <div style={{ display:'flex', gap:6, flexShrink:0 }}>
            <button onClick={handleDelete}
              style={{ background:'#c0392b', color:'#fff', border:'none', borderRadius:6, padding:'4px 10px', fontSize:13, cursor:'pointer' }}>
              Delete
            </button>
            <button className="btn-ghost" style={{ fontSize:13 }} onClick={() => setConfirm(false)}>Keep</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Tab ───────────────────────────────────────────────────────────────

export default function HallOfFameTab({ user, tick }) {
  const [meals,    setMeals]    = useState(() => getMeals());
  const [rankings, setRankings] = useState(() => getRankings());
  const [showLog,  setShowLog]  = useState(false);

  // Re-read when Firebase pushes a remote change
  useEffect(() => { refresh(); }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  function refresh() {
    setMeals(getMeals());
    setRankings(getRankings());
  }

  const combined = buildCombinedRanking(meals, rankings);

  return (
    <div style={{ padding:'0 0 16px' }}>
      {/* Header */}
      <div style={{ padding:'20px 16px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h1 style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'2rem', margin:0 }}>
          Hall of Fame
        </h1>
        <button className="btn-amber" style={{ minHeight:40, padding:'0 16px', fontSize:14 }}
          onClick={() => setShowLog(true)}>
          + Log meal
        </button>
      </div>

      {/* Legend */}
      {combined.length > 0 && (
        <p style={{ fontSize:12, color:'var(--text-muted)', padding:'0 16px 12px' }}>
          Ranked by combined average across both users · best first
        </p>
      )}

      {/* Empty state */}
      {combined.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">🏆</div>
          <p>No meals ranked yet.<br/>Log a meal and rank it against your history.</p>
        </div>
      )}

      {/* Ranked list */}
      <div style={{ padding:'0 16px' }}>
        {combined.map((meal, i) => (
          <MealEntryCard
            key={meal.id}
            rank={i + 1}
            meal={meal}
            rankings={rankings}
            onDelete={() => refresh()}
          />
        ))}
      </div>

      {/* Log meal sheet */}
      {showLog && (
        <LogMealSheet
          user={user}
          onClose={() => setShowLog(false)}
          onLogged={() => refresh()}
        />
      )}
    </div>
  );
}
