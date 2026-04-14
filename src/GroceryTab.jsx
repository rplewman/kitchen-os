import { useState, useEffect, useRef } from 'react';
import {
  getGrocery, addGroceryItem, updateGroceryItem,
  deleteGroceryItem, clearCheckedItems,
  getRecipes, addIngredientsToGrocery, getApiKey,
  getISOWeekKey,
} from './storage.js';
import Anthropic from '@anthropic-ai/sdk';

const CATEGORIES = ['Produce', 'Meat & Fish', 'Dairy', 'Pantry', 'Other'];

// ── Claude categorise helper ───────────────────────────────────────────────

async function categoriseItem(name) {
  const apiKey = getApiKey();
  if (!apiKey) return 'Other';
  try {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{
        role: 'user',
        content: `Categorise "${name}" as exactly one of: Produce, Meat & Fish, Dairy, Pantry, Other. Reply with just the category name.`,
      }],
    });
    const cat = msg.content[0].text.trim();
    return CATEGORIES.includes(cat) ? cat : 'Other';
  } catch { return 'Other'; }
}

// ── Swipeable grocery item ─────────────────────────────────────────────────

function GroceryItem({ item, onToggle, onDelete }) {
  const touchStartX = useRef(null);
  const [swiped, setSwiped] = useState(false);

  function onTouchStart(e) { touchStartX.current = e.touches[0].clientX; }
  function onTouchEnd(e) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx < -60) setSwiped(true);
    else if (dx > 40) setSwiped(false);
    touchStartX.current = null;
  }

  return (
    <div
      className="swipe-item"
      style={{ marginBottom:1 }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div
        style={{
          display:'flex', alignItems:'center', gap:12,
          padding:'11px 16px',
          background:'var(--card)',
          transform: swiped ? 'translateX(-72px)' : 'translateX(0)',
          transition:'transform 0.2s ease',
          opacity: item.checked ? 0.5 : 1,
        }}
      >
        {/* Circular checkbox */}
        <div
          onClick={() => onToggle(item)}
          style={{
            width:26, height:26, borderRadius:'50%', flexShrink:0, cursor:'pointer',
            border:`2px solid ${item.checked ? 'var(--green)' : 'var(--border)'}`,
            background: item.checked ? 'var(--green)' : 'transparent',
            display:'flex', alignItems:'center', justifyContent:'center',
            transition:'background 0.15s, border-color 0.15s',
          }}
        >
          {item.checked && <span style={{ color:'#fff', fontSize:13, lineHeight:1 }}>✓</span>}
        </div>

        {/* Name + meta */}
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{
            fontSize:15, fontWeight:500, margin:0, lineHeight:1.3,
            textDecoration: item.checked ? 'line-through' : 'none',
            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
          }}>
            {item.name}
          </p>
          {(item.amount || item.unit || item.addedBy) && (
            <p style={{ fontSize:12, color:'var(--text-muted)', margin:0 }}>
              {[item.amount, item.unit].filter(Boolean).join(' ')}
              {item.addedBy && ` · ${item.addedBy}`}
            </p>
          )}
        </div>
      </div>

      {/* Delete reveal */}
      <div
        className="swipe-delete-bg"
        style={{ borderRadius:'var(--radius-sm)' }}
        onClick={() => onDelete(item.id)}
      >
        🗑
      </div>
    </div>
  );
}

// ── Add Item Sheet ─────────────────────────────────────────────────────────

