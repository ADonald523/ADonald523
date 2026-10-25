// Transforme les réponses du questionnaire de départ en budget (calcul pur, testable).
//
// answers = {
//   incomes:  { salaire, job, aides, famille, revenuautre },          montants mensuels
//   payDay:   jour de paie (1–31) ou null
//   charges:  { loyer, energie, internet, assurance, telephone, navigo, streaming, sport, credit, chargeautre },
//   spending: { courses, resto, sorties, shopping, autre },           estimations mensuelles (optionnel)
//   savings:  montant à mettre de côté chaque mois
// }

const total = (obj = {}) => Object.values(obj).reduce((s, v) => s + (Number(v) || 0), 0);
const floor5 = (n) => Math.max(0, Math.floor(n / 5) * 5);
const entries = (obj = {}) => Object.entries(obj).filter(([, v]) => Number(v) > 0);

// Répartition par défaut du reste à vivre quand on ne connaît pas les habitudes.
export const DEFAULT_SPLIT = { courses: 0.4, resto: 0.12, sorties: 0.15, shopping: 0.1, sante: 0.08, autre: 0.15 };
// Part du reste à vivre gardée en marge pour les imprévus.
const MARGIN = 0.1;

// Épargne conseillée : 10 % des revenus, sans dépasser 20 % de ce qui reste après les charges.
// Si les dépenses habituelles mangent déjà tout, on commence petit (20 €) pour prendre l'habitude.
export function suggestSavings(answers) {
  const income = total(answers.incomes);
  const free = income - total(answers.charges);
  if (free <= 0) return 0;
  const ideal = floor5(Math.min(income * 0.1, free * 0.2));
  return free - total(answers.spending) < ideal ? Math.min(ideal, 20) : ideal;
}

export function buildPlan(answers) {
  const income = total(answers.incomes);
  const charges = total(answers.charges);
  const savings = Number(answers.savings) || 0;
  const available = income - charges - savings;
  const estimated = total(answers.spending);
  const day = Number(answers.payDay) || null;

  // Enveloppes : les habitudes déclarées si elles tiennent dans le reste à vivre,
  // sinon réduites à proportion ; à défaut, une répartition type.
  const room = available * (1 - MARGIN);
  let budgets = [];
  if (available > 0) {
    if (estimated > 0) {
      const factor = estimated > room ? room / estimated : 1;
      budgets = entries(answers.spending).map(([category, v]) => ({ category, amount: floor5(v * factor) }));
    } else {
      budgets = Object.entries(DEFAULT_SPLIT).map(([category, share]) => ({ category, amount: floor5(room * share) }));
    }
    budgets = budgets.filter((b) => b.amount > 0);
  }

  // Diagnostic : avec les habitudes déclarées, quel jour serait-on à sec ?
  let dryDay = null;
  if (available <= 0) dryDay = 1;
  else if (estimated > available) dryDay = Math.max(1, Math.floor(available / (estimated / 30)));

  return {
    incomes: entries(answers.incomes).map(([category, amount]) => ({ category, amount: Number(amount), day })),
    charges: entries(answers.charges).map(([category, amount]) => ({ category, amount: Number(amount) })),
    savingsPlans: savings > 0 ? [{ category: 'epargne', amount: savings, day }] : [],
    budgets,
    summary: {
      income, charges, savings, available, estimated, dryDay,
      overspend: Math.max(0, estimated - available),
      perDay: available > 0 ? available / 30 : 0,
      chargePct: income > 0 ? Math.round((charges / income) * 100) : 0,
      biggestSpending: entries(answers.spending).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    },
  };
}
