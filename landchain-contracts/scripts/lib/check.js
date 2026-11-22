const { LANDS, VERIFICATION } = require("./demoData");
const { hashDemoDocument, sha256Hex } = require("./documents");

// ---------------------------------------------------------------------------
// Décodage d'une erreur de contrat (erreur personnalisée Solidity)
// ---------------------------------------------------------------------------
function findRevertData(err, depth = 0) {
  if (!err || depth > 5 || typeof err !== "object") return null;
  for (const key of ["data", "error", "info", "cause"]) {
    const v = err[key];
    if (typeof v === "string" && /^0x[0-9a-fA-F]{8,}$/.test(v)) return v;
    if (v && typeof v === "object") {
      const found = findRevertData(v, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function decodeRevertName(registry, err) {
  const data = findRevertData(err);
  if (data) {
    try {
      const parsed = registry.interface.parseError(data);
      if (parsed) return parsed.name;
    } catch (_) {
      /* on passe au repli */
    }
  }
  if (err && err.revert && err.revert.name) return err.revert.name;
  const m = /custom error ['"]?([A-Za-z0-9_]+)\(/.exec(String((err && err.message) || ""));
  return m ? m[1] : null;
}

/** Simule l'appel (staticCall) sans rien écrire sur la chaîne. */
async function simulate(registry, signer, fn, args) {
  try {
    await registry.connect(signer)[fn].staticCall(...args);
    return { reverted: false, error: null };
  } catch (err) {
    return { reverted: true, error: decodeRevertName(registry, err) };
  }
}

// ---------------------------------------------------------------------------
// Contrôle des permissions et des règles (opérations interdites)
// ---------------------------------------------------------------------------
async function runChecks(registry, actors, requestIds) {
  const results = [];
  const record = (rule, description, expected, actual) =>
    results.push({ rule, description, expected, actual, ok: expected === actual });

  const UNAUTH = "AccessControlUnauthorizedAccount";
  const OK = "(aucune erreur)";
  const someHash = hashDemoDocument("TF-DEMO-TUN-0001.txt");
  const agentRole = await registry.AGENT_ROLE();
  const adminRole = await registry.DEFAULT_ADMIN_ROLE();

  async function expectError(rule, description, signerKey, fn, args, expectedError) {
    const r = await simulate(registry, actors[signerKey], fn, args);
    record(rule, description, expectedError, r.reverted ? r.error ?? "(erreur inconnue)" : OK);
  }

  // --- Rôles ---------------------------------------------------------------
  record("RM-16", "Admin possède DEFAULT_ADMIN_ROLE", true, await registry.hasRole(adminRole, actors.admin.address));
  record("RM-16", "Admin ne possède pas AGENT_ROLE", false, await registry.hasRole(agentRole, actors.admin.address));
  record("RM-02", "Agent 1 possède AGENT_ROLE", true, await registry.hasRole(agentRole, actors.agent1.address));
  record("RM-02", "Propriétaire n'a pas AGENT_ROLE", false, await registry.hasRole(agentRole, actors.ahmed.address));

  await expectError("RM-17", "Un non-admin ne peut pas attribuer un rôle", "ahmed",
    "grantRole", [agentRole, actors.ahmed.address], UNAUTH);

  // --- Enregistrement ------------------------------------------------------
  await expectError("RM-02", "Un propriétaire ne peut pas enregistrer un bien", "ahmed",
    "registerLand", [2001, "TF-X", actors.ahmed.address, someHash], UNAUTH);
  await expectError("RM-16", "L'administrateur ne peut pas enregistrer un bien", "admin",
    "registerLand", [2001, "TF-X", actors.admin.address, someHash], UNAUTH);
  await expectError("RM-01", "Doublon d'identifiant refusé", "agent1",
    "registerLand", [1001, "TF-X", actors.ahmed.address, someHash], "LandAlreadyExists");
  await expectError("RM-03", "Empreinte nulle refusée", "agent1",
    "registerLand", [2001, "TF-X", actors.ahmed.address, "0x" + "00".repeat(32)], "InvalidDocumentHash");
  await expectError("RM-03", "Titulaire nul refusé", "agent1",
    "registerLand", [2001, "TF-X", "0x" + "00".repeat(20), someHash], "InvalidOwner");
  await expectError("RM-03", "Référence vide refusée", "agent1",
    "registerLand", [2001, "", actors.ahmed.address, someHash], "EmptyReference");

  // --- Modification --------------------------------------------------------
  await expectError("RM-06", "Un intrus ne peut pas modifier l'empreinte", "intruder",
    "updateDocumentHash", [1001, hashDemoDocument("TF-DEMO-SFX-0002.txt")], UNAUTH);
  await expectError("RM-06", "Un propriétaire ne peut pas changer le statut", "ahmed",
    "setLandStatus", [1001, 2], UNAUTH);

  // --- Transfert -----------------------------------------------------------
  await expectError("RM-07", "Un non-titulaire ne peut pas demander un transfert", "intruder",
    "requestTransfer", [1003, actors.intruder.address], "NotLandOwner");
  await expectError("RM-09", "Une seule demande en attente par bien", "mohamed",
    "requestTransfer", [1003, actors.sana.address], "PendingRequestExists");
  await expectError("RM-08", "Nouveau titulaire = titulaire actuel refusé", "mohamed",
    "requestTransfer", [1006, actors.mohamed.address], "InvalidProposedOwner");
  await expectError("RM-08", "Nouveau titulaire = adresse zéro refusé", "mohamed",
    "requestTransfer", [1006, "0x" + "00".repeat(20)], "InvalidProposedOwner");
  await expectError("RM-07", "L'ancien titulaire (Ahmed) ne peut plus demander un transfert du bien 1001", "ahmed",
    "requestTransfer", [1001, actors.fatma.address], "NotLandOwner");
  await expectError("D5", "Transfert refusé sur un bien suspendu", "ahmed",
    "requestTransfer", [1004, actors.sana.address], "LandIsSuspended");
  await expectError("RM-11", "Un intrus ne peut pas valider une demande", "intruder",
    "approveTransfer", [requestIds.enAttente], UNAUTH);
  await expectError("RM-16", "L'administrateur ne peut pas valider une demande", "admin",
    "approveTransfer", [requestIds.enAttente], UNAUTH);
  await expectError("RM-11", "Une demande déjà validée ne peut plus être décidée", "agent1",
    "approveTransfer", [requestIds.valide], "RequestNotPending");
  await expectError("RM-11", "Une demande refusée ne peut pas être validée ensuite", "agent1",
    "approveTransfer", [requestIds.refuse], "RequestNotPending");
  await expectError("D2", "Une demande annulée ne peut plus être validée", "agent1",
    "approveTransfer", [requestIds.annule], "RequestNotPending");
  await expectError("D2", "Seul l'auteur peut annuler sa demande", "intruder",
    "cancelTransferRequest", [requestIds.enAttente], "NotRequester");
  await expectError("D3", "Un agent ne décide pas d'une demande dont il est partie", "agent2",
    "approveTransfer", [requestIds.conflit], "ConflictOfInterest");
  await expectError("D3", "Idem pour un refus", "agent2",
    "rejectTransfer", [requestIds.conflit], "ConflictOfInterest");
  await expectError("RM-10", "Demande inexistante", "agent1",
    "approveTransfer", [9999], "RequestNotFound");
  await expectError("RM-22", "Lecture d'un bien inexistant", "intruder",
    "getLand", [9999], "LandNotFound");

  // --- Vérification documentaire (RM-21 à RM-23) ----------------------------
  const verify = async (id, hash) => VERIFICATION[Number(await registry.verifyDocument(id, hash))];
  record("RM-22", "Document d'origine du bien 1001 -> Match", "Match",
    await verify(1001, hashDemoDocument("TF-DEMO-TUN-0001.txt")));
  record("RM-22", "Document modifié (120 -> 210 m²) -> Mismatch", "Mismatch",
    await verify(1001, hashDemoDocument("TF-DEMO-TUN-0001_MODIFIE.txt")));
  record("RM-22", "Ancienne version du bien 1006 -> Mismatch", "Mismatch",
    await verify(1006, hashDemoDocument("TF-DEMO-KRO-0006.txt")));
  record("RM-22", "Nouvelle version du bien 1006 -> Match", "Match",
    await verify(1006, hashDemoDocument("TF-DEMO-KRO-0006_v2.txt")));
  record("RM-22", "Bien inexistant -> NotFound", "NotFound",
    await verify(9999, sha256Hex(Buffer.from("n'importe quoi"))));

  // --- État final attendu des scénarios ------------------------------------
  const ownerOf = async (id) => (await registry.getLand(id)).owner;
  record("RM-14", "1001 : le transfert validé a changé le titulaire (Sana)", actors.sana.address, await ownerOf(1001));
  record("RM-13", "1002 : le transfert refusé a laissé le titulaire (Fatma)", actors.fatma.address, await ownerOf(1002));
  record("RM-09", "1003 : titulaire inchangé tant que la demande est en attente (Mohamed)", actors.mohamed.address, await ownerOf(1003));
  record("D2", "1005 : après annulation, le titulaire reste Fatma", actors.fatma.address, await ownerOf(1005));
  record("D5", "1004 : statut Suspendu", 2, Number((await registry.getLand(1004)).status));
  record("RM-10", "1005 : statut de la demande annulée = Annulee (3)", 3, Number((await registry.getTransferRequest(requestIds.annule)).status));
  record("RM-15", "1001 : la demande validée enregistre l'agent décisionnaire", actors.agent1.address, (await registry.getTransferRequest(requestIds.valide)).reviewedBy);
  record("Compteurs", "Nombre de biens enregistrés", LANDS.length, Number(await registry.landCount()));
  record("Compteurs", "Demandes en attente (1003 et 1007)", 2, Number(await registry.pendingRequestCount()));

  return results;
}

function printResults(results, log = console.log) {
  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed += 1;
    log(`${r.ok ? "  ✔" : "  ✘"} [${r.rule}] ${r.description}` +
        (r.ok ? "" : `\n      attendu : ${r.expected}\n      obtenu  : ${r.actual}`));
  }
  log(`\n${results.length - failed}/${results.length} contrôles réussis.`);
  return failed;
}

module.exports = { runChecks, printResults, decodeRevertName };
