import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getRecipes, saveRecipe, updateRecipe, deleteRecipe,
  addIngredientsToGrocery, getApiKey,
} from './storage.js';
import Anthropic from '@anthropic-ai/sdk';

// ── Claude API helper ──────────────────────────────────────────────────────

async function callClaude(systemPrompt, userContent) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('No API key set. Tap ⚙️ to add your Claude API key.');
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });
  return msg.content[0].text;
}

const EXTRACT_SYSTEM = `You extract recipe information and return ONLY valid JSON.
Return an object with these exact fields:
{
  "title": string,
  "description": string (1-2 sentences),
  "servings": number,
  "difficulty": "easy"|"medium"|"hard",
  "timeEstimate": string (e.g. "30 mins"),
  "ingredients": [{"name": string, "amount": string, "unit": string, "category": "Produce"|"Meat & Fish"|"Dairy"|"Pantry"|"Other"}],
  "steps": [string],
  "tags": [string]
}
Return ONLY the JSON object, no markdown, no explanation.`;

async function extractFromUrl(url) {
  return JSON.parse(await callClaude(EXTRACT_SYSTEM,
    `Extract the recipe from this URL: ${url}\nIf you cannot access it, return a recipe template with title "Recipe from ${url}".`
  ));
}

async function extractFromPhoto(base64, mimeType) {
  const client = new Anthropic({ apiKey: getApiKey(), dangerouslyAllowBrowser: true });
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: EXTRACT_SYSTEM,
    messages: [{
      role: 'user',
      content: [{
        type: 'image',
        source: { type: 'base64', media_type: mimeType, data: base64 },
      }, { type: 'text', text: 'Extract the recipe from this image.' }],
    }],
  });
  return JSON.parse(msg.content[0].text);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(iso) {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7)  return `${days}d ago`;
  if (days < 30) return `${Math.floor(days/7)}w ago`;
  if (days < 365)return `${Math.floor(days/30)}mo ago`;
  return `${Math.floor(days/365)}y ago`;
}

function isRediscover(recipe) {
  if (!recipe.lastCooked) return true; // never cooked
  return (Date.now() - new Date(recipe.lastCooked)) > 60 * 86400000;
}

const DIFFICULTY_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

// ── Sub-components ─────────────────────────────────────────────────────────

function DifficultyPill({ d }) {
  return <span className={`pill pill-${d}`}>{DIFFICULTY_LABELS[d] || d}</span>;
}

function CookBadge({ recipe }) {
  if (!recipe.cookCount && !recipe.lastCooked) return null;
  return (
    <span className="pill pill-cook" style={{ fontSize:11 }}>
      🍳 {recipe.cookCount || 0}×{recipe.lastCooked ? ` · ${timeAgo(recipe.lastCooked)}` : ''}
    </span>
  );
}

function RecipeCard({ recipe, onTap, onAddToGrocery }) {
  return (
    <div
      className="card"
      style={{ marginBottom:12, cursor:'pointer', borderLeft:'4px solid var(--green)' }}
      onClick={() => onTap(recipe)}
    >
      {recipe.imageData && (
        <img
          src={recipe.imageData}
          alt={recipe.title}
          style={{ width:'100%', height:140, objectFit:'cover', borderRadius:'var(--radius-sm)', marginBottom:10 }}
        />
      )}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
        <h3 style={{ fontFamily:'Cormorant Garamond, serif', fontSize:'1.15rem', lineHeight:1.2 }}>
          {recipe.title}
        </h3>
        {recipe.difficulty && <DifficultyPill d={recipe.difficulty} />}
      </div>
      {recipe.description && (
        <p style={{ fontSize:13, color:'var(--text-muted)', margin:'6px 0 8px', lineHeight:1.5 }}>
          {recipe.description.length > 100 ? recipe.description.slice(0,100) + '…' : recipe.description}
        </p>
      )}
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        {recipe.timeEstimate && (
          <span style={{ fontSize:12, color:'var(--text-muted)' }}>⏱ {recipe.timeEstimate}</span>
        )}
        {recipe.servings && (
          <span style={{ fontSize:12, color:'var(--text-muted)' }}>🍽 {recipe.servings}</span>
        )}
        <CookBadge recipe={recipe} />
      </div>
      <div style={{ marginTop:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:11, color:'var(--text-muted)' }}>
          Added by {recipe.addedBy || 'unknown'}
        </span>
        <button
          className="btn-ghost"
          style={{ fontSize:12, padding:'4px 10px', minHeight:32, color:'var(--amber)' }}
          onClick={e => { e.stopPropagation(); onAddToGrocery(recipe); }}
        >
          + Groceries
        </button>
      </div>
    </div>
  );
}

