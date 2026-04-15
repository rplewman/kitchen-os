import { useState, useEffect, useRef } from 'react';
import {
  getWeek, addDayMeal, removeDayMeal, clearDayMeal, getISOWeekKey,
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

// ── Add Meal Sheet ─────────────────────────────────────────────────────────
// Opens when tapping a day. Shows existing meals + ability to add more.

function DayMealSheet({ day, weekKey, daySlot, onClose, onAssigned }) {
  const recipes  = getRecipes();
  const meals    = daySlot?.meals || [];
  const [search,   setSearch]   = useState('');
  const [freeform, setFreeform] = useState('');
  const [adding,   setAdding]   = useState(meals.length === 0); // start in add mode if empty

  const filtered = recipes.filter(r =>
    !search || r.title.toLowerCase().includes(search.toLowerCase())
  );

  function handleAddRecipe(recipe) {
    addDayMeal(weekKey, day, { mealName: recipe.title, recipeId: recipe.id });
    onAssigned();
    setSearch('');
    setAdding(false);
  }

  function handleAddFreeform() {
    const name = freeform.trim();
    if (!name) return;
    addDayMeal(weekKey, day, { mealName: name, recipeId: null });
    onAssigned();
    setFreeform('');
    setAdding(false);
  }

  function handleRemove(index) {
    removeDayMeal(weekKey, day, index);
    onAssigned();
  }

  function handleClearAll() {
    clearDayMeal(weekKey, day);
    onAssigned();
    onClose();
  }

  // Refresh meals list from storage after each mutation
  const [localMeals, setLocalMeals] = useState(meals);
  useEffect(() => {
    setLocalMeals((getWeek(weekKey)[day]?.meals) || []);
  }, [day, weekKey]); // eslint-disable-line

  function refreshLocal() {
    setLocalMeals((getWeek(weekKey)[day]?.meals) || []);
  }

  function doAddRecipe(recipe) { handleAddRecipe(recipe); refreshLocal(); }
  function doAddFreeform()     { handleAddFreeform();      refreshLocal(); }
  function doRemove(i)         { handleRemove(i);          refreshLocal(); }

  return (
    <div className="sheet-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-body">
          {/* Header */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div className="sheet-title" style={{ marginBottom:0 }}>
              {DAY_NAMES[DAY_KEYS.indexOf(day)]}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              {localMeals.length > 0 && (
                <button className="btn-ghost" style={{ color:'#c0392b', fontSize:13 }} onClick={handleClearAll}>
                  Clear all
                </button>
              )}
              <button className="btn-icon" onClick={onClose} style={{ fontSize:18 }}>✕</button>
            </div>
          </div>

          {/* Existing meals */}
          {localMeals.length > 0 && (
            <div style={{ marginBottom:16 }}>
              {localMeals.map((m, i) => {
                const recipe = m.recipeId ? recipes.find(r => r.id === m.recipeId) : null;
                return (
                  <div key={i} style={{
                    display:'flex', alignItems:'center', gap:10,
                    padding:'10px 12px', marginBottom:6,
                    background:'var(--bg)', borderRadius:'var(--radius-sm)',
                    border:'1.5px solid var(--border)',
                  }}>
                    <div style={{ flex:1 }}>
                      <p style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'1.05rem', fontWeight:600, lineHeight:1.2 }}>
                        {m.mealName}
                      </p>
                      {recipe?.difficulty && (
                        <span className={`pill pill-${recipe.difficulty}`} style={{ fontSize:11, marginTop:4 }}>
                          {recipe.difficulty}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => doRemove(i)}
                      style={{ background:'transparent', border:'none', color:'var(--text-muted)',
                        fontSize:18, cursor:'pointer', padding:'4px 6px', minHeight:36 }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add another / Add first */}
          {!adding ? (
            <button
              className="btn-secondary"
              style={{ width:'100%', marginBottom:8 }}
              onClick={() => setAdding(true)}
            >
              + Add another dish
            </button>
          ) : (
            <div>
              {localMeals.length > 0 && (
                <p style={{ fontSize:13, fontWeight:600, color:'var(--text-muted)', marginBottom:10,
                  textTransform:'uppercase', letterSpacing:'0.05em' }}>
                  Add another dish
                </p>
              )}

              {/* Freeform */}
              <div style={{ display:'flex', gap:8, marginBottom:16 }}>
                <input type="text" placeholder="Type a meal name…" value={freeform}
                  onChange={e => setFreeform(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doAddFreeform()}
                  style={{ flex:1 }} />
                <button className="btn-primary" style={{ minWidth:70 }} onClick={doAddFreeform}>
                  Add
                </button>
              </div>

              {/* Divider */}
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                <div style={{ flex:1, height:1, background:'var(--border)' }} />
                <span style={{ fontSize:12, color:'var(--text-muted)' }}>or pick from library</span>
                <div style={{ flex:1, height:1, background:'var(--border)' }} />
              </div>

              {/* Recipe search */}
              <input type="text" placeholder="Search recipes…" value={search}
                onChange={e => setSearch(e.target.value)} style={{ marginBottom:10 }} />

              {recipes.length === 0 && (
                <p style={{ color:'var(--text-muted)', fontSize:14, textAlign:'center', padding:'12px 0' }}>
                  No recipes saved yet.
                </p>
              )}

              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {filtered.map(r => {
                  const alreadyAdded = localMeals.some(m => m.recipeId === r.id);
                  return (
                    <button
                      key={r.id}
                      onClick={() => !alreadyAdded && doAddRecipe(r)}
                      style={{
                        background: alreadyAdded ? 'var(--amber-light)' : 'var(--bg)',
                        border:`1.5px solid ${alreadyAdded ? 'var(--amber)' : 'var(--border)'}`,
                        borderRadius:'var(--radius-sm)', padding:'10px 14px', textAlign:'left',
                        display:'flex', justifyContent:'space-between', alignItems:'center',
                        minHeight:48, opacity: alreadyAdded ? 0.7 : 1,
                        cursor: alreadyAdded ? 'default' : 'pointer',
                      }}
                    >
                      <span style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'1rem', fontWeight:600 }}>
                        {r.title}
                      </span>
                      <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
                        {r.difficulty && (
                          <span className={`pill pill-${r.difficulty}`} style={{ fontSize:11 }}>
                            {r.difficulty}
                          </span>
                        )}
                        {alreadyAdded && <span style={{ fontSize:11, color:'var(--amber)' }}>Added</span>}
                      </div>
                    </button>
                  );
                })}
              </div>

              {localMeals.length > 0 && (
                <button className="btn-ghost" style={{ marginTop:12, width:'100%' }}
                  onClick={() => { setAdding(false); setSearch(''); setFreeform(''); }}>
                  Done adding
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Day Card ───────────────────────────────────────────────────────────────

function DayCard({ dayKey, dayIndex, weekKey, monday, onTap, tick }) {
  const daySlot = getWeek(weekKey)[dayKey] || { meals: [] };
  const meals   = daySlot.meals || [];
  const recipes = getRecipes();
  const dateStr = formatDate(monday, dayIndex);

  // Pick border colour from the first recipe's difficulty
  const firstRecipe = meals.length > 0 && meals[0].recipeId
    ? recipes.find(r => r.id === meals[0].recipeId) : null;
  const borderColor = meals.length > 0
    ? (firstRecipe?.difficulty ? DIFF_COLORS[firstRecipe.difficulty] : 'var(--green)')
    : 'var(--border)';

  return (
    <div
      className="card"
      style={{
        marginBottom:10, cursor:'pointer',
        borderLeft:`4px solid ${borderColor}`,
        background: meals.length > 0 ? 'var(--card)' : '#faf8f5',
        transition:'border-left-color 0.2s',
      }}
      onClick={() => onTap(dayKey)}
    >
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <span style={{ fontSize:13, fontWeight:600, color:'var(--text-muted)',
            textTransform:'uppercase', letterSpacing:'0.06em' }}>
            {DAY_NAMES[dayIndex].slice(0,3)}
          </span>
          <span style={{ fontSize:12, color:'var(--text-muted)', marginLeft:8 }}>{dateStr}</span>
        </div>
        {meals.length > 1 && (
          <span style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600 }}>
            {meals.length} dishes
          </span>
        )}
        {meals.length === 1 && firstRecipe?.difficulty && (
          <span className={`pill pill-${firstRecipe.difficulty}`} style={{ fontSize:11 }}>
            {firstRecipe.difficulty}
          </span>
        )}
      </div>

      {meals.length > 0 ? (
        <div style={{ marginTop:6, display:'flex', flexDirection:'column', gap:3 }}>
          {meals.map((m, i) => (
            <p key={i} style={{
              fontFamily:'Cormorant Garamond,serif', fontSize:'1.1rem',
              fontWeight:600, lineHeight:1.2,
              borderLeft: i > 0 ? '2px solid var(--border)' : 'none',
              paddingLeft: i > 0 ? 8 : 0,
              marginLeft: i > 0 ? 2 : 0,
              color: i === 0 ? 'var(--text)' : 'var(--text-muted)',
            }}>
              {m.mealName}
            </p>
          ))}
        </div>
      ) : (
        <p style={{ color:'var(--text-muted)', fontSize:14, marginTop:6 }}>＋ Add meal</p>
      )}
    </div>
  );
}

// ── Weekly Nutrition Panel ─────────────────────────────────────────────────

// Rough daily targets (based on NHS / standard dietary reference values)
const DAILY_TARGETS = {
  calories: 2000,
  protein:  50,   // g
  carbs:    260,  // g
  fat:      70,   // g
  fiber:    30,   // g
};

const MACRO_META = [
  { key:'protein',  label:'Protein',  unit:'g', tip:'Aim for ~50g/day — supports muscle, satiety' },
  { key:'fiber',    label:'Fibre',    unit:'g', tip:'Aim for ~30g/day — gut health, keeps you full' },
  { key:'carbs',    label:'Carbs',    unit:'g', tip:'Aim for ~260g/day — main energy source'        },
  { key:'fat',      label:'Fat',      unit:'g', tip:'Aim for ~70g/day — hormones, brain function'   },
  { key:'calories', label:'Calories', unit:'',  tip:'Aim for ~2000 kcal/day'                        },
];

function trafficLight(value, target) {
  const pct = value / target;
  if (pct >= 0.8) return { color:'#2e7d32', bg:'#e8f5e9', label:'Good' };
  if (pct >= 0.5) return { color:'#e65100', bg:'#fff3e0', label:'Low'  };
  return                 { color:'#c62828', bg:'#ffebee', label:'Very low' };
}

function WeeklyNutritionPanel({ week, recipes }) {
  const [open, setOpen] = useState(false);

  // Sum macros across all planned recipe-linked meals for the week
  const totals = { calories:0, protein:0, carbs:0, fat:0, fiber:0 };
  let daysWithData = 0;
  let missingMacros = 0;

  DAY_KEYS.forEach(day => {
    const dayMeals = week[day]?.meals || [];
    let dayHasData = false;
    dayMeals.forEach(m => {
      if (!m.recipeId) return;
      const recipe = recipes.find(r => r.id === m.recipeId);
      if (!recipe) return;
      if (!recipe.macros) { missingMacros++; return; }
      const servings = recipe.servings || 1;
      Object.keys(totals).forEach(k => {
        totals[k] += (recipe.macros[k] || 0) * servings;
      });
      dayHasData = true;
    });
    if (dayHasData) daysWithData++;
  });

  const hasAnyData = daysWithData > 0;
  // Average per day (only over days that have planned meals)
  const perDay = {};
  Object.keys(totals).forEach(k => {
    perDay[k] = daysWithData > 0 ? Math.round(totals[k] / daysWithData) : 0;
  });

  if (!hasAnyData) return null;

  return (
    <div style={{ margin:'4px 16px 16px', background:'var(--card)', borderRadius:'var(--radius)',
      boxShadow:'var(--shadow)', overflow:'hidden' }}>
      {/* Header row — always visible */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width:'100%', background:'transparent', border:'none', cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'12px 16px', minHeight:48 }}
      >
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:16 }}>🥗</span>
          <span style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'1.05rem', fontWeight:600 }}>
            Weekly nutrition gut-check
          </span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {/* Quick traffic-light dots for protein + fibre */}
          {['protein','fiber'].map(k => {
            const tl = trafficLight(perDay[k], DAILY_TARGETS[k]);
            return <div key={k} style={{ width:8, height:8, borderRadius:'50%', background: tl.color }} />;
          })}
          <span style={{ fontSize:16, color:'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none',
            transition:'transform 0.2s' }}>
            ›
          </span>
        </div>
      </button>

      {/* Expanded detail */}
      {open && (
        <div style={{ padding:'0 16px 16px', borderTop:'1px solid var(--border)' }}>
          <p style={{ fontSize:12, color:'var(--text-muted)', margin:'10px 0 14px' }}>
            Average per day · based on {daysWithData} planned day{daysWithData !== 1 ? 's' : ''}
            {missingMacros > 0 ? ` · ${missingMacros} recipe${missingMacros !== 1 ? 's' : ''} missing estimates` : ''}
          </p>

          {MACRO_META.map(({ key, label, unit, tip }) => {
            const value  = perDay[key];
            const target = DAILY_TARGETS[key];
            const tl     = trafficLight(value, target);
            const pct    = Math.min(100, Math.round((value / target) * 100));

            return (
              <div key={key} style={{ marginBottom:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                  <span style={{ fontSize:13, fontWeight:600 }}>{label}</span>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:13, fontWeight:700, color: tl.color }}>
                      {value}{unit}
                    </span>
                    <span style={{ fontSize:11, color:'var(--text-muted)' }}>
                      / {target}{unit}
                    </span>
                    <span style={{ fontSize:11, fontWeight:600, background: tl.bg,
                      color: tl.color, padding:'1px 7px', borderRadius:99 }}>
                      {tl.label}
                    </span>
                  </div>
                </div>
                {/* Progress bar */}
                <div style={{ height:6, background:'var(--bg)', borderRadius:3, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${pct}%`, background: tl.color,
                    borderRadius:3, transition:'width 0.4s' }} />
                </div>
                <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>{tip}</p>
              </div>
            );
          })}

          <p style={{ fontSize:11, color:'var(--text-muted)', fontStyle:'italic', marginTop:4 }}>
            Estimates only — useful as a rough guide, not clinical advice.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main Tab ───────────────────────────────────────────────────────────────

export default function MealPlannerTab({ user, tick: remoteTick, macrosEnabled }) {
  const [weekKey,   setWeekKey]   = useState(() => getISOWeekKey());
  const [activeDay, setActiveDay] = useState(null);
  const [tick,      setTick]      = useState(0);
  const [toast,     setToast]     = useState('');

  useEffect(() => { setTick(t => t + 1); }, [remoteTick]);
  const touchStartX = useRef(null);

  const monday        = getMondayOfWeek(weekKey);
  const week          = getWeek(weekKey);
  const isCurrentWeek = weekKey === getISOWeekKey();

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2200); }
  function handleAssigned() { setTick(t => t + 1); }
  function goToPrev() { setWeekKey(k => getAdjacentWeekKey(k, -1)); }
  function goToNext() { setWeekKey(k => getAdjacentWeekKey(k,  1)); }

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
      const daySlot = week[day];
      (daySlot?.meals || []).forEach(m => {
        if (!m.recipeId) return;
        const recipe = recipes.find(r => r.id === m.recipeId);
        if (!recipe?.ingredients?.length) return;
        addIngredientsToGrocery(recipe.ingredients, user || 'Unknown', recipe.id, weekKey);
        count += recipe.ingredients.length;
      });
    });
    if (count > 0) showToast(`Added ${count} items to your grocery list!`);
    else showToast('No recipe ingredients to add for this week.');
  }

  return (
    <div style={{ padding:'0 0 80px' }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Header */}
      <div style={{ padding:'28px 16px 8px', borderBottom:'1px solid var(--border)', marginBottom:12 }}>
        <p style={{ fontSize:11, fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase',
          color:'var(--amber)', marginBottom:4 }}>
          Kitchen OS
        </p>
        <h1 style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'2.8rem', margin:'0 0 12px', lineHeight:1 }}>
          Meal Plan
        </h1>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          background:'var(--card)', borderRadius:'var(--radius)', padding:'10px 6px',
          boxShadow:'var(--shadow)' }}>
          <button className="btn-icon" onClick={goToPrev} style={{ fontSize:22, color:'var(--green)' }}>‹</button>
          <div style={{ textAlign:'center' }}>
            <p style={{ fontSize:14, fontWeight:700, color:'var(--green)', marginBottom:2 }}>
              {isCurrentWeek ? '✦ This week' : weekKey}
            </p>
            <p style={{ fontSize:12, color:'var(--text-muted)' }}>{weekLabel(weekKey)}</p>
          </div>
          <button className="btn-icon" onClick={goToNext} style={{ fontSize:22, color:'var(--green)' }}>›</button>
        </div>
      </div>

      {/* Day cards */}
      <div style={{ padding:'0 16px' }} key={`${weekKey}-${tick}`}>
        {DAY_KEYS.map((day, i) => (
          <DayCard
            key={`${weekKey}-${day}-${tick}`}
            dayKey={day}
            dayIndex={i}
            weekKey={weekKey}
            monday={monday}
            tick={tick}
            onTap={d => setActiveDay(d)}
          />
        ))}
      </div>

      {/* Weekly nutrition panel */}
      {macrosEnabled && (
        <WeeklyNutritionPanel week={week} recipes={getRecipes()} />
      )}

      {/* Sticky "Add week to groceries" */}
      <div style={{ position:'sticky', bottom:'calc(var(--tab-h) + env(safe-area-inset-bottom, 0px) + 8px)', padding:'0 16px', zIndex:10 }}>
        <button className="btn-amber" style={{ width:'100%', fontSize:15, boxShadow:'var(--shadow-lg)' }}
          onClick={handleAddWeekToGroceries}>
          🛒 Add week to groceries
        </button>
      </div>

      {/* Day meal sheet */}
      {activeDay && (
        <DayMealSheet
          day={activeDay}
          weekKey={weekKey}
          daySlot={week[activeDay]}
          onClose={() => setActiveDay(null)}
          onAssigned={handleAssigned}
        />
      )}

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
