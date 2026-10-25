import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSync, randomToken } from '../sync.js';

// Faux Firestore : un document partagé, notifications asynchrones comme le vrai.
function fakeServer() {
  let doc = null;
  const listeners = new Set();
  const notify = () => listeners.forEach((l) => setTimeout(() => l(doc && structuredClone(doc)), 1));
  return {
    adapter: () => ({
      subscribe(onData) {
        listeners.add(onData);
        setTimeout(() => onData(doc && structuredClone(doc)), 1);
        return () => listeners.delete(onData);
      },
      async transact(update) {
        await new Promise((r) => setTimeout(r, 2));
        doc = structuredClone(update(doc && structuredClone(doc)));
        notify();
      },
    }),
    get doc() { return doc; },
  };
}

const empty = (name) => ({
  version: 1, settings: { p1: name, p2: '', splitP1: 50, updatedAt: 0 },
  incomes: [], charges: [], savingsPlans: [], budgets: [], goals: [], transactions: [], deleted: {},
});

function device(server, name) {
  const d = { state: empty(name), remoteUpdates: 0 };
  d.sync = createSync(server.adapter(), {
    getState: () => d.state,
    onRemote: (s) => { d.state = s; d.remoteUpdates++; },
    onStatus: (s) => { d.status = s; },
  });
  d.add = (col, item) => { d.state[col].push({ updatedAt: Date.now(), ...item }); d.sync.changed(); };
  d.del = (col, id) => { d.state[col] = d.state[col].filter((x) => x.id !== id); d.state.deleted[id] = Date.now(); d.sync.changed(); };
  return d;
}

const settle = () => new Promise((r) => setTimeout(r, 1500));
const ids = (d) => d.state.transactions.map((t) => t.id).sort();

test('deux téléphones convergent, suppressions comprises, sans boucle infinie', async () => {
  const server = fakeServer();
  const a = device(server, 'Donald');
  const b = device(server, 'Elle');
  a.add('transactions', { id: 't1', amount: 10 });
  b.add('transactions', { id: 't2', amount: 20 });
  await settle();
  assert.deepEqual(ids(a), ['t1', 't2']);
  assert.deepEqual(ids(b), ['t1', 't2']);

  b.del('transactions', 't1');
  await settle();
  assert.deepEqual(ids(a), ['t2']);
  assert.deepEqual(ids(b), ['t2']);

  const before = a.remoteUpdates + b.remoteUpdates;
  await settle();
  assert.equal(a.remoteUpdates + b.remoteUpdates, before, 'plus aucune mise à jour une fois synchronisés');
  assert.equal(a.status, 'ok');
  a.sync.stop();
  b.sync.stop();
});

test('jetons d’invitation aléatoires', () => {
  const a = randomToken();
  assert.match(a, /^[\w-]{24}$/);
  assert.notEqual(a, randomToken());
});
