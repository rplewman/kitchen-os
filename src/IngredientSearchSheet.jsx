import { useState } from 'react';
import { getRecipes, saveRecipe } from './storage.js';
import { callClaude, parseJson } from './claude.js';

const DIFFICULTY_COLOR = { easy: '#155724', medium: '#7c4a00', hard: '#7c1a1a' };

function normalize(s) {
  return s.toLowerCase().trim().replace(/ies$/, 'y').replace(/es$/, '').replace(/s$/, '');
}

function ingredientMatches(ingName, query) {
  const n = normalize(ingName);
  const q = normalize(query);
  return n.includes(q) || q.includes(n);
}

function buildSuggestPrompt(ingredient, glutenFree) {
  const base = `Suggest 5 recipes that use ${ingredient} as a key ingredient.`;
  const gfNote = glutenFree
    ? ` For each recipe, either make it naturally gluten-free or include a clear, simple substitution note in the steps (e.g. "use gluten-free pasta" or "swap soy sauce for tamari"). Add a "glutenFreeNote" field (string) to each recipe explaining any substitutions needed, or "naturally gluten-free" if none are required.`
    : '';
  return base + gfNote;
}

function buildSystemPrompt(glutenFree) {
  const base = `You suggest recipes based on a given ingredient and return ONLY valid JSON.
Return a JSON array of exactly 5 recipe objects, each with:
[{"title": string, "description": string (1-2 sentences), "difficulty": "easy"|"medium"|"hard",
  "timeEstimate": string, "servings": number,
  "ingredients": [{"name": string, "amount": string, "unit": string,
                   "category": "Produce"|"Meat & Fish"|"Dairy"|"Pantry"|"Other"}],
  "steps": [string], "tags": [string]${glutenFree ? ', "glutenFreeNote": string' : ''}}]
Return ONLY the JSON array, no markdown, no explanation.`;
  return base;
}

// ── Expandable suggestion card ─────────────────────────────────────────────

