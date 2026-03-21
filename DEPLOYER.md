# 🎯 Jeopardy! Online — Déploiement sur Railway

## Tester en local d'abord

1. Ouvre un terminal dans ce dossier (`jeopardy-online/`)
2. Lance :
   ```
   node server.js
   ```
3. Ouvre http://localhost:3000 dans ton navigateur
4. Partage ton IP locale avec tes amis sur le même Wi-Fi : http://TON_IP:3000

---

## Déployer sur Railway (gratuit, accessible partout)

### Étape 1 — Créer un dépôt GitHub
1. Va sur https://github.com/new
2. Crée un dépôt public (ex: `jeopardy-online`)
3. Dans ce dossier, ouvre un terminal et tape :
   ```
   git init
   git add .
   git commit -m "Jeopardy online"
   git remote add origin https://github.com/TON_PSEUDO/jeopardy-online.git
   git push -u origin main
   ```

### Étape 2 — Déployer sur Railway
1. Va sur https://railway.app et connecte-toi avec GitHub
2. Clique **New Project → Deploy from GitHub repo**
3. Sélectionne ton dépôt `jeopardy-online`
4. Railway détecte automatiquement Node.js et lance `npm start`
5. Dans **Settings → Networking → Generate Domain** pour avoir un lien public

### Étape 3 — Jouer !
- Envoie le lien Railway à tes amis
- Le premier à créer une salle est le **HOST** (il gère les réponses)
- Les autres rejoignent avec le code à 5 lettres

---

## Comment ça marche

| Rôle   | Peut faire |
|--------|-----------|
| HOST   | Cliquer les cases, révéler la réponse, valider ✅/❌, annuler ↩ |
| Joueur | Cliquer les cases quand c'est son tour |

Le HOST est le "présentateur" — il valide si la réponse dite à voix haute était correcte.
Idéal avec un appel Discord/téléphone en parallèle !
