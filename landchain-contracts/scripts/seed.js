// Crée les biens et les scénarios de démonstration sur le contrat déjà déployé.
// Usage : npx hardhat run scripts/seed.js --network localhost
const hre = require("hardhat");
const { loadDeployedRegistry } = require("./lib/deploy");
const { seedDemo } = require("./lib/seed");
const fs = require("fs");
const path = require("path");
const { DEPLOY_DIR } = require("./lib/deploy");

async function main() {
  const { registry, actors } = await loadDeployedRegistry(hre);
  const result = await seedDemo(registry, actors, { log: console.log });
  if (result.skipped) return;

  const total = result.ops.reduce((s, o) => s + BigInt(o.gasUsed), 0n);
  console.log(`\n${result.ops.length} transactions, gaz total ${total}.`);
  console.log("Identifiants de demande :", JSON.stringify(result.requestIds));

  // Sauvegardé pour que check.js sache quelle demande correspond à quel scénario.
  fs.writeFileSync(
    path.join(DEPLOY_DIR, `${hre.network.name}.seed.json`),
    JSON.stringify({ requestIds: result.requestIds, ops: result.ops }, null, 2) + "\n"
  );
  console.log(`Rapport écrit : deployments/${hre.network.name}.seed.json`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
