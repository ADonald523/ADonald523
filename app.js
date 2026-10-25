import { computeMonth, mergeStates, monthKey, shiftMonth, shareOf, activeIn, pad, COLLECTIONS } from './calc.js';

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
  { id: 'credit', label: 'Crédit / remboursement', emoji: '🏦' },
  { id: 'chargeautre', label: 'Autre charge', emoji: '📄' },
];
const INCOME_KINDS = [
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
  settings: { p1: 'Moi', p2: 'Ma copine', splitP1: 50, updatedAt: 0 },
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
const ui = { tab: 'home', view: 'all', ...load(UI_KEY, {}), month: monthKey() };

function persist() {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(state));
    localStorage.setItem(UI_KEY, JSON.stringify({ tab: ui.tab, view: ui.view }));
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
const ownerName = (o) => (o === 'shared' ? 'Commun' : state.settings[o] || o);
const viewName = (v) => (v === 'all' ? 'Nous deux' : state.settings[v]);
const inView = (item) => shareOf(item.owner, ui.view, state.settings.splitP1) > 0;

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

  $('#view-switch').innerHTML = ['all', 'p1', 'p2']
    .map((v) => `<button role="tab" data-action="view" data-id="${v}" aria-selected="${ui.view === v}">${esc(viewName(v))}</button>`)
    .join('');

  for (const b of document.querySelectorAll('#tabbar button')) b.classList.toggle('active', b.dataset.tab === ui.tab);

  const screens = { home: renderHome, tx: renderTransactions, plan: renderPlan, save: renderSavings, settings: renderSettings };
  $('#screen').innerHTML = (screens[ui.tab] || renderHome)();
}

