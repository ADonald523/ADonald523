import { computeMonth, mergeStates, monthKey, shiftMonth, activeIn, pad, COLLECTIONS } from './calc.js';
import { createSync } from './sync.js';
import * as cloud from './cloud.js';
import { buildPlan, suggestSavings } from './plan.js';

// ---------- Données de référence ----------

const EXPENSE_CATS = [
  { id: 'courses', label: 'Courses', emoji: '🛒' },
  { id: 'resto', label: 'Resto / fast-food', emoji: '🍔' },
  { id: 'transport', label: 'Transport', emoji: '🚌' },
  { id: 'sorties', label: 'Sorties & loisirs', emoji: '🎉' },
  { id: 'shopping', label: 'Shopping', emoji: '🛍️' },
  { id: 'sante', label: 'Santé & beauté', emoji: '💊' },
  { id: 'maison', label: 'Maison', emoji: '🧺' },
  { id: 'etudes', label: 'Études', emoji: '📚' },
  { id: 'cadeaux', label: 'Cadeaux', emoji: '🎁' },
  { id: 'autre', label: 'Autre', emoji: '💸' },
];
const CHARGE_CATS = [
  { id: 'loyer', label: 'Loyer', emoji: '🏠' },
  { id: 'energie', label: 'Électricité / gaz', emoji: '⚡' },
  { id: 'telephone', label: 'Téléphone', emoji: '📱' },
  { id: 'internet', label: 'Internet', emoji: '🌐' },
  { id: 'assurance', label: 'Assurance / mutuelle', emoji: '🛡️' },
  { id: 'navigo', label: 'Abonnement transport', emoji: '🚇' },
  { id: 'streaming', label: 'Abonnements (Netflix, Spotify…)', emoji: '📺' },
  { id: 'sport', label: 'Salle de sport', emoji: '🏋️' },
  { id: 'credit', label: 'Crédit / remboursement', emoji: '🏦' },
  { id: 'chargeautre', label: 'Autre charge', emoji: '📄' },
];
const INCOME_KINDS = [
  { id: 'salaire', label: 'Salaire', emoji: '🏢' },
  { id: 'alternance', label: 'Alternance', emoji: '🎓' },
  { id: 'job', label: 'Petit job', emoji: '💼' },
  { id: 'aides', label: 'CAF / APL / bourse', emoji: '🏛️' },
  { id: 'famille', label: 'Famille', emoji: '👪' },
  { id: 'revenuautre', label: 'Autre revenu', emoji: '💶' },
];
const SAVING_CATS = [{ id: 'epargne', label: 'Épargne', emoji: '🐷' }];
const ALL_CATS = Object.fromEntries([...EXPENSE_CATS, ...CHARGE_CATS, ...INCOME_KINDS, ...SAVING_CATS].map((c) => [c.id, c]));
const cat = (id) => ALL_CATS[id] || { label: id || '—', emoji: '💸' };

// ---------- Stockage ----------

const DATA_KEY = 'budget-duo:data';
const UI_KEY = 'budget-duo:ui';

const emptyState = () => ({
  version: 1,
  settings: { name: '', updatedAt: 0 },
  incomes: [], charges: [], savingsPlans: [], budgets: [], goals: [], transactions: [],
  deleted: {},
});

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

let state = { ...emptyState(), ...load(DATA_KEY, {}) };
// Anciennes versions : le prénom s'appelait `p1`.
if (state.settings.name === undefined) state.settings = { name: state.settings.p1 === 'Moi' ? '' : state.settings.p1 || '', updatedAt: 0 };
const ui = { tab: 'home', ...load(UI_KEY, {}), month: monthKey() };

function persist() {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(state));
    localStorage.setItem(UI_KEY, JSON.stringify({ tab: ui.tab }));
  } catch {
    toast('⚠️ Impossible d’enregistrer sur cet appareil');
  }
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function upsert(col, item) {
  const next = { ...item, id: item.id || uid(), updatedAt: Date.now() };
  const i = state[col].findIndex((x) => x.id === next.id);
  if (i >= 0) state[col][i] = next;
  else state[col].push(next);
  commit();
}

function remove(col, id) {
  state[col] = state[col].filter((x) => x.id !== id);
  state.deleted[id] = Date.now();
  commit();
}

function commit() {
  persist();
  syncer?.changed();
  render();
}

// ---------- Utilitaires ----------

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function money(n, sign = false) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const digits = Number.isInteger(v) ? 0 : 2;
  const s = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Math.abs(v));
  if (v < 0) return '−' + s;
  return sign && v > 0 ? '+' + s : s;
}

