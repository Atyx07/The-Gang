# The Gang - Version Numérique Multijoueur

Ce projet recrée fidèlement le jeu coopératif **The Gang** en ligne, avec l'ambiance visuelle du jeu de cartes (table en feutre, jetons de poker, cartes de jeu rétro et ambiance braquage).

## 🚀 Fonctionnalités
- Salons multijoueurs privés par code (2 à 6 joueurs).
- Lien d'invitation direct en 1 clic.
- Logique complète des phases : Pré-flop, Flop, Turn, River.
- Attribution et échange muet de jetons d'estimation entre complices.
- Résolution automatique par moteur de poker officiel (`pokersolver`) : calcul de la meilleure main à 5 cartes, détection des inversions et déclenchement des alarmes.

---

## 🛠️ Option 1 : Lancer en local sur sa machine (Gratuit)

### Prérequis
- Installer **Node.js** (version 18 ou supérieure) : https://nodejs.org

### Commandes
1. Extraire le dossier du projet.
2. Ouvrir un terminal dans le dossier et exécuter :
   ```bash
   npm install
   npm start
   ```
3. Ouvrir votre navigateur sur `http://localhost:3000`.

Pour jouer avec vos amis depuis chez vous sans configurer de box internet, vous pouvez utiliser un tunnel gratuit comme **ngrok** :
```bash
npx ngrok http 3000
```
Donnez simplement le lien généré par ngrok à vos amis.

---

## ☁️ Option 2 : Héberger gratuitement en ligne (Accessible 24/7)

La méthode la plus simple et 100% gratuite sans carte bancaire est **Render** :

1. Créez un compte gratuit sur [GitHub](https://github.com) et mettez les fichiers de ce projet dans un nouveau dépôt privé ou public.
2. Créez un compte gratuit sur [Render.com](https://render.com).
3. Cliquez sur **New +** > **Web Service**.
4. Liez votre dépôt GitHub.
5. Renseignez simplement :
   - **Environment** : `Node`
   - **Build Command** : `npm install`
   - **Start Command** : `node server.js`
   - **Plan** : `Free`
6. Cliquez sur **Deploy Web Service**.
7. En 2 minutes, Render vous donne une URL publique (ex: `https://the-gang-game.onrender.com`) accessible par tous vos amis sur PC, Mac ou mobile !
