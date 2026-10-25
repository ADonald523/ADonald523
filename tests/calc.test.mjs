import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMonth, mergeStates, shiftMonth, daysInMonth } from '../calc.js';

const base = () => ({
  settings: {},
  incomes: [
    { id: 'i1', amount: 1000 },
    { id: 'i2', amount: 900 },
  ],
  charges: [
    { id: 'c1', amount: 600 },
    { id: 'c2', amount: 50 },
  ],
  savingsPlans: [{ id: 's1', amount: 50 }],
  budgets: [{ id: 'b1', category: 'courses', amount: 300 }],
  goals: [],
  transactions: [],
  deleted: {},
});

test('dates de mois', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(daysInMonth('2028-02'), 29);
});

test('reste à vivre et budget par jour', () => {
  const s = base();
  s.transactions.push({ id: 't1', type: 'expense', category: 'courses', amount: 200, date: '2026-10-05' });
  const r = computeMonth(s, '2026-10', new Date(2026, 9, 11));
  assert.equal(r.income, 1900);
  assert.equal(r.charges, 650);
  assert.equal(r.available, 1200);
  assert.equal(r.remaining, 1000);
  assert.equal(r.daysLeft, 21);
  assert.equal(r.byCategory.courses.spent, 200);
  assert.equal(r.byCategory.courses.budget, 300);
});

test('projection : date à laquelle on est à sec', () => {
  const s = base();
  // 1200 € disponibles, 600 € dépensés en 5 jours => 120 €/jour => à sec le 10
  s.transactions.push({ id: 't1', type: 'expense', category: 'resto', amount: 600, date: '2026-10-02' });
  const r = computeMonth(s, '2026-10', new Date(2026, 9, 5));
  assert.equal(r.dryDay, 10);
});

test('pas d\'alerte si le rythme tient', () => {
  const s = base();
  s.transactions.push({ id: 't1', type: 'expense', category: 'resto', amount: 100, date: '2026-10-02' });
  const r = computeMonth(s, '2026-10', new Date(2026, 9, 10));
  assert.equal(r.dryDay, null);
});

test('revenus ponctuels comptés', () => {
  const s = base();
  s.transactions.push({ id: 't1', type: 'income', category: 'job', amount: 150, date: '2026-10-20' });
  assert.equal(computeMonth(s, '2026-10').income, 2050);
  assert.equal(computeMonth(s, '2026-11').income, 1900);
});

test('fusion : plus récent gagne, suppressions respectées', () => {
  const a = { ...base(), transactions: [
    { id: 'x', amount: 10, updatedAt: 1 },
    { id: 'y', amount: 20, updatedAt: 1 },
  ] };
  const b = { ...base(), transactions: [
    { id: 'x', amount: 15, updatedAt: 2 },
    { id: 'z', amount: 30, updatedAt: 1 },
  ], deleted: { y: 5 } };
  const m = mergeStates(a, b);
  const byId = Object.fromEntries(m.transactions.map((t) => [t.id, t.amount]));
  assert.deepEqual(byId, { x: 15, z: 30 });
});