const parseAmount = (s) => {
  const n = parseFloat(String(s ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};

const today = () => new Date();
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function pct(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function bar(value, max) {
  const p = max > 0 ? Math.min(100, (value / max) * 100) : value > 0 ? 100 : 0;
  const cls = max > 0 && value > max ? 'bad' : p >= 85 ? 'warn' : '';
  return `<div class="bar ${cls}"><i style="width:${p}%"></i></div>`;
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ---------- Rendu ----------

function render() {
  const [y, m] = ui.month.split('-').map(Number);
  $('#month-label').textContent = new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  for (const b of document.querySelectorAll('#tabbar button')) b.classList.toggle('active', b.dataset.tab === ui.tab);

  const screens = { home: renderHome, tx: renderTransactions, plan: renderPlan, save: renderSavings, settings: renderSettings };
  $('#screen').innerHTML = (screens[ui.tab] || renderHome)();
}

function renderHome() {
  const r = computeMonth(state, ui.month);
  const out = [];

  const steps = [
    [state.incomes.length, 'Ajoutez vos revenus du mois (alternance, job, CAF…)', 'add-income'],
    [state.charges.length, 'Listez vos charges fixes (loyer, téléphone, abonnements…)', 'add-charge'],
    [state.savingsPlans.length, 'Décidez d’un petit montant à mettre de côté', 'add-saving'],
    [state.budgets.length, 'Fixez des enveloppes (courses, sorties…)', 'add-budget'],
    [state.transactions.length, 'Notez chaque dépense avec le bouton +', 'add-expense'],
  ];
  if (!state.incomes.length && !state.charges.length) {
    out.push(`<section class="card"><h2>Faites votre bilan</h2>
      <p class="small">Répondez à quelques questions (2 minutes) : l’appli construit votre budget et vous dit combien vous pouvez dépenser par jour.</p>
      <button class="btn" data-action="wizard">Commencer le bilan</button></section>`);
  } else if (state.settings.onboarded) {
    if (!state.transactions.length) {
      out.push(`<section class="card"><h2>Dernière étape ✍️</h2>
        <p class="small">À chaque achat, appuyez sur <strong>+</strong> et notez-le (10 secondes). C’est ce qui permet à l’appli de vous prévenir avant d’être à sec.</p>
        <button class="btn" data-action="add-expense">Noter ma première dépense</button></section>`);
    }
  } else if (steps.some(([ok]) => !ok)) {
    out.push(`<section class="card"><h2>Pour bien démarrer</h2><ol class="steps">${steps
      .map(([ok, text, action]) => `<li class="${ok ? 'done' : ''}">${ok ? text : `<button class="link-btn" data-action="${action}">${text}</button>`}</li>`)
      .join('')}</ol></section>`);
  }

  if (cloud.cloudEnabled && !account.user && state.transactions.length >= 3) {
    out.push(`<div class="alert warn small"><strong>💾 Vos données ne sont que sur ce téléphone</strong>Créez un compte gratuit pour ne rien perdre et les retrouver partout. <button class="link-btn" data-action="tab" data-id="settings">Créer un compte</button></div>`);
  }

  let heroLabel = 'Il vous reste pour le quotidien';
  let heroSub = '';
  if (r.isCurrent) {
    heroSub = r.remaining > 0
      ? `soit <strong>${money(r.perDay)} / jour</strong> pendant ${r.daysLeft} jour${r.daysLeft > 1 ? 's' : ''}`
      : r.remaining < 0 ? 'Le budget du mois est dépassé' : '';
  } else if (r.isPast) {
    heroLabel = 'Bilan du mois';
    heroSub = r.remaining >= 0 ? 'Mois terminé dans le vert 👏' : 'Mois terminé dans le rouge';
  } else {
    heroLabel = 'Prévu pour le quotidien';
    heroSub = `soit ${money(r.perDayPlanned)} / jour`;
  }
  out.push(`<section class="card hero">
    <div class="label">${heroLabel}</div>
    <div class="big ${r.remaining < 0 ? 'neg' : ''}">${money(r.remaining)}</div>
    <div class="sub">${heroSub}</div>
  </section>`);

  if (state.incomes.length || state.charges.length) {
    if (r.available <= 0) {
      out.push(`<div class="alert bad"><strong>Le mois est perdu d’avance</strong>Charges fixes + épargne dépassent vos revenus de ${money(-r.available)}. Avant toute autre chose : réduire une charge (abonnement, forfait…) ou trouver un revenu (APL, prime d’activité, heures en plus).</div>`);
    } else if (r.dryDay) {
      out.push(`<div class="alert warn"><strong>⚠️ À ce rythme, à sec vers le ${r.dryDay}</strong>Vous dépensez en moyenne ${money(r.spent / r.dayNow)} par jour. Pour tenir jusqu’à la fin du mois, visez ${money(Math.max(0, r.perDay))} par jour maximum.</div>`);
    } else if (r.isCurrent && r.spent > 0) {
      out.push(`<div class="alert good"><strong>✅ Vous tenez le rythme</strong>Si vous continuez comme ça, il restera environ ${money(r.available - r.projected)} à la fin du mois.</div>`);
    }
  }

  out.push(`<section class="card"><h2>Le mois en un coup d’œil</h2><div class="flow">
    <div class="flow-row"><span>Revenus</span><span class="pos">${money(r.income, true)}</span></div>
    <div class="flow-row"><span>Charges fixes</span><span>${money(-r.charges)}</span></div>
    <div class="flow-row"><span>Épargne (se payer en premier)</span><span>${money(-r.savings)}</span></div>
    <div class="flow-row total"><span>Reste à vivre</span><span>${money(r.available)}</span></div>
    <div class="flow-row"><span>Déjà dépensé</span><span>${money(-r.spent)}</span></div>
    <div class="flow-row total"><span>Reste</span><span class="${r.remaining < 0 ? 'neg' : 'pos'}">${money(r.remaining)}</span></div>
  </div>${r.available > 0 ? bar(r.spent, r.available) : ''}</section>`);

  const upcoming = state.charges
    .filter((c) => activeIn(c, ui.month) && (!r.isCurrent || (c.day || 1) >= r.dayNow))
    .sort((a, b) => (a.day || 1) - (b.day || 1));
  if (upcoming.length && !r.isPast) {
    out.push(`<section class="card"><h2>Prélèvements à venir <small>${money(upcoming.reduce((s, c) => s + amountOf(c), 0))}</small></h2><ul class="list">${upcoming
      .slice(0, 6)
      .map((c) => `<li><div class="emoji">${cat(c.category).emoji}</div><div class="grow"><div class="title">${esc(c.label)}</div><div class="muted small">le ${c.day || 1}</div></div><div class="amount">${money(amountOf(c))}</div></li>`)
      .join('')}</ul></section>`);
  }

  const cats = Object.entries(r.byCategory).sort((a, b) => b[1].spent - a[1].spent);
  if (cats.length) {
    out.push(`<section class="card"><h2>Enveloppes <button class="link-btn" data-action="add-budget">+ enveloppe</button></h2><ul class="list">${cats
      .map(([id, v]) => `<li><div class="emoji">${cat(id).emoji}</div><div class="grow"><div class="flow-row"><span class="title">${esc(cat(id).label)}</span><span class="small ${v.budget && v.spent > v.budget ? 'neg' : 'muted'}">${money(v.spent)}${v.budget ? ` / ${money(v.budget)}` : ''}</span></div>${v.budget ? bar(v.spent, v.budget) : ''}</div></li>`)
      .join('')}</ul></section>`);
  }

  const recent = monthTransactions().slice(0, 5);
  if (recent.length) {
    out.push(`<section class="card"><h2>Dernières dépenses <button class="link-btn" data-action="tab" data-id="tx">Tout voir</button></h2><ul class="list">${recent.map(txRow).join('')}</ul></section>`);
  }
  return out.join('');
}

const amountOf = (it) => Number(it.amount) || 0;

function monthTransactions() {
  return state.transactions
    .filter((t) => t.date.startsWith(ui.month))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.updatedAt || 0) - (a.updatedAt || 0));
}

function txRow(t) {
  const c = cat(t.category);
  const isIncome = t.type === 'income';
  return `<li><button class="row" data-action="edit-tx" data-id="${t.id}">
    <div class="emoji">${c.emoji}</div>
    <div class="grow"><div class="title">${esc(t.note || c.label)}</div><div class="muted small">${esc(c.label)}</div></div>
    <div class="amount ${isIncome ? 'pos' : ''}">${money(isIncome ? amountOf(t) : -amountOf(t))}</div>
  </button></li>`;
}

function renderTransactions() {
  const list = monthTransactions();
  const head = `<div class="btn-row"><button class="btn" data-action="add-expense">+ Dépense</button><button class="btn ghost" data-action="add-extra-income">+ Rentrée d’argent</button></div>`;
  if (!list.length) return head + `<div class="empty">Aucune dépense notée ce mois-ci.<br>Le secret : noter <strong>tout</strong>, même le café à 1,50 €.</div>`;

  const r = computeMonth(state, ui.month);
  const groups = new Map();
  for (const t of list) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }
  let html = head + `<section class="card"><div class="grid2">
    <div class="stat"><div class="v">${money(r.spent)}</div><div class="k">dépensé ce mois</div></div>
    <div class="stat"><div class="v">${money(r.dayNow ? r.spent / r.dayNow : 0)}</div><div class="k">en moyenne / jour</div></div>
  </div>`;
  for (const [date, items] of groups) {
    const label = new Date(date + 'T00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    html += `<div class="day-head">${label}</div><ul class="list">${items.map(txRow).join('')}</ul>`;
  }
  return html + '</section>';
}

function recurringList(col, items, emptyText) {
  if (!items.length) return `<p class="muted small">${emptyText}</p>`;
  return `<ul class="list">${items
    .map((it) => `<li><button class="row" data-action="edit-${col}" data-id="${it.id}">
      <div class="emoji">${cat(it.category).emoji}</div>
      <div class="grow"><div class="title">${esc(it.label || cat(it.category).label)}</div><div class="muted small">${it.day ? `le ${it.day}` : '&nbsp;'}</div></div>
      <div class="amount">${money(amountOf(it))}</div>
    </button></li>`)
    .join('')}</ul>`;
}

function renderPlan() {
  const r = computeMonth(state, ui.month);
  const mine = (col) => state[col].filter((x) => activeIn(x, ui.month)).sort((a, b) => (a.day || 0) - (b.day || 0) || amountOf(b) - amountOf(a));
  const recurringIncome = mine('incomes').reduce((s, x) => s + amountOf(x), 0);
  const budgets = mine('budgets');
  const budgeted = budgets.reduce((s, b) => s + amountOf(b), 0);
  const free = r.available - budgeted;

  const chargePct = pct(r.charges, r.income);
  const savePct = pct(r.savings, r.income);
  const tips = [];
  if (r.income > 0) {
    tips.push(chargePct > 50
      ? `<div class="alert warn">Vos charges fixes mangent <strong>${chargePct} %</strong> de vos revenus (repère : 50 % max). Regardez d’abord les abonnements et le forfait téléphone.</div>`
      : `<div class="alert good">Charges fixes : ${chargePct} % des revenus — c’est raisonnable (repère : 50 % max).</div>`);
    tips.push(savePct < 5
      ? `<div class="alert warn">Épargne : ${savePct} % des revenus. Même 20 € par mois mis de côté dès la paie, ça change tout.</div>`
      : `<div class="alert good">Épargne : ${savePct} % des revenus 👍 (repère : 10 %).</div>`);
  }

  return `
  ${tips.join('')}
  <section class="card"><h2>Revenus mensuels <small>${money(recurringIncome)}</small></h2>
    ${recurringList('incomes', mine('incomes'), 'Ajoutez ce que vous touchez chaque mois : salaire d’alternance, job, APL…')}
    <button class="link-btn" data-action="add-income">+ Ajouter un revenu</button></section>

  <section class="card"><h2>Charges fixes <small>${money(r.charges)}</small></h2>
    ${recurringList('charges', mine('charges'), 'Tout ce qui part automatiquement chaque mois.')}
    <button class="link-btn" data-action="add-charge">+ Ajouter une charge</button></section>

  <section class="card"><h2>Enveloppes du quotidien <small>${money(budgeted)}</small></h2>
    <p class="muted small">Le « reste à vivre » (${money(r.available)}) est réparti en enveloppes. Quand une enveloppe est vide, on arrête.</p>
    ${budgets.length ? `<ul class="list">${budgets
      .map((b) => {
        const spent = r.byCategory[b.category]?.spent || 0;
        const total = r.byCategory[b.category]?.budget || amountOf(b);
        return `<li><button class="row" data-action="edit-budgets" data-id="${b.id}"><div class="emoji">${cat(b.category).emoji}</div><div class="grow"><div class="flow-row"><span class="title">${esc(cat(b.category).label)}</span><span class="small muted">${money(amountOf(b))}</span></div>${bar(spent, total)}</div></button></li>`;
      })
      .join('')}</ul>` : ''}
    <div class="flow-row small" style="margin-top:8px"><span class="muted">Non réparti</span><span class="${free < 0 ? 'neg' : ''}">${money(free)}</span></div>
    ${free < 0 ? '<p class="small neg">Vos enveloppes dépassent le reste à vivre : réduisez-en une.</p>' : ''}
    <button class="link-btn" data-action="add-budget">+ Ajouter une enveloppe</button></section>`;
}

function renderSavings() {
  const plans = state.savingsPlans.filter((p) => activeIn(p, ui.month));
  const goals = state.goals;
  const monthly = plans.reduce((s, p) => s + amountOf(p), 0);
  const fixed = computeMonth(state, ui.month).charges;

  return `
  <section class="card"><h2>Épargne automatique <small>${money(monthly)} / mois</small></h2>
    <div class="tip small">Se payer en premier : programmez un virement automatique vers un livret <strong>le jour de la paie</strong>, pas à la fin du mois (il ne reste jamais rien à la fin du mois).</div>
    ${recurringList('savingsPlans', plans, 'Aucun virement d’épargne pour l’instant.')}
    <button class="link-btn" data-action="add-saving">+ Ajouter un virement d’épargne</button></section>

  <section class="card"><h2>Objectifs</h2>
    ${goals.length ? `<ul class="list">${goals
      .map((g) => `<li><div class="emoji">🎯</div><div class="grow">
        <div class="flow-row"><button class="link-btn" style="padding:0;color:inherit;font-weight:600" data-action="edit-goal" data-id="${g.id}">${esc(g.name)}</button><span class="small muted">${money(g.saved || 0)} / ${money(g.target)}</span></div>
        ${bar(g.saved || 0, g.target)}
        <div class="flow-row small muted" style="margin-top:4px"><span>${pct(g.saved || 0, g.target)} %</span><button class="link-btn" data-action="feed-goal" data-id="${g.id}">+ / − argent</button></div>
      </div></li>`)
      .join('')}</ul>` : '<p class="muted small">Un objectif motive : vacances, permis, fonds d’urgence…</p>'}
    <button class="link-btn" data-action="add-goal">+ Nouvel objectif</button></section>

  <section class="card"><h2>Premier objectif conseillé</h2>
    <p class="small">Un <strong>fonds d’urgence</strong> d’un mois de charges fixes (${money(fixed)}) : c’est ce qui évite le découvert et les frais bancaires quand une dépense imprévue tombe.</p>
    ${state.goals.some((g) => g.name === 'Fonds d’urgence') ? '' : `<button class="btn ghost" data-action="emergency-goal">Créer l’objectif « Fonds d’urgence »</button>`}
  </section>`;
}

function renderSettings() {
  const s = state.settings;
  return `
  ${renderAccountCard()}

  <section class="card"><h2>Profil</h2>
    <form id="settings-form">
      <label class="field"><span>Votre prénom</span><input name="name" value="${esc(s.name)}" maxlength="20" autocomplete="given-name"></label>
      <button class="btn" type="submit">Enregistrer</button>
    </form>
    <button class="btn ghost" style="margin-top:8px" data-action="wizard">Refaire mon bilan</button>
  </section>

  <section class="card"><details><summary><strong>Sauvegarde manuelle (fichier)</strong></summary>
    <p class="small">Exportez vos données dans un fichier pour les garder ou les transférer sur un autre appareil sans compte.</p>
    <div class="btn-row"><button class="btn" data-action="export">Exporter mes données</button>
    <label class="btn ghost" style="text-align:center">Importer et fusionner<input type="file" accept="application/json,.json" id="import-file" hidden></label></div>
  </details></section>

  <section class="card"><h2>Les 5 règles pour finir le mois</h2>
    <div class="tip small"><strong>1. Regarder le « par jour », pas le solde.</strong> Le solde du compte ment : il ne montre pas le loyer qui tombe dans 10 jours.</div>
    <div class="tip small"><strong>2. Se payer en premier.</strong> L’épargne part le jour de la paie, automatiquement.</div>
    <div class="tip small"><strong>3. Tout noter, tout de suite.</strong> Ce sont les petites dépenses (snacks, Uber Eats, cafés) qui vident le compte.</div>
    <div class="tip small"><strong>4. Chasser les charges fixes.</strong> Un abonnement à 10 € = 120 € par an. Forfait mobile à 5–10 € suffit.</div>
    <div class="tip small"><strong>5. Vérifier vos aides.</strong> APL, prime d’activité (dès 18 ans en alternance si vous gagnez assez) : simulez sur caf.fr.</div>
  </section>

  ${account.user ? '' : `<section class="card"><h2>Données</h2>
    <button class="btn danger" data-action="reset">Tout effacer sur ce téléphone</button></section>`}`;
}

const SYNC_LABELS = {
  connecting: '⏳ Connexion…',
  syncing: '🔄 Synchronisation…',
  ok: '🟢 Sauvegardé et synchronisé',
  offline: '🟠 Hors ligne — ça se synchronisera au retour du réseau',
  error: '🔴 Erreur de synchro',
};

function syncStatusText() {
  const { status, message } = syncInfo;
  return `${SYNC_LABELS[status] || ''}${status === 'error' && message ? `<br><span class="muted">${esc(message)}</span>` : ''}`;
}

function renderAccountCard() {
  if (!cloud.cloudEnabled) return '';
  if (!account.user) {
    return `<section class="card"><h2>Compte</h2>
      <p class="small">Créez un compte gratuit pour <strong>sauvegarder</strong> votre budget et le retrouver sur <strong>tous vos appareils</strong>.</p>
      <button class="btn ghost" data-action="auth-google">Continuer avec Google</button>
      <p class="muted small" style="text-align:center;margin:10px 0">ou avec un e-mail</p>
      <form id="auth-form">
        <label class="field"><span>E-mail</span><input name="email" type="email" autocomplete="email" required></label>
        <label class="field"><span>Mot de passe (6 caractères min.)</span><input name="password" type="password" minlength="6" autocomplete="current-password" required></label>
        <div class="btn-row"><button class="btn" value="signin">Se connecter</button><button class="btn ghost" value="signup">Créer un compte</button></div>
      </form>
      <button class="link-btn" data-action="auth-reset">Mot de passe oublié ?</button>
    </section>`;
  }
  return `<section class="card"><h2>Mon compte</h2>
    <p class="small"><strong>${esc(account.user.email || account.user.displayName || '')}</strong><br><span id="sync-status">${syncStatusText()}</span></p>
    <div class="btn-row"><button class="btn ghost" data-action="auth-signout">Se déconnecter</button></div>
    <button class="link-btn" style="color:var(--bad)" data-action="auth-delete">Supprimer mon compte</button>
  </section>`;
}

// ---------- Formulaires (feuille du bas) ----------

let currentForm = null;

const catOptions = (list) => list.map((c) => ({ value: c.id, label: `${c.emoji} ${c.label}` }));

function field(f, v) {
  const val = v ?? '';
  if (f.type === 'chips') {
    return `<div class="field"><span>${f.label}</span><div class="chips">${f.options
      .map((o) => `<label><input type="radio" name="${f.name}" value="${esc(o.value)}" ${String(o.value) === String(val) ? 'checked' : ''} required><span>${esc(o.label)}</span></label>`)
      .join('')}</div></div>`;
  }
  const attrs = {
    amount: `inputmode="decimal" class="amount-input" placeholder="0,00" autocomplete="off" required`,
    text: `maxlength="60" autocomplete="off"`,
    date: `type="date" required`,
    day: `type="number" min="1" max="31" inputmode="numeric"`,
  }[f.type];
  const shown = f.type === 'amount' && val !== '' ? String(val).replace('.', ',') : val;
  return `<label class="field"><span>${f.label}</span><input name="${f.name}" ${attrs} value="${esc(shown)}" ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}></label>`;
}

function openForm({ title, fields, values = {}, onSave, onDelete }) {
  currentForm = { fields, onSave, onDelete };
  $('#sheet-form').innerHTML = `<h3>${title}</h3>${fields.map((f) => field(f, values[f.name])).join('')}
    <div class="btn-row">
      ${onDelete ? '<button class="btn danger" value="delete" formnovalidate>Supprimer</button>' : ''}
      <button class="btn ghost" value="cancel" formnovalidate>Annuler</button>
      <button class="btn" value="save">OK</button>
    </div>`;
  const dlg = $('#sheet');
  dlg.showModal();
  const first = dlg.querySelector('.amount-input') || dlg.querySelector('input');
  if (first && !values.id) first.focus();
}

$('#sheet-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const action = e.submitter?.value;
  const dlg = $('#sheet');
  if (action === 'delete') {
    if (confirm('Supprimer cet élément ?')) {
      currentForm.onDelete();
      dlg.close();
    }
    return;
  }
  if (action !== 'save') return dlg.close();

  const fd = new FormData(e.target);
  const data = {};
  for (const f of currentForm.fields) {
    let v = fd.get(f.name);
    if (f.type === 'amount') {
      v = parseAmount(v);
      if (!(v > 0)) {
        toast('Montant invalide');
        return;
      }
    }
    if (f.type === 'day') v = v ? Math.min(31, Math.max(1, parseInt(v, 10))) : null;
    if (f.type === 'text') v = String(v || '').trim();
    data[f.name] = v;
  }
  currentForm.onSave(data);
  dlg.close();
});

function defaultDate() {
  return ui.month === monthKey() ? isoDate(today()) : `${ui.month}-01`;
}

function txForm(t) {
  const isIncome = (t?.type || 'expense') === 'income';
  openForm({
    title: t?.id ? (isIncome ? 'Modifier la rentrée' : 'Modifier la dépense') : isIncome ? 'Rentrée d’argent' : 'Nouvelle dépense',
    fields: [
      { name: 'amount', label: 'Montant (€)', type: 'amount' },
      { name: 'category', label: isIncome ? 'Type' : 'Catégorie', type: 'chips', options: catOptions(isIncome ? INCOME_KINDS : EXPENSE_CATS) },
      { name: 'date', label: 'Date', type: 'date' },
      { name: 'note', label: 'Note (optionnel)', type: 'text', placeholder: isIncome ? 'ex. heures sup, remboursement…' : 'ex. Lidl, McDo, cinéma…' },
    ],
    values: { category: isIncome ? 'job' : 'courses', date: defaultDate(), ...t },
    onSave: (d) => {
      upsert('transactions', { ...t, ...d, type: isIncome ? 'income' : 'expense' });
      toast(isIncome ? 'Rentrée ajoutée' : 'Dépense ajoutée');
    },
    onDelete: t?.id ? () => remove('transactions', t.id) : null,
  });
}

function recurringForm(col, item, { title, cats, labelHint, withDay = true }) {
  const fields = [
    { name: 'amount', label: 'Montant par mois (€)', type: 'amount' },
    { name: 'category', label: 'Type', type: 'chips', options: catOptions(cats) },
    { name: 'label', label: 'Nom (optionnel)', type: 'text', placeholder: labelHint },
  ];
  if (withDay) fields.push({ name: 'day', label: 'Jour du mois', type: 'day', placeholder: 'ex. 5' });
  openForm({
    title: item?.id ? `Modifier` : title,
    fields,
    values: { category: cats[0].id, ...item },
    onSave: (d) => upsert(col, { from: ui.month, ...item, ...d }),
    onDelete: item?.id ? () => remove(col, item.id) : null,
  });
}

const FORMS = {
  incomes: (it) => recurringForm('incomes', it, { title: 'Revenu mensuel', cats: INCOME_KINDS, labelHint: 'ex. Salaire alternance' }),
  charges: (it) => recurringForm('charges', it, { title: 'Charge fixe', cats: CHARGE_CATS, labelHint: 'ex. Free mobile' }),
  savingsPlans: (it) => recurringForm('savingsPlans', it, { title: 'Virement d’épargne', cats: SAVING_CATS, labelHint: 'ex. Livret A' }),
  budgets: (it) => openForm({
    title: it?.id ? 'Modifier l’enveloppe' : 'Nouvelle enveloppe',
    fields: [
      { name: 'amount', label: 'Montant par mois (€)', type: 'amount' },
      { name: 'category', label: 'Catégorie', type: 'chips', options: catOptions(EXPENSE_CATS) },
    ],
    values: { category: 'courses', ...it },
    onSave: (d) => upsert('budgets', { from: ui.month, ...it, ...d }),
    onDelete: it?.id ? () => remove('budgets', it.id) : null,
  }),
  goal: (g) => openForm({
    title: g?.id ? 'Modifier l’objectif' : 'Nouvel objectif',
    fields: [
      { name: 'name', label: 'Objectif', type: 'text', placeholder: 'ex. Vacances d’été' },
      { name: 'amount', label: 'Montant visé (€)', type: 'amount' },
    ],
    values: { amount: g?.target, ...g },
    onSave: ({ amount, ...d }) => upsert('goals', { saved: 0, ...g, ...d, name: d.name || 'Objectif', target: amount }),
    onDelete: g?.id ? () => remove('goals', g.id) : null,
  }),
};

// ---------- Actions ----------

const find = (col, id) => state[col].find((x) => x.id === id);

const ACTIONS = {
  wizard: () => openWizard(),
  'wiz-next': () => wizardGo(1),
  'wiz-prev': () => wizardGo(-1),
  'wiz-skip': () => {
    state.settings = { ...state.settings, onboarded: true, updatedAt: Date.now() };
    closeWizard();
    commit();
  },
  'wiz-login': () => {
    closeWizard();
    ACTIONS.tab('settings');
  },
  'wiz-apply': () => applyPlan(),
  'prev-month': () => { ui.month = shiftMonth(ui.month, -1); render(); },
  'next-month': () => { ui.month = shiftMonth(ui.month, 1); render(); },
  tab: (id) => { ui.tab = id; persist(); render(); window.scrollTo(0, 0); },
  'add-expense': () => txForm(),
  'add-extra-income': () => txForm({ type: 'income' }),
  'edit-tx': (id) => txForm(find('transactions', id)),
  'add-income': () => FORMS.incomes(),
  'add-charge': () => FORMS.charges(),
  'add-saving': () => FORMS.savingsPlans(),
  'add-budget': () => FORMS.budgets(),
  'add-goal': () => FORMS.goal(),
  'edit-incomes': (id) => FORMS.incomes(find('incomes', id)),
  'edit-charges': (id) => FORMS.charges(find('charges', id)),
  'edit-savingsPlans': (id) => FORMS.savingsPlans(find('savingsPlans', id)),
  'edit-budgets': (id) => FORMS.budgets(find('budgets', id)),
  'edit-goal': (id) => FORMS.goal(find('goals', id)),
  'feed-goal': (id) => {
    const g = find('goals', id);
    openForm({
      title: g.name,
      fields: [
        { name: 'amount', label: 'Montant (€)', type: 'amount' },
        { name: 'dir', label: 'Opération', type: 'chips', options: [{ value: 'in', label: '➕ Je mets de côté' }, { value: 'out', label: '➖ Je retire' }] },
      ],
      values: { dir: 'in' },
      onSave: ({ amount, dir }) => {
        upsert('goals', { ...g, saved: Math.max(0, (g.saved || 0) + (dir === 'out' ? -amount : amount)) });
        toast(dir === 'out' ? 'Retrait noté' : 'Bravo, c’est de côté 💪');
      },
    });
  },
  'emergency-goal': () => {
    const fixed = computeMonth(state, ui.month).charges;
    upsert('goals', { name: 'Fonds d’urgence', target: Math.max(300, Math.round(fixed)), saved: 0 });
  },
  export: exportData,
  reset: () => {
    if (account.user) return toast('Vous êtes connecté : utilisez « Se déconnecter » ou « Supprimer mon compte »');
    if (confirm('Effacer toutes les données de ce téléphone ? (pensez à exporter avant)')) {
      state = emptyState();
      commit();
    }
  },
  'auth-google': () => withBusy(() => cloud.signInGoogle()),
  'auth-reset': () => {
    const email = document.querySelector('#auth-form [name=email]')?.value.trim();
    if (!email) return toast('Entrez d’abord votre e-mail');
    withBusy(async () => {
      await cloud.resetPassword(email);
      toast('E-mail de réinitialisation envoyé');
    });
  },
  'auth-signout': () => {
    if (!confirm('Se déconnecter ? Les données seront retirées de ce téléphone (elles restent dans votre compte).')) return;
    disconnect();
    withBusy(async () => {
      await cloud.signOut();
      state = emptyState();
      commit();
    });
  },
  'auth-delete': () => {
    if (!confirm('Supprimer définitivement votre compte et vos données en ligne ? Cette action est irréversible.')) return;
    withBusy(async () => {
      await cloud.deleteAccount(account.user.uid);
      disconnect();
      state = emptyState();
      commit();
      toast('Compte supprimé');
    });
  },
};

document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) return ACTIONS.tab(tab.dataset.tab);
  const el = e.target.closest('[data-action]');
  if (el && ACTIONS[el.dataset.action]) ACTIONS[el.dataset.action](el.dataset.id);
});

