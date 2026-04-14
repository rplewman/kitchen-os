/**
 * storage.js
 * All shared storage helpers and data model initializers.
 * Uses localStorage as the persistence layer (works on shared device/tablet).
 * Abstracted so the backend can be swapped without touching any UI component.
 *
 * Data models:
 *   recipes    — { id, title, description, servings, difficulty, timeEstimate,
 *                  ingredients: [{name, amount, unit, category}], steps,
 *                  sourceType, sourceUrl, addedBy, addedAt, tags,
 *                  cookCount, lastCooked, imageData }
 *   mealPlan   — { [weekKey]: { mon, tue, wed, thu, fri, sat, sun } }
 *                  each day: { mealName, recipeId|null }
 *   grocery    — [{ id, name, amount, unit, category, checked, addedBy, fromRecipeId }]
 *   meals      — [{ id, name, recipeId, cookedAt, addedBy, notes }]
 *   rankings   — { [userName]: [mealId, ...] }  best → worst
 */

// ---------------------------------------------------------------------------
// Firebase sync hook (imported lazily to avoid circular deps)
// ---------------------------------------------------------------------------

let _push = () => {};
export function _registerPush(fn) { _push = fn; }

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const KEYS = {
  recipes: 'kitchen_os_recipes',
  mealPlan: 'kitchen_os_meal_plan',
  grocery: 'kitchen_os_grocery',
  meals: 'kitchen_os_meals',
  rankings: 'kitchen_os_rankings',
  apiKey: 'kitchen_os_api_key',
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  _push();
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

export function getRecipes() {
  return read(KEYS.recipes, []);
}

export function saveRecipe(recipe) {
  const recipes = getRecipes();
  const now = new Date().toISOString();
  const newRecipe = {
    id: generateId(),
    cookCount: 0,
    lastCooked: null,
    addedAt: now,
    tags: [],
    ...recipe,
  };
  write(KEYS.recipes, [newRecipe, ...recipes]);
  return newRecipe;
}

export function updateRecipe(id, changes) {
  const recipes = getRecipes();
  const updated = recipes.map(r => (r.id === id ? { ...r, ...changes } : r));
  write(KEYS.recipes, updated);
  return updated.find(r => r.id === id);
}

export function deleteRecipe(id) {
  write(KEYS.recipes, getRecipes().filter(r => r.id !== id));
}

export function incrementCookCount(recipeId) {
  const recipes = getRecipes();
  const recipe = recipes.find(r => r.id === recipeId);
  if (!recipe) return;
  updateRecipe(recipeId, {
    cookCount: (recipe.cookCount || 0) + 1,
    lastCooked: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Meal Plan
// ---------------------------------------------------------------------------

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function getMealPlan() {
  return read(KEYS.mealPlan, {});
}

function emptyWeek() {
  const w = {};
  DAYS.forEach(d => { w[d] = { meals: [] }; });
  return w;
}

/** Normalise a day slot to always use the `meals` array format. */
function normaliseDay(slot) {
  if (!slot) return { meals: [] };
  // Legacy format: { mealName, recipeId }
  if (!slot.meals) {
    if (slot.mealName) return { meals: [{ mealName: slot.mealName, recipeId: slot.recipeId || null }] };
    return { meals: [] };
  }
  return slot;
}

export function getWeek(weekKey) {
  const plan = getMealPlan();
  const week = plan[weekKey] || emptyWeek();
  // Normalise every day slot (handles legacy single-meal format)
  const out = {};
  DAYS.forEach(d => { out[d] = normaliseDay(week[d]); });
  return out;
}

function ensureWeek(plan, weekKey) {
  if (!plan[weekKey]) plan[weekKey] = emptyWeek();
  DAYS.forEach(d => {
    plan[weekKey][d] = normaliseDay(plan[weekKey][d]);
  });
}

/** Add a meal entry to a day (supports multiple per day). */
export function addDayMeal(weekKey, day, { mealName, recipeId }) {
  const plan = getMealPlan();
  ensureWeek(plan, weekKey);
  plan[weekKey][day].meals.push({ mealName, recipeId: recipeId || null });
  write(KEYS.mealPlan, plan);
}

/** Remove a meal entry by index from a day. */
export function removeDayMeal(weekKey, day, index) {
  const plan = getMealPlan();
  ensureWeek(plan, weekKey);
  plan[weekKey][day].meals.splice(index, 1);
  write(KEYS.mealPlan, plan);
}

/** Clear all meals from a day. */
export function clearDayMeal(weekKey, day) {
  const plan = getMealPlan();
  ensureWeek(plan, weekKey);
  plan[weekKey][day].meals = [];
  write(KEYS.mealPlan, plan);
}

/** @deprecated Use addDayMeal. Kept for any callers that set a single meal. */
export function setDayMeal(weekKey, day, { mealName, recipeId }) {
  const plan = getMealPlan();
  ensureWeek(plan, weekKey);
  plan[weekKey][day].meals = mealName ? [{ mealName, recipeId: recipeId || null }] : [];
  write(KEYS.mealPlan, plan);
}

/** ISO week key e.g. "2025-W22" */
export function getISOWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/** Returns the Monday Date for a given ISO week key */
export function getMondayOfWeek(weekKey) {
  const [year, week] = weekKey.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
  return monday;
}

export function getAdjacentWeekKey(weekKey, delta) {
  const monday = getMondayOfWeek(weekKey);
  monday.setUTCDate(monday.getUTCDate() + delta * 7);
  return getISOWeekKey(monday);
}

// ---------------------------------------------------------------------------
// Grocery List
// ---------------------------------------------------------------------------

export function getGrocery() {
  return read(KEYS.grocery, []);
}

export function addGroceryItem(item) {
  const list = getGrocery();
  const newItem = {
    id: generateId(),
    checked: false,
    category: 'Other',
    fromRecipeId: null,
    ...item,
  };
  write(KEYS.grocery, [...list, newItem]);
  return newItem;
}

export function updateGroceryItem(id, changes) {
  const list = getGrocery();
  write(KEYS.grocery, list.map(i => (i.id === id ? { ...i, ...changes } : i)));
}

export function deleteGroceryItem(id) {
  write(KEYS.grocery, getGrocery().filter(i => i.id !== id));
}

export function clearCheckedItems() {
  write(KEYS.grocery, getGrocery().filter(i => !i.checked));
}

export function addIngredientsToGrocery(ingredients, addedBy, fromRecipeId, weekKey = null) {
  ingredients.forEach(ing => {
    addGroceryItem({
      name: ing.name,
      amount: ing.amount || '',
      unit: ing.unit || '',
      category: ing.category || 'Other',
      addedBy,
      fromRecipeId,
      weekKey,
    });
  });
}

// ---------------------------------------------------------------------------
// Meals (Hall of Fame entries)
// ---------------------------------------------------------------------------

export function getMeals() {
  return read(KEYS.meals, []);
}

export function addMeal(meal) {
  const meals = getMeals();
  const newMeal = {
    id: generateId(),
    cookedAt: new Date().toISOString(),
    notes: '',
    recipeId: null,
    ...meal,
  };
  write(KEYS.meals, [newMeal, ...meals]);
  return newMeal;
}

export function deleteMeal(id) {
  write(KEYS.meals, getMeals().filter(m => m.id !== id));
}

// ---------------------------------------------------------------------------
// Rankings
// ---------------------------------------------------------------------------

export function getRankings() {
  return read(KEYS.rankings, {});
}

export function getUserRanking(userName) {
  return getRankings()[userName] || [];
}

/** Insert mealId at a specific index in the user's ranking */
export function insertIntoRanking(userName, mealId, index) {
  const rankings = getRankings();
  const userRank = rankings[userName] ? [...rankings[userName]] : [];
  // Remove if already present
  const filtered = userRank.filter(id => id !== mealId);
  filtered.splice(index, 0, mealId);
  write(KEYS.rankings, { ...rankings, [userName]: filtered });
}

export function removeFromRanking(userName, mealId) {
  const rankings = getRankings();
  const userRank = (rankings[userName] || []).filter(id => id !== mealId);
  write(KEYS.rankings, { ...rankings, [userName]: userRank });
}

// ---------------------------------------------------------------------------
// API Key
// ---------------------------------------------------------------------------

export function getApiKey() {
  const raw = localStorage.getItem(KEYS.apiKey);
  if (!raw) return '';
  try {
    // New format: JSON-encoded string (set via write())
    const parsed = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed : '';
  } catch {
    // Legacy format: raw string stored without JSON encoding
    return raw;
  }
}

export function setApiKey(key) {
  write(KEYS.apiKey, key);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function getSettings() {
  return read('kitchen_os_settings', { macrosEnabled: true });
}

export function saveSettings(changes) {
  write('kitchen_os_settings', { ...getSettings(), ...changes });
}