function renderHome() {
  const r = computeMonth(state, ui.month, ui.view);
  const out = [];

  const steps = [
    [state.incomes.length, 'Ajoutez vos revenus du mois (alternance, job, CAF…)', 'add-income'],
    [state.charges.length, 'Listez vos charges fixes (loyer, téléphone, abonnements…)', 'add-charge'],
    [state.savingsPlans.length, 'Décidez d’un petit montant à mettre de côté', 'add-saving'],
    [state.budgets.length, 'Fixez des enveloppes (courses, sorties…)', 'add-budget'],
    [state.transactions.length, 'Notez chaque dépense avec le bouton +', 'add-expense'],
  ];
  if (steps.some(([ok]) => !ok)) {
    out.push(`<section class="card"><h2>Pour bien démarrer</h2><ol class="steps">${steps
      .map(([ok, text, action]) => `<li class="${ok ? 'done' : ''}">${ok ? text : `<button class="link-btn" data-action="${action}">${text}</button>`}</li>`)
      .join('')}</ol></section>`);
  }

  let heroLabel = 'Il vous reste pour le quotidien';
  let heroSub = '';
  if (r.isCurrent) {
    heroSub = r.remaining > 0
      ? `soit <strong>${money(r.perDay)} / jour</strong> pendant ${r.daysLeft} jour${r.daysLeft > 1 ? 's' : ''}`
      : 'Le budget du mois est dépassé';
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
    .filter((c) => activeIn(c, ui.month) && inView(c) && (!r.isCurrent || (c.day || 1) >= r.dayNow))
    .sort((a, b) => (a.day || 1) - (b.day || 1));
  if (upcoming.length && !r.isPast) {
    out.push(`<section class="card"><h2>Prélèvements à venir <small>${money(upcoming.reduce((s, c) => s + shareAmount(c), 0))}</small></h2><ul class="list">${upcoming
      .slice(0, 6)
      .map((c) => `<li><div class="emoji">${cat(c.category).emoji}</div><div class="grow"><div class="title">${esc(c.label)}</div><div class="muted small">le ${c.day || 1} · ${esc(ownerName(c.owner))}</div></div><div class="amount">${money(shareAmount(c))}</div></li>`)
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

const shareAmount = (it) => (Number(it.amount) || 0) * shareOf(it.owner, ui.view, state.settings.splitP1);

function monthTransactions() {
  return state.transactions
    .filter((t) => t.date.startsWith(ui.month) && inView(t))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.updatedAt || 0) - (a.updatedAt || 0));
}

function txRow(t) {
  const c = cat(t.category);
  const isIncome = t.type === 'income';
  return `<li><button class="row" data-action="edit-tx" data-id="${t.id}">
    <div class="emoji">${c.emoji}</div>
    <div class="grow"><div class="title">${esc(t.note || c.label)}</div><div class="muted small">${esc(c.label)} · ${esc(ownerName(t.owner))}</div></div>
    <div class="amount ${isIncome ? 'pos' : ''}">${money(isIncome ? shareAmount(t) : -shareAmount(t))}</div>
  </button></li>`;
}

function renderTransactions() {
  const list = monthTransactions();
  const head = `<div class="btn-row"><button class="btn" data-action="add-expense">+ Dépense</button><button class="btn ghost" data-action="add-extra-income">+ Rentrée d’argent</button></div>`;
  if (!list.length) return head + `<div class="empty">Aucune dépense notée ce mois-ci.<br>Le secret : noter <strong>tout</strong>, même le café à 1,50 €.</div>`;

  const r = computeMonth(state, ui.month, ui.view);
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
      <div class="grow"><div class="title">${esc(it.label || cat(it.category).label)}</div><div class="muted small">${esc(ownerName(it.owner))}${it.day ? ` · le ${it.day}` : ''}</div></div>
      <div class="amount">${money(shareAmount(it))}</div>
    </button></li>`)
    .join('')}</ul>`;
}

function renderPlan() {
  const r = computeMonth(state, ui.month, ui.view);
  const mine = (col) => state[col].filter((x) => activeIn(x, ui.month) && inView(x)).sort((a, b) => (a.day || 0) - (b.day || 0) || shareAmount(b) - shareAmount(a));
  const recurringIncome = mine('incomes').reduce((s, x) => s + shareAmount(x), 0);
  const budgets = mine('budgets');
  const budgeted = budgets.reduce((s, b) => s + shareAmount(b), 0);
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
        const total = r.byCategory[b.category]?.budget || shareAmount(b);
        return `<li><button class="row" data-action="edit-budgets" data-id="${b.id}"><div class="emoji">${cat(b.category).emoji}</div><div class="grow"><div class="flow-row"><span class="title">${esc(cat(b.category).label)}</span><span class="small muted">${money(shareAmount(b))} · ${esc(ownerName(b.owner))}</span></div>${bar(spent, total)}</div></button></li>`;
      })
      .join('')}</ul>` : ''}
    <div class="flow-row small" style="margin-top:8px"><span class="muted">Non réparti</span><span class="${free < 0 ? 'neg' : ''}">${money(free)}</span></div>
    ${free < 0 ? '<p class="small neg">Vos enveloppes dépassent le reste à vivre : réduisez-en une.</p>' : ''}
    <button class="link-btn" data-action="add-budget">+ Ajouter une enveloppe</button></section>`;
}

function renderSavings() {
  const plans = state.savingsPlans.filter((p) => activeIn(p, ui.month) && inView(p));
  const goals = state.goals.filter(inView);
  const monthly = plans.reduce((s, p) => s + shareAmount(p), 0);
  const fixed = computeMonth(state, ui.month, ui.view).charges;

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
        <div class="flow-row small muted" style="margin-top:4px"><span>${esc(ownerName(g.owner))} · ${pct(g.saved || 0, g.target)} %</span><button class="link-btn" data-action="feed-goal" data-id="${g.id}">+ / − argent</button></div>
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
  <section class="card"><h2>Vous deux</h2>
    <form id="settings-form">
      <div class="grid2">
        <label class="field"><span>Prénom 1</span><input name="p1" value="${esc(s.p1)}" maxlength="20"></label>
        <label class="field"><span>Prénom 2</span><input name="p2" value="${esc(s.p2)}" maxlength="20"></label>
      </div>
      <label class="field"><span>Partage des dépenses communes : <strong id="split-out">${s.splitP1} % / ${100 - s.splitP1} %</strong></span>
        <input name="splitP1" type="range" min="0" max="100" step="5" value="${s.splitP1}"></label>
      <p class="muted small">Astuce : partager au prorata des revenus est souvent plus juste que 50/50.${splitHint()}</p>
      <button class="btn" type="submit">Enregistrer</button>
    </form>
  </section>

  <section class="card"><h2>Synchroniser entre vos deux téléphones</h2>
    <p class="small">Les données restent sur ce téléphone (rien n’est envoyé sur internet). Pour être à jour tous les deux :</p>
    <ol class="steps small">
      <li>L’un appuie sur <strong>Envoyer mes données</strong> (WhatsApp, mail…)</li>
      <li>L’autre ouvre le fichier avec <strong>Importer et fusionner</strong></li>
      <li>Puis l’inverse, pour que les deux aient tout</li>
    </ol>
    <div class="btn-row"><button class="btn" data-action="export">Envoyer mes données</button>
    <label class="btn ghost" style="text-align:center">Importer et fusionner<input type="file" accept="application/json,.json" id="import-file" hidden></label></div>
  </section>

  <section class="card"><h2>Les 5 règles pour finir le mois</h2>
    <div class="tip small"><strong>1. Regarder le « par jour », pas le solde.</strong> Le solde du compte ment : il ne montre pas le loyer qui tombe dans 10 jours.</div>
    <div class="tip small"><strong>2. Se payer en premier.</strong> L’épargne part le jour de la paie, automatiquement.</div>
    <div class="tip small"><strong>3. Tout noter, tout de suite.</strong> Ce sont les petites dépenses (snacks, Uber Eats, cafés) qui vident le compte.</div>
    <div class="tip small"><strong>4. Chasser les charges fixes.</strong> Un abonnement à 10 € = 120 € par an. Forfait mobile à 5–10 € suffit.</div>
    <div class="tip small"><strong>5. Vérifier vos aides.</strong> APL, prime d’activité (dès 18 ans en alternance si vous gagnez assez) : simulez sur caf.fr.</div>
  </section>

  <section class="card"><h2>Données</h2>
    <button class="btn danger" data-action="reset">Tout effacer sur ce téléphone</button></section>`;
}

