# LANDCHAIN – Smart contracts et déploiement local (Phases 2 et 3)

Registre foncier décentralisé de **démonstration** (données fictives, blockchain locale).
Ce prototype ne constitue pas un registre officiel et un transfert technique n'a aucune valeur juridique.

## Contenu

| Élément | Rôle |
|---|---|
| `contracts/LandRegistry.sol` | Contrat unique : rôles, biens, propositions, transferts, vérification d'empreinte, événements |
| `test/LandRegistry.test.js` | Tests unitaires (règles métier, rôles, propositions et cas malveillants) |
| `docs/DOCUMENTATION_TECHNIQUE.md` | Interface du contrat, événements, erreurs, traçabilité RM → code → tests |
| `scripts/` | Phase 3 : déploiement, données de démonstration, contrôle des permissions |
| `demo-documents/` | Documents fictifs dont l'empreinte est enregistrée par le script de données |
| `hardhat.config.js` | Solidity 0.8.28, optimiseur activé, réseau `localhost` (chaîne 31337) |

## Installation

Prérequis : Node.js 18 ou plus récent.
Depuis le dossier extrait `landchain-contracts-phase3_`, entrez d'abord dans le
sous-dossier qui contient `package.json` et `hardhat.config.js` :

```powershell
cd .\landchain-contracts\
npm install --legacy-peer-deps
npx hardhat compile
npx hardhat test
npx hardhat coverage
```

Si vous êtes déjà dans le dossier `landchain-contracts`, ne relancez pas la
commande `cd` : exécutez directement les quatre commandes suivantes. Une erreur
`ENOENT ... package.json` ou `HHE3: No Hardhat config file found` signifie que
les commandes sont exécutées depuis le dossier parent.

Si le téléchargement du compilateur Solidity est bloqué (hors ligne, pare-feu), le projet peut
compiler avec le paquet npm `solc` :

```bash
LANDCHAIN_SOLCJS=true npx hardhat test        # Linux / macOS
set LANDCHAIN_SOLCJS=true && npx hardhat test # Windows (cmd)
```

## Résultats

- 54 tests réussis
- Couverture : 100 % des instructions, 100 % des fonctions, 98,4 % des branches
- Une seule ligne non couverte, volontairement : le contrôle `OwnerChangedSinceRequest`
  (RM-12) de `approveTransfer`. Il est inatteignable avec le code actuel, car un bien n'a
  qu'une demande en attente à la fois et le titulaire ne change que par une validation.
  Il est conservé comme protection en profondeur si le contrat évolue.

## Rôles

| Acteur | Mécanisme |
|---|---|
| Administrateur technique | `DEFAULT_ADMIN_ROLE` : attribue et révoque les rôles uniquement |
| Agent foncier habilité | `AGENT_ROLE` : enregistre les biens, décide des transferts |
| Propriétaire | Déduit du champ `owner` du bien (aucun rôle) |
| Vérificateur | Aucun rôle : les fonctions de lecture sont ouvertes |

## Limite à connaître

Tout ce qui est stocké dans un contrat est **lisible par n'importe qui**. Le contrat ne contient donc
que des données non sensibles (adresse, référence de démonstration, empreinte SHA-256, statuts).
Les documents et les informations personnelles restent hors chaîne.

## Phase 3 : déploiement local

```bash
npm run node          # terminal 1 : nœud Hardhat (garder ouvert)
npm run setup:local   # terminal 2 : déploiement + données de démo + contrôles
```

Détails (comptes, scénarios, MetaMask) : `docs/PHASE3_DEPLOIEMENT_LOCAL.md`.

## Suite

Phase 4 : adapter la maquette React, brancher ethers.js et MetaMask à partir de `deployments/localhost.json`.

## Propositions de biens utilisateur

La phase 4 autorise un compte utilisateur à soumettre une proposition de bien avec
`submitLandProposal`. Cette proposition ne crée pas immédiatement un bien : seul un agent
foncier peut l'approuver avec `approveLandProposal` ou la refuser avec
`rejectLandProposal`. Le déposant peut annuler une proposition ouverte avec
`cancelLandProposal`.

Une seule proposition ouverte est permise par `landId`. Le contrat utilise l'index
`_openProposalOf` pour effectuer ce contrôle en temps constant ; il ne parcourt pas les
propositions déjà traitées. L'index est libéré après approbation, refus ou annulation.
Cette extension est volontaire et documentée : elle complète l'enregistrement définitif
réservé aux agents, au lieu de donner à l'utilisateur un accès direct à `registerLand`.
