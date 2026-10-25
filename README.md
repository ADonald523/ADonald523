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
1. Sur GitHub : *Settings → Pages → Branch* : choisir la branche, dossier `/ (root)`, *Save*.
2. Ouvrir l'adresse donnée (`https://<pseudo>.github.io/<repo>/`) sur le téléphone.
3. **Ajouter à l'écran d'accueil** (Safari : bouton Partager → « Sur l'écran d'accueil » ; Chrome : menu ⋮ → « Installer l'application »).

### En local
```bash
npm start      # puis ouvrir http://localhost:8080
npm test       # tests des calculs
```
(Il faut passer par un petit serveur : ouvrir `index.html` directement ne marche pas à cause des modules JS.)

## Synchroniser à deux
Chacun a ses données sur son téléphone. Régulièrement (ex. le dimanche) :
1. Réglages → **Envoyer mes données** → l'envoyer à l'autre.
2. L'autre : Réglages → **Importer et fusionner**.
3. Puis l'inverse. Rien n'est perdu : les doublons et suppressions sont gérés.

## Structure
| Fichier | Rôle |
|---|---|
| `index.html`, `styles.css` | Interface (mobile d'abord, mode sombre auto) |
| `app.js` | Écrans, formulaires, stockage local, import/export |
| `calc.js` | Calculs purs (reste à vivre, budget/jour, projection, fusion) |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Installation sur téléphone + hors ligne |
| `tests/` | Tests (`node --test`) |
