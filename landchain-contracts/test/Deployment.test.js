// Phase 3 : valide les scripts de déploiement, de données et de contrôle sur le réseau en mémoire.
const { expect } = require("chai");
const hre = require("hardhat");
const { deployLandRegistry } = require("../scripts/lib/deploy");
const { seedDemo } = require("../scripts/lib/seed");
const { runChecks } = require("../scripts/lib/check");
const { getLandHistory, labelsFromInfo } = require("../scripts/lib/history");

describe("Phase 3 - scripts de déploiement local", function () {
  this.timeout(120000);
  let snapshotId, registry, actors, info, seed;

  before(async function () {
    snapshotId = await hre.network.provider.send("evm_snapshot");
    ({ registry, actors, info } = await deployLandRegistry(hre, { write: false }));
    seed = await seedDemo(registry, actors);
  });

  after(async function () {
    await hre.network.provider.send("evm_revert", [snapshotId]);
  });

  it("déploie le contrat et attribue les rôles", async function () {
    const agentRole = await registry.AGENT_ROLE();
    const adminRole = await registry.DEFAULT_ADMIN_ROLE();
    expect(await registry.hasRole(adminRole, actors.admin.address)).to.equal(true);
    expect(await registry.hasRole(agentRole, actors.agent1.address)).to.equal(true);
    expect(await registry.hasRole(agentRole, actors.agent2.address)).to.equal(true);
    expect(await registry.hasRole(agentRole, actors.admin.address)).to.equal(false);
    expect(info.contract.address).to.equal(await registry.getAddress());
    expect(info.accounts).to.have.length(8);
  });

  it("crée les 7 biens et les 5 demandes de démonstration", async function () {
    expect(seed.skipped).to.equal(false);
    expect(await registry.landCount()).to.equal(7n);
    expect(await registry.requestCount()).to.equal(5n);
    expect(await registry.pendingRequestCount()).to.equal(2n);
  });

  it("ignore une seconde initialisation", async function () {
    const again = await seedDemo(registry, actors);
    expect(again.skipped).to.equal(true);
    expect(await registry.landCount()).to.equal(7n);
  });

  it("réussit tous les contrôles de permissions et de règles", async function () {
    const results = await runChecks(registry, actors, seed.requestIds);
    const failed = results.filter((r) => !r.ok);
    expect(failed, JSON.stringify(failed, null, 2)).to.have.length(0);
  });

  it("reconstitue l'historique du bien 1001 depuis les événements", async function () {
    const entries = await getLandHistory(registry, 1001, labelsFromInfo(info));
    expect(entries.map((e) => e.event)).to.deep.equal([
      "LandRegistered",
      "TransferRequested",
      "TransferApproved",
      "OwnershipChanged",
    ]);
    expect(entries[0].fromLabel).to.equal("Agent 1");
    for (const e of entries) {
      expect(e.txHash).to.match(/^0x[0-9a-f]{64}$/);
      expect(e.date).to.match(/^\d{4}-\d{2}-\d{2} /);
    }
  });
});