function AddItemSheet({ user, onClose, onAdded }) {
  const [name,   setName]   = useState('');
  const [amount, setAmount] = useState('');
  const [unit,   setUnit]   = useState('');
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    const n = name.trim();
    if (!n) return;
    setSaving(true);
    const category = await categoriseItem(n);
    addGroceryItem({ name: n, amount: amount.trim(), unit: unit.trim(), category, addedBy: user });
    onAdded();
    onClose();
  }

  return (
    <div className="sheet-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-body">
          <div className="sheet-title">Add Item</div>
          <div className="field">
            <label>Item name</label>
            <input type="text" placeholder="e.g. Sourdough bread" value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              autoFocus />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="field">
              <label>Amount</label>
              <input type="text" placeholder="2" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom:0 }}>
              <label>Unit</label>
              <input type="text" placeholder="loaves" value={unit} onChange={e => setUnit(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="sheet-footer">
          <button className="btn-primary" style={{ width:'100%' }} onClick={handleAdd} disabled={saving}>
            {saving ? 'Categorising…' : 'Add to List'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add from Recipe Sheet ──────────────────────────────────────────────────

function AddFromRecipeSheet({ user, onClose, onAdded }) {
  const recipes = getRecipes();
  const [step,     setStep]     = useState('pick'); // 'pick' | 'ingredients'
  const [recipe,   setRecipe]   = useState(null);
  const [selected, setSelected] = useState({});

  function handlePickRecipe(r) {
    setRecipe(r);
    const all = {};
    r.ingredients?.forEach((_,i) => { all[i] = true; });
    setSelected(all);
    setStep('ingredients');
  }

  function handleAdd() {
    const toAdd = recipe.ingredients.filter((_,i) => selected[i]);
    addIngredientsToGrocery(toAdd, user, recipe.id);
    onAdded();
    onClose();
  }

  return (
    <div className="sheet-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-body">
          {step === 'pick' ? (
            <>
              <div className="sheet-title">Pick a Recipe</div>
              {recipes.length === 0 && (
                <p style={{ color:'var(--text-muted)', fontSize:14, textAlign:'center', padding:'24px 0' }}>
                  No recipes saved yet.
                </p>
              )}
              <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:480, overflowY:'auto' }}>
                {recipes.map(r => (
                  <button
                    key={r.id}
                    onClick={() => handlePickRecipe(r)}
                    style={{
                      background:'var(--bg)', border:'1.5px solid var(--border)',
                      borderRadius:'var(--radius-sm)', padding:'12px 14px', textAlign:'left',
                      fontFamily:'Cormorant Garamond,serif', fontSize:'1.05rem', fontWeight:600, minHeight:48,
                    }}
                  >
                    {r.title}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <button className="btn-ghost" style={{ marginBottom:12, padding:'0', fontSize:13 }}
                onClick={() => setStep('pick')}>
                ← Back
              </button>
              <div className="sheet-title">{recipe.title}</div>
              <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:14 }}>
                Select ingredients to add:
              </p>
              <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:360, overflowY:'auto', marginBottom:16 }}>
                {(recipe.ingredients || []).map((ing, i) => (
                  <label key={i} style={{
                    display:'flex', gap:12, alignItems:'center', fontSize:14,
                    cursor:'pointer', textTransform:'none', letterSpacing:0,
                    padding:'8px 0', borderBottom:'1px solid var(--border)',
                  }}>
                    <input type="checkbox" checked={!!selected[i]}
                      onChange={e => setSelected(s => ({ ...s, [i]: e.target.checked }))}
                      style={{ width:18, height:18, accentColor:'var(--green)', flexShrink:0 }} />
                    <span style={{ flex:1 }}>{ing.name}</span>
                    <span style={{ color:'var(--text-muted)', fontSize:13 }}>
                      {[ing.amount, ing.unit].filter(Boolean).join(' ')}
                    </span>
                  </label>
                ))}
              </div>
              <button className="btn-primary" style={{ width:'100%' }} onClick={handleAdd}
                disabled={!Object.values(selected).some(Boolean)}>
                Add Selected to Groceries
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Tab ───────────────────────────────────────────────────────────────

export default function GroceryTab({ user, tick }) {
  const [items,      setItems]      = useState(() => getGrocery());
  const [showAdd,    setShowAdd]    = useState(false);
  const [showRecipe, setShowRecipe] = useState(false);
  const [toast,      setToast]      = useState('');
  const [weekFilter, setWeekFilter] = useState('all'); // 'all' | weekKey string

  // Re-read when Firebase pushes a remote change
  useEffect(() => { setItems(getGrocery()); }, [tick]);

  function refresh() { setItems(getGrocery()); }
  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2200); }

  // Collect distinct weeks that have tagged items
  const weeks = [...new Set(items.map(i => i.weekKey).filter(Boolean))].sort().reverse();
  const currentWeek = getISOWeekKey();

  // Apply week filter
  const visibleItems = weekFilter === 'all'
    ? items
    : items.filter(i => i.weekKey === weekFilter || !i.weekKey && weekFilter === 'untagged');

  function handleToggle(item) {
    updateGroceryItem(item.id, { checked: !item.checked });
    refresh();
  }

  function handleDelete(id) {
    deleteGroceryItem(id);
    refresh();
  }

  function handleClearChecked() {
    clearCheckedItems();
    refresh();
    showToast('Cleared checked items.');
  }

  // Group visible items by category
  const grouped = {};
  CATEGORIES.forEach(cat => { grouped[cat] = []; });
  visibleItems.forEach(item => {
    const cat = CATEGORIES.includes(item.category) ? item.category : 'Other';
    grouped[cat].push(item);
  });

  // Sort: unchecked first per category
  Object.keys(grouped).forEach(cat => {
    grouped[cat].sort((a,b) => (a.checked ? 1 : 0) - (b.checked ? 1 : 0));
  });

  const hasChecked = visibleItems.some(i => i.checked);
  const totalCount = items.length;

  return (
    <div style={{ padding:'0 0 16px' }}>
      {/* Header */}
      <div style={{ padding:'20px 16px 12px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h1 style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'2rem', margin:0 }}>
          Groceries
          {totalCount > 0 && (
            <span style={{ fontSize:14, fontWeight:400, color:'var(--text-muted)', marginLeft:8, fontFamily:'DM Sans,sans-serif' }}>
              {items.filter(i => !i.checked).length}/{totalCount}
            </span>
          )}
        </h1>
        <div style={{ display:'flex', gap:8 }}>
          {hasChecked && (
            <button className="btn-ghost" style={{ fontSize:13, color:'#c0392b', padding:'0 10px' }}
              onClick={handleClearChecked}>
              Clear ✓
            </button>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ padding:'0 16px 12px', display:'flex', gap:8 }}>
        <button className="btn-primary" style={{ flex:1, fontSize:14 }} onClick={() => setShowAdd(true)}>
          + Add item
        </button>
        <button className="btn-secondary" style={{ flex:1, fontSize:14 }} onClick={() => setShowRecipe(true)}>
          From recipe
        </button>
      </div>

      {/* Week filter strip */}
      {weeks.length > 0 && (
        <div style={{ display:'flex', gap:8, overflowX:'auto', padding:'0 16px 14px', scrollbarWidth:'none' }}>
          <button
            onClick={() => setWeekFilter('all')}
            style={{
              flexShrink:0, padding:'5px 14px', borderRadius:99, fontSize:13, fontWeight:600,
              border:'1.5px solid var(--border)', cursor:'pointer',
              background: weekFilter === 'all' ? 'var(--green)' : 'var(--card)',
              color: weekFilter === 'all' ? '#fff' : 'var(--text-muted)',
            }}
          >
            All
          </button>
          {weeks.map(wk => (
            <button
              key={wk}
              onClick={() => setWeekFilter(wk)}
              style={{
                flexShrink:0, padding:'5px 14px', borderRadius:99, fontSize:13, fontWeight:600,
                border:'1.5px solid var(--border)', cursor:'pointer',
                background: weekFilter === wk ? 'var(--green)' : 'var(--card)',
                color: weekFilter === wk ? '#fff' : 'var(--text-muted)',
              }}
            >
              {wk === currentWeek ? 'This week' : wk}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {totalCount === 0 && (
        <div className="empty-state">
          <div className="empty-icon">🛒</div>
          <p>Your grocery list is empty.<br/>Add items or pull from a recipe.</p>
        </div>
      )}

      {/* Grouped list */}
      {CATEGORIES.map(cat => {
        const catItems = grouped[cat];
        if (!catItems?.length) return null;
        return (
          <div key={cat} style={{ marginBottom:8 }}>
            <div style={{ padding:'8px 16px 4px', display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:12, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em' }}>
                {cat}
              </span>
              <span style={{
                background:'var(--green)', color:'#fff', fontSize:10, fontWeight:700,
                borderRadius:99, padding:'1px 7px', lineHeight:1.6,
              }}>
                {catItems.length}
              </span>
            </div>
            <div>
              {catItems.map(item => (
                <GroceryItem
                  key={item.id}
                  item={item}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Sheets */}
      {showAdd && (
        <AddItemSheet user={user} onClose={() => setShowAdd(false)} onAdded={refresh} />
      )}
      {showRecipe && (
        <AddFromRecipeSheet user={user} onClose={() => setShowRecipe(false)} onAdded={refresh} />
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
