// Déploiement + données + contrôles + historique, en une fois, sur le réseau en mémoire.
// Ne nécessite pas de nœud : sert à valider les scripts rapidement.
// Usage : npx hardhat run scripts/demo-all.js
const hre = require("hardhat");
const { deployLandRegistry } = require("./lib/deploy");
const { seedDemo } = require("./lib/seed");
const { runChecks, printResults } = require("./lib/check");
const { getLandHistory, printHistory, labelsFromInfo } = require("./lib/history");

async function main() {
  const { registry, actors, info } = await deployLandRegistry(hre, { write: false, log: console.log });
  console.log("\nDonnées de démonstration :");
  const seed = await seedDemo(registry, actors, { log: console.log });
  console.log("\nContrôles :");
  const failed = printResults(await runChecks(registry, actors, seed.requestIds));
  console.log("\nHistorique du bien 1001 :");
  printHistory(await getLandHistory(registry, 1001, labelsFromInfo(info)));
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