document.addEventListener('submit', (e) => {
  if (e.target.id === 'auth-form') {
    e.preventDefault();
    const fd = new FormData(e.target);
    const email = String(fd.get('email')).trim();
    const password = String(fd.get('password'));
    return withBusy(() => (e.submitter?.value === 'signup' ? cloud.signUp(email, password) : cloud.signIn(email, password)));
  }
  if (e.target.id !== 'settings-form') return;
  e.preventDefault();
  const fd = new FormData(e.target);
  state.settings = { ...state.settings, name: String(fd.get('name')).trim(), updatedAt: Date.now() };
  commit();
  toast('Enregistré');
});

document.addEventListener('change', async (e) => {
  if (e.target.id !== 'import-file' || !e.target.files[0]) return;
  try {
    const incoming = JSON.parse(await e.target.files[0].text());
    if (!COLLECTIONS.every((c) => Array.isArray(incoming[c]))) throw new Error('format');
    const before = state.transactions.length;
    state = mergeStates(state, incoming);
    commit();
    toast(`Fusion réussie (${state.transactions.length - before >= 0 ? '+' : ''}${state.transactions.length - before} dépenses)`);
  } catch {
    toast('Fichier non reconnu');
  }
  e.target.value = '';
});

async function exportData() {
  const name = `budget-duo-${(state.settings.name || 'moi').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${isoDate(today())}.json`;
  const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Budget Duo' });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Questionnaire de départ ----------

let wiz = null; // { step, answers }

const SITUATIONS = [
  { value: 'etudiant', label: '🎒 Étudiant·e' },
  { value: 'alternant', label: '🎓 Alternant·e' },
  { value: 'salarie', label: '💼 Salarié·e' },
  { value: 'autre', label: '✨ Autre' },
];

const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => (o[k] ??= {}), obj)[last] = value;
}

