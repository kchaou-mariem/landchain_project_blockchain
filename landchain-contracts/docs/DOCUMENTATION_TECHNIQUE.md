# LandRegistry – Documentation technique

Version : Phase 2 · Solidity 0.8.28 · OpenZeppelin Contracts 5.1.0 (`AccessControl`)

## 1. Types

| Type | Valeurs |
|---|---|
| `LandStatus` | `Actif` (0), `TransfertEnCours` (1), `Suspendu` (2) |
| `RequestStatus` | `EnAttente` (0), `Validee` (1), `Refusee` (2), `Annulee` (3) |
| `VerificationResult` | `Match` (0), `Mismatch` (1), `NotFound` (2) |

```solidity
struct Land {
    string  landRef;       // référence foncière de démonstration
    address owner;         // titulaire enregistré
    bytes32 documentHash;  // empreinte SHA-256 du document de référence
    LandStatus status;
    uint64  createdAt;     // date du bloc d'enregistrement
    bool    exists;
}

struct TransferRequest {
    uint256 landId;
    address currentOwner;  // titulaire au moment de la demande
    address proposedOwner;
    RequestStatus status;
    uint64  createdAt;
    address reviewedBy;    // agent décisionnaire (nul tant qu'il n'y a pas de décision)
    uint64  reviewedAt;
}

struct LandProposal {
    uint256 landId;
    string landRef;
    address proposedOwner;
    bytes32 documentHash;
    address submittedBy;
    uint64 createdAt;
    bool exists;
}
```

> Le champ s'appelle `landRef` et non `reference`, car `reference` est un mot réservé de Solidity.

## 2. Fonctions

### Écriture

| Fonction | Accès | Effet | Règles |
|---|---|---|---|
| `registerLand(landId, landRef, owner, documentHash)` | `AGENT_ROLE` | Enregistre un bien, statut `Actif` | RM-01 à RM-05 |
| `updateDocumentHash(landId, newHash)` | `AGENT_ROLE` | Remplace l'empreinte | RM-06 |
| `setLandStatus(landId, newStatus)` | `AGENT_ROLE` | Bascule `Actif` ↔ `Suspendu` | RM-06, D5 |
| `requestTransfer(landId, proposedOwner)` → `requestId` | Titulaire du bien | Crée une demande, bien en `TransfertEnCours` | RM-07 à RM-10 |
| `cancelTransferRequest(requestId)` | Demandeur | Annule une demande en attente | D2 |
| `approveTransfer(requestId)` | `AGENT_ROLE` | Valide, change le titulaire | RM-11, RM-12, RM-14, RM-15, D3 |
| `rejectTransfer(requestId)` | `AGENT_ROLE` | Refuse, titulaire inchangé | RM-11, RM-13, RM-15, D3 |
| `submitLandProposal(landId, landRef, proposedOwner, documentHash)` → `proposalId` | Tout compte | Soumet un bien en attente de validation par un agent | Phase 4 |
| `approveLandProposal(proposalId)` | `AGENT_ROLE` | Enregistre définitivement la proposition | Phase 4 |
| `rejectLandProposal(proposalId)` | `AGENT_ROLE` | Refuse une proposition et libère son `landId` | Phase 4 |
| `cancelLandProposal(proposalId)` | Déposant | Annule sa proposition ouverte et libère son `landId` | Phase 4 |
| `grantRole`, `revokeRole` | Administrateur | Gère les rôles (OpenZeppelin) | RM-16, RM-17 |

### Lecture (ouverte à tout compte)

| Fonction | Retour |
|---|---|
| `getLand(landId)` | `Land`, ou erreur `LandNotFound` |
| `getTransferRequest(requestId)` | `TransferRequest`, ou erreur `RequestNotFound` |
| `pendingRequestOf(landId)` | `requestId` en attente, 0 si aucune |
| `landExists(landId)` | `bool` |
| `verifyDocument(landId, documentHash)` | `Match`, `Mismatch` ou `NotFound` |
| `landCount()`, `requestCount()`, `pendingRequestCount()` | Compteurs pour le tableau de bord |

### Propositions utilisateur

Le dépôt par un utilisateur est une extension assumée du cahier initial : l'agent reste le
seul compte qui crée le bien définitif, mais un autre compte peut préparer une proposition.
Une seule proposition ouverte est autorisée par `landId`. Le contrat conserve cet index dans
`_openProposalOf`, ce qui rend le contrôle constant et évite de parcourir tout l'historique
des propositions à chaque dépôt. L'index est supprimé après approbation, refus ou annulation.
Le déposant peut annuler sa propre proposition ; cette possibilité évite qu'une proposition
erronée ou déposée par un tiers bloque définitivement un identifiant.

## 3. Événements

| Événement | Paramètres | Émis par |
|---|---|---|
| `LandRegistered` | `landId`*, `owner`*, `documentHash`, `registeredBy` | `registerLand` |
| `DocumentHashUpdated` | `landId`*, `oldHash`, `newHash`, `updatedBy` | `updateDocumentHash` |
| `LandStatusChanged` | `landId`*, `oldStatus`, `newStatus`, `changedBy` | `setLandStatus` |
| `TransferRequested` | `requestId`*, `landId`*, `currentOwner`, `proposedOwner` | `requestTransfer` |
| `TransferApproved` | `requestId`*, `landId`*, `reviewedBy` | `approveTransfer` |
| `TransferRejected` | `requestId`*, `landId`*, `reviewedBy` | `rejectTransfer` |
| `TransferCancelled` | `requestId`*, `landId`*, `cancelledBy` | `cancelTransferRequest` |
| `OwnershipChanged` | `landId`*, `previousOwner`*, `newOwner`*, `requestId` | `approveTransfer` |
| `RoleGranted`, `RoleRevoked` | Fournis par OpenZeppelin | `grantRole`, `revokeRole` |
| `LandProposalSubmitted` | `proposalId`*, `landId`*, `landRef`, `proposedOwner`, `documentHash`, `submittedBy` | `submitLandProposal` |
| `LandProposalApproved` | `proposalId`*, `landId`*, `reviewedBy` | `approveLandProposal` |
| `LandProposalRejected` | `proposalId`*, `landId`*, `reviewedBy` | `rejectLandProposal` |
| `LandProposalCancelled` | `proposalId`*, `landId`*, `cancelledBy` | `cancelLandProposal` |

