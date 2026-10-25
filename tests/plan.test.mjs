import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, suggestSavings } from '../plan.js';

const student = {
  incomes: { salaire: 1100, aides: 150 },
  payDay: 28,
  charges: { loyer: 550, telephone: 15, streaming: 25, navigo: 0 },
  spending: { courses: 250, resto: 200, sorties: 150, shopping: 100 },
  savings: 50,
};

test('le budget est construit à partir des réponses', () => {
  const p = buildPlan(student);
  assert.deepEqual(p.incomes.map((i) => i.category), ['salaire', 'aides']);
  assert.equal(p.incomes[0].day, 28);
  assert.deepEqual(p.charges.map((c) => c.category), ['loyer', 'telephone', 'streaming'], 'les charges à 0 sont ignorées');
  assert.equal(p.savingsPlans[0].amount, 50);
  assert.equal(p.summary.available, 1250 - 590 - 50);
});

test('habitudes trop chères : diagnostic et enveloppes réduites', () => {
  const p = buildPlan(student);
  // 610 € disponibles, 700 € de dépenses habituelles => à sec vers le 26
  assert.equal(p.summary.overspend, 90);
  assert.equal(p.summary.dryDay, 26);
  assert.equal(p.summary.biggestSpending, 'courses');
  const sum = p.budgets.reduce((s, b) => s + b.amount, 0);
  assert.ok(sum <= 610 * 0.9, `enveloppes (${sum}) dans le reste à vivre moins la marge`);
  assert.ok(p.budgets.every((b) => b.amount % 5 === 0));
});

test('habitudes raisonnables : enveloppes = habitudes, pas d’alerte', () => {
  const p = buildPlan({ ...student, spending: { courses: 200, sorties: 100 } });
  assert.equal(p.summary.dryDay, null);
  assert.deepEqual(p.budgets, [{ category: 'courses', amount: 200 }, { category: 'sorties', amount: 100 }]);
});

test('sans habitudes déclarées : répartition type', () => {
  const p = buildPlan({ ...student, spending: {} });
  assert.ok(p.budgets.length >= 5);
  assert.equal(p.budgets.find((b) => b.category === 'courses').amount, 215); // 40 % de (610 € − 10 % de marge) arrondi à 5
});

test('charges supérieures aux revenus', () => {
  const p = buildPlan({ incomes: { job: 400 }, charges: { loyer: 450 }, spending: { courses: 100 }, savings: 0 });
  assert.equal(p.summary.dryDay, 1);
  assert.deepEqual(p.budgets, []);
  assert.equal(suggestSavings({ incomes: { job: 400 }, charges: { loyer: 450 } }), 0);
});

test('épargne conseillée', () => {
  // 10 % de 1250 € = 125 €, 20 % de ce qui reste après charges (660 €) = 132 € → 125 €
  assert.equal(suggestSavings({ ...student, spending: { courses: 300 } }), 125);
  // Dépenses habituelles (700 €) > ce qui reste (660 €) : on commence petit
  assert.equal(suggestSavings(student), 20);
});
