// Calculs purs (sans DOM) : testables avec `node --test`.

export const pad = (n) => String(n).padStart(2, '0');

export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

export function daysInMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

const sum = (items) => items.reduce((s, it) => s + (Number(it.amount) || 0), 0);

// Un élément récurrent (revenu, charge, épargne) s'applique-t-il à ce mois ?
export function activeIn(item, key) {
  if (item.from && key < item.from) return false;
  if (item.until && key > item.until) return false;
  return true;
}

export function computeMonth(state, key, today = new Date()) {
  const tx = state.transactions.filter((t) => t.date.startsWith(key));

  const recurringIncome = sum(state.incomes.filter((i) => activeIn(i, key)));
  const extraIncome = sum(tx.filter((t) => t.type === 'income'));
  const income = recurringIncome + extraIncome;

  const charges = sum(state.charges.filter((c) => activeIn(c, key)));
  const savings = sum(state.savingsPlans.filter((p) => activeIn(p, key)));

  // « Reste à vivre » : ce qui reste pour les dépenses du quotidien.
  const available = income - charges - savings;

  const expenses = tx.filter((t) => t.type !== 'income');
  const spent = sum(expenses);
  const remaining = available - spent;

  const total = daysInMonth(key);
  const curKey = monthKey(today);
  const isCurrent = key === curKey;
  const isPast = key < curKey;
  const dayNow = isCurrent ? today.getDate() : isPast ? total : 0;
  const daysLeft = isCurrent ? total - dayNow + 1 : isPast ? 0 : total;
  const perDay = daysLeft > 0 ? remaining / daysLeft : 0;
  const perDayPlanned = available / total;

  // Projection : au rythme actuel, quand sera-t-on à sec ?
  let projected = spent;
  let dryDay = null;
  if (isCurrent && dayNow > 0) {
    const rate = spent / dayNow;
    projected = rate * total;
    if (available <= 0) dryDay = 1;
    else if (rate > 0 && projected > available) dryDay = Math.max(1, Math.floor(available / rate));
  }

  const byCategory = {};
  for (const t of expenses) {
    const v = Number(t.amount) || 0;
    if (!v) continue;
    byCategory[t.category] ??= { spent: 0, budget: 0 };
    byCategory[t.category].spent += v;
  }
  for (const b of state.budgets.filter((x) => activeIn(x, key))) {
    const v = Number(b.amount) || 0;
    if (!v) continue;
    byCategory[b.category] ??= { spent: 0, budget: 0 };
    byCategory[b.category].budget += v;
  }

  return {
    income, charges, savings, available, spent, remaining,
    total, dayNow, daysLeft, perDay, perDayPlanned,
    projected, dryDay, isCurrent, isPast, byCategory,
  };
}

// Fusion de deux sauvegardes (deux appareils, ou un fichier importé).
// Chaque élément a un id et un updatedAt ; les suppressions sont gardées
// dans `deleted` pour ne pas réapparaître après une fusion.
export const COLLECTIONS = ['incomes', 'charges', 'savingsPlans', 'budgets', 'goals', 'transactions'];

export function mergeStates(a, b) {
  const deleted = { ...a.deleted };
  for (const [id, ts] of Object.entries(b.deleted || {})) {
    deleted[id] = Math.max(deleted[id] || 0, ts);
  }
  const out = {
    version: a.version,
    settings: (b.settings?.updatedAt || 0) > (a.settings?.updatedAt || 0) ? b.settings : a.settings,
    deleted,
  };
  for (const col of COLLECTIONS) {
    const map = new Map();
    for (const it of [...(a[col] || []), ...(b[col] || [])]) {
      const prev = map.get(it.id);
      if (!prev || (it.updatedAt || 0) > (prev.updatedAt || 0)) map.set(it.id, it);
    }
    out[col] = [...map.values()].filter((it) => !(deleted[it.id] >= (it.updatedAt || 0)));
  }
  return out;
}

// Empreinte d'une sauvegarde : deux états de même empreinte ont le même contenu
// (toute modification change updatedAt). Sert à éviter les allers-retours inutiles.
export function fingerprint(s) {
  const parts = [`settings:${s.settings?.updatedAt || 0}`];
  for (const col of COLLECTIONS) {
    parts.push(col + ':' + (s[col] || []).map((it) => `${it.id}@${it.updatedAt || 0}`).sort().join(','));
  }
  parts.push('deleted:' + Object.keys(s.deleted || {}).sort().join(','));
  return parts.join('|');
}