function wizAmount(path, label, hint = '') {
  const [group, id] = path.split('.');
  const v = getPath(wiz.answers, path);
  return `<label class="wiz-row"><span>${cat(id).emoji} ${label}${hint ? `<small>${hint}</small>` : ''}</span>
    <input data-path="${path}" data-group="${group}" inputmode="decimal" placeholder="0" autocomplete="off" value="${v ? String(v).replace('.', ',') : ''}"><b>€</b></label>`;
}

const wizTotal = (group, label) =>
  `<div class="wiz-total"><span>${label}</span><span id="wiz-total" data-group="${group}">${money(sumGroup(group))}</span></div>`;
const sumGroup = (group) => Object.values(wiz.answers[group] || {}).reduce((s, v) => s + (Number(v) || 0), 0);

const WIZ_STEPS = [
  () => `<h2>Faisons le point en 2 minutes 👋</h2>
    <p class="lead">Quelques questions sur votre argent. À la fin, l’appli construit votre budget et vous dit <strong>combien vous pouvez dépenser par jour</strong> pour tenir jusqu’à la fin du mois.</p>
    <label class="field"><span>Votre prénom</span><input data-path="name" maxlength="20" autocomplete="given-name" value="${esc(wiz.answers.name || '')}"></label>
    <div class="field"><span>Vous êtes…</span><div class="chips">${SITUATIONS
      .map((o) => `<label><input type="radio" name="situation" data-path="situation" value="${o.value}" ${wiz.answers.situation === o.value ? 'checked' : ''}><span>${o.label}</span></label>`)
      .join('')}</div></div>
    <p class="muted small">🔒 Vos réponses restent sur votre téléphone (ou dans votre compte si vous en créez un).</p>
    ${cloud.cloudEnabled && !account.user ? '<button class="link-btn" data-action="wiz-login">Déjà un compte ? Se connecter</button>' : ''}`,

  () => {
    const salaire = { alternant: 'Salaire d’alternance', etudiant: 'Salaire / alternance', salarie: 'Salaire' }[wiz.answers.situation] || 'Salaire';
    return `<h2>Combien gagnez-vous par mois ?</h2>
    <p class="lead">Les montants qui arrivent vraiment sur votre compte (net). Laissez vide ce qui ne vous concerne pas.</p>
    ${wizAmount('incomes.salaire', salaire)}
    ${wizAmount('incomes.job', 'Petit job, missions')}
    ${wizAmount('incomes.aides', 'CAF, APL, bourse')}
    ${wizAmount('incomes.famille', 'Aide de la famille')}
    ${wizAmount('incomes.revenuautre', 'Autre revenu')}
    ${wizTotal('incomes', 'Total par mois')}
    <label class="wiz-row"><span>📅 Jour de paie <small>Pour savoir quand le mois recommence</small></span>
      <input data-path="payDay" type="number" min="1" max="31" inputmode="numeric" placeholder="ex. 28" value="${esc(wiz.answers.payDay || '')}"></label>`;
  },

  () => `<h2>Votre logement</h2>
    <p class="lead">Ce que vous payez chaque mois pour vous loger.</p>
    ${wizAmount('charges.loyer', 'Loyer', 'Si l’APL est versée au propriétaire : le reste à payer')}
    ${wizAmount('charges.energie', 'Électricité / gaz')}
    ${wizAmount('charges.internet', 'Box internet')}
    ${wizAmount('charges.assurance', 'Assurance habitation / mutuelle')}
    ${wizTotal('charges', 'Charges fixes jusqu’ici')}`,

  () => `<h2>Vos abonnements et prélèvements</h2>
    <p class="lead">Astuce : ouvrez votre appli bancaire et regardez tout ce qui part automatiquement chaque mois.</p>
    ${wizAmount('charges.telephone', 'Forfait téléphone')}
    ${wizAmount('charges.navigo', 'Abonnement transport', 'Navigo, bus, train…')}
    ${wizAmount('charges.streaming', 'Netflix, Spotify, Disney+…')}
    ${wizAmount('charges.sport', 'Salle de sport')}
    ${wizAmount('charges.credit', 'Crédit, paiement en plusieurs fois')}
    ${wizAmount('charges.chargeautre', 'Autre prélèvement')}
    ${wizTotal('charges', 'Total charges fixes')}`,

  () => `<h2>Et au quotidien, vous dépensez à peu près…</h2>
    <p class="lead">Par mois. Une estimation suffit : c’est souvent ici que l’argent part sans qu’on s’en rende compte.</p>
    ${wizAmount('spending.courses', 'Courses', 'Supermarché, produits du quotidien')}
    ${wizAmount('spending.resto', 'Resto, fast-food, livraison', 'Uber Eats, McDo, kebab, cafés…')}
    ${wizAmount('spending.sorties', 'Sorties & loisirs', 'Bars, ciné, soirées…')}
    ${wizAmount('spending.shopping', 'Shopping', 'Vêtements, achats en ligne…')}
    ${wizAmount('spending.autre', 'Autre', 'Tabac, jeux, divers…')}
    ${wizTotal('spending', 'Total du quotidien')}`,

  () => {
    const income = sumGroup('incomes');
    const free = income - sumGroup('charges');
    wiz.answers.savings ??= suggestSavings(wiz.answers);
    return `<h2>Mettre un peu de côté</h2>
    <p class="lead">Après vos charges fixes, il vous reste <strong>${money(free)}</strong> par mois.
      Le bon réflexe : mettre de côté <strong>dès la paie</strong>, pas « ce qui reste à la fin » (il ne reste jamais rien).</p>
    ${free > 0 ? `<div class="alert good small">Conseil pour vous : <strong>${money(suggestSavings(wiz.answers))} par mois</strong>. Même 20 € suffisent pour commencer.</div>` : '<div class="alert warn small">Vos charges dépassent vos revenus : on commence sans épargne, il faut d’abord rééquilibrer.</div>'}
    <label class="wiz-row"><span>🐷 Montant à mettre de côté</span>
      <input data-path="savings" inputmode="decimal" placeholder="0" autocomplete="off" value="${wiz.answers.savings ? String(wiz.answers.savings).replace('.', ',') : ''}"><b>€</b></label>`;
  },

  () => {
    const plan = buildPlan(wiz.answers);
    const r = plan.summary;
    const name = wiz.answers.name ? `, ${esc(wiz.answers.name)}` : '';
    const diag = [];
    if (r.available <= 0) {
      diag.push(`<div class="alert bad"><strong>Le problème principal : vos charges</strong>Charges fixes + épargne dépassent vos revenus de ${money(-r.available)} par mois. Avant tout : réduire une charge (forfait, abonnements, crédit) ou augmenter les revenus (APL, prime d’activité, heures en plus).</div>`);
    } else if (r.dryDay) {
      diag.push(`<div class="alert warn"><strong>Voilà pourquoi vous êtes à sec vers le ${r.dryDay}</strong>Vos dépenses du quotidien (≈ ${money(r.estimated)}) dépassent ce qui reste après les charges (${money(r.available)}) : il manque <strong>${money(r.overspend)} par mois</strong>.${r.biggestSpending ? ` Le plus gros poste : <strong>${esc(cat(r.biggestSpending).label.toLowerCase())}</strong>.` : ''} Les enveloppes ci-dessous sont calculées pour tenir tout le mois.</div>`);
    } else if (r.estimated > 0) {
      diag.push(`<div class="alert good"><strong>Vos habitudes tiennent dans votre budget 👍</strong>Il reste environ ${money(r.available - r.estimated)} de marge par mois. Le secret maintenant : noter vos dépenses pour vérifier.</div>`);
    }
    if (r.chargePct > 50) diag.push(`<div class="alert warn small">Vos charges fixes représentent <strong>${r.chargePct} %</strong> de vos revenus (repère : 50 % maximum).</div>`);
    const subs = (Number(wiz.answers.charges?.streaming) || 0) + (Number(wiz.answers.charges?.sport) || 0);
    if (subs >= 20) diag.push(`<div class="alert warn small">Abonnements : ${money(subs)} par mois, soit <strong>${money(subs * 12)} par an</strong>. Lesquels utilisez-vous vraiment ?</div>`);

    return `<h2>Votre budget${name} 🎯</h2>
    ${r.available > 0 ? `<section class="card hero"><div class="label">Pour tenir tout le mois, dépensez au maximum</div><div class="big">${money(r.perDay)}</div><div class="sub">par jour (hors loyer et abonnements, déjà comptés)</div></section>` : ''}
    <section class="card"><div class="flow">
      <div class="flow-row"><span>Revenus</span><span class="pos">${money(r.income, true)}</span></div>
      <div class="flow-row"><span>Charges fixes</span><span>${money(-r.charges)}</span></div>
      <div class="flow-row"><span>Épargne</span><span>${money(-r.savings)}</span></div>
      <div class="flow-row total"><span>Reste pour le quotidien</span><span class="${r.available < 0 ? 'neg' : ''}">${money(r.available)}</span></div>
    </div></section>
    ${diag.join('')}
    ${plan.budgets.length ? `<section class="card"><h2>Vos enveloppes du mois</h2><ul class="list">${plan.budgets
      .map((b) => `<li><div class="emoji">${cat(b.category).emoji}</div><div class="grow title">${esc(cat(b.category).label)}</div><div class="amount">${money(b.amount)}</div></li>`)
      .join('')}</ul><p class="muted small">Une partie est gardée en marge pour les imprévus. Tout reste modifiable dans l’onglet Budget.</p></section>` : ''}`;
  },
];

