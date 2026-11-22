const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

// Énumérations du contrat (même ordre que dans LandRegistry.sol)
const LandStatus = { Actif: 0n, TransfertEnCours: 1n, Suspendu: 2n };
const RequestStatus = { EnAttente: 0n, Validee: 1n, Refusee: 2n, Annulee: 3n };
const Verification = { Match: 0n, Mismatch: 1n, NotFound: 2n };

// Empreinte SHA-256 d'un contenu texte : même calcul que celui fait dans le navigateur (RM-21)
const sha256Of = (text) => ethers.sha256(ethers.toUtf8Bytes(text));

const LAND_ID = 1001n;
const LAND_REF = "TN-DEMO-0001";
const DOC_V1 = "contenu du titre foncier de demonstration";
const DOC_HASH = sha256Of(DOC_V1);

describe("LandRegistry", function () {
  async function deployFixture() {
    const [admin, agent, agent2, owner, newOwner, outsider, other] =
      await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("LandRegistry")).deploy(admin.address);
    await registry.waitForDeployment();
    const AGENT_ROLE = await registry.AGENT_ROLE();
    const DEFAULT_ADMIN_ROLE = await registry.DEFAULT_ADMIN_ROLE();
    await registry.connect(admin).grantRole(AGENT_ROLE, agent.address);
    await registry.connect(admin).grantRole(AGENT_ROLE, agent2.address);
    return { registry, admin, agent, agent2, owner, newOwner, outsider, other, AGENT_ROLE, DEFAULT_ADMIN_ROLE };
  }

  // Un bien déjà enregistré, prêt pour les tests de transfert
  async function withLandFixture() {
    const ctx = await deployFixture();
    await ctx.registry
      .connect(ctx.agent)
      .registerLand(LAND_ID, LAND_REF, ctx.owner.address, DOC_HASH);
    return ctx;
  }

  // Un bien avec une demande de transfert en attente (requestId = 1)
  async function withRequestFixture() {
    const ctx = await withLandFixture();
    await ctx.registry.connect(ctx.owner).requestTransfer(LAND_ID, ctx.newOwner.address);
    return ctx;
  }

  // -------------------------------------------------------------------
  describe("Déploiement et rôles (RM-16, RM-17)", function () {
    it("donne le rôle d'administrateur au compte fourni, sans rôle d'agent", async function () {
      const { registry, admin, AGENT_ROLE, DEFAULT_ADMIN_ROLE } = await loadFixture(deployFixture);
      expect(await registry.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.equal(true);
      expect(await registry.hasRole(AGENT_ROLE, admin.address)).to.equal(false);
    });

    it("refuse un administrateur égal à l'adresse zéro", async function () {
      const factory = await ethers.getContractFactory("LandRegistry");
      await expect(factory.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(factory, "InvalidAdmin");
    });

    it("seul l'administrateur attribue et révoque les rôles", async function () {
      const { registry, agent, outsider, AGENT_ROLE, DEFAULT_ADMIN_ROLE } = await loadFixture(deployFixture);
      await expect(registry.connect(agent).grantRole(AGENT_ROLE, outsider.address))
        .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount")
        .withArgs(agent.address, DEFAULT_ADMIN_ROLE);
      await expect(registry.connect(outsider).revokeRole(AGENT_ROLE, agent.address))
        .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("émet RoleGranted et RoleRevoked (traçabilité des rôles)", async function () {
      const { registry, admin, outsider, AGENT_ROLE } = await loadFixture(deployFixture);
      await expect(registry.connect(admin).grantRole(AGENT_ROLE, outsider.address))
        .to.emit(registry, "RoleGranted").withArgs(AGENT_ROLE, outsider.address, admin.address);
      await expect(registry.connect(admin).revokeRole(AGENT_ROLE, outsider.address))
        .to.emit(registry, "RoleRevoked").withArgs(AGENT_ROLE, outsider.address, admin.address);
    });

    it("l'administrateur seul ne peut pas enregistrer un bien (RM-16)", async function () {
      const { registry, admin, owner, AGENT_ROLE } = await loadFixture(deployFixture);
      await expect(registry.connect(admin).registerLand(LAND_ID, LAND_REF, owner.address, DOC_HASH))
        .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount")
        .withArgs(admin.address, AGENT_ROLE);
    });

    it("la révocation bloque les nouvelles opérations sans effacer les anciennes (RM-17)", async function () {
      const { registry, admin, agent, owner, AGENT_ROLE } = await loadFixture(withLandFixture);
      await registry.connect(admin).revokeRole(AGENT_ROLE, agent.address);

      // nouvelle opération refusée
      await expect(registry.connect(agent).registerLand(2002n, "TN-DEMO-0002", owner.address, DOC_HASH))
        .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
      // bien enregistré avant la révocation toujours présent, et son événement toujours retrouvable
      const land = await registry.getLand(LAND_ID);
      expect(land.exists).to.equal(true);
      const events = await registry.queryFilter(registry.filters.LandRegistered(LAND_ID));
      expect(events).to.have.length(1);
      expect(events[0].args.registeredBy).to.equal(agent.address);
    });
  });

  // -------------------------------------------------------------------
  describe("Enregistrement d'un bien (RM-01 à RM-05, critères 1 à 3)", function () {
    it("un agent enregistre un bien avec un identifiant unique (critère 1)", async function () {
      const { registry, agent, owner } = await loadFixture(deployFixture);
      await expect(registry.connect(agent).registerLand(LAND_ID, LAND_REF, owner.address, DOC_HASH))
        .to.emit(registry, "LandRegistered")
        .withArgs(LAND_ID, owner.address, DOC_HASH, agent.address);

      const land = await registry.getLand(LAND_ID);
      expect(land.landRef).to.equal(LAND_REF);
      expect(land.owner).to.equal(owner.address);
      expect(land.documentHash).to.equal(DOC_HASH);
      expect(land.status).to.equal(LandStatus.Actif);
      expect(land.exists).to.equal(true);
      expect(await registry.landCount()).to.equal(1n);
    });

    it("horodate le bien avec la date du bloc, pas une valeur de l'appelant (RM-05)", async function () {
      const { registry, agent, owner } = await loadFixture(deployFixture);
      const tx = await registry.connect(agent).registerLand(LAND_ID, LAND_REF, owner.address, DOC_HASH);
      const block = await ethers.provider.getBlock((await tx.wait()).blockNumber);
      expect((await registry.getLand(LAND_ID)).createdAt).to.equal(BigInt(block.timestamp));
    });

    it("refuse un enregistrement en doublon (critère 2, RM-01)", async function () {
      const { registry, agent, owner, newOwner } = await loadFixture(withLandFixture);
      await expect(registry.connect(agent).registerLand(LAND_ID, "AUTRE-REF", newOwner.address, sha256Of("autre")))
        .to.be.revertedWithCustomError(registry, "LandAlreadyExists").withArgs(LAND_ID);
      // le bien d'origine est intact
      expect((await registry.getLand(LAND_ID)).owner).to.equal(owner.address);
      expect(await registry.landCount()).to.equal(1n);
    });

    it("refuse un compte sans rôle d'agent (critère 3, RM-02)", async function () {
      const { registry, outsider, owner, AGENT_ROLE } = await loadFixture(deployFixture);
      await expect(registry.connect(outsider).registerLand(LAND_ID, LAND_REF, owner.address, DOC_HASH))
        .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount")
        .withArgs(outsider.address, AGENT_ROLE);
    });

    it("refuse un propriétaire de bien qui s'enregistre lui-même (pas de rôle d'agent)", async function () {
      const { registry, owner } = await loadFixture(deployFixture);
      await expect(registry.connect(owner).registerLand(LAND_ID, LAND_REF, owner.address, DOC_HASH))
        .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("refuse les champs obligatoires manquants (RM-03)", async function () {
      const { registry, agent, owner } = await loadFixture(deployFixture);
      const r = registry.connect(agent);
      await expect(r.registerLand(0n, LAND_REF, owner.address, DOC_HASH)).to.be.revertedWithCustomError(registry, "InvalidLandId");
      await expect(r.registerLand(LAND_ID, "", owner.address, DOC_HASH)).to.be.revertedWithCustomError(registry, "EmptyReference");
      await expect(r.registerLand(LAND_ID, LAND_REF, ethers.ZeroAddress, DOC_HASH)).to.be.revertedWithCustomError(registry, "InvalidOwner");
      await expect(r.registerLand(LAND_ID, LAND_REF, owner.address, ethers.ZeroHash)).to.be.revertedWithCustomError(registry, "InvalidDocumentHash");
    });
  });

  // -------------------------------------------------------------------
  describe("Consultation (RM-22, critère 4)", function () {
    it("n'importe quel compte lit les informations d'un bien (critère 4)", async function () {
      const { registry, outsider, owner } = await loadFixture(withLandFixture);
      const land = await registry.connect(outsider).getLand(LAND_ID);
      expect(land.owner).to.equal(owner.address);
      expect(await registry.connect(outsider).landExists(LAND_ID)).to.equal(true);
      expect(await registry.landExists(9999n)).to.equal(false);
    });

    it("getLand échoue pour un bien inexistant", async function () {
      const { registry } = await loadFixture(deployFixture);
      await expect(registry.getLand(42n)).to.be.revertedWithCustomError(registry, "LandNotFound").withArgs(42n);
    });

    it("getTransferRequest échoue pour une demande inexistante", async function () {
      const { registry } = await loadFixture(deployFixture);
      await expect(registry.getTransferRequest(7n)).to.be.revertedWithCustomError(registry, "RequestNotFound").withArgs(7n);
      await expect(registry.getTransferRequest(0n)).to.be.revertedWithCustomError(registry, "RequestNotFound");
    });
  });

  // -------------------------------------------------------------------
  describe("Vérification documentaire (RM-21 à RM-23, critère 5)", function () {
    it("retourne Match pour le document de référence", async function () {
      const { registry, outsider } = await loadFixture(withLandFixture);
      expect(await registry.connect(outsider).verifyDocument(LAND_ID, sha256Of(DOC_V1))).to.equal(Verification.Match);
    });

    it("détecte un document modifié : un seul caractère change l'empreinte (critère 5)", async function () {
      const { registry } = await loadFixture(withLandFixture);
      expect(await registry.verifyDocument(LAND_ID, sha256Of(DOC_V1 + "."))).to.equal(Verification.Mismatch);
      expect(await registry.verifyDocument(LAND_ID, ethers.ZeroHash)).to.equal(Verification.Mismatch);
    });

    it("retourne NotFound si le bien n'existe pas", async function () {
      const { registry } = await loadFixture(withLandFixture);
      expect(await registry.verifyDocument(9999n, DOC_HASH)).to.equal(Verification.NotFound);
    });

    it("calcule le même SHA-256 que celui attendu côté interface", async function () {
      // Vecteur de test connu : SHA-256("abc")
      expect(sha256Of("abc")).to.equal("0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    });
  });

  // -------------------------------------------------------------------
  describe("Modification de l'empreinte (RM-06)", function () {
    it("un agent remplace l'empreinte et l'événement garde l'ancienne et la nouvelle", async function () {
      const { registry, agent } = await loadFixture(withLandFixture);
      const newHash = sha256Of("document corrige");
      await expect(registry.connect(agent).updateDocumentHash(LAND_ID, newHash))
        .to.emit(registry, "DocumentHashUpdated")
        .withArgs(LAND_ID, DOC_HASH, newHash, agent.address);
      expect((await registry.getLand(LAND_ID)).documentHash).to.equal(newHash);
      // l'ancien document ne correspond plus
      expect(await registry.verifyDocument(LAND_ID, DOC_HASH)).to.equal(Verification.Mismatch);
      expect(await registry.verifyDocument(LAND_ID, newHash)).to.equal(Verification.Match);
    });

    it("refuse un non-agent, le propriétaire y compris", async function () {
      const { registry, owner, outsider } = await loadFixture(withLandFixture);
      await expect(registry.connect(owner).updateDocumentHash(LAND_ID, sha256Of("x"))).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
      await expect(registry.connect(outsider).updateDocumentHash(LAND_ID, sha256Of("x"))).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("refuse une empreinte nulle, identique, ou un bien inexistant", async function () {
      const { registry, agent } = await loadFixture(withLandFixture);
      await expect(registry.connect(agent).updateDocumentHash(LAND_ID, ethers.ZeroHash)).to.be.revertedWithCustomError(registry, "InvalidDocumentHash");
      await expect(registry.connect(agent).updateDocumentHash(LAND_ID, DOC_HASH)).to.be.revertedWithCustomError(registry, "SameDocumentHash");
      await expect(registry.connect(agent).updateDocumentHash(9999n, sha256Of("x"))).to.be.revertedWithCustomError(registry, "LandNotFound");
    });
  });

  // -------------------------------------------------------------------
  describe("Statut d'un bien (RM-06, décision D5)", function () {
    it("un agent suspend puis réactive un bien", async function () {
      const { registry, agent } = await loadFixture(withLandFixture);
      await expect(registry.connect(agent).setLandStatus(LAND_ID, LandStatus.Suspendu))
        .to.emit(registry, "LandStatusChanged")
        .withArgs(LAND_ID, LandStatus.Actif, LandStatus.Suspendu, agent.address);
      expect((await registry.getLand(LAND_ID)).status).to.equal(LandStatus.Suspendu);
      await registry.connect(agent).setLandStatus(LAND_ID, LandStatus.Actif);
      expect((await registry.getLand(LAND_ID)).status).to.equal(LandStatus.Actif);
    });

    it("refuse un non-agent", async function () {
      const { registry, owner } = await loadFixture(withLandFixture);
      await expect(registry.connect(owner).setLandStatus(LAND_ID, LandStatus.Suspendu)).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("refuse de forcer TransfertEnCours ou de répéter le même statut", async function () {
      const { registry, agent } = await loadFixture(withLandFixture);
      await expect(registry.connect(agent).setLandStatus(LAND_ID, LandStatus.TransfertEnCours)).to.be.revertedWithCustomError(registry, "InvalidStatusChange");
      await expect(registry.connect(agent).setLandStatus(LAND_ID, LandStatus.Actif)).to.be.revertedWithCustomError(registry, "InvalidStatusChange");
    });

    it("refuse de modifier le statut d'un bien qui a une demande en attente", async function () {
      const { registry, agent } = await loadFixture(withRequestFixture);
      await expect(registry.connect(agent).setLandStatus(LAND_ID, LandStatus.Suspendu)).to.be.revertedWithCustomError(registry, "InvalidStatusChange");
    });

    it("refuse une demande de transfert sur un bien suspendu", async function () {
      const { registry, agent, owner, newOwner } = await loadFixture(withLandFixture);
      await registry.connect(agent).setLandStatus(LAND_ID, LandStatus.Suspendu);
      await expect(registry.connect(owner).requestTransfer(LAND_ID, newOwner.address))
        .to.be.revertedWithCustomError(registry, "LandIsSuspended").withArgs(LAND_ID);
    });
  });

  // -------------------------------------------------------------------
  describe("Demande de transfert (RM-07 à RM-10, critère 6)", function () {
    it("le titulaire soumet une demande valide (critère 6)", async function () {
      const { registry, owner, newOwner } = await loadFixture(withLandFixture);
      await expect(registry.connect(owner).requestTransfer(LAND_ID, newOwner.address))
        .to.emit(registry, "TransferRequested")
        .withArgs(1n, LAND_ID, owner.address, newOwner.address);

      const req = await registry.getTransferRequest(1n);
      expect(req.landId).to.equal(LAND_ID);
      expect(req.currentOwner).to.equal(owner.address);
      expect(req.proposedOwner).to.equal(newOwner.address);
      expect(req.status).to.equal(RequestStatus.EnAttente);
      expect(req.reviewedBy).to.equal(ethers.ZeroAddress);
      expect(req.reviewedAt).to.equal(0n);

      expect((await registry.getLand(LAND_ID)).status).to.equal(LandStatus.TransfertEnCours);
      expect(await registry.pendingRequestOf(LAND_ID)).to.equal(1n);
      expect(await registry.pendingRequestCount()).to.equal(1n);
      expect(await registry.requestCount()).to.equal(1n);
      // la demande ne change PAS le titulaire (RM-14)
      expect((await registry.getLand(LAND_ID)).owner).to.equal(owner.address);
    });

    it("refuse quelqu'un qui n'est pas le titulaire, agent compris (RM-07)", async function () {
      const { registry, agent, outsider, newOwner } = await loadFixture(withLandFixture);
      await expect(registry.connect(outsider).requestTransfer(LAND_ID, newOwner.address))
        .to.be.revertedWithCustomError(registry, "NotLandOwner").withArgs(LAND_ID, outsider.address);
      await expect(registry.connect(agent).requestTransfer(LAND_ID, newOwner.address))
        .to.be.revertedWithCustomError(registry, "NotLandOwner");
    });

    it("refuse un bien inexistant", async function () {
      const { registry, owner, newOwner } = await loadFixture(withLandFixture);
      await expect(registry.connect(owner).requestTransfer(9999n, newOwner.address)).to.be.revertedWithCustomError(registry, "LandNotFound");
    });

    it("refuse un nouveau titulaire nul ou identique au titulaire actuel (RM-08)", async function () {
      const { registry, owner } = await loadFixture(withLandFixture);
      await expect(registry.connect(owner).requestTransfer(LAND_ID, ethers.ZeroAddress)).to.be.revertedWithCustomError(registry, "InvalidProposedOwner");
      await expect(registry.connect(owner).requestTransfer(LAND_ID, owner.address)).to.be.revertedWithCustomError(registry, "InvalidProposedOwner");
    });

    it("refuse une deuxième demande tant qu'une est en attente (RM-09)", async function () {
      const { registry, owner, other } = await loadFixture(withRequestFixture);
      await expect(registry.connect(owner).requestTransfer(LAND_ID, other.address))
        .to.be.revertedWithCustomError(registry, "PendingRequestExists").withArgs(LAND_ID, 1n);
    });
  });

  // -------------------------------------------------------------------
  describe("Validation d'un transfert (RM-11, RM-12, RM-14, RM-15, critères 7 et 9)", function () {
    it("l'agent valide : le titulaire change et deux événements sont émis (critères 7 et 9)", async function () {
      const { registry, agent, owner, newOwner } = await loadFixture(withRequestFixture);
      await expect(registry.connect(agent).approveTransfer(1n))
        .to.emit(registry, "TransferApproved").withArgs(1n, LAND_ID, agent.address)
        .and.to.emit(registry, "OwnershipChanged").withArgs(LAND_ID, owner.address, newOwner.address, 1n);

      const land = await registry.getLand(LAND_ID);
      expect(land.owner).to.equal(newOwner.address);
      expect(land.status).to.equal(LandStatus.Actif);

      const req = await registry.getTransferRequest(1n);
      expect(req.status).to.equal(RequestStatus.Validee);
      expect(req.reviewedBy).to.equal(agent.address);
      expect(req.reviewedAt).to.be.gt(0n);

      expect(await registry.pendingRequestOf(LAND_ID)).to.equal(0n);
      expect(await registry.pendingRequestCount()).to.equal(0n);
    });

    it("n'importe qui sans rôle d'agent ne peut pas valider (RM-11)", async function () {
      const { registry, owner, newOwner, outsider } = await loadFixture(withRequestFixture);
      for (const who of [owner, newOwner, outsider]) {
        await expect(registry.connect(who).approveTransfer(1n)).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
      }
      // aucun effet
      expect((await registry.getLand(LAND_ID)).owner).to.equal(owner.address);
    });

    it("l'administrateur seul ne peut pas valider ni refuser (RM-16)", async function () {
      const { registry, admin, owner } = await loadFixture(withRequestFixture);
      await expect(registry.connect(admin).approveTransfer(1n)).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
      await expect(registry.connect(admin).rejectTransfer(1n)).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
      expect((await registry.getLand(LAND_ID)).owner).to.equal(owner.address);
    });

    it("une décision est définitive : pas de double validation (RM-11)", async function () {
      const { registry, agent, agent2 } = await loadFixture(withRequestFixture);
      await registry.connect(agent).approveTransfer(1n);
      await expect(registry.connect(agent2).approveTransfer(1n))
        .to.be.revertedWithCustomError(registry, "RequestNotPending").withArgs(1n, RequestStatus.Validee);
      await expect(registry.connect(agent2).rejectTransfer(1n)).to.be.revertedWithCustomError(registry, "RequestNotPending");
    });

    it("refuse une demande inexistante", async function () {
      const { registry, agent } = await loadFixture(withLandFixture);
      await expect(registry.connect(agent).approveTransfer(1n)).to.be.revertedWithCustomError(registry, "RequestNotFound");
    });

    it("un agent ne décide pas d'une demande dont il est partie (décision D3)", async function () {
      const { registry, admin, agent, owner, other, AGENT_ROLE } = await loadFixture(withLandFixture);
      // le propriétaire du bien devient agent, puis demande un transfert vers un autre agent
      await registry.connect(admin).grantRole(AGENT_ROLE, owner.address);
      await registry.connect(admin).grantRole(AGENT_ROLE, other.address);
      await registry.connect(owner).requestTransfer(LAND_ID, other.address);

      await expect(registry.connect(owner).approveTransfer(1n)).to.be.revertedWithCustomError(registry, "ConflictOfInterest").withArgs(1n, owner.address);
      await expect(registry.connect(other).approveTransfer(1n)).to.be.revertedWithCustomError(registry, "ConflictOfInterest").withArgs(1n, other.address);
      await expect(registry.connect(owner).rejectTransfer(1n)).to.be.revertedWithCustomError(registry, "ConflictOfInterest");
      // un agent tiers peut décider
      await expect(registry.connect(agent).approveTransfer(1n)).to.emit(registry, "OwnershipChanged");
    });
  });

  // -------------------------------------------------------------------
  describe("Refus d'un transfert (RM-11, RM-13, critère 8)", function () {
    it("l'agent refuse : le titulaire ne change pas (critère 8)", async function () {
      const { registry, agent, owner } = await loadFixture(withRequestFixture);
      await expect(registry.connect(agent).rejectTransfer(1n))
        .to.emit(registry, "TransferRejected").withArgs(1n, LAND_ID, agent.address);

      const land = await registry.getLand(LAND_ID);
      expect(land.owner).to.equal(owner.address);
      expect(land.status).to.equal(LandStatus.Actif);

      const req = await registry.getTransferRequest(1n);
      expect(req.status).to.equal(RequestStatus.Refusee);
      expect(req.reviewedBy).to.equal(agent.address);
      expect(await registry.pendingRequestOf(LAND_ID)).to.equal(0n);
      expect(await registry.pendingRequestCount()).to.equal(0n);
    });

    it("n'émet pas OwnershipChanged lors d'un refus", async function () {
      const { registry, agent } = await loadFixture(withRequestFixture);
      await expect(registry.connect(agent).rejectTransfer(1n)).to.not.emit(registry, "OwnershipChanged");
    });

    it("refuse un non-agent", async function () {
      const { registry, owner, outsider } = await loadFixture(withRequestFixture);
      await expect(registry.connect(owner).rejectTransfer(1n)).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
      await expect(registry.connect(outsider).rejectTransfer(1n)).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("après un refus, le titulaire peut soumettre une nouvelle demande", async function () {
      const { registry, agent, owner, other } = await loadFixture(withRequestFixture);
      await registry.connect(agent).rejectTransfer(1n);
      await expect(registry.connect(owner).requestTransfer(LAND_ID, other.address)).to.emit(registry, "TransferRequested").withArgs(2n, LAND_ID, owner.address, other.address);
    });
  });

  // -------------------------------------------------------------------
  describe("Annulation par le demandeur (décision D2)", function () {
    it("le titulaire annule sa demande en attente", async function () {
      const { registry, owner } = await loadFixture(withRequestFixture);
      await expect(registry.connect(owner).cancelTransferRequest(1n))
        .to.emit(registry, "TransferCancelled").withArgs(1n, LAND_ID, owner.address);
      expect((await registry.getTransferRequest(1n)).status).to.equal(RequestStatus.Annulee);
      const land = await registry.getLand(LAND_ID);
      expect(land.status).to.equal(LandStatus.Actif);
      expect(land.owner).to.equal(owner.address);
      expect(await registry.pendingRequestCount()).to.equal(0n);
    });

    it("refuse un tiers ou un agent", async function () {
      const { registry, agent, newOwner, outsider } = await loadFixture(withRequestFixture);
      for (const who of [agent, newOwner, outsider]) {
        await expect(registry.connect(who).cancelTransferRequest(1n)).to.be.revertedWithCustomError(registry, "NotRequester");
      }
    });

    it("refuse d'annuler une demande déjà décidée ou déjà annulée", async function () {
      const { registry, agent, owner } = await loadFixture(withRequestFixture);
      await registry.connect(agent).approveTransfer(1n);
      await expect(registry.connect(owner).cancelTransferRequest(1n)).to.be.revertedWithCustomError(registry, "RequestNotPending");
    });

    it("après annulation, une nouvelle demande est possible", async function () {
      const { registry, owner, other } = await loadFixture(withRequestFixture);
      await registry.connect(owner).cancelTransferRequest(1n);
      await expect(registry.connect(owner).requestTransfer(LAND_ID, other.address)).to.emit(registry, "TransferRequested");
    });
  });

  // -------------------------------------------------------------------
  describe("Propositions de biens utilisateur", function () {
    it("crée une proposition et indexe le bien sans parcourir les anciennes propositions", async function () {
      const { registry, owner, other } = await loadFixture(deployFixture);
      await expect(registry.connect(owner).submitLandProposal(2001n, "TN-PROP-0001", owner.address, DOC_HASH))
        .to.emit(registry, "LandProposalSubmitted")
        .withArgs(1n, 2001n, "TN-PROP-0001", owner.address, DOC_HASH, owner.address);

      await expect(registry.connect(other).submitLandProposal(2002n, "TN-PROP-0002", other.address, sha256Of("prop-2")))
        .to.emit(registry, "LandProposalSubmitted").withArgs(2n, 2002n, "TN-PROP-0002", other.address, sha256Of("prop-2"), other.address);
      expect(await registry.proposalCount()).to.equal(2n);
    });

    it("refuse une seconde proposition ouverte pour le même bien", async function () {
      const { registry, owner, other } = await loadFixture(deployFixture);
      await registry.connect(owner).submitLandProposal(2001n, "TN-PROP-0001", owner.address, DOC_HASH);
      await expect(registry.connect(other).submitLandProposal(2001n, "AUTRE", other.address, sha256Of("autre")))
        .to.be.revertedWithCustomError(registry, "ProposalAlreadyExists").withArgs(2001n);
    });

    it("empêche un enregistrement direct concurrent tant que la proposition est ouverte", async function () {
      const { registry, agent, owner } = await loadFixture(deployFixture);
      await registry.connect(owner).submitLandProposal(2001n, "TN-PROP-0001", owner.address, DOC_HASH);
      await expect(registry.connect(agent).registerLand(2001n, LAND_REF, owner.address, DOC_HASH))
        .to.be.revertedWithCustomError(registry, "ProposalAlreadyExists").withArgs(2001n);
    });

    it("libère l'identifiant après refus et permet une nouvelle proposition", async function () {
      const { registry, agent, owner, other } = await loadFixture(deployFixture);
      await registry.connect(owner).submitLandProposal(2001n, "TN-PROP-0001", owner.address, DOC_HASH);
      await registry.connect(agent).rejectLandProposal(1n);
      await expect(registry.connect(other).submitLandProposal(2001n, "TN-PROP-0002", other.address, sha256Of("prop-2")))
        .to.emit(registry, "LandProposalSubmitted").withArgs(2n, 2001n, "TN-PROP-0002", other.address, sha256Of("prop-2"), other.address);
    });

    it("permet au déposant d'annuler sa proposition", async function () {
      const { registry, owner, other } = await loadFixture(deployFixture);
      await registry.connect(owner).submitLandProposal(2001n, "TN-PROP-0001", owner.address, DOC_HASH);
      await expect(registry.connect(owner).cancelLandProposal(1n))
        .to.emit(registry, "LandProposalCancelled").withArgs(1n, 2001n, owner.address);
      await expect(registry.connect(other).submitLandProposal(2001n, "TN-PROP-0002", other.address, sha256Of("prop-2")))
        .to.emit(registry, "LandProposalSubmitted");
    });

    it("refuse l'annulation par un autre compte", async function () {
      const { registry, owner, other } = await loadFixture(deployFixture);
      await registry.connect(owner).submitLandProposal(2001n, "TN-PROP-0001", owner.address, DOC_HASH);
      await expect(registry.connect(other).cancelLandProposal(1n))
        .to.be.revertedWithCustomError(registry, "NotProposalSubmitter")
        .withArgs(1n, other.address);
    });

    it("libère l'identifiant après approbation", async function () {
      const { registry, agent, owner, other } = await loadFixture(deployFixture);
      await registry.connect(owner).submitLandProposal(2001n, "TN-PROP-0001", owner.address, DOC_HASH);
      await registry.connect(agent).approveLandProposal(1n);
      await expect(registry.connect(other).submitLandProposal(2002n, "TN-PROP-0002", other.address, sha256Of("prop-2")))
        .to.emit(registry, "LandProposalSubmitted");
    });
  });

  // -------------------------------------------------------------------
  describe("Historique par événements (RM-04, RM-19, critère 9)", function () {
    it("reconstitue le cycle complet d'un bien à partir des événements", async function () {
      const { registry, agent, owner, newOwner, other } = await loadFixture(withLandFixture);

      await registry.connect(owner).requestTransfer(LAND_ID, newOwner.address); // demande 1
      await registry.connect(agent).rejectTransfer(1n);
      await registry.connect(owner).requestTransfer(LAND_ID, newOwner.address); // demande 2
      await registry.connect(agent).approveTransfer(2n);
      await registry.connect(newOwner).requestTransfer(LAND_ID, other.address); // demande 3
      await registry.connect(newOwner).cancelTransferRequest(3n);

      // LandRegistered et OwnershipChanged : landId est le 1er paramètre indexé.
      // TransferRequested/Approved/Rejected/Cancelled : requestId est le 1er, landId le 2e.
      const byLandSecond = async (name) => registry.queryFilter(registry.filters[name](null, LAND_ID));
      expect(await registry.queryFilter(registry.filters.LandRegistered(LAND_ID))).to.have.length(1);
      expect(await byLandSecond("TransferRejected")).to.have.length(1);
      expect(await byLandSecond("TransferApproved")).to.have.length(1);
      expect(await byLandSecond("TransferCancelled")).to.have.length(1);
      expect((await registry.queryFilter(registry.filters.TransferRequested(null, LAND_ID)))).to.have.length(3);

      const changes = await registry.queryFilter(registry.filters.OwnershipChanged(LAND_ID));
      expect(changes).to.have.length(1);
      expect(changes[0].args.previousOwner).to.equal(owner.address);
      expect(changes[0].args.newOwner).to.equal(newOwner.address);
      // chaque journal donne la transaction et le bloc (exigence §5.6)
      expect(changes[0].transactionHash).to.match(/^0x[0-9a-f]{64}$/);
      expect(changes[0].blockNumber).to.be.gt(0);
    });

    it("conserve la trace d'un changement d'empreinte et d'un changement de statut", async function () {
      const { registry, agent } = await loadFixture(withLandFixture);
      const h2 = sha256Of("v2");
      await registry.connect(agent).updateDocumentHash(LAND_ID, h2);
      await registry.connect(agent).setLandStatus(LAND_ID, LandStatus.Suspendu);
      const hashEvents = await registry.queryFilter(registry.filters.DocumentHashUpdated(LAND_ID));
      expect(hashEvents[0].args.oldHash).to.equal(DOC_HASH);
      expect(hashEvents[0].args.newHash).to.equal(h2);
      expect(await registry.queryFilter(registry.filters.LandStatusChanged(LAND_ID))).to.have.length(1);
    });

    it("les décisions enregistrent la date du bloc (reviewedAt)", async function () {
      const { registry, agent } = await loadFixture(withRequestFixture);
      await time.increase(3600);
      const tx = await registry.connect(agent).approveTransfer(1n);
      const block = await ethers.provider.getBlock((await tx.wait()).blockNumber);
      const req = await registry.getTransferRequest(1n);
      expect(req.reviewedAt).to.equal(BigInt(block.timestamp));
      expect(req.reviewedAt).to.be.gt(req.createdAt);
    });
  });

  // -------------------------------------------------------------------
  describe("Scénarios malveillants et cas limites", function () {
    it("l'ancien titulaire ne peut plus demander de transfert après la validation", async function () {
      const { registry, agent, owner, other } = await loadFixture(withRequestFixture);
      await registry.connect(agent).approveTransfer(1n);
      await expect(registry.connect(owner).requestTransfer(LAND_ID, other.address)).to.be.revertedWithCustomError(registry, "NotLandOwner");
    });

    it("le nouveau titulaire peut à son tour demander un transfert", async function () {
      const { registry, agent, newOwner, other } = await loadFixture(withRequestFixture);
      await registry.connect(agent).approveTransfer(1n);
      await expect(registry.connect(newOwner).requestTransfer(LAND_ID, other.address)).to.emit(registry, "TransferRequested");
    });

    it("deux biens indépendants ont chacun leur demande en attente", async function () {
      const { registry, agent, owner, newOwner } = await loadFixture(withRequestFixture);
      await registry.connect(agent).registerLand(2002n, "TN-DEMO-0002", owner.address, sha256Of("autre bien"));
      await registry.connect(owner).requestTransfer(2002n, newOwner.address);
      expect(await registry.pendingRequestOf(LAND_ID)).to.equal(1n);
      expect(await registry.pendingRequestOf(2002n)).to.equal(2n);
      expect(await registry.pendingRequestCount()).to.equal(2n);
      await registry.connect(agent).rejectTransfer(1n);
      expect(await registry.pendingRequestCount()).to.equal(1n);
    });

    it("ne contient aucune fonction qui permette à l'administrateur de changer le titulaire", async function () {
      const { registry } = await loadFixture(deployFixture);
      const names = registry.interface.fragments.filter((f) => f.type === "function").map((f) => f.name);
      expect(names).to.not.include.members(["setOwner", "transferLand", "forceTransfer", "deleteLand"]);
    });

    it("ne reçoit pas d'argent (pas de fonction receive ni de fallback)", async function () {
      const { registry, outsider } = await loadFixture(deployFixture);
      await expect(outsider.sendTransaction({ to: await registry.getAddress(), value: 1n })).to.be.reverted;
    });
  });
});
