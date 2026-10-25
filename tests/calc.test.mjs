import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMonth, mergeStates, shareOf, shiftMonth, daysInMonth } from '../calc.js';

const base = () => ({
  settings: { splitP1: 50 },
  incomes: [
    { id: 'i1', owner: 'p1', amount: 1000 },
    { id: 'i2', owner: 'p2', amount: 900 },
  ],
  charges: [
    { id: 'c1', owner: 'shared', amount: 600 },
    { id: 'c2', owner: 'p1', amount: 50 },
  ],
  savingsPlans: [{ id: 's1', owner: 'p1', amount: 50 }],
  budgets: [{ id: 'b1', owner: 'shared', category: 'courses', amount: 300 }],
  goals: [],
  transactions: [],
  deleted: {},
});

test('shareOf répartit les éléments communs', () => {
  assert.equal(shareOf('shared', 'p1', 60), 0.6);
  assert.equal(shareOf('shared', 'p2', 60), 0.4);
  assert.equal(shareOf('p1', 'p2'), 0);
  assert.equal(shareOf('p2', 'all'), 1);
});

test('dates de mois', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(daysInMonth('2028-02'), 29);
});

test('reste à vivre et budget par jour', () => {
  const s = base();
  s.transactions.push({ id: 't1', type: 'expense', owner: 'shared', category: 'courses', amount: 200, date: '2026-10-05' });
  const r = computeMonth(s, '2026-10', 'all', new Date(2026, 9, 11));
  assert.equal(r.income, 1900);
  assert.equal(r.charges, 650);
  assert.equal(r.available, 1200);
  assert.equal(r.remaining, 1000);
  assert.equal(r.daysLeft, 21);
  assert.equal(r.byCategory.courses.spent, 200);
  assert.equal(r.byCategory.courses.budget, 300);

  const p1 = computeMonth(s, '2026-10', 'p1', new Date(2026, 9, 11));
  assert.equal(p1.income, 1000);
  assert.equal(p1.charges, 350);
  assert.equal(p1.available, 600);
  assert.equal(p1.spent, 100);
});

test('projection : date à laquelle on est à sec', () => {
  const s = base();
  // 1200 € disponibles, 600 € dépensés en 5 jours => 120 €/jour => à sec le 10
  s.transactions.push({ id: 't1', type: 'expense', owner: 'p1', category: 'resto', amount: 600, date: '2026-10-02' });
  const r = computeMonth(s, '2026-10', 'all', new Date(2026, 9, 5));
  assert.equal(r.dryDay, 10);
});

test('pas d\'alerte si le rythme tient', () => {
  const s = base();
  s.transactions.push({ id: 't1', type: 'expense', owner: 'p1', category: 'resto', amount: 100, date: '2026-10-02' });
  const r = computeMonth(s, '2026-10', 'all', new Date(2026, 9, 10));
  assert.equal(r.dryDay, null);
});

test('revenus ponctuels comptés', () => {
  const s = base();
  s.transactions.push({ id: 't1', type: 'income', owner: 'p2', category: 'job', amount: 150, date: '2026-10-20' });
  assert.equal(computeMonth(s, '2026-10', 'p2').income, 1050);
  assert.equal(computeMonth(s, '2026-11', 'p2').income, 900);
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