function splitHint() {
  const inc = (o) => state.incomes.filter((i) => i.owner === o && activeIn(i, ui.month)).reduce((s, i) => s + i.amount, 0);
  const a = inc('p1');
  const b = inc('p2');
  if (!a || !b) return '';
  return ` Avec vos revenus actuels : <strong>${pct(a, a + b)} % / ${100 - pct(a, a + b)} %</strong>.`;
}

// ---------- Formulaires (feuille du bas) ----------

let currentForm = null;

function ownerOptions() {
  return [
    { value: 'p1', label: state.settings.p1 },
    { value: 'p2', label: state.settings.p2 },
    { value: 'shared', label: '👫 Commun' },
  ];
}
const catOptions = (list) => list.map((c) => ({ value: c.id, label: `${c.emoji} ${c.label}` }));
const defaultOwner = () => (ui.view === 'all' ? state.settings.lastOwner || 'p1' : ui.view);

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
      { name: 'owner', label: 'Qui ?', type: 'chips', options: ownerOptions() },
      { name: 'date', label: 'Date', type: 'date' },
      { name: 'note', label: 'Note (optionnel)', type: 'text', placeholder: isIncome ? 'ex. heures sup, remboursement…' : 'ex. Lidl, McDo, cinéma…' },
    ],
    values: { category: isIncome ? 'job' : 'courses', owner: defaultOwner(), date: defaultDate(), ...t },
    onSave: (d) => {
      if (ui.view === 'all') state.settings.lastOwner = d.owner;
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
    { name: 'owner', label: 'À qui ?', type: 'chips', options: ownerOptions() },
  ];
  if (withDay) fields.push({ name: 'day', label: 'Jour du mois', type: 'day', placeholder: 'ex. 5' });
  openForm({
    title: item?.id ? `Modifier` : title,
    fields,
    values: { category: cats[0].id, owner: defaultOwner(), ...item },
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
      { name: 'owner', label: 'Pour qui ?', type: 'chips', options: ownerOptions() },
    ],
    values: { category: 'courses', owner: defaultOwner(), ...it },
    onSave: (d) => upsert('budgets', { from: ui.month, ...it, ...d }),
    onDelete: it?.id ? () => remove('budgets', it.id) : null,
  }),
  goal: (g) => openForm({
    title: g?.id ? 'Modifier l’objectif' : 'Nouvel objectif',
    fields: [
      { name: 'name', label: 'Objectif', type: 'text', placeholder: 'ex. Vacances d’été' },
      { name: 'amount', label: 'Montant visé (€)', type: 'amount' },
      { name: 'owner', label: 'Pour qui ?', type: 'chips', options: ownerOptions() },
    ],
    values: { owner: 'shared', amount: g?.target, ...g },
    onSave: ({ amount, ...d }) => upsert('goals', { saved: 0, ...g, ...d, name: d.name || 'Objectif', target: amount }),
    onDelete: g?.id ? () => remove('goals', g.id) : null,
  }),
};

// ---------- Actions ----------

const find = (col, id) => state[col].find((x) => x.id === id);

const ACTIONS = {
  'prev-month': () => { ui.month = shiftMonth(ui.month, -1); render(); },
  'next-month': () => { ui.month = shiftMonth(ui.month, 1); render(); },
  view: (id) => { ui.view = id; persist(); render(); },
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
    const fixed = computeMonth(state, ui.month, 'all').charges;
    upsert('goals', { name: 'Fonds d’urgence', target: Math.max(300, Math.round(fixed)), saved: 0, owner: 'shared' });
  },
  export: exportData,
  reset: () => {
    if (confirm('Effacer toutes les données de ce téléphone ? (pensez à exporter avant)')) {
      state = emptyState();
      commit();
    }
  },
};

document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) return ACTIONS.tab(tab.dataset.tab);
  const el = e.target.closest('[data-action]');
  if (el && ACTIONS[el.dataset.action]) ACTIONS[el.dataset.action](el.dataset.id);
});

document.addEventListener('input', (e) => {
  if (e.target.name === 'splitP1') {
    const v = Number(e.target.value);
    $('#split-out').textContent = `${v} % / ${100 - v} %`;
  }
});

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'settings-form') return;
  e.preventDefault();
  const fd = new FormData(e.target);
  state.settings = {
    ...state.settings,
    p1: String(fd.get('p1')).trim() || 'Moi',
    p2: String(fd.get('p2')).trim() || 'Ma copine',
    splitP1: Number(fd.get('splitP1')),
    updatedAt: Date.now(),
  };
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
  const name = `budget-duo-${(state.settings.p1 || 'moi').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${isoDate(today())}.json`;
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

// ---------- Démarrage ----------

render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
