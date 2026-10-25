# Budget Duo 💸

Une petite application (web, installable sur le téléphone) pour suivre **à deux** nos revenus,
charges fixes, dépenses et épargne — et surtout **arrêter d'être à sec le 20 du mois**.

## L'idée

Le solde du compte bancaire trompe : il ne montre pas le loyer qui tombe dans 10 jours.
L'appli calcule plutôt :

```
Revenus du mois (alternance, job, CAF…)
− Charges fixes (loyer, téléphone, abonnements…)
− Épargne (mise de côté dès la paie)
= Reste à vivre
− Ce qu'on a déjà dépensé
= Ce qu'il reste  →  ÷ jours restants  =  combien on peut dépenser PAR JOUR
```

Et elle prévient : *« À ce rythme, vous serez à sec vers le 18 »*.

## Fonctionnalités

- **Accueil** : reste du mois, budget par jour, alerte si le rythme est trop élevé, prélèvements à venir.
- **Vue « Nous deux » / toi / elle** : les dépenses communes sont partagées (50/50 ou au prorata, réglable).
- **Dépenses** : ajout en 3 secondes avec le bouton `+`, par catégorie et par personne.
- **Budget** : revenus mensuels, charges fixes, enveloppes (courses, sorties…) avec repères (charges ≤ 50 %, épargne ≈ 10 %).
- **Épargne** : virements automatiques prévus + objectifs (fonds d'urgence, vacances…).
- **Synchronisation** entre les deux téléphones par fichier (WhatsApp, mail…) avec fusion intelligente.
- Fonctionne **hors ligne**, aucune donnée envoyée sur internet, aucun compte à créer.

## L'utiliser

### Le plus simple : GitHub Pages (gratuit)
1. Sur GitHub : *Settings → Pages → Build and deployment* : *Deploy from a branch*, choisir la branche, dossier `/ (root)`, *Save*.
2. Attendre 1–2 min et ouvrir l'adresse donnée (ici `https://adonald523.github.io/ADonald523/`) sur le téléphone.
3. **Ajouter à l'écran d'accueil** (Safari : bouton Partager → « Sur l'écran d'accueil » ; Chrome : menu ⋮ → « Installer l'application »).

### En local
```bash
npm start      # puis ouvrir http://localhost:8080
npm test       # tests des calculs
```
(Il faut passer par un petit serveur : ouvrir `index.html` directement ne marche pas à cause des modules JS.)

## Synchroniser à deux (automatique)
Les deux téléphones voient les mêmes chiffres en temps réel, grâce à une base **Firebase** gratuite
(plan Spark, sans carte bancaire). À faire **une seule fois**, par l'un des deux :

1. [console.firebase.google.com](https://console.firebase.google.com) → *Créer un projet* (Google Analytics inutile).
2. *Créer → Firestore Database → Créer une base de données* → emplacement en Europe, *mode production*.
3. Onglet *Règles* : coller le contenu de [`firestore.rules`](firestore.rules) → *Publier*.
4. ⚙️ *Paramètres du projet* → *Vos applications* → icône `</>` (Web) → *Enregistrer* → copier le bloc `firebaseConfig`.
5. Dans l'appli : *Réglages → Synchro automatique* → coller le bloc → **Activer**.
6. **Inviter** → envoyer le lien à l'autre en message privé. Il/elle l'ouvre sur son téléphone : c'est tout.

Ce qui était déjà noté sur chaque téléphone est fusionné, sans doublons. Hors ligne, l'appli continue
de marcher et se resynchronise au retour du réseau.

> 🔒 Tout le budget est stocké dans un document dont le nom est un code secret aléatoire (24 caractères)
> contenu dans le lien d'invitation : ne partagez ce lien qu'entre vous deux.

Sans Firebase, il reste la **sauvegarde manuelle** (Réglages → envoyer / importer un fichier).

## Structure
| Fichier | Rôle |
|---|---|
| `index.html`, `styles.css` | Interface (mobile d'abord, mode sombre auto) |
| `app.js` | Écrans, formulaires, stockage local, import/export |
| `calc.js` | Calculs purs (reste à vivre, budget/jour, projection, fusion) |
| `sync.js` | Synchro automatique Firebase (chargée seulement si activée) |
| `firestore.rules` | Règles de sécurité à coller dans Firebase |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Installation sur téléphone + hors ligne |
| `tests/` | Tests (`node --test`) |