function openWizard() {
  const prev = state.settings.answers;
  wiz = {
    step: 0,
    answers: prev ? structuredClone(prev) : { name: state.settings.name || '', incomes: {}, charges: {}, spending: {} },
  };
  document.body.classList.add('wizard-open');
  renderWizard();
}

function closeWizard() {
  wiz = null;
  document.body.classList.remove('wizard-open');
  $('#wizard').hidden = true;
  $('#wizard').innerHTML = '';
}

function renderWizard() {
  const last = WIZ_STEPS.length - 1;
  const el = $('#wizard');
  el.hidden = false;
  el.innerHTML = `<div class="wiz">
    <div class="wiz-top"><span class="muted small">${wiz.step < last ? `Question ${wiz.step + 1} sur ${last}` : 'Résultat'}</span>
      ${wiz.step < last ? '<button class="link-btn" data-action="wiz-skip">Passer</button>' : ''}</div>
    <div class="wiz-progress"><i style="width:${(wiz.step / last) * 100}%"></i></div>
    ${WIZ_STEPS[wiz.step]()}
  </div>
  <div class="wiz-foot"><div class="btn-row">
    ${wiz.step > 0 ? `<button class="btn ghost" data-action="wiz-prev">${wiz.step === last ? 'Modifier' : 'Retour'}</button>` : ''}
    ${wiz.step < last
      ? `<button class="btn" data-action="wiz-next">${wiz.step === last - 1 ? 'Voir mon budget' : 'Continuer'}</button>`
      : '<button class="btn" data-action="wiz-apply">Créer mon budget</button>'}
  </div></div>`;
  el.scrollTop = 0;
}

