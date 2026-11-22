// Déploie LandRegistry sur le réseau choisi et écrit deployments/<réseau>.json + l'ABI.
// Usage : npx hardhat run scripts/deploy.js --network localhost
const hre = require("hardhat");
const { deployLandRegistry } = require("./lib/deploy");

async function main() {
  const write = hre.network.name !== "hardhat"; // le réseau en mémoire disparaît à la fin du script
  console.log(`Réseau : ${hre.network.name}`);
  const { info } = await deployLandRegistry(hre, { write, log: console.log });

  console.log("\nComptes de test :");
  for (const a of info.accounts) {
    console.log(`  #${a.index}  ${a.label.padEnd(8)} ${a.address}  ${a.role}`);
  }
  if (!write) console.log("\n(Réseau en mémoire : aucun fichier écrit. Utilisez --network localhost.)");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
