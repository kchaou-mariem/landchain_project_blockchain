// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title LandRegistry
 * @notice Registre foncier de démonstration (prototype académique, données fictives).
 *         Il ne constitue pas un registre officiel et un transfert technique n'a
 *         aucune valeur juridique.
 *
 * Choix de conception :
 *  - Rôles : DEFAULT_ADMIN_ROLE (administrateur technique) et AGENT_ROLE (agent habilité).
 *    Le propriétaire est déduit du champ `owner` d'un bien. Le vérificateur n'a pas de rôle :
 *    les fonctions de lecture sont ouvertes.
 *  - Aucune donnée personnelle ni aucun document sur la chaîne : seulement une adresse,
 *    une référence de démonstration et une empreinte SHA-256.
 *  - L'historique est porté par les événements, pas par des tableaux stockés (RM-19).
 *  - Tous les contrôles sont faits ici, dans le contrat (RM-20).
 */
contract LandRegistry is AccessControl {
    // ---------------------------------------------------------------------
    // Rôles
    // ---------------------------------------------------------------------

    /// @notice Agent foncier habilité (rôle simulé dans le prototype).
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    enum LandStatus {
        Actif,
        TransfertEnCours,
        Suspendu
    }

    enum RequestStatus {
        EnAttente,
        Validee,
        Refusee,
        Annulee
    }

    enum VerificationResult {
        Match, // empreinte correspondante
        Mismatch, // empreinte différente
        NotFound // référence introuvable
    }

    struct Land {
        string landRef;
        address owner;
        bytes32 documentHash;
        LandStatus status;
        uint64 createdAt;
        bool exists;
    }

    struct TransferRequest {
        uint256 landId;
        address currentOwner;
        address proposedOwner;
        RequestStatus status;
        uint64 createdAt;
        address reviewedBy;
        uint64 reviewedAt;
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

    // ---------------------------------------------------------------------
    // Stockage
    // ---------------------------------------------------------------------

    mapping(uint256 landId => Land) private _lands;
    mapping(uint256 requestId => TransferRequest) private _requests;
    /// @dev landId => requestId de la demande en attente (0 si aucune). Applique RM-09.
    mapping(uint256 landId => uint256 requestId) private _pendingRequest;
    mapping(uint256 proposalId => LandProposal) private _proposals; // _getProposal() vérifie l'existence => c une fonction definie a la fin du contrat (fonction interne) .
    /// @dev landId => proposalId de la proposition ouverte (0 si aucune).
    mapping(uint256 landId => uint256 proposalId) private _openProposalOf; //c utilisé pour vérifier qu'il n'y a pas de proposition ouverte pour un bien donné

    uint256 public landCount;
    uint256 public requestCount;
    uint256 public pendingRequestCount;
    uint256 public proposalCount;

    // ---------------------------------------------------------------------
    // Événements (ils constituent l'historique, RM-19)
    // ---------------------------------------------------------------------

    event LandRegistered(
        uint256 indexed landId,
        address indexed owner,
        bytes32 documentHash,
        address registeredBy
    );
    event DocumentHashUpdated(
        uint256 indexed landId,
        bytes32 oldHash,
        bytes32 newHash,
        address updatedBy
    );
    event LandStatusChanged(
        uint256 indexed landId,
        LandStatus oldStatus,
        LandStatus newStatus,
        address changedBy
    );
    event TransferRequested(
        uint256 indexed requestId,
        uint256 indexed landId,
        address currentOwner,
        address proposedOwner
    );
    event TransferApproved(
        uint256 indexed requestId,
        uint256 indexed landId,
        address reviewedBy
    );
    event TransferRejected(
        uint256 indexed requestId,
        uint256 indexed landId,
        address reviewedBy
    );
    event TransferCancelled(
        uint256 indexed requestId,
        uint256 indexed landId,
        address cancelledBy
    );
    event OwnershipChanged(
        uint256 indexed landId,
        address indexed previousOwner,
        address indexed newOwner,
        uint256 requestId
    );
    event LandProposalSubmitted(
        uint256 indexed proposalId,
        uint256 indexed landId,
        string landRef,
        address proposedOwner,
        bytes32 documentHash,
        address submittedBy
    );
    event LandProposalApproved(uint256 indexed proposalId, uint256 indexed landId, address reviewedBy);
    event LandProposalRejected(uint256 indexed proposalId, uint256 indexed landId, address reviewedBy);
    event LandProposalCancelled(uint256 indexed proposalId, uint256 indexed landId, address cancelledBy);

    // ---------------------------------------------------------------------
    // Erreurs personnalisées (messages courts, traduits par l'interface)
    // ---------------------------------------------------------------------

    error InvalidAdmin();
    error InvalidLandId();
    error EmptyReference();
    error InvalidOwner();
    error InvalidDocumentHash();
    error LandAlreadyExists(uint256 landId);
    error LandNotFound(uint256 landId);
    error SameDocumentHash();
    error InvalidStatusChange(LandStatus current, LandStatus requested);
    error NotLandOwner(uint256 landId, address caller);
    error LandIsSuspended(uint256 landId);
    error PendingRequestExists(uint256 landId, uint256 requestId);
    error InvalidProposedOwner();
    error RequestNotFound(uint256 requestId);
    error RequestNotPending(uint256 requestId, RequestStatus status);
    error NotRequester(uint256 requestId, address caller);
    error ConflictOfInterest(uint256 requestId, address caller);
    error OwnerChangedSinceRequest(uint256 requestId);
    error ProposalNotFound(uint256 proposalId);
    error ProposalAlreadyExists(uint256 landId);
    error NotProposalSubmitter(uint256 proposalId, address caller);

    // ---------------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------------

    /// @param admin Compte administrateur technique (gère les rôles uniquement).
    constructor(address admin) {
        if (admin == address(0)) revert InvalidAdmin();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ---------------------------------------------------------------------
    // Écriture : enregistrement et métadonnées (agent)
    // ---------------------------------------------------------------------

    /// @notice Enregistre un nouveau bien (RM-01 à RM-05).
    function registerLand(
        uint256 landId,
        string calldata landRef, //calldata : sert à indiquer que la variable est en lecture seule et qu'elle est stockée dans la mémoire de la fonction, ce qui permet d'économiser de l'espace mémoire et d'améliorer les performances. 
        address owner,
        bytes32 documentHash
    ) external onlyRole(AGENT_ROLE) { //external : sert à indiquer que la fonction est appelée depuis l'extérieur du contrat
        if (landId == 0) revert InvalidLandId();
        if (bytes(landRef).length == 0) revert EmptyReference();
        if (owner == address(0)) revert InvalidOwner();
        if (documentHash == bytes32(0)) revert InvalidDocumentHash();
        if (_lands[landId].exists) revert LandAlreadyExists(landId);
        if (_openProposalOf[landId] != 0) revert ProposalAlreadyExists(landId);

        _lands[landId] = Land({
            landRef: landRef,
            owner: owner,
            documentHash: documentHash,
            status: LandStatus.Actif,
            createdAt: uint64(block.timestamp),
            exists: true
        });
        landCount += 1;

        emit LandRegistered(landId, owner, documentHash, msg.sender);
    }

    /// @notice Soumet un bien proposé par un utilisateur. Un agent doit le valider.
    function submitLandProposal(
        uint256 landId,
        string calldata landRef,
        address proposedOwner,
        bytes32 documentHash
    ) external returns (uint256 proposalId) {
        if (landId == 0) revert InvalidLandId();
        if (bytes(landRef).length == 0) revert EmptyReference();
        if (proposedOwner == address(0)) revert InvalidOwner();
        if (documentHash == bytes32(0)) revert InvalidDocumentHash();
        if (_lands[landId].exists) revert LandAlreadyExists(landId);
        if (_openProposalOf[landId] != 0) revert ProposalAlreadyExists(landId);

        proposalId = ++proposalCount;
        _proposals[proposalId] = LandProposal({
            landId: landId,
            landRef: landRef,
            proposedOwner: proposedOwner,
            documentHash: documentHash,
            submittedBy: msg.sender,
            createdAt: uint64(block.timestamp),
            exists: true
        });
        _openProposalOf[landId] = proposalId;
        emit LandProposalSubmitted(proposalId, landId, landRef, proposedOwner, documentHash, msg.sender);
    }

    function approveLandProposal(uint256 proposalId) external onlyRole(AGENT_ROLE) {
        LandProposal storage proposal = _getProposal(proposalId);
        if (_lands[proposal.landId].exists) revert LandAlreadyExists(proposal.landId);
        _lands[proposal.landId] = Land({
            landRef: proposal.landRef,
            owner: proposal.proposedOwner,
            documentHash: proposal.documentHash,
            status: LandStatus.Actif,
            createdAt: uint64(block.timestamp),
            exists: true
        });
        landCount += 1;
        proposal.exists = false;
        delete _openProposalOf[proposal.landId];
        emit LandRegistered(proposal.landId, proposal.proposedOwner, proposal.documentHash, msg.sender);
        emit LandProposalApproved(proposalId, proposal.landId, msg.sender);
    }

    function rejectLandProposal(uint256 proposalId) external onlyRole(AGENT_ROLE) {
        LandProposal storage proposal = _getProposal(proposalId);
        uint256 landId = proposal.landId;
        proposal.exists = false;
        delete _openProposalOf[landId];
        emit LandProposalRejected(proposalId, landId, msg.sender);
    }

    /// @notice Annule une proposition encore ouverte, uniquement par son déposant.
    function cancelLandProposal(uint256 proposalId) external {
        LandProposal storage proposal = _getProposal(proposalId);
        if (proposal.submittedBy != msg.sender)
            revert NotProposalSubmitter(proposalId, msg.sender);

        uint256 landId = proposal.landId;
        proposal.exists = false;
        delete _openProposalOf[landId];
        emit LandProposalCancelled(proposalId, landId, msg.sender);
    }

    function getLandProposal(uint256 proposalId) external view returns (LandProposal memory) { // memory:variable va etre stockée dans la mémoire temporaire de la fonction
        return _getProposal(proposalId);
    }

    /// @notice Remplace l'empreinte du document de référence (RM-06).
    ///         L'ancienne et la nouvelle valeur sont conservées dans l'événement.
    function updateDocumentHash(
        uint256 landId,
        bytes32 newHash
    ) external onlyRole(AGENT_ROLE) {
        Land storage land = _getExistingLand(landId);
        if (newHash == bytes32(0)) revert InvalidDocumentHash();
        if (newHash == land.documentHash) revert SameDocumentHash();

        bytes32 oldHash = land.documentHash;
        land.documentHash = newHash;

        emit DocumentHashUpdated(landId, oldHash, newHash, msg.sender);
    }

    /// @notice Suspend ou réactive un bien (RM-06). Seules les bascules Actif <-> Suspendu
    ///         sont permises. TransfertEnCours est géré uniquement par le contrat, et un bien
    ///         qui a une demande en attente ne peut pas être modifié : il faut d'abord la traiter.
    function setLandStatus(
        uint256 landId,
        LandStatus newStatus
    ) external onlyRole(AGENT_ROLE) {
        Land storage land = _getExistingLand(landId);
        LandStatus current = land.status;

        if (
            newStatus == LandStatus.TransfertEnCours ||
            current == LandStatus.TransfertEnCours ||
            newStatus == current
        ) revert InvalidStatusChange(current, newStatus);

        land.status = newStatus;
        emit LandStatusChanged(landId, current, newStatus, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Écriture : transfert (propriétaire puis agent)
    // ---------------------------------------------------------------------

    /// @notice Le titulaire enregistré soumet une demande de transfert (RM-07 à RM-10).
    function requestTransfer(
        uint256 landId,
        address proposedOwner
    ) external returns (uint256 requestId) {
        Land storage land = _getExistingLand(landId);

        if (land.owner != msg.sender) revert NotLandOwner(landId, msg.sender);
        if (land.status == LandStatus.Suspendu) revert LandIsSuspended(landId);

        uint256 pending = _pendingRequest[landId];
        if (pending != 0) revert PendingRequestExists(landId, pending);

        if (proposedOwner == address(0) || proposedOwner == land.owner)
            revert InvalidProposedOwner();

        requestId = ++requestCount;
        _requests[requestId] = TransferRequest({
            landId: landId,
            currentOwner: land.owner,
            proposedOwner: proposedOwner,
            status: RequestStatus.EnAttente,
            createdAt: uint64(block.timestamp),
            reviewedBy: address(0),
            reviewedAt: 0
        });
        _pendingRequest[landId] = requestId;
        pendingRequestCount += 1;
        land.status = LandStatus.TransfertEnCours;

        emit TransferRequested(requestId, landId, land.owner, proposedOwner);
    }

    /// @notice Le demandeur annule sa demande tant qu'elle est en attente (décision D2).
    function cancelTransferRequest(uint256 requestId) external {
        TransferRequest storage req = _getPendingRequest(requestId);
        if (req.currentOwner != msg.sender)
            revert NotRequester(requestId, msg.sender);

        req.status = RequestStatus.Annulee;
        _closePending(req);

        emit TransferCancelled(requestId, req.landId, msg.sender);
    }

    /// @notice L'agent valide la demande : le titulaire enregistré est mis à jour (RM-11, RM-12, RM-14, RM-15).
    function approveTransfer(
        uint256 requestId
    ) external onlyRole(AGENT_ROLE) {
        TransferRequest storage req = _getPendingRequest(requestId);
        _checkNoConflictOfInterest(requestId, req);

        Land storage land = _lands[req.landId];
        // RM-12 : le titulaire actuel doit toujours être celui de la demande.
        if (land.owner != req.currentOwner)
            revert OwnerChangedSinceRequest(requestId);

        req.status = RequestStatus.Validee;
        req.reviewedBy = msg.sender;
        req.reviewedAt = uint64(block.timestamp);

        address previousOwner = land.owner;
        land.owner = req.proposedOwner;
        _closePending(req);

        emit TransferApproved(requestId, req.landId, msg.sender);
        emit OwnershipChanged(
            req.landId,
            previousOwner,
            req.proposedOwner,
            requestId
        );
    }

    /// @notice L'agent refuse la demande : le titulaire enregistré ne change pas (RM-11, RM-13, RM-15).
    function rejectTransfer(
        uint256 requestId
    ) external onlyRole(AGENT_ROLE) {
        TransferRequest storage req = _getPendingRequest(requestId);
        _checkNoConflictOfInterest(requestId, req);

        req.status = RequestStatus.Refusee;
        req.reviewedBy = msg.sender;
        req.reviewedAt = uint64(block.timestamp);
        _closePending(req);

        emit TransferRejected(requestId, req.landId, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Lecture (ouverte à tout compte : consultation et vérification)
    // ---------------------------------------------------------------------

    /// @notice Retourne un bien. Échoue avec LandNotFound s'il n'existe pas.
    function getLand(uint256 landId) external view returns (Land memory) {
        if (!_lands[landId].exists) revert LandNotFound(landId);
        return _lands[landId];
    }

    /// @notice Retourne une demande de transfert. Échoue avec RequestNotFound si elle n'existe pas.
    function getTransferRequest(
        uint256 requestId
    ) external view returns (TransferRequest memory) {
        if (_requests[requestId].landId == 0) revert RequestNotFound(requestId);
        return _requests[requestId];
    }

    /// @notice Retourne l'identifiant de la demande en attente d'un bien (0 si aucune).
    function pendingRequestOf(uint256 landId) external view returns (uint256) {
        return _pendingRequest[landId];
    }

    /// @notice Indique si un bien existe.
    function landExists(uint256 landId) external view returns (bool) {
        return _lands[landId].exists;
    }

    /// @notice Compare une empreinte calculée hors chaîne à l'empreinte de référence (RM-21 à RM-23).
    /// @dev Une correspondance prouve l'identité du contenu avec la référence, pas l'authenticité initiale.
    function verifyDocument(
        uint256 landId,
        bytes32 documentHash
    ) external view returns (VerificationResult) {
        Land storage land = _lands[landId];
        if (!land.exists) return VerificationResult.NotFound;
        return
            land.documentHash == documentHash
                ? VerificationResult.Match
                : VerificationResult.Mismatch;
    }

    // ---------------------------------------------------------------------
    // Interne
    // ---------------------------------------------------------------------

    function _getExistingLand(
        uint256 landId
    ) private view returns (Land storage land) {
        land = _lands[landId];
        if (!land.exists) revert LandNotFound(landId);
    }

    function _getPendingRequest(
        uint256 requestId
    ) private view returns (TransferRequest storage req) {
        req = _requests[requestId];
        if (req.landId == 0) revert RequestNotFound(requestId);
        if (req.status != RequestStatus.EnAttente)
            revert RequestNotPending(requestId, req.status);
    }

    function _getProposal(uint256 proposalId) private view returns (LandProposal storage proposal) {
        proposal = _proposals[proposalId];
        if (!proposal.exists) revert ProposalNotFound(proposalId);
    }

    /// @dev Décision D3 : un agent ne décide pas d'une demande dont il est partie.
    function _checkNoConflictOfInterest(
        uint256 requestId,
        TransferRequest storage req
    ) private view {
        if (msg.sender == req.currentOwner || msg.sender == req.proposedOwner)
            revert ConflictOfInterest(requestId, msg.sender);
    }

    /// @dev Libère le bien après une décision ou une annulation.
    function _closePending(TransferRequest storage req) private {
        delete _pendingRequest[req.landId];
        pendingRequestCount -= 1;
        _lands[req.landId].status = LandStatus.Actif;
    }
}
