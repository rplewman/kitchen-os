import { useState } from 'react';
import { getRecipes, saveRecipe } from './storage.js';
import { callClaude, parseJson } from './claude.js';

const SUGGEST_SYSTEM = `You suggest recipes based on a given ingredient and return ONLY valid JSON.
Return a JSON array of exactly 5 recipe objects, each with:
[{"title": string, "description": string (1-2 sentences), "difficulty": "easy"|"medium"|"hard",
  "timeEstimate": string, "servings": number,
  "ingredients": [{"name": string, "amount": string, "unit": string,
                   "category": "Produce"|"Meat & Fish"|"Dairy"|"Pantry"|"Other"}],
  "steps": [string], "tags": [string]}]
Return ONLY the JSON array, no markdown, no explanation.`;

const DIFFICULTY_COLOR = { easy: '#155724', medium: '#7c4a00', hard: '#7c1a1a' };

function normalize(s) {
  return s.toLowerCase().trim().replace(/ies$/, 'y').replace(/es$/, '').replace(/s$/, '');
}

function ingredientMatches(ingName, query) {
  const n = normalize(ingName);
  const q = normalize(query);
  return n.includes(q) || q.includes(n);
}

export default function IngredientSearchSheet({ ingredient, user, onClose }) {
  const [mode,       setMode]       = useState('pick'); // 'pick' | 'library' | 'external'
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [addedIdxs,  setAddedIdxs]  = useState(new Set());

  // Library search is instant — filter all recipes client-side
  const libraryMatches = getRecipes().filter(r =>
    r.ingredients?.some(ing => ingredientMatches(ing.name, ingredient))
  );

  async function handleFindNew() {
    setLoading(true); setError('');
    try {
      const text = await callClaude(
        SUGGEST_SYSTEM,
        `Suggest 5 recipes that use ${ingredient} as a key ingredient.`,
        { maxTokens: 3000 }
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

  function handleSaveRecipe(recipe, idx) {
    saveRecipe({ ...recipe, addedBy: user, sourceType: 'suggested' });
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

              {/* External option */}
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
                  Ask Claude to suggest 5 recipes that use this ingredient
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
                      <div key={r.id} className="card"
                        style={{ borderLeft:'4px solid var(--green)' }}>
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
              <button className="btn-ghost" style={{ fontSize:13, padding:0, marginBottom:16 }}
                onClick={() => setMode('pick')}>
                ← Back
              </button>

              {suggestions.length === 0 ? (
                <p style={{ color:'var(--text-muted)', fontSize:14, textAlign:'center', padding:'24px 0' }}>
                  No suggestions returned.
                </p>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {suggestions.map((r, i) => {
                    const isAdded = addedIdxs.has(i);
                    return (
                      <div key={i} className="card" style={{ borderLeft:'4px solid var(--amber)' }}>
                        <p style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'1.1rem',
                          fontWeight:600, margin:'0 0 4px' }}>
                          {r.title}
                        </p>
                        {r.description && (
                          <p style={{ fontSize:13, color:'var(--text-muted)', margin:'0 0 8px', lineHeight:1.4 }}>
                            {r.description}
                          </p>
                        )}
                        <div style={{ display:'flex', justifyContent:'space-between',
                          alignItems:'center', flexWrap:'wrap', gap:8 }}>
                          <div style={{ display:'flex', gap:10, fontSize:12 }}>
                            {r.difficulty && (
                              <span style={{ color: DIFFICULTY_COLOR[r.difficulty], fontWeight:600 }}>
                                {r.difficulty}
                              </span>
                            )}
                            {r.timeEstimate && (
                              <span style={{ color:'var(--text-muted)' }}>⏱ {r.timeEstimate}</span>
                            )}
                          </div>
                          <button
                            className={isAdded ? 'btn-ghost' : 'btn-primary'}
                            style={{ fontSize:12, minHeight:32, padding:'0 14px',
                              opacity: isAdded ? 0.6 : 1 }}
                            onClick={() => !isAdded && handleSaveRecipe(r, i)}
                            disabled={isAdded}
                          >
                            {isAdded ? '✓ Saved' : '+ Save recipe'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
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