// Enregistre les champs de l'écran courant dans wiz.answers.
function readWizard() {
  for (const input of document.querySelectorAll('#wizard [data-path]')) {
    const path = input.dataset.path;
    if (input.type === 'radio') {
      if (input.checked) setPath(wiz.answers, path, input.value);
    } else if (path === 'name') {
      wiz.answers.name = input.value.trim();
    } else if (path === 'payDay') {
      const d = parseInt(input.value, 10);
      wiz.answers.payDay = d >= 1 && d <= 31 ? d : null;
    } else {
      const v = parseAmount(input.value);
      setPath(wiz.answers, path, v > 0 ? v : 0);
    }
  }
}

function wizardGo(delta) {
  readWizard();
  if (delta > 0 && wiz.step === 1 && sumGroup('incomes') <= 0) return toast('Indiquez au moins un revenu');
  wiz.step = Math.max(0, Math.min(WIZ_STEPS.length - 1, wiz.step + delta));
  renderWizard();
}

function applyPlan() {
  const plan = buildPlan(wiz.answers);
  const now = Date.now();
  // Le bilan remplace le budget prévu (revenus, charges, épargne, enveloppes) ; les dépenses notées restent.
  for (const col of ['incomes', 'charges', 'savingsPlans', 'budgets']) {
    for (const it of state[col]) state.deleted[it.id] = now;
    state[col] = plan[col].map((it) => ({ ...it, id: uid(), from: ui.month, updatedAt: now }));
  }
  if (!state.goals.some((g) => g.name === 'Fonds d’urgence') && plan.summary.charges > 0) {
    state.goals.push({ id: uid(), name: 'Fonds d’urgence', target: Math.max(300, Math.round(plan.summary.charges)), saved: 0, updatedAt: now });
  }
  state.settings = { ...state.settings, name: wiz.answers.name || state.settings.name, onboarded: true, answers: wiz.answers, updatedAt: now };
  closeWizard();
  ui.tab = 'home';
  commit();
  toast('Votre budget est prêt ✨');
}

