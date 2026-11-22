// Vérifie les permissions et les règles métier sur le contrat déployé et initialisé.
// Les opérations interdites sont simulées (staticCall) : rien n'est écrit sur la chaîne.
// Usage : npx hardhat run scripts/check.js --network localhost
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { loadDeployedRegistry, DEPLOY_DIR } = require("./lib/deploy");
const { runChecks, printResults } = require("./lib/check");

async function main() {
  const { registry, actors } = await loadDeployedRegistry(hre);
  const seedFile = path.join(DEPLOY_DIR, `${hre.network.name}.seed.json`);
  if (!fs.existsSync(seedFile)) {
    throw new Error("Fichier de scénarios introuvable. Lancez d'abord : npm run seed:local");
  }
  const { requestIds } = JSON.parse(fs.readFileSync(seedFile, "utf8"));

  console.log(`Contrôles sur ${await registry.getAddress()} (${hre.network.name})\n`);
  const results = await runChecks(registry, actors, requestIds);
  const failed = printResults(results);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
