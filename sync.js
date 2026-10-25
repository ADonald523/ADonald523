// Synchronisation automatique entre les deux téléphones.
// Toute la sauvegarde du couple vit dans un seul document Firestore,
// identifié par un code secret partagé via le lien d'invitation.
import { mergeStates, fingerprint } from './calc.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';

// Adaptateur Firestore : subscribe() écoute le document, transact() le met à jour atomiquement.
export async function firestoreAdapter(config, code) {
  const [{ initializeApp, getApps }, fs] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = getApps()[0] || initializeApp(config);
  const db = fs.getFirestore(app);
  const ref = fs.doc(db, 'couples', code);
  const parse = (snap) => (snap.exists() ? JSON.parse(snap.data().json) : null);
  return {
    subscribe: (onData, onError) => fs.onSnapshot(ref, (snap) => onData(parse(snap)), onError),
    transact: (update) => fs.runTransaction(db, async (tx) => {
      const next = update(parse(await tx.get(ref)));
      tx.set(ref, { json: JSON.stringify(next), updatedAt: fs.serverTimestamp() });
    }),
  };
}

// getState() : état local ; onRemote(state) : appliquer un état fusionné ;
// onStatus('ok' | 'syncing' | 'offline' | 'error', message?)
export function createSync(adapter, { getState, onRemote, onStatus }) {
  let timer = null;
  let pushing = false;
  let again = false;

  async function push() {
    if (pushing) return void (again = true);
    pushing = true;
    onStatus('syncing');
    try {
      await adapter.transact((remote) => (remote ? mergeStates(getState(), remote) : getState()));
      onStatus('ok');
    } catch (err) {
      onStatus(navigator.onLine === false ? 'offline' : 'error', err?.message);
    } finally {
      pushing = false;
      if (again) {
        again = false;
        push();
      }
    }
  }

  const schedule = (delay = 600) => {
    clearTimeout(timer);
    timer = setTimeout(push, delay);
  };

  const unsubscribe = adapter.subscribe(
    (remote) => {
      const local = getState();
      const merged = remote ? mergeStates(local, remote) : local;
      if (fingerprint(merged) !== fingerprint(local)) onRemote(merged);
      if (!remote || fingerprint(merged) !== fingerprint(remote)) schedule(0);
      else if (!pushing) onStatus('ok');
    },
    (err) => onStatus('error', err?.message),
  );

  const onOnline = () => schedule(0);
  globalThis.addEventListener?.('online', onOnline);

  return {
    changed: () => schedule(),
    stop: () => {
      clearTimeout(timer);
      unsubscribe();
      globalThis.removeEventListener?.('online', onOnline);
    },
  };
}

// Code couple : 24 caractères aléatoires, impossible à deviner.
export function newCoupleCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
}

// Accepte le bloc copié depuis la console Firebase (`const firebaseConfig = { apiKey: "…", … }`).
export function parseFirebaseConfig(text) {
  const config = {};
  for (const [, key, value] of String(text).matchAll(/["']?(\w+)["']?\s*:\s*["']([^"']*)["']/g)) config[key] = value;
  return config.apiKey && config.projectId && config.appId ? config : null;
}

export const encodeInvite = (sync) =>
  btoa(unescape(encodeURIComponent(JSON.stringify(sync)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function decodeInvite(s) {
  try {
    const json = decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
    const sync = JSON.parse(json);
    return sync?.code && sync?.config?.projectId ? sync : null;
  } catch {
    return null;
  }
}
