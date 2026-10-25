// Synchronisation d'un budget entre appareils (et entre partenaires).
// `adapter` donne accès au document distant : subscribe(onData, onError) et transact(update).
import { mergeStates, fingerprint } from './calc.js';

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

// Jeton aléatoire (invitations) : 24 caractères, impossible à deviner.
export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
}