// Total en direct sur les écrans de montants.
document.addEventListener('input', (e) => {
  const group = e.target.dataset?.group;
  const out = document.getElementById('wiz-total');
  if (!wiz || !group || !out || out.dataset.group !== group) return;
  let sum = 0;
  for (const input of document.querySelectorAll(`#wizard [data-group="${group}"]`)) {
    if (input !== out) sum += parseAmount(input.value) || 0;
  }
  // Les montants du même groupe saisis sur un autre écran (charges : logement + abonnements).
  const here = new Set([...document.querySelectorAll(`#wizard input[data-group="${group}"]`)].map((i) => i.dataset.path.split('.')[1]));
  for (const [k, v] of Object.entries(wiz.answers[group] || {})) if (!here.has(k)) sum += Number(v) || 0;
  out.textContent = money(sum);
});

// ---------- Compte & synchro ----------

const account = { user: null };
let syncer = null;
const syncInfo = { status: 'off', message: '' };
let busy = false;

function setSyncStatus(status, message = '') {
  Object.assign(syncInfo, { status, message });
  const el = document.getElementById('sync-status');
  if (el) el.innerHTML = syncStatusText();
}

// Ne pas effacer un formulaire en cours de saisie.
const safeRender = () => {
  const el = document.activeElement;
  if (!el || el === document.body || !$('#screen').contains(el)) render();
};

