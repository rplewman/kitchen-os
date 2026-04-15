import { useState, useEffect, useCallback } from 'react';
import {
  getRecipes, saveRecipe, updateRecipe, deleteRecipe,
  addIngredientsToGrocery, getApiKey,
  getISOWeekKey, getWeek, addDayMeal,
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

// Strip markdown code fences that Claude sometimes wraps JSON in despite instructions
function parseJson(text) {
  return JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim());
}

// ── Background macro estimation ────────────────────────────────────────────

const MACRO_SYSTEM = `You estimate nutritional macros for a recipe and return ONLY valid JSON.
Given a list of ingredients and the number of servings, estimate per-serving values.
Return exactly:
{"calories":number,"protein":number,"carbs":number,"fat":number,"fiber":number}
All numbers are integers. Protein/carbs/fat/fiber in grams. Return ONLY the JSON, no markdown.`;

export async function estimateMacros(recipe) {
  const apiKey = getApiKey();
  if (!apiKey || !recipe.ingredients?.length) return null;
  try {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    const ingList = recipe.ingredients.map(i =>
      `${i.amount || ''} ${i.unit || ''} ${i.name}`.trim()
    ).join(', ');
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system: MACRO_SYSTEM,
      messages: [{ role: 'user', content:
        `Recipe: ${recipe.title}\nServings: ${recipe.servings || 2}\nIngredients: ${ingList}` }],
    });
    return parseJson(msg.content[0].text);
  } catch { return null; }
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