\* paramètre `indexed`, utilisable comme filtre. Attention à l'ordre : pour les événements `Transfer*`,
`requestId` est le premier paramètre indexé et `landId` le second.
Le numéro de bloc, l'identifiant de transaction et l'adresse de l'émetteur sont fournis par le journal
de la blockchain (exigence du §5.6 du cahier).

## 4. Erreurs personnalisées

`InvalidAdmin`, `InvalidLandId`, `EmptyReference`, `InvalidOwner`, `InvalidDocumentHash`,
`LandAlreadyExists(landId)`, `LandNotFound(landId)`, `SameDocumentHash`,
`InvalidStatusChange(current, requested)`, `NotLandOwner(landId, caller)`, `LandIsSuspended(landId)`,
`PendingRequestExists(landId, requestId)`, `InvalidProposedOwner`, `RequestNotFound(requestId)`,
`RequestNotPending(requestId, status)`, `NotRequester(requestId, caller)`,
`ConflictOfInterest(requestId, caller)`, `OwnerChangedSinceRequest(requestId)`,
et `AccessControlUnauthorizedAccount(account, neededRole)` fournie par OpenZeppelin.
`ProposalNotFound(proposalId)`, `ProposalAlreadyExists(landId)` et
`NotProposalSubmitter(proposalId, caller)` concernent les propositions utilisateur.

L'interface traduira ces erreurs en messages français (décision D6).

## 5. Évolutions par rapport à la Phase 1

| Changement | Raison |
|---|---|
| Champ `reference` renommé `landRef` | `reference` est un mot réservé de Solidity |
| Ajout de l'événement `TransferCancelled` | Décision D2 : l'annulation doit être tracée |
| Ajout de `landCount`, `requestCount`, `pendingRequestCount`, `landExists` | Alimenter le tableau de bord sans parcourir les données |
| `setLandStatus` limité à `Actif` ↔ `Suspendu`, interdit si une demande est en attente | Évite un état incohérent : `TransfertEnCours` est géré uniquement par le contrat |
| Erreur `SameDocumentHash` | Évite un événement `DocumentHashUpdated` sans changement réel |

## 6. Traçabilité des règles métier

| Règle | Où dans le contrat | Tests (groupe) |
|---|---|---|
| RM-01 identifiant unique | `registerLand` : `LandAlreadyExists` | Enregistrement |
| RM-02 agent seul | `onlyRole(AGENT_ROLE)` | Enregistrement |
| RM-03 champs obligatoires | `registerLand` : 4 vérifications | Enregistrement |
| RM-04 événement par opération | tous les événements | Historique |
| RM-05 date du bloc | `block.timestamp` | Enregistrement |
| RM-06 modification par agent, avec trace | `updateDocumentHash`, `setLandStatus` | Empreinte, Statut |
| RM-07 titulaire seul demande | `requestTransfer` : `NotLandOwner` | Demande |
| RM-08 nouveau titulaire valide | `InvalidProposedOwner` | Demande |
| RM-09 une demande en attente par bien | `_pendingRequest`, `PendingRequestExists` | Demande |
| RM-10 identifiant et statut de demande | `requestCount`, `RequestStatus` | Demande |
| RM-11 agent seul, décision définitive | `approveTransfer`, `rejectTransfer`, `RequestNotPending` | Validation, Refus |
| RM-12 titulaire revérifié | `OwnerChangedSinceRequest` | Non atteignable (voir README) |
| RM-13 refus sans effet sur le titulaire | `rejectTransfer` | Refus |
| RM-14 titulaire changé seulement à la validation | `approveTransfer` | Demande, Validation |
| RM-15 agent et date de décision | `reviewedBy`, `reviewedAt` | Validation, Historique |
| RM-16 l'administrateur ne modifie pas les biens | aucune fonction d'écriture sur les biens pour lui | Rôles, Cas limites |
| RM-17 révocation sans effacer l'historique | `AccessControl`, événements | Rôles |
| RM-18 aucune donnée personnelle ni document | structures `Land` et `TransferRequest` | Revue de conception |
| RM-19 historique par événements | pas de tableau d'historique | Historique |
| RM-20 contrôles dans le contrat | toutes les fonctions | Tous les groupes |
| RM-21 à RM-23 vérification d'empreinte | `verifyDocument` | Vérification |
| Propositions utilisateur | `submitLandProposal`, `_openProposalOf`, `approveLandProposal`, `rejectLandProposal`, `cancelLandProposal` | Propositions de biens utilisateur |

Critères de validation du cahier (§11) : 1 à 9 et 12 sont couverts par les tests.
Les critères 10 (interface) et 11 (documents hors chaîne) concernent les phases suivantes ou la conception.

## 7. Limites connues

- Les données du contrat sont publiques : la confidentialité repose sur le fait de n'y mettre que des données non sensibles.
- L'administrateur peut s'attribuer `AGENT_ROLE` (décision D4). L'action est tracée par `RoleGranted`, mais pas empêchée.
- La correspondance d'empreinte prouve l'identité d'un contenu avec la référence, pas son authenticité initiale.
- Aucun audit de sécurité indépendant n'a été réalisé : le contrat est un prototype pédagogique.
