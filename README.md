# Budget Duo 💸

Une application web (installable sur téléphone) pour **arrêter d'être à sec avant la fin du mois** :
suivre ses revenus, ses charges fixes, ses dépenses et son épargne. Chaque utilisateur a son compte et son budget privé.

## L'idée

Le solde du compte bancaire trompe : il ne montre pas le loyer qui tombe dans 10 jours.
L'appli calcule plutôt :

```
Revenus du mois (salaire, alternance, job, CAF…)
− Charges fixes (loyer, téléphone, abonnements…)
− Épargne (mise de côté dès la paie)
= Reste à vivre
− Ce qui est déjà dépensé
= Ce qu'il reste  →  ÷ jours restants  =  combien on peut dépenser PAR JOUR
```

Et elle prévient : *« À ce rythme, vous serez à sec vers le 18 »*.

## Fonctionnalités

- **Accueil** : reste du mois, budget par jour, alerte si le rythme est trop élevé, prélèvements à venir.
- **Dépenses** : ajout en 3 secondes avec le bouton `+`, par catégorie.
- **Budget** : revenus, charges fixes, enveloppes (courses, sorties…), avec des repères (charges ≤ 50 %, épargne ≈ 10 %).
- **Épargne** : virements automatiques prévus et objectifs (fonds d'urgence, vacances…).
- **Comptes** (e-mail ou Google) : budget sauvegardé dans le cloud et synchronisé en temps réel sur tous les appareils de l'utilisateur.
- Marche **sans compte** (données sur le téléphone) et **hors ligne**.
- **Suppression de compte** et des données en un clic (RGPD).

## Mise en production

L'appli fonctionne tout de suite en mode local. Pour activer les comptes, il faut **un projet Firebase
pour l'application**, créé une seule fois par l'éditeur (pas par les utilisateurs). Plan gratuit
*Spark*, sans carte bancaire, largement suffisant pour démarrer.

1. **Héberger le site** : GitHub → *Settings → Pages → Deploy from a branch* → la branche, dossier `/ (root)` → *Save*.
   Adresse : `https://adonald523.github.io/ADonald523/`.
2. **Créer le projet** sur [console.firebase.google.com](https://console.firebase.google.com) (Google Analytics inutile).
3. **Authentication** → *Commencer* → activer **E-mail/Mot de passe** et **Google**.
   Puis *Paramètres → Domaines autorisés* → ajouter `adonald523.github.io`.
4. **Firestore Database** → *Créer une base de données* → emplacement en Europe (ex. `eur3`), *mode production*.
5. Onglet **Règles** → coller le contenu de [`firestore.rules`](firestore.rules) → *Publier*.
6. ⚙️ **Paramètres du projet** → *Vos applications* → icône `</>` (Web) → *Enregistrer*,
   puis copier les valeurs de `firebaseConfig` dans [`firebase-config.js`](firebase-config.js) :
   ```js
   export const FIREBASE_CONFIG = {
     apiKey: '…',
     authDomain: '….firebaseapp.com',
     projectId: '…',
     appId: '…',
   };
   ```
   (Ces valeurs ne sont pas secrètes : la sécurité repose sur les règles Firestore.)
7. Commit + push : les utilisateurs voient la carte **Compte** dans *Réglages*.

### Sécurité des données
- Chaque utilisateur a **un document privé** (`users/{uid}`) : lui seul peut le lire, le modifier ou le supprimer.
- Personne ne peut lister les comptes ni lire les données d'un autre.

Les règles sont testées avec l'émulateur Firebase (lecture, écriture et listing par un autre compte
ou sans compte : refusés).

## Développement

```bash
npm start      # serveur local : http://localhost:8080
npm test       # tests des calculs et de la synchro
```
Ouvrir `index.html` directement ne marche pas (modules JS) : passer par `npm start`.

Pour tester les comptes sans toucher à la prod, lancer l'émulateur Firebase
(`npx firebase-tools emulators:start --project demo-budget`) et ajouter à `FIREBASE_CONFIG` :
`emulators: { auth: 'http://127.0.0.1:9099', firestore: ['127.0.0.1', 8081] }`.

## Structure

| Fichier | Rôle |
|---|---|
| `index.html`, `styles.css` | Interface (mobile d'abord, mode sombre auto) |
| `app.js` | Écrans, formulaires, stockage local, compte |
| `calc.js` | Calculs purs (reste à vivre, budget/jour, projection, fusion) |
| `sync.js` | Synchro du budget entre appareils (fusion sans conflit, hors ligne) |
| `cloud.js` | Comptes Firebase (Auth) et données (Firestore) |
| `firebase-config.js` | Configuration Firebase de l'application (`null` = mode local) |
| `firestore.rules`, `firebase.json` | Règles de sécurité et configuration de l'émulateur |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Installation sur téléphone + hors ligne |
| `tests/` | Tests (`node --test`) |

## Limites connues / suite
- Un utilisateur = un document Firestore (1 Mo max, soit plusieurs milliers de dépenses : des années d'usage).
  Pour une grosse base d'utilisateurs, passer à un document par dépense.
- Pas encore de connexion bancaire automatique (agrégateurs DSP2 type Powens ou Bridge : payants, avec contrat).
- Pour les stores (App Store / Play Store) : empaqueter la PWA avec Capacitor.
