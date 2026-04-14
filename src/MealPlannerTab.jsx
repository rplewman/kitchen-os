import { useState, useEffect, useRef } from 'react';
import {
  getWeek, setDayMeal, clearDayMeal, getISOWeekKey,
  getAdjacentWeekKey, getMondayOfWeek,
  getRecipes, addIngredientsToGrocery,
} from './storage.js';

const DAY_KEYS  = ['mon','tue','wed','thu','fri','sat','sun'];
const DAY_NAMES = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

const DIFF_COLORS = { easy:'#4caf50', medium:'var(--amber)', hard:'#e53935' };

function formatDate(monday, offset) {
  const d = new Date(monday);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', timeZone:'UTC' });
}

function weekLabel(weekKey) {
  const monday = getMondayOfWeek(weekKey);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const fmt = d => d.toLocaleDateString('en-GB', { day:'numeric', month:'short', timeZone:'UTC' });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

// ── Assign Meal Sheet ──────────────────────────────────────────────────────

function AssignMealSheet({ day, weekKey, currentMeal, onClose, onAssigned }) {
  const recipes = getRecipes();
  const [search, setSearch] = useState('');
  const [freeform, setFreeform] = useState(currentMeal?.recipeId ? '' : (currentMeal?.mealName || ''));

  const filtered = recipes.filter(r =>
    !search || r.title.toLowerCase().includes(search.toLowerCase())
  );

  function handleRecipe(recipe) {
    setDayMeal(weekKey, day, { mealName: recipe.title, recipeId: recipe.id });
    onAssigned();
    onClose();
  }

  function handleFreeform() {
    const name = freeform.trim();
    if (!name) return;
    setDayMeal(weekKey, day, { mealName: name, recipeId: null });
    onAssigned();
    onClose();
  }

  function handleClear() {
    clearDayMeal(weekKey, day);
    onAssigned();
    onClose();
  }

  return (
    <div className="sheet-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-body">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div className="sheet-title" style={{ marginBottom:0 }}>
              {DAY_NAMES[DAY_KEYS.indexOf(day)]}
            </div>
            {currentMeal?.mealName && (
              <button className="btn-ghost" style={{ color:'#c0392b', fontSize:13 }} onClick={handleClear}>
                Clear
              </button>
            )}
          </div>

          {/* Freeform entry */}
          <div style={{ display:'flex', gap:8, marginBottom:20 }}>
            <input type="text" placeholder="Type a meal name…" value={freeform}
              onChange={e => setFreeform(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleFreeform()} style={{ flex:1 }} />
            <button className="btn-primary" style={{ minWidth:70 }} onClick={handleFreeform}>
              Set
            </button>
          </div>

          {/* Divider */}
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
            <div style={{ flex:1, height:1, background:'var(--border)' }} />
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>or pick from library</span>
            <div style={{ flex:1, height:1, background:'var(--border)' }} />
          </div>

          {/* Recipe search */}
          <div style={{ marginBottom:12 }}>
            <input type="text" placeholder="Search recipes…" value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>

          {recipes.length === 0 && (
            <p style={{ color:'var(--text-muted)', fontSize:14, textAlign:'center', padding:'16px 0' }}>
              No recipes saved yet. Add some in the Recipes tab!
            </p>
          )}

          <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:320, overflowY:'auto' }}>
            {filtered.map(r => (
              <button
                key={r.id}
                onClick={() => handleRecipe(r)}
                style={{
                  background: currentMeal?.recipeId === r.id ? 'var(--amber-light)' : 'var(--bg)',
                  border:`1.5px solid ${currentMeal?.recipeId === r.id ? 'var(--amber)' : 'var(--border)'}`,
                  borderRadius:'var(--radius-sm)', padding:'10px 14px', textAlign:'left',
                  display:'flex', justifyContent:'space-between', alignItems:'center', minHeight:48,
                }}
              >
                <span style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'1rem', fontWeight:600 }}>
                  {r.title}
                </span>
                {r.difficulty && (
                  <span className={`pill pill-${r.difficulty}`} style={{ flexShrink:0, fontSize:11 }}>
                    {r.difficulty}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Day Card ───────────────────────────────────────────────────────────────

function DayCard({ dayKey, dayIndex, weekKey, monday, onTap }) {
  const [week, setWeek] = useState(() => getWeek(weekKey));

  // Re-read when weekKey changes
  useState(() => { setWeek(getWeek(weekKey)); });

  const meal = week[dayKey] || { mealName:'', recipeId:null };
  const recipes = getRecipes();
  const recipe  = meal.recipeId ? recipes.find(r => r.id === meal.recipeId) : null;
  const diff    = recipe?.difficulty;
  const dateStr = formatDate(monday, dayIndex);

  return (
    <div
      className="card"
      style={{
        marginBottom:10, cursor:'pointer', borderLeft:'4px solid var(--border)',
        borderLeftColor: meal.mealName ? (diff ? DIFF_COLORS[diff] : 'var(--green)') : 'var(--border)',
        background: meal.mealName ? 'var(--card)' : '#faf8f5',
        transition:'border-left-color 0.2s',
      }}
      onClick={() => onTap(dayKey)}
    >
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <span style={{ fontSize:13, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
            {DAY_NAMES[dayIndex].slice(0,3)}
          </span>
          <span style={{ fontSize:12, color:'var(--text-muted)', marginLeft:8 }}>{dateStr}</span>
        </div>
        {diff && <span className={`pill pill-${diff}`} style={{ fontSize:11 }}>{diff}</span>}
      </div>

      {meal.mealName ? (
        <p style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'1.15rem', fontWeight:600, marginTop:6, lineHeight:1.2 }}>
          {meal.mealName}
        </p>
      ) : (
        <p style={{ color:'var(--text-muted)', fontSize:14, marginTop:6 }}>＋ Add meal</p>
      )}
    </div>
  );
}

// ── Main Tab ───────────────────────────────────────────────────────────────

export default function MealPlannerTab({ user, tick: remoteTick }) {
  const [weekKey,   setWeekKey]   = useState(() => getISOWeekKey());
  const [activeDay, setActiveDay] = useState(null);
  const [tick,      setTick]      = useState(0); // local force re-render after assign
  const [toast,     setToast]     = useState('');

  // Re-render on remote Firebase change
  useEffect(() => { setTick(t => t + 1); }, [remoteTick]);
  const touchStartX = useRef(null);

  const monday = getMondayOfWeek(weekKey);
  const week   = getWeek(weekKey);
  const isCurrentWeek = weekKey === getISOWeekKey();

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2200); }

  function handleAssigned() { setTick(t => t+1); }

  function goToPrev() { setWeekKey(k => getAdjacentWeekKey(k, -1)); }
  function goToNext() { setWeekKey(k => getAdjacentWeekKey(k,  1)); }

  // Swipe gesture
  function onTouchStart(e) { touchStartX.current = e.touches[0].clientX; }
  function onTouchEnd(e) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 60) { dx < 0 ? goToNext() : goToPrev(); }
    touchStartX.current = null;
  }

  function handleAddWeekToGroceries() {
    const recipes = getRecipes();
    let count = 0;
    DAY_KEYS.forEach(day => {
      const m = week[day];
      if (!m?.recipeId) return;
      const recipe = recipes.find(r => r.id === m.recipeId);
      if (!recipe?.ingredients?.length) return;
      addIngredientsToGrocery(recipe.ingredients, user || 'Unknown', recipe.id);
      count += recipe.ingredients.length;
    });
    if (count > 0) showToast(`Added ${count} items to your grocery list!`);
    else showToast('No recipe ingredients to add for this week.');
  }

  return (
    <div style={{ padding:'0 0 80px' }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Header */}
      <div style={{ padding:'20px 16px 4px' }}>
        <h1 style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'2rem', marginBottom:4 }}>
          Meal Plan
        </h1>

        {/* Week navigation */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
          <button className="btn-icon" onClick={goToPrev} style={{ fontSize:20 }}>‹</button>
          <div style={{ textAlign:'center' }}>
            <p style={{ fontSize:13, fontWeight:600, color:'var(--green)' }}>
              {isCurrentWeek ? 'This week' : weekKey}
            </p>
            <p style={{ fontSize:12, color:'var(--text-muted)' }}>{weekLabel(weekKey)}</p>
          </div>
          <button className="btn-icon" onClick={goToNext} style={{ fontSize:20 }}>›</button>
        </div>
      </div>

      {/* Day cards */}
      <div style={{ padding:'0 16px' }} key={`${weekKey}-${tick}`}>
        {DAY_KEYS.map((day, i) => (
          <DayCard
            key={`${weekKey}-${day}`}
            dayKey={day}
            dayIndex={i}
            weekKey={weekKey}
            monday={monday}
            onTap={d => setActiveDay(d)}
          />
        ))}
      </div>

      {/* Sticky "Add week to groceries" */}
      <div style={{
        position:'sticky', bottom: 'calc(var(--tab-h) + 8px)',
        padding:'0 16px', zIndex:10,
      }}>
        <button
          className="btn-amber"
          style={{ width:'100%', fontSize:15, boxShadow:'var(--shadow-lg)' }}
          onClick={handleAddWeekToGroceries}
        >
          🛒 Add week to groceries
        </button>
      </div>

      {/* Assign meal sheet */}
      {activeDay && (
        <AssignMealSheet
          day={activeDay}
          weekKey={weekKey}
          currentMeal={week[activeDay]}
          onClose={() => setActiveDay(null)}
          onAssigned={handleAssigned}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position:'fixed', bottom:80, left:'50%', transform:'translateX(-50%)',
          background:'var(--green)', color:'#fff', padding:'10px 20px',
          borderRadius:99, fontSize:14, fontWeight:600, zIndex:200,
          boxShadow:'var(--shadow-lg)', whiteSpace:'nowrap',
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