async function fetchPageContent(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`https://r.jina.ai/${url}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return '';
    const text = await res.text();
    return text.length > 300 ? text : ''; // discard suspiciously short responses
  } catch {
    return '';
  }
}

async function extractFromUrl(url, onStatus) {
  onStatus?.('Fetching page…');
  const pageContent = await fetchPageContent(url);

  onStatus?.(pageContent ? 'Extracting recipe with Claude…' : 'Extracting with Claude (no page content fetched)…');

  const prompt = pageContent
    ? `Extract the recipe from this page content:\n\n${pageContent.slice(0, 12000)}`
    : `Extract the recipe from this URL: ${url}`;

  return parseJson(await callClaude(EXTRACT_SYSTEM, prompt));
}

// Resize an image File to maxDimension on longest side, returns a data-URL (JPEG)
function resizeImage(file, maxDimension) {
  return new Promise(resolve => {
    const img = new Image();
    const blobUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = blobUrl;
  });
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
  return parseJson(msg.content[0].text);
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

const DAY_KEYS  = ['mon','tue','wed','thu','fri','sat','sun'];
const DAY_LABEL = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

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

function RecipeCard({ recipe, onTap, onAddToGrocery, onPlanThisWeek, macrosEnabled }) {
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
      {macrosEnabled && recipe.macros && (
        <div style={{ display:'flex', gap:10, marginTop:8, flexWrap:'wrap' }}>
          {[
            { label:'cal', value: recipe.macros.calories, color:'#7c4a00' },
            { label:'P',   value: recipe.macros.protein,  color:'#1b5e20' },
            { label:'C',   value: recipe.macros.carbs,    color:'#0d47a1' },
            { label:'F',   value: recipe.macros.fat,      color:'#b71c1c' },
            { label:'Fi',  value: recipe.macros.fiber,    color:'#4a148c' },
          ].map(({ label, value, color }) => (
            <span key={label} style={{ fontSize:11, color, fontWeight:600 }}>
              {label} {value}{label === 'cal' ? '' : 'g'}
            </span>
          ))}
          <span style={{ fontSize:10, color:'var(--text-muted)' }}>per serving</span>
        </div>
      )}
      <div style={{ marginTop:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:11, color:'var(--text-muted)' }}>
          Added by {recipe.addedBy || 'unknown'}
        </span>
        <div style={{ display:'flex', gap:4 }}>
          <button
            className="btn-ghost"
            style={{ fontSize:12, padding:'4px 8px', minHeight:32, color:'var(--green)' }}
            onClick={e => { e.stopPropagation(); onPlanThisWeek(recipe); }}
          >
            + Plan
          </button>
          <button
            className="btn-ghost"
            style={{ fontSize:12, padding:'4px 8px', minHeight:32, color:'var(--amber)' }}
            onClick={e => { e.stopPropagation(); onAddToGrocery(recipe); }}
          >
            + Groceries
          </button>
        </div>
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
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error,      setError]      = useState('');
  const [form,       setForm]       = useState(BLANK_RECIPE);
  const [urlInput,   setUrlInput]   = useState('');
  const [ingText,    setIngText]    = useState(''); // raw ingredient text for manual
  const [stepsText,  setStepsText]  = useState(''); // raw steps text for manual
  function setField(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleUrl() {
    if (!urlInput.trim()) return;
    setLoading(true); setError(''); setLoadingMsg('Fetching page…');
    try {
      const data = await extractFromUrl(urlInput.trim(), setLoadingMsg);
      setForm({ ...BLANK_RECIPE, ...data, sourceType:'url', sourceUrl: urlInput.trim() });
      setIngText(data.ingredients?.map(i => `${i.amount} ${i.unit} ${i.name}`.trim()).join('\n') || '');
      setStepsText(data.steps?.join('\n') || '');
      setMode('manual');
    } catch(e) {
      setError(e.message || 'Could not extract recipe. Check your API key or try manual entry.');
    } finally { setLoading(false); setLoadingMsg(''); }
  }

  async function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true); setError(''); setLoadingMsg('Processing photo…');
    try {
      // Resize to ≤1024px for Claude (keeps API payload small and fast)
      const apiDataUrl = await resizeImage(file, 1024);
      const base64 = apiDataUrl.split(',')[1];

      setLoadingMsg('Extracting recipe with Claude…');
      const data = await extractFromPhoto(base64, 'image/jpeg');

      // Store a smaller thumbnail to keep Firebase/localStorage lean
      const thumbDataUrl = await resizeImage(file, 400);
      setForm({ ...BLANK_RECIPE, ...data, sourceType:'photo', imageData: thumbDataUrl });
      setIngText(data.ingredients?.map(i => `${i.amount} ${i.unit} ${i.name}`.trim()).join('\n') || '');
      setStepsText(data.steps?.join('\n') || '');
      setMode('manual');
    } catch(e) {
      setError(e.message || 'Could not read photo. Check your API key or try manual entry.');
    } finally { setLoading(false); setLoadingMsg(''); }
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
    // Estimate macros in the background after save (only if feature is on)
    if (macrosEnabled) {
      estimateMacros(saved).then(macros => {
        if (macros) updateRecipe(saved.id, { macros });
      });
    }
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

          {/* Photo mode — instructions shown in body; file input lives in footer label */}
          {mode === 'photo' && !loading && (
            <div style={{ textAlign:'center', padding:'24px 0 8px', color:'var(--text-muted)', fontSize:14, lineHeight:1.6 }}>
              <div style={{ fontSize:40, marginBottom:8 }}>📷</div>
              <p>Take a photo or choose an image of a recipe.<br/>Claude will extract the details for you.</p>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ textAlign:'center', padding:'32px 0' }}>
              <div className="spinner" style={{ marginBottom:12 }} />
              <p style={{ color:'var(--text-muted)', fontSize:14 }}>{loadingMsg || 'Extracting recipe with Claude…'}</p>
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
              /* label wrapping the file input is the only reliable way to open
                 the file picker on iOS Safari — programmatic .click() is blocked */
              <label style={{
                display:'flex', alignItems:'center', justifyContent:'center',
                width:'100%', minHeight:44, borderRadius:'var(--radius-sm)',
                background:'var(--green)', color:'#fff',
                fontSize:15, fontWeight:500, cursor:'pointer',
              }}>
                <input type="file" accept="image/*" style={{ display:'none' }} onChange={handlePhoto} />
                Choose Photo
              </label>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Recipe Detail Sheet ────────────────────────────────────────────────────

function RecipeDetailSheet({ recipe: initialRecipe, user, onClose, onDeleted, onUpdated, onAddToGrocery }) {
  const [recipe, setRecipe] = useState(initialRecipe);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showIngPicker, setShowIngPicker] = useState(false);
  const [selected, setSelected] = useState({});

  // View-mode scaling state
  const baseServings = recipe.servings || 2;
  const [scaledServings, setScaledServings] = useState(baseServings);
  const scaleFactor = scaledServings / baseServings;

  // Edit-mode form state
  const [editForm, setEditForm] = useState(null);

  function startEdit() {
    setEditForm({
      title:        recipe.title        || '',
      description:  recipe.description  || '',
      servings:     recipe.servings     || '',
      difficulty:   recipe.difficulty   || 'medium',
      timeEstimate: recipe.timeEstimate || '',
      tags:         recipe.tags         || [],
      ingText:  (recipe.ingredients || []).map(i => `${i.amount || ''} ${i.unit || ''} ${i.name}`.trim()).join('\n'),
      stepsText: (recipe.steps || []).join('\n'),
    });
    setEditing(true);
  }

  function setEditField(k, v) { setEditForm(f => ({ ...f, [k]: v })); }

  function parseIngredients(text) {
    return text.split('\n').filter(Boolean).map(line => {
      const parts = line.trim().split(/\s+/);
      const amount = parts[0] || '';
      const unit = parts.length > 2 ? parts[1] : '';
      const name = parts.length > 2 ? parts.slice(2).join(' ') : parts.slice(1).join(' ');
      return { name: name || line, amount, unit, category: 'Other' };
    });
  }

  function handleSaveEdit() {
    if (!editForm.title.trim()) return;
    const changes = {
      title:        editForm.title.trim(),
      description:  editForm.description.trim(),
      servings:     Number(editForm.servings) || null,
      difficulty:   editForm.difficulty,
      timeEstimate: editForm.timeEstimate.trim(),
      tags:         typeof editForm.tags === 'string'
                      ? editForm.tags.split(',').map(t => t.trim()).filter(Boolean)
                      : editForm.tags,
      ingredients:  parseIngredients(editForm.ingText),
      steps:        editForm.stepsText.split('\n').filter(Boolean),
    };
    const updated = updateRecipe(recipe.id, changes);
    setRecipe(updated);
    setScaledServings(updated.servings || 2);
    setEditing(false);
    onUpdated?.();
  }

  function scaleAmount(amount) {
    if (!amount) return amount;
    const num = parseFloat(amount);
    if (isNaN(num)) return amount;
    const scaled = num * scaleFactor;
    if (scaled === Math.round(scaled)) return String(Math.round(scaled));
    return parseFloat(scaled.toFixed(1)).toString();
  }

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

        {/* ── Edit mode ── */}
        {editing ? (
          <>
            <div className="sheet-body">
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <div className="sheet-title" style={{ marginBottom:0 }}>Edit Recipe</div>
                <button className="btn-ghost" style={{ fontSize:13 }} onClick={() => setEditing(false)}>Cancel</button>
              </div>
              <div className="field">
                <label>Title *</label>
                <input type="text" value={editForm.title} onChange={e => setEditField('title', e.target.value)} />
              </div>
              <div className="field">
                <label>Description</label>
                <textarea rows={2} value={editForm.description} onChange={e => setEditField('description', e.target.value)} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div className="field">
                  <label>Servings</label>
                  <input type="number" value={editForm.servings} onChange={e => setEditField('servings', e.target.value)} />
                </div>
                <div className="field">
                  <label>Time</label>
                  <input type="text" placeholder="30 mins" value={editForm.timeEstimate} onChange={e => setEditField('timeEstimate', e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label>Difficulty</label>
                <select value={editForm.difficulty} onChange={e => setEditField('difficulty', e.target.value)}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <div className="field">
                <label>Ingredients (one per line, e.g. "2 cups flour")</label>
                <textarea rows={6} value={editForm.ingText} onChange={e => setEditField('ingText', e.target.value)}
                  placeholder={"2 cups flour\n1 tsp salt\n200g butter"} />
              </div>
              <div className="field">
                <label>Steps (one per line)</label>
                <textarea rows={6} value={editForm.stepsText} onChange={e => setEditField('stepsText', e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom:0 }}>
                <label>Tags (comma separated)</label>
                <input type="text" placeholder="pasta, quick, vegetarian"
                  value={Array.isArray(editForm.tags) ? editForm.tags.join(', ') : editForm.tags}
                  onChange={e => setEditField('tags', e.target.value)} />
              </div>
            </div>
            <div className="sheet-footer">
              <button className="btn-primary" style={{ width:'100%' }}
                onClick={handleSaveEdit} disabled={!editForm.title.trim()}>
                Save Changes
              </button>
            </div>
          </>
        ) : (

        /* ── View mode ── */
        <>
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

          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:14 }}>
            {recipe.difficulty && <DifficultyPill d={recipe.difficulty} />}
            {recipe.timeEstimate && <span className="pill pill-cook">⏱ {recipe.timeEstimate}</span>}
            {recipe.servings && (
              <div style={{ display:'flex', alignItems:'center', gap:2, background:'var(--bg)',
                borderRadius:99, border:'1.5px solid var(--border)', padding:'3px 6px' }}>
                <button
                  onClick={() => setScaledServings(s => Math.max(1, s - 1))}
                  style={{ background:'none', border:'none', fontSize:16, cursor:'pointer',
                    padding:'0 4px', lineHeight:1, color:'var(--text-muted)', minHeight:26, minWidth:24 }}>
                  −
                </button>
                <span style={{ fontSize:13, fontWeight:600, minWidth:32, textAlign:'center' }}>
                  🍽 {scaledServings}
                </span>
                <button
                  onClick={() => setScaledServings(s => s + 1)}
                  style={{ background:'none', border:'none', fontSize:16, cursor:'pointer',
                    padding:'0 4px', lineHeight:1, color:'var(--text-muted)', minHeight:26, minWidth:24 }}>
                  +
                </button>
              </div>
            )}
            {scaledServings !== baseServings && (
              <span style={{ fontSize:11, color:'var(--amber)', fontStyle:'italic' }}>
                scaled from {baseServings}
              </span>
            )}
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
                    <span style={{ color:'var(--text-muted)', fontSize:13 }}>{[scaleAmount(ing.amount), ing.unit].filter(Boolean).join(' ')}</span>
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
                  + Groceries
                </button>
              )}
              <button className="btn-secondary" style={{ flex:1 }} onClick={startEdit}>
                Edit
              </button>
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
        </>
        )}
      </div>
    </div>
  );
}

// ── Main Tab ───────────────────────────────────────────────────────────────

export default function RecipesTab({ user, tick, macrosEnabled }) {
  const [recipes,       setRecipes]       = useState(() => getRecipes());
  const [showAdd,       setShowAdd]       = useState(false);
  const [selected,      setSelected]      = useState(null);
  const [search,        setSearch]        = useState('');
  const [toastMsg,      setToastMsg]      = useState('');
  const [planRecipe,    setPlanRecipe]    = useState(null); // recipe waiting for day selection

  // Re-read when Firebase pushes a remote change
  useEffect(() => { setRecipes(getRecipes()); }, [tick]);

  function showToast(msg) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2500);
  }

  function refresh() { setRecipes(getRecipes()); }

  function handlePlanThisWeek(recipe) {
    setPlanRecipe(recipe); // open day picker
  }

  function handlePickDay(dayKey, dayLabel) {
    const weekKey = getISOWeekKey();
    addDayMeal(weekKey, dayKey, { mealName: planRecipe.title, recipeId: planRecipe.id });
    setPlanRecipe(null);
    showToast(`Added to ${dayLabel}!`);
  }

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
              macrosEnabled={macrosEnabled}
              onPlanThisWeek={handlePlanThisWeek}
              onAddToGrocery={recipe => {
                setSelected(recipe);
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
          onDeleted={() => { refresh(); }}
          onUpdated={() => refresh()}
          onAddToGrocery={() => { showToast('Added to grocery list!'); setSelected(null); }}
        />
      )}

      {/* Day picker sheet */}
      {planRecipe && (() => {
        const weekKey = getISOWeekKey();
        const week    = getWeek(weekKey);
        return (
          <div className="sheet-overlay" onClick={e => { if (e.target === e.currentTarget) setPlanRecipe(null); }}>
            <div className="sheet">
              <div className="sheet-handle" />
              <div className="sheet-body" style={{ paddingBottom:24 }}>
                <div className="sheet-title" style={{ marginBottom:8 }}>Add to which day?</div>
                <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>
                  {planRecipe.title}
                </p>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {DAY_KEYS.map((key, i) => {
                    const meals = week[key]?.meals || [];
                    const hasMeals = meals.length > 0;
                    return (
                      <button
                        key={key}
                        onClick={() => handlePickDay(key, DAY_LABEL[i])}
                        style={{
                          display:'flex', alignItems:'center', justifyContent:'space-between',
                          background: hasMeals ? 'var(--bg)' : 'var(--card)',
                          border:`1.5px solid ${hasMeals ? 'var(--border)' : 'var(--green)'}`,
                          borderRadius:'var(--radius-sm)', padding:'12px 16px',
                          color: hasMeals ? 'var(--text-muted)' : 'var(--green)',
                          fontWeight: hasMeals ? 400 : 600, fontSize:15,
                        }}
                      >
                        <span>{DAY_LABEL[i]}</span>
                        {hasMeals ? (
                          <span style={{ fontSize:12, color:'var(--text-muted)' }}>
                            {meals.map(m => m.mealName).join(', ').slice(0, 32)}
                            {meals.map(m => m.mealName).join(', ').length > 32 ? '…' : ''}
                          </span>
                        ) : (
                          <span style={{ fontSize:12, color:'var(--green)', opacity:0.7 }}>empty</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Toast */}
      {toastMsg && (
        <div style={{
          position:'fixed', bottom:'var(--toast-bottom)', left:'50%', transform:'translateX(-50%)',
          background:'var(--green)', color:'#fff', padding:'10px 20px',
          borderRadius:99, fontSize:14, fontWeight:600, zIndex:'var(--z-toast)',
          boxShadow:'var(--shadow-lg)', whiteSpace:'nowrap',
        }}>
          {toastMsg}
        </div>
      )}
    </div>
  );
}