function RediscoverCard({ recipe, onTap }) {
  return (
    <div
      className="card"
      style={{ minWidth:160, maxWidth:160, cursor:'pointer', flexShrink:0, background:'var(--amber-light)', border:'1px solid var(--amber)' }}
      onClick={() => onTap(recipe)}
    >
      {recipe.imageData && (
        <img src={recipe.imageData} alt={recipe.title}
          style={{ width:'100%', height:80, objectFit:'cover', borderRadius:6, marginBottom:8 }} />
      )}
      {!recipe.imageData && (
        <div style={{ fontSize:32, marginBottom:8, textAlign:'center' }}>🍽</div>
      )}
      <p style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'0.95rem', fontWeight:600, lineHeight:1.2 }}>
        {recipe.title}
      </p>
      <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
        {recipe.lastCooked ? `Last: ${timeAgo(recipe.lastCooked)}` : 'Never cooked'}
      </p>
    </div>
  );
}

// ── Add Recipe Sheet ───────────────────────────────────────────────────────

const BLANK_RECIPE = {
  title:'', description:'', servings:'', difficulty:'medium',
  timeEstimate:'', ingredients:[], steps:[], tags:[], sourceType:'manual', sourceUrl:'',
};

function AddRecipeSheet({ user, onClose, onSaved }) {
  const [mode,       setMode]       = useState('manual'); // 'url'|'photo'|'manual'
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [form,       setForm]       = useState(BLANK_RECIPE);
  const [urlInput,   setUrlInput]   = useState('');
  const [ingText,    setIngText]    = useState(''); // raw ingredient text for manual
  const [stepsText,  setStepsText]  = useState(''); // raw steps text for manual
  const fileRef = useRef();

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleUrl() {
    if (!urlInput.trim()) return;
    setLoading(true); setError('');
    try {
      const data = await extractFromUrl(urlInput.trim());
      setForm({ ...BLANK_RECIPE, ...data, sourceType:'url', sourceUrl: urlInput.trim() });
      setIngText(data.ingredients?.map(i => `${i.amount} ${i.unit} ${i.name}`.trim()).join('\n') || '');
      setStepsText(data.steps?.join('\n') || '');
      setMode('manual'); // show the editable form
    } catch(e) {
      setError(e.message || 'Could not extract recipe. Check your API key or try manual entry.');
    } finally { setLoading(false); }
  }

  async function handlePhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true); setError('');
    try {
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = ev => res(ev.target.result.split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const data = await extractFromPhoto(base64, file.type);
      // Save thumbnail
      const thumbBase64 = await new Promise(res => {
        const reader = new FileReader();
        reader.onload = ev => res(ev.target.result);
        reader.readAsDataURL(file);
      });
      setForm({ ...BLANK_RECIPE, ...data, sourceType:'photo', imageData: thumbBase64 });
      setIngText(data.ingredients?.map(i => `${i.amount} ${i.unit} ${i.name}`.trim()).join('\n') || '');
      setStepsText(data.steps?.join('\n') || '');
      setMode('manual');
    } catch(e) {
      setError(e.message || 'Could not read photo. Check your API key or try manual entry.');
    } finally { setLoading(false); }
  }

  function parseIngredients(text) {
    return text.split('\n').filter(Boolean).map(line => {
      const parts = line.trim().split(/\s+/);
      const amount = parts[0] || '';
      const unit = parts.length > 2 ? parts[1] : '';
      const name = parts.length > 2 ? parts.slice(2).join(' ') : parts.slice(1).join(' ');
      return { name: name || line, amount, unit, category: 'Other' };
    });
  }

  function handleSave() {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    const recipe = {
      ...form,
      servings: Number(form.servings) || null,
      ingredients: parseIngredients(ingText),
      steps: stepsText.split('\n').filter(Boolean),
      addedBy: user,
    };
    const saved = saveRecipe(recipe);
    onSaved(saved);
    onClose();
  }

  // Determine if the sticky Save button should show
  const showSaveButton = mode === 'manual' && !loading;
  const showExtractButton = (mode === 'url' || mode === 'photo') && !loading;

  return (
    <div className="sheet-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <div className="sheet-handle" />

        {/* Scrollable body */}
        <div className="sheet-body">
          <div className="sheet-title">Add Recipe</div>

          {/* Mode picker */}
          <div style={{ display:'flex', gap:8, marginBottom:20 }}>
            {[['url','🔗 URL'],['photo','📷 Photo'],['manual','✏️ Manual']].map(([m,label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  flex:1, background: mode===m ? 'var(--green)' : 'var(--bg)',
                  color: mode===m ? '#fff' : 'var(--text-muted)',
                  border:'1.5px solid var(--border)', borderRadius:'var(--radius-sm)',
                  fontSize:13, padding:'8px 4px', minHeight:40,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* URL mode */}
          {mode === 'url' && !loading && (
            <div className="field">
              <label>Recipe URL</label>
              <input type="url" placeholder="https://…" value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleUrl()} />
            </div>
          )}

          {/* Photo mode */}
          {mode === 'photo' && !loading && (
            <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handlePhoto} />
          )}

          {/* Loading */}
          {loading && (
            <div style={{ textAlign:'center', padding:'32px 0' }}>
              <div className="spinner" style={{ marginBottom:12 }} />
              <p style={{ color:'var(--text-muted)', fontSize:14 }}>Extracting recipe with Claude…</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <p style={{ color:'#c0392b', fontSize:13, marginBottom:12, background:'#fdd', padding:'8px 12px', borderRadius:6 }}>
              {error}
            </p>
          )}

          {/* Manual / edit form */}
          {mode === 'manual' && !loading && (
            <div>
              <div className="field">
                <label>Title *</label>
                <input type="text" value={form.title} onChange={e => setField('title', e.target.value)} />
              </div>
              <div className="field">
                <label>Description</label>
                <textarea rows={2} value={form.description} onChange={e => setField('description', e.target.value)} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div className="field">
                  <label>Servings</label>
                  <input type="number" value={form.servings} onChange={e => setField('servings', e.target.value)} />
                </div>
                <div className="field">
                  <label>Time</label>
                  <input type="text" placeholder="30 mins" value={form.timeEstimate} onChange={e => setField('timeEstimate', e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label>Difficulty</label>
                <select value={form.difficulty} onChange={e => setField('difficulty', e.target.value)}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <div className="field">
                <label>Ingredients (one per line, e.g. "2 cups flour")</label>
                <textarea rows={5} value={ingText} onChange={e => setIngText(e.target.value)}
                  placeholder={"2 cups flour\n1 tsp salt\n200g butter"} />
              </div>
              <div className="field">
                <label>Steps (one per line)</label>
                <textarea rows={5} value={stepsText} onChange={e => setStepsText(e.target.value)}
                  placeholder={"Preheat oven to 180°C\nMix dry ingredients…"} />
              </div>
              <div className="field" style={{ marginBottom:0 }}>
                <label>Tags (comma separated)</label>
                <input type="text" placeholder="pasta, quick, vegetarian"
                  value={form.tags.join(', ')}
                  onChange={e => setField('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))} />
              </div>
            </div>
          )}
        </div>

        {/* Sticky footer — always visible above keyboard / safe area */}
        {(showSaveButton || showExtractButton) && (
          <div className="sheet-footer">
            {showSaveButton && (
              <button className="btn-primary" style={{ width:'100%' }} onClick={handleSave}>
                Save Recipe
              </button>
            )}
            {showExtractButton && mode === 'url' && (
              <button className="btn-primary" style={{ width:'100%' }} onClick={handleUrl}>
                Extract with Claude
              </button>
            )}
            {showExtractButton && mode === 'photo' && (
              <button className="btn-primary" style={{ width:'100%' }} onClick={() => fileRef.current.click()}>
                Choose Photo
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Recipe Detail Sheet ────────────────────────────────────────────────────

function RecipeDetailSheet({ recipe, user, onClose, onDeleted, onAddToGrocery }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showIngPicker, setShowIngPicker] = useState(false);
  const [selected, setSelected] = useState({});

  function handleDelete() {
    deleteRecipe(recipe.id);
    onDeleted(recipe.id);
    onClose();
  }

  function handleAddSelected() {
    const toAdd = recipe.ingredients.filter((_,i) => selected[i]);
    addIngredientsToGrocery(toAdd, user, recipe.id);
    setShowIngPicker(false);
    onAddToGrocery();
  }

  return (
    <div className="sheet-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-body">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, marginBottom:16 }}>
            <h2 style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'1.5rem', lineHeight:1.2 }}>
              {recipe.title}
            </h2>
            <button className="btn-icon" onClick={onClose} style={{ flexShrink:0 }}>✕</button>
          </div>

          {recipe.imageData && (
            <img src={recipe.imageData} alt={recipe.title}
              style={{ width:'100%', height:180, objectFit:'cover', borderRadius:'var(--radius-sm)', marginBottom:14 }} />
          )}

          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:14 }}>
            {recipe.difficulty && <DifficultyPill d={recipe.difficulty} />}
            {recipe.timeEstimate && <span className="pill pill-cook">⏱ {recipe.timeEstimate}</span>}
            {recipe.servings && <span className="pill pill-cook">🍽 {recipe.servings}</span>}
            <CookBadge recipe={recipe} />
          </div>

          {recipe.description && (
            <p style={{ color:'var(--text-muted)', fontSize:14, marginBottom:16, lineHeight:1.6 }}>
              {recipe.description}
            </p>
          )}

          {recipe.ingredients?.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <h3 style={{ fontFamily:'Cormorant Garamond,serif', marginBottom:8 }}>Ingredients</h3>
              <ul style={{ listStyle:'none', display:'flex', flexDirection:'column', gap:4 }}>
                {recipe.ingredients.map((ing, i) => (
                  <li key={i} style={{ fontSize:14, padding:'4px 0', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between' }}>
                    <span>{ing.name}</span>
                    <span style={{ color:'var(--text-muted)', fontSize:13 }}>{[ing.amount, ing.unit].filter(Boolean).join(' ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {recipe.steps?.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <h3 style={{ fontFamily:'Cormorant Garamond,serif', marginBottom:8 }}>Method</h3>
              <ol style={{ paddingLeft:20, display:'flex', flexDirection:'column', gap:10 }}>
                {recipe.steps.map((step, i) => (
                  <li key={i} style={{ fontSize:14, lineHeight:1.6 }}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          {recipe.tags?.length > 0 && (
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
              {recipe.tags.map(t => (
                <span key={t} style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:99, padding:'2px 10px', fontSize:12 }}>
                  {t}
                </span>
              ))}
            </div>
          )}

          {recipe.sourceUrl && (
            <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:16 }}>
              Source: <span style={{ wordBreak:'break-all' }}>{recipe.sourceUrl}</span>
            </p>
          )}

          {/* Ingredient picker for grocery */}
          {showIngPicker && recipe.ingredients?.length > 0 && (
            <div style={{ background:'var(--bg)', borderRadius:'var(--radius-sm)', padding:12, marginBottom:8 }}>
              <p style={{ fontWeight:600, marginBottom:10, fontSize:14 }}>Select ingredients to add:</p>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {recipe.ingredients.map((ing, i) => (
                  <label key={i} style={{ display:'flex', gap:10, alignItems:'center', fontSize:14, cursor:'pointer',
                    textTransform:'none', letterSpacing:0 }}>
                    <input type="checkbox" checked={!!selected[i]}
                      onChange={e => setSelected(s => ({ ...s, [i]: e.target.checked }))}
                      style={{ width:18, height:18, accentColor:'var(--green)', flexShrink:0 }} />
                    {ing.name} {ing.amount && `— ${ing.amount} ${ing.unit || ''}`}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div className="sheet-footer">
          {showIngPicker ? (
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn-primary" style={{ flex:1 }} onClick={handleAddSelected}
                disabled={!Object.values(selected).some(Boolean)}>
                Add to Groceries
              </button>
              <button className="btn-ghost" onClick={() => { setShowIngPicker(false); setSelected({}); }}>
                Cancel
              </button>
            </div>
          ) : (
            <div style={{ display:'flex', gap:8 }}>
              {recipe.ingredients?.length > 0 && (
                <button className="btn-amber" style={{ flex:1 }} onClick={() => {
                  setShowIngPicker(true);
                  const all = {};
                  recipe.ingredients.forEach((_,i) => { all[i] = true; });
                  setSelected(all);
                }}>
                  + Add to Groceries
                </button>
              )}
              {!confirmDelete ? (
                <button className="btn-ghost" style={{ color:'#c0392b' }} onClick={() => setConfirmDelete(true)}>
                  Delete
                </button>
              ) : (
                <>
                  <button style={{ background:'#c0392b', color:'#fff', flex:1, minHeight:44,
                    border:'none', borderRadius:'var(--radius-sm)', cursor:'pointer' }} onClick={handleDelete}>
                    Confirm Delete
                  </button>
                  <button className="btn-ghost" onClick={() => setConfirmDelete(false)}>Keep</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Tab ───────────────────────────────────────────────────────────────

export default function RecipesTab({ user, tick }) {
  const [recipes,     setRecipes]     = useState(() => getRecipes());
  const [showAdd,     setShowAdd]     = useState(false);
  const [selected,    setSelected]    = useState(null);
  const [search,      setSearch]      = useState('');
  const [toastMsg,    setToastMsg]    = useState('');

  // Re-read when Firebase pushes a remote change
  useEffect(() => { setRecipes(getRecipes()); }, [tick]);

  function showToast(msg) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2500);
  }

  function refresh() { setRecipes(getRecipes()); }

  const filtered = recipes.filter(r =>
    !search || r.title.toLowerCase().includes(search.toLowerCase()) ||
    r.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()))
  );

  const rediscover = recipes.filter(isRediscover).slice(0, 12);

  return (
    <div style={{ padding:'0 0 16px' }}>
      {/* Header */}
      <div style={{ padding:'20px 16px 12px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h1 style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'2rem', margin:0 }}>Recipes</h1>
        <button className="btn-primary" style={{ minHeight:40, padding:'0 16px', fontSize:14 }}
          onClick={() => setShowAdd(true)}>
          + Add
        </button>
      </div>

      {/* Search */}
      <div style={{ padding:'0 16px 12px' }}>
        <input type="text" placeholder="Search recipes or tags…" value={search}
          onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Rediscover strip */}
      {!search && rediscover.length > 0 && (
        <div>
          <div className="section-header" style={{ padding:'8px 16px 6px' }}>
            <span className="section-title" style={{ fontSize:'1.1rem' }}>✨ Rediscover</span>
          </div>
          <div className="h-scroll">
            {rediscover.map(r => (
              <RediscoverCard key={r.id} recipe={r} onTap={setSelected} />
            ))}
          </div>
        </div>
      )}

      {/* Recipe list */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📖</div>
          <p>{search ? 'No recipes match your search.' : 'No recipes yet.\nTap + Add to get started.'}</p>
        </div>
      ) : (
        <div style={{ padding:'0 16px' }}>
          {filtered.map(r => (
            <RecipeCard
              key={r.id}
              recipe={r}
              onTap={setSelected}
              onAddToGrocery={recipe => {
                setSelected(recipe); // open detail with grocery picker
              }}
            />
          ))}
        </div>
      )}

      {/* Add sheet */}
      {showAdd && (
        <AddRecipeSheet
          user={user}
          onClose={() => setShowAdd(false)}
          onSaved={() => refresh()}
        />
      )}

      {/* Detail sheet */}
      {selected && (
        <RecipeDetailSheet
          recipe={selected}
          user={user}
          onClose={() => setSelected(null)}
          onDeleted={() => refresh()}
          onAddToGrocery={() => { showToast('Added to grocery list!'); setSelected(null); }}
        />
      )}

      {/* Toast */}
      {toastMsg && (
        <div style={{
          position:'fixed', bottom: 80, left:'50%', transform:'translateX(-50%)',
          background:'var(--green)', color:'#fff', padding:'10px 20px',
          borderRadius:99, fontSize:14, fontWeight:600, zIndex:200,
          boxShadow:'var(--shadow-lg)', whiteSpace:'nowrap',
        }}>
          {toastMsg}
        </div>
      )}
    </div>
  );
}
