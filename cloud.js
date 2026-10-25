// Comptes utilisateurs et budgets dans le cloud (Firebase Auth + Firestore).
//
// Modèle :
//   users/{uid}         { budgetId, me }      → le budget de l'utilisateur, et qui il est dedans (p1/p2)
//   budgets/{budgetId}  { members: [uid…], json, updatedAt, inviteToken?, joinWith? }
// Les règles (firestore.rules) limitent la lecture/écriture d'un budget à ses membres.
import { FIREBASE_CONFIG } from './firebase-config.js';
import { randomToken } from './sync.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';
export const cloudEnabled = Boolean(FIREBASE_CONFIG);

let sdk = null;
async function load() {
  if (sdk) return sdk;
  const [appMod, auth, fs] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = appMod.getApps()[0] || appMod.initializeApp(FIREBASE_CONFIG);
  const a = auth.getAuth(app);
  a.languageCode = 'fr';
  const db = fs.getFirestore(app);
  // Développement : `emulators: { auth: 'http://127.0.0.1:9099', firestore: ['127.0.0.1', 8080] }`
  const emu = FIREBASE_CONFIG.emulators;
  if (emu) {
    auth.connectAuthEmulator(a, emu.auth, { disableWarnings: true });
    fs.connectFirestoreEmulator(db, ...emu.firestore);
  }
  sdk = { auth, fs, a, db };
  return sdk;
}

const MESSAGES = {
  'auth/invalid-email': 'Adresse e-mail invalide.',
  'auth/missing-password': 'Entrez un mot de passe.',
  'auth/weak-password': 'Mot de passe trop court (6 caractères minimum).',
  'auth/email-already-in-use': 'Un compte existe déjà avec cet e-mail : connectez-vous.',
  'auth/invalid-credential': 'E-mail ou mot de passe incorrect.',
  'auth/wrong-password': 'E-mail ou mot de passe incorrect.',
  'auth/user-not-found': 'Aucun compte avec cet e-mail.',
  'auth/too-many-requests': 'Trop d’essais. Réessayez dans quelques minutes.',
  'auth/network-request-failed': 'Pas de connexion internet.',
  'auth/popup-closed-by-user': 'Connexion annulée.',
  'auth/requires-recent-login': 'Par sécurité, reconnectez-vous puis réessayez.',
  'permission-denied': 'Accès refusé (lien d’invitation expiré ou budget déjà complet ?).',
};
export const errorMessage = (err) => MESSAGES[err?.code] || err?.message || 'Erreur inconnue';

export async function onUser(cb) {
  const { auth, a } = await load();
  return auth.onAuthStateChanged(a, cb);
}

export async function signUp(email, password) {
  const { auth, a } = await load();
  return auth.createUserWithEmailAndPassword(a, email, password);
}

export async function signIn(email, password) {
  const { auth, a } = await load();
  return auth.signInWithEmailAndPassword(a, email, password);
}

export async function signInGoogle() {
  const { auth, a } = await load();
  return auth.signInWithPopup(a, new auth.GoogleAuthProvider());
}

export async function resetPassword(email) {
  const { auth, a } = await load();
  return auth.sendPasswordResetEmail(a, email);
}

export async function signOut() {
  const { auth, a } = await load();
  return auth.signOut(a);
}

export async function getProfile(uid) {
  const { fs, db } = await load();
  const snap = await fs.getDoc(fs.doc(db, 'users', uid));
  return snap.exists() && snap.data().budgetId ? snap.data() : null;
}

export async function saveProfile(uid, profile) {
  const { fs, db } = await load();
  await fs.setDoc(fs.doc(db, 'users', uid), profile);
}

// Nouveau budget dont l'utilisateur est l'unique membre, rempli avec `localState`.
export async function createBudget(uid, localState, me) {
  const { fs, db } = await load();
  const ref = fs.doc(fs.collection(db, 'budgets'));
  await fs.setDoc(ref, { members: [uid], json: JSON.stringify(localState), updatedAt: fs.serverTimestamp() });
  const profile = { budgetId: ref.id, me };
  await saveProfile(uid, profile);
  return profile;
}

let onMembers = null;
export const watchMembers = (cb) => {
  onMembers = cb;
};

// Même interface que le faux serveur des tests : subscribe() + transact().
export async function budgetAdapter(budgetId) {
  const { fs, db } = await load();
  const ref = fs.doc(db, 'budgets', budgetId);
  const parse = (snap) => (snap.exists() ? JSON.parse(snap.data().json) : null);
  return {
    subscribe: (onData, onError) => fs.onSnapshot(ref, (snap) => {
      onData(parse(snap));
      onMembers?.(snap.exists() ? snap.data().members : []);
    }, onError),
    transact: (update) => fs.runTransaction(db, async (tx) => {
      const next = update(parse(await tx.get(ref)));
      tx.update(ref, { json: JSON.stringify(next), updatedAt: fs.serverTimestamp() });
    }),
  };
}

// Lien d'invitation : …/#join=<budgetId>.<jeton>
export async function createInvite(budgetId) {
  const { fs, db } = await load();
  const token = randomToken();
  await fs.updateDoc(fs.doc(db, 'budgets', budgetId), { inviteToken: token });
  return `${budgetId}.${token}`;
}

export async function joinBudget(uid, invite) {
  const { fs, db } = await load();
  const [budgetId, token] = invite.split('.');
  await fs.updateDoc(fs.doc(db, 'budgets', budgetId), { members: fs.arrayUnion(uid), joinWith: token });
  const profile = { budgetId, me: 'p2' };
  await fs.setDoc(fs.doc(db, 'users', uid), profile);
  return profile;
}

// Quitter un budget partagé : on repart sur un budget perso avec une copie des données.
export async function leaveBudget(uid, budgetId, localState) {
  const { fs, db } = await load();
  await fs.updateDoc(fs.doc(db, 'budgets', budgetId), { members: fs.arrayRemove(uid) });
  return createBudget(uid, localState, 'p1');
}

// Suppression du compte (RGPD) : budget supprimé si on en est le seul membre.
export async function deleteAccount(uid, budgetId, members) {
  const { fs, db, a } = await load();
  const ref = fs.doc(db, 'budgets', budgetId);
  if (members.length <= 1) await fs.deleteDoc(ref);
  else await fs.updateDoc(ref, { members: fs.arrayRemove(uid) });
  await fs.deleteDoc(fs.doc(db, 'users', uid));
  await a.currentUser.delete();
}
