// Répartition des comptes de test Hardhat entre les acteurs du système.
// Ces comptes sont publics et identiques sur toutes les installations Hardhat :
// ne jamais les utiliser sur un réseau réel.
const ACTORS = [
  { key: "admin", index: 0, role: "Administrateur technique", label: "Admin" },
  { key: "agent1", index: 1, role: "Agent foncier habilité", label: "Agent 1" },
  { key: "agent2", index: 2, role: "Agent foncier habilité", label: "Agent 2" },
  { key: "ahmed", index: 3, role: "Propriétaire", label: "Ahmed" },
  { key: "fatma", index: 4, role: "Propriétaire", label: "Fatma" },
  { key: "mohamed", index: 5, role: "Propriétaire", label: "Mohamed" },
  { key: "sana", index: 6, role: "Acheteur / vérificateur", label: "Sana" },
  { key: "intruder", index: 7, role: "Compte sans droit (tests de refus)", label: "Intrus" },
];

async function getActors(ethers) {
  const signers = await ethers.getSigners();
  if (signers.length < ACTORS.length) {
    throw new Error(
      `Il faut au moins ${ACTORS.length} comptes, ${signers.length} disponibles.`
    );
  }
  const byKey = {};
  for (const a of ACTORS) byKey[a.key] = signers[a.index];
  return byKey;
}

async function describeActors(actors) {
  const rows = [];
  for (const a of ACTORS) {
    rows.push({
      index: a.index,
      key: a.key,
      label: a.label,
      role: a.role,
      address: await actors[a.key].getAddress(),
    });
  }
  return rows;
}

module.exports = { ACTORS, getActors, describeActors };