async function withBusy(fn) {
  if (busy) return;
  busy = true;
  document.body.classList.add('busy');
  try {
    await fn();
  } catch (err) {
    toast(cloud.errorMessage(err));
  } finally {
    busy = false;
    document.body.classList.remove('busy');
  }
}

function stopSync() {
  syncer?.stop();
  syncer = null;
}

async function connectBudget() {
  stopSync();
  setSyncStatus('connecting');
  try {
    const adapter = await cloud.userAdapter(account.user.uid);
    syncer = createSync(adapter, {
      getState: () => state,
      onRemote: (merged) => {
        state = merged;
        persist();
        if (wiz && state.settings.onboarded) closeWizard();
        safeRender();
      },
      onStatus: (status, message) => setSyncStatus(status, status === 'error' ? cloud.errorMessage({ message }) : ''),
    });
  } catch (err) {
    setSyncStatus('error', cloud.errorMessage(err));
  }
}

function disconnect() {
  stopSync();
  account.user = null;
  setSyncStatus('off');
}

async function onSignedIn(user) {
  if (account.user?.uid === user.uid) return;
  account.user = user;
  render();
  // Premier passage : ce qui est déjà noté sur l'appareil part dans le compte.
  await connectBudget();
}

// ---------- Démarrage ----------

render();
// Premier lancement : le questionnaire construit le budget.
if (!state.settings.onboarded && !state.incomes.length && !state.charges.length) openWizard();
if (cloud.cloudEnabled) {
  cloud.onUser((user) => {
    if (user) onSignedIn(user);
    else if (account.user) {
      disconnect();
      render();
    }
  }).catch(() => setSyncStatus('offline'));
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
