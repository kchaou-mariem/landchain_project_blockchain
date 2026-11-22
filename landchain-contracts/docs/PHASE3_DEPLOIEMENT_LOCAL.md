# LANDCHAIN – Phase 3 : déploiement local

Objectif du cahier des charges : lancer la blockchain locale, déployer les contrats, configurer les comptes de test,
vérifier les transactions et les permissions.
Livrables : environnement local fonctionnel et scripts de déploiement.

## 1. Procédure (3 terminaux ou 2)

```bash
# Terminal 1 : nœud local (garder ouvert)
npm run node

# Terminal 2 : déploiement + données de démonstration + contrôles
npm run setup:local
```

`setup:local` enchaîne trois étapes, qui peuvent aussi être lancées séparément :

| Commande | Rôle | Fichiers produits |
|---|---|---|
| `npm run deploy:local` | Déploie `LandRegistry`, attribue `AGENT_ROLE` aux agents 1 et 2 | `deployments/localhost.json`, `deployments/LandRegistry.abi.json` |
| `npm run seed:local` | Crée 7 biens et 5 demandes de transfert (scénarios, section 3) | `deployments/localhost.seed.json` (identifiants de demande, gaz et durée par opération) |
| `npm run check:local` | Simule les opérations interdites et contrôle l'état final | aucun (code de sortie 1 si un contrôle échoue) |

Historique d'un bien, reconstitué à partir des événements :

```bash
npx hardhat history --land 1001 --network localhost
```

Sans nœud (réseau en mémoire, tout en une fois) : `npm run demo:memory`. Les tests automatiques des scripts :
`npx hardhat test` (fichier `test/Deployment.test.js`).

**Important : la chaîne Hardhat est en mémoire.** Si vous arrêtez `npm run node`, tout disparaît (contrat, biens, demandes).
Relancez alors `npm run setup:local`. Les scripts détectent ce cas et l'indiquent.

## 2. Comptes de test

Le nœud Hardhat crée 20 comptes publics, identiques chez tout le monde, avec 10 000 ETH fictifs chacun.
**Ne jamais les utiliser sur un réseau réel** : leurs clés privées sont connues de tous.

| Index | Nom | Rôle dans LANDCHAIN | Mécanisme |
|---|---|---|---|
| 0 | Admin | Administrateur technique | `DEFAULT_ADMIN_ROLE` (aussi déployeur) |
| 1 | Agent 1 | Agent foncier habilité | `AGENT_ROLE` |
| 2 | Agent 2 | Agent foncier habilité | `AGENT_ROLE` |
| 3 | Ahmed | Propriétaire | titulaire de 1001 et 1004 |
| 4 | Fatma | Propriétaire | titulaire de 1002 et 1005 |
| 5 | Mohamed | Propriétaire | titulaire de 1003 et 1006 |
| 6 | Sana | Acheteuse / vérificatrice | aucun rôle |
| 7 | Intrus | Compte sans droit | sert aux tests de refus |

Les adresses exactes sont affichées par `deploy:local` et enregistrées dans `deployments/localhost.json`.
Les noms sont de simples étiquettes locales : ils ne sont jamais écrits sur la chaîne (RM-18).

## 3. Scénarios de démonstration

| Bien | Scénario | État final | Règle illustrée |
|---|---|---|---|
| 1001 | Ahmed demande un transfert vers Sana, l'agent 1 valide | titulaire : Sana | RM-14 |
| 1002 | Fatma demande un transfert vers Mohamed, l'agent 2 refuse | titulaire : Fatma | RM-13, critère 8 |
| 1003 | Mohamed demande un transfert vers Ahmed, rien n'est décidé | demande en attente | à traiter en direct |
| 1004 | L'agent 1 suspend le bien | Suspendu | D5 (transfert refusé) |
| 1005 | Fatma demande puis annule | Actif, demande Annulée | D2 |
| 1006 | L'agent 1 met à jour l'empreinte (version 2 du document) | ancienne version = « différente » | RM-06 |
| 1007 | Bien détenu par l'agent 2, demande en attente | l'agent 2 ne peut pas décider | D3 |

Les documents fictifs sont dans `demo-documents/`. Leur empreinte SHA-256 est calculée à l'initialisation avec le
même algorithme que le navigateur. Pour la page Vérification : `TF-DEMO-TUN-0001.txt` donne « correspondante » sur le bien 1001,
`TF-DEMO-TUN-0001_MODIFIE.txt` (120 m² devenu 210 m²) donne « différente », et le bien 9999 donne « référence introuvable ».

## 4. Contrôles de `check:local`

Chaque ligne affiche la règle vérifiée. Ces opérations sont **simulées** (`staticCall`) : elles échouent comme sur la
chaîne, mais n'écrivent rien.

- Rôles : l'admin n'a pas `AGENT_ROLE`, un non-admin ne peut pas attribuer de rôle (RM-16, RM-17).
- Enregistrement : refus pour un propriétaire, pour l'admin, pour un doublon, une empreinte nulle, un titulaire nul, une référence vide (RM-01 à RM-03).
- Modification : un intrus ne peut changer ni l'empreinte ni le statut (RM-06).
- Transfert : non-titulaire, seconde demande en attente, nouveau titulaire invalide, bien suspendu, décision par un intrus ou par l'admin,
  décision sur une demande déjà traitée, annulation par un tiers, conflit d'intérêts (RM-07 à RM-11, D2, D3, D5).
- Vérification : correspondante, différente, introuvable (RM-22).
- État final : titulaires, statuts, compteurs et `reviewedBy` conformes aux scénarios.

## 5. Brancher MetaMask (préparation de la Phase 4)

1. Ajouter un réseau manuellement : RPC `http://127.0.0.1:8545`, identifiant de chaîne `31337`, symbole `ETH`.
2. Importer les comptes voulus avec leur clé privée (affichée par `npm run node` au démarrage, pour chaque compte de test).
3. Le frontend lira l'adresse du contrat dans `deployments/localhost.json` et l'ABI dans `deployments/LandRegistry.abi.json` (décision A8) :
   rien n'est codé en dur.

Si MetaMask affiche une erreur de nonce après un redémarrage du nœud : Paramètres > Avancé > « Effacer les données d'activité ».

## 6. Limites

- Le réseau local ne persiste rien et n'est pas un registre officiel.
- Les mesures de gaz et de durée (`localhost.seed.json`) sont celles de votre machine : le cahier ne fixe aucun objectif chiffré (§8.5).
- Le contrat est lisible par n'importe qui (§7 de la Phase 1) : les niveaux d'accès relèvent de l'interface et de la couche de service.
