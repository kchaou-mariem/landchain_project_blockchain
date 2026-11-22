const { LANDS } = require("./demoData");
const { hashDemoDocument } = require("./documents");

/**
 * Crée les données de démonstration. Ne fait rien si des biens existent déjà.
 *
 * Scénarios (identifiants de bien -> résultat attendu) :
 *  1001  demande Ahmed -> Sana, VALIDÉE par l'agent 1      : le titulaire devient Sana
 *  1002  demande Fatma -> Mohamed, REFUSÉE par l'agent 2    : le titulaire reste Fatma (RM-13)
 *  1003  demande Mohamed -> Ahmed, laissée EN ATTENTE       : à traiter en direct pendant la démo
 *  1004  bien SUSPENDU par l'agent 1                        : tout transfert est refusé (D5)
 *  1005  demande Fatma -> Sana, ANNULÉE par Fatma           : le bien redevient Actif (D2)
 *  1006  empreinte mise à jour (version 2 du document)      : l'ancien fichier devient "différent"
 *  1007  bien détenu par l'agent 2, demande -> Sana en attente : l'agent 2 ne peut pas décider (D3)
 */
async function seedDemo(registry, actors, { log = () => {} } = {}) {
  if ((await registry.landCount()) !== 0n) {
    log("Des biens existent déjà : initialisation ignorée.");
    return { skipped: true, ops: [], requestIds: {} };
  }

  const ops = [];
  const requestIds = {};

  async function run(label, send) {
    const t0 = Date.now();
    const tx = await send();
    const receipt = await tx.wait();
    ops.push({
      operation: label,
      gasUsed: receipt.gasUsed.toString(),
      ms: Date.now() - t0,
      txHash: receipt.hash,
    });
    log(`  ✔ ${label} (gaz ${receipt.gasUsed})`);
  }

  async function request(label, landId, ownerKey, proposedKey, name) {
    const proposed = await actors[proposedKey].getAddress();
    await run(label, () => registry.connect(actors[ownerKey]).requestTransfer(landId, proposed));
    requestIds[name] = Number(await registry.requestCount());
    return requestIds[name];
  }

  log("Enregistrement des biens par l'agent 1 :");
  for (const land of LANDS) {
    const owner = await actors[land.owner].getAddress();
    await run(`registerLand ${land.id}`, () =>
      registry.connect(actors.agent1).registerLand(land.id, land.ref, owner, hashDemoDocument(land.doc))
    );
  }

  log("Scénario 1001 : transfert validé");
  const r1 = await request("requestTransfer 1001", 1001, "ahmed", "sana", "valide");
  await run(`approveTransfer #${r1}`, () => registry.connect(actors.agent1).approveTransfer(r1));

  log("Scénario 1002 : transfert refusé");
  const r2 = await request("requestTransfer 1002", 1002, "fatma", "mohamed", "refuse");
  await run(`rejectTransfer #${r2}`, () => registry.connect(actors.agent2).rejectTransfer(r2));

  log("Scénario 1003 : demande laissée en attente");
  await request("requestTransfer 1003", 1003, "mohamed", "ahmed", "enAttente");

  log("Scénario 1004 : bien suspendu");
  await run("setLandStatus 1004 -> Suspendu", () =>
    registry.connect(actors.agent1).setLandStatus(1004, 2)
  );

  log("Scénario 1005 : demande annulée");
  const r5 = await request("requestTransfer 1005", 1005, "fatma", "sana", "annule");
  await run(`cancelTransferRequest #${r5}`, () =>
    registry.connect(actors.fatma).cancelTransferRequest(r5)
  );

  log("Scénario 1006 : mise à jour de l'empreinte");
  await run("updateDocumentHash 1006", () =>
    registry.connect(actors.agent1).updateDocumentHash(1006, hashDemoDocument("TF-DEMO-KRO-0006_v2.txt"))
  );

  log("Scénario 1007 : conflit d'intérêts");
  await request("requestTransfer 1007", 1007, "agent2", "sana", "conflit");

  return { skipped: false, ops, requestIds };
}

module.exports = { seedDemo };