function SuggestionCard({ recipe, idx, isAdded, onSave }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card" style={{ borderLeft:'4px solid var(--amber)', padding:0, overflow:'hidden' }}>
      {/* Collapsed header — always visible, tap to expand */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding:'14px 16px', cursor:'pointer' }}
      >
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
          <p style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'1.1rem',
            fontWeight:600, margin:'0 0 4px', flex:1, lineHeight:1.2 }}>
            {recipe.title}
          </p>
          <span style={{ fontSize:13, color:'var(--text-muted)', flexShrink:0, marginTop:2 }}>
            {expanded ? '▲' : '▼'}
          </span>
        </div>

        {recipe.description && (
          <p style={{ fontSize:13, color:'var(--text-muted)', margin:'0 0 8px', lineHeight:1.4 }}>
            {recipe.description}
          </p>
        )}

        <div style={{ display:'flex', gap:10, fontSize:12, flexWrap:'wrap', alignItems:'center' }}>
          {recipe.difficulty && (
            <span style={{ color: DIFFICULTY_COLOR[recipe.difficulty], fontWeight:600 }}>
              {recipe.difficulty}
            </span>
          )}
          {recipe.timeEstimate && (
            <span style={{ color:'var(--text-muted)' }}>⏱ {recipe.timeEstimate}</span>
          )}
          {recipe.servings && (
            <span style={{ color:'var(--text-muted)' }}>🍽 {recipe.servings}</span>
          )}
        </div>

        {recipe.glutenFreeNote && (
          <p style={{ fontSize:11, color:'#1b5e20', background:'#e8f5e9',
            border:'1px solid #4caf50', borderRadius:4, padding:'4px 8px',
            margin:'8px 0 0', lineHeight:1.4 }}>
            🌾 {recipe.glutenFreeNote}
          </p>
        )}
      </div>

      {/* Expanded preview */}
      {expanded && (
        <div style={{ borderTop:'1px solid var(--border)', padding:'12px 16px',
          background:'var(--bg)' }}>
          {recipe.ingredients?.length > 0 && (
            <div style={{ marginBottom:12 }}>
              <p style={{ fontSize:12, fontWeight:600, color:'var(--text-muted)',
                textTransform:'uppercase', letterSpacing:'0.06em', margin:'0 0 8px' }}>
                Ingredients
              </p>
              <ul style={{ listStyle:'none', margin:0, padding:0,
                display:'flex', flexDirection:'column', gap:4 }}>
                {recipe.ingredients.map((ing, i) => (
                  <li key={i} style={{ fontSize:13, display:'flex',
                    justifyContent:'space-between', padding:'3px 0',
                    borderBottom:'1px solid var(--border)' }}>
                    <span>{ing.name}</span>
                    <span style={{ color:'var(--text-muted)' }}>
                      {[ing.amount, ing.unit].filter(Boolean).join(' ')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {recipe.steps?.length > 0 && (
            <div style={{ marginBottom:12 }}>
              <p style={{ fontSize:12, fontWeight:600, color:'var(--text-muted)',
                textTransform:'uppercase', letterSpacing:'0.06em', margin:'0 0 8px' }}>
                Method
              </p>
              <ol style={{ paddingLeft:18, margin:0,
                display:'flex', flexDirection:'column', gap:6 }}>
                {recipe.steps.map((step, i) => (
                  <li key={i} style={{ fontSize:13, lineHeight:1.5, color:'var(--text)' }}>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Save button inside expanded view */}
          <button
            className={isAdded ? 'btn-ghost' : 'btn-primary'}
            style={{ width:'100%', fontSize:13, minHeight:36,
              opacity: isAdded ? 0.6 : 1 }}
            onClick={e => { e.stopPropagation(); if (!isAdded) onSave(); }}
            disabled={isAdded}
          >
            {isAdded ? '✓ Saved to library' : '+ Save to my library'}
          </button>
        </div>
      )}

      {/* Collapsed save button — only when not expanded */}
      {!expanded && (
        <div style={{ padding:'0 16px 14px' }}>
          <button
            className={isAdded ? 'btn-ghost' : 'btn-secondary'}
            style={{ fontSize:12, minHeight:32, padding:'0 14px',
              opacity: isAdded ? 0.6 : 1 }}
            onClick={e => { e.stopPropagation(); if (!isAdded) onSave(); }}
            disabled={isAdded}
          >
            {isAdded ? '✓ Saved' : '+ Save'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main sheet ─────────────────────────────────────────────────────────────

export default function IngredientSearchSheet({ ingredient, user, onClose }) {
  const [mode,        setMode]        = useState('pick'); // 'pick' | 'library' | 'external'
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [addedIdxs,   setAddedIdxs]   = useState(new Set());
  const [glutenFree,  setGlutenFree]  = useState(false);

  // Library search is instant — filter all recipes client-side
  const libraryMatches = getRecipes().filter(r =>
    r.ingredients?.some(ing => ingredientMatches(ing.name, ingredient))
  );

  async function handleFindNew() {
    setLoading(true); setError('');
    try {
      const text = await callClaude(
        buildSystemPrompt(glutenFree),
        buildSuggestPrompt(ingredient, glutenFree),
        { maxTokens: 3500 }
      );
      const data = parseJson(text);
      setSuggestions(Array.isArray(data) ? data : []);
      setMode('external');
    } catch (e) {
      setError(e.message || 'Could not fetch suggestions. Check your API key.');
    } finally {
      setLoading(false);
    }
  }

  function handleSave(idx) {
    saveRecipe({ ...suggestions[idx], addedBy: user, sourceType: 'suggested' });
    setAddedIdxs(s => new Set([...s, idx]));
  }

  return (
    <div className="sheet-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-body">

          {/* Header */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
            <div>
              <p style={{ fontSize:11, color:'var(--text-muted)', textTransform:'uppercase',
                letterSpacing:'0.07em', margin:'0 0 4px' }}>
                Ingredient
              </p>
              <div className="sheet-title" style={{ marginBottom:0 }}>{ingredient}</div>
            </div>
            <button className="btn-icon" onClick={onClose} style={{ flexShrink:0 }}>✕</button>
          </div>

          {/* ── Pick mode ── */}
          {mode === 'pick' && !loading && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {/* Library option */}
              <button
                onClick={() => setMode('library')}
                style={{
                  width:'100%', padding:16, background:'var(--card)',
                  border:'1.5px solid var(--green)', borderRadius:'var(--radius)',
                  textAlign:'left', cursor:'pointer',
                }}
              >
                <p style={{ fontSize:16, fontWeight:600, color:'var(--green)', margin:'0 0 4px' }}>
                  📚 Search my library
                </p>
                <p style={{ fontSize:13, color:'var(--text-muted)', margin:0, lineHeight:1.4 }}>
                  {libraryMatches.length > 0
                    ? `${libraryMatches.length} saved recipe${libraryMatches.length > 1 ? 's' : ''} already use this`
                    : 'Check which of your recipes use this ingredient'}
                </p>
              </button>

              {/* Gluten-free toggle */}
              <div style={{
                display:'flex', alignItems:'center', justifyContent:'space-between',
                background:'var(--bg)', border:'1.5px solid var(--border)',
                borderRadius:'var(--radius-sm)', padding:'12px 14px',
              }}>
                <div>
                  <p style={{ fontSize:14, fontWeight:500, margin:0 }}>Gluten-free adaptable</p>
                  <p style={{ fontSize:12, color:'var(--text-muted)', margin:'2px 0 0', lineHeight:1.3 }}>
                    Recipes with easy gluten-free swaps included
                  </p>
                </div>
                <div
                  onClick={() => setGlutenFree(g => !g)}
                  style={{
                    width:44, height:26, borderRadius:13, flexShrink:0,
                    background: glutenFree ? 'var(--green)' : 'var(--border)',
                    position:'relative', cursor:'pointer', transition:'background 0.2s',
                  }}
                >
                  <div style={{
                    position:'absolute', top:3,
                    left: glutenFree ? 21 : 3,
                    width:20, height:20, borderRadius:'50%', background:'#fff',
                    boxShadow:'0 1px 4px rgba(0,0,0,0.2)', transition:'left 0.2s',
                  }} />
                </div>
              </div>

              {/* Find new recipes option */}
              <button
                onClick={handleFindNew}
                style={{
                  width:'100%', padding:16, background:'var(--card)',
                  border:'1.5px solid var(--amber)', borderRadius:'var(--radius)',
                  textAlign:'left', cursor:'pointer',
                }}
              >
                <p style={{ fontSize:16, fontWeight:600, color:'var(--amber)', margin:'0 0 4px' }}>
                  ✨ Find new recipes
                </p>
                <p style={{ fontSize:13, color:'var(--text-muted)', margin:0, lineHeight:1.4 }}>
                  Ask Claude to suggest 5 recipes
                  {glutenFree ? ' with gluten-free adaptations' : ' using this ingredient'}
                </p>
              </button>

              {error && (
                <p style={{ color:'#c0392b', fontSize:13, background:'#fdd',
                  padding:'8px 12px', borderRadius:6, margin:0 }}>
                  {error}
                </p>
              )}
            </div>
          )}

          {/* ── Loading ── */}
          {loading && (
            <div style={{ textAlign:'center', padding:'48px 0' }}>
              <div className="spinner" style={{ marginBottom:12 }} />
              <p style={{ color:'var(--text-muted)', fontSize:14 }}>
                Finding recipes with {ingredient}…
              </p>
            </div>
          )}

          {/* ── Library results ── */}
          {mode === 'library' && (
            <>
              <button className="btn-ghost" style={{ fontSize:13, padding:0, marginBottom:16 }}
                onClick={() => setMode('pick')}>
                ← Back
              </button>

              {libraryMatches.length === 0 ? (
                <div className="empty-state" style={{ padding:'32px 0' }}>
                  <div className="empty-icon" style={{ fontSize:40 }}>📖</div>
                  <p>
                    None of your saved recipes use <strong>{ingredient}</strong>.
                    <br />Try finding new recipes instead.
                  </p>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {libraryMatches.map(r => {
                    const matchingIngs = r.ingredients
                      .filter(i => ingredientMatches(i.name, ingredient))
                      .map(i => i.name).join(', ');
                    return (
                      <div key={r.id} className="card" style={{ borderLeft:'4px solid var(--green)' }}>
                        <p style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'1.1rem',
                          fontWeight:600, margin:'0 0 4px' }}>
                          {r.title}
                        </p>
                        {r.description && (
                          <p style={{ fontSize:13, color:'var(--text-muted)', margin:'0 0 8px', lineHeight:1.4 }}>
                            {r.description.length > 100 ? r.description.slice(0, 100) + '…' : r.description}
                          </p>
                        )}
                        <div style={{ display:'flex', gap:10, fontSize:12, flexWrap:'wrap', marginBottom:6 }}>
                          {r.difficulty && (
                            <span style={{ color: DIFFICULTY_COLOR[r.difficulty], fontWeight:600 }}>
                              {r.difficulty}
                            </span>
                          )}
                          {r.timeEstimate && <span style={{ color:'var(--text-muted)' }}>⏱ {r.timeEstimate}</span>}
                          {r.servings && <span style={{ color:'var(--text-muted)' }}>🍽 {r.servings}</span>}
                        </div>
                        <p style={{ fontSize:11, color:'var(--green)', margin:0 }}>
                          Uses: {matchingIngs}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ── External suggestions ── */}
          {mode === 'external' && !loading && (
            <>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                <button className="btn-ghost" style={{ fontSize:13, padding:0 }}
                  onClick={() => setMode('pick')}>
                  ← Back
                </button>
                <p style={{ fontSize:12, color:'var(--text-muted)', margin:0 }}>
                  Tap a recipe to preview
                </p>
              </div>

              {suggestions.length === 0 ? (
                <p style={{ color:'var(--text-muted)', fontSize:14, textAlign:'center', padding:'24px 0' }}>
                  No suggestions returned.
                </p>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {suggestions.map((r, i) => (
                    <SuggestionCard
                      key={i}
                      idx={i}
                      recipe={r}
                      isAdded={addedIdxs.has(i)}
                      onSave={() => handleSave(i)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          <div style={{ height: 24 }} />
        </div>
      </div>
    </div>
  );
}
