# LANDCHAIN – Frontend

## Phase 4 – Étape 1 : connexion au backend blockchain

Cette étape branche l'écran **Web3 Wallet** sur le contrat `LandRegistry` déployé
par le projet Hardhat. La connexion utilise MetaMask et `ethers`, avec le réseau
local Hardhat (`chain ID 31337`) et l'adresse du déploiement local.

Les données suivantes restent volontairement fictives jusqu'à l'étape 2 :

- le solde ETH ;
- la liste des transactions ;
- les formulaires de vérification et de transfert.

L'étape 2 commence l'intégration métier : le registre lit les événements et les
biens du contrat, et le formulaire d'enregistrement calcule localement le
SHA-256 du PDF avant d'envoyer uniquement cette empreinte à la blockchain.
L'enregistrement nécessite un portefeuille ayant `AGENT_ROLE` (par exemple
`Account #1` après `npm run setup:local`). `Account #0` est l'administrateur
technique et ne peut pas enregistrer un bien, conformément aux règles du
contrat.

## Démarrage local

Dans un terminal, lancer la blockchain et le contrat :

```powershell
cd ..\landchain-contracts
npx hardhat node
```

Dans un deuxième terminal :

```powershell
cd ..\landchain-contracts
npm run setup:local
```

Dans MetaMask, ajouter le réseau local avec les paramètres suivants :

- RPC URL : `http://127.0.0.1:8545`
- Chain ID : `31337`
- Symbole : `ETH`

Importer ensuite un compte de test affiché par `npx hardhat node`.

Dans un troisième terminal, démarrer l'interface :

```powershell
npm install
npm run dev
```

Ouvrir l'URL Vite, aller dans **Web3 Wallet**, puis cliquer sur **Connect
MetaMask**. L'interface vérifie le réseau et vérifie que le bytecode du contrat
est présent à l'adresse déployée avant de considérer la connexion valide.

## Adresse du contrat

L'adresse par défaut est celle du déploiement Hardhat local :
`0x5FbDB2315678afcb367f032d93F642f64180aa3`.

Pour utiliser une autre adresse sans modifier le code, définir
`VITE_LANDREGISTRY_ADDRESS` avant `npm run dev` ou `npm run build`.
