// Comptes utilisateurs et budgets dans le cloud (Firebase Auth + Firestore).
//
// Modèle : un document privé par utilisateur, users/{uid} = { json, updatedAt }.
// Les règles (firestore.rules) n'autorisent que son propriétaire à le lire ou l'écrire.
import { FIREBASE_CONFIG } from './firebase-config.js';

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
  'permission-denied': 'Accès refusé : reconnectez-vous.',
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

// Même interface que le faux serveur des tests : subscribe() + transact().
// Au premier passage le document n'existe pas : la synchro y envoie les données déjà notées.
export async function userAdapter(uid) {
  const { fs, db } = await load();
  const ref = fs.doc(db, 'users', uid);
  const parse = (snap) => (snap.exists() ? JSON.parse(snap.data().json) : null);
  return {
    subscribe: (onData, onError) => fs.onSnapshot(ref, (snap) => onData(parse(snap)), onError),
    transact: (update) => fs.runTransaction(db, async (tx) => {
      const next = update(parse(await tx.get(ref)));
      tx.set(ref, { json: JSON.stringify(next), updatedAt: fs.serverTimestamp() });
    }),
  };
}

// Suppression du compte et de ses données (RGPD).
export async function deleteAccount(uid) {
  const { fs, db, a } = await load();
  await fs.deleteDoc(fs.doc(db, 'users', uid));
  await a.currentUser.delete();
}
