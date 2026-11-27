// Déploie LandRegistry sur le réseau choisi et écrit deployments/<réseau>.json + l'ABI.
// Usage : npm run deploy:local ou npm run deploy:sepolia
const hre = require("hardhat");
const { deployLandRegistry } = require("./lib/deploy");

async function main() {
  if (hre.network.name === "sepolia" && !process.env.DEPLOYER_PRIVATE_KEY) {
    throw new Error(
      "DEPLOYER_PRIVATE_KEY est requis pour déployer sur Sepolia. Configurez-le dans le fichier .env local."
    );
  }
  const write = hre.network.name !== "hardhat"; // le réseau en mémoire disparaît à la fin du script
  console.log(`Réseau : ${hre.network.name}`);
  const { info } = await deployLandRegistry(hre, { write, log: console.log });

  console.log("\nCompte(s) configuré(s) :");
  for (const a of info.accounts) {
    console.log(`  #${a.index}  ${a.label.padEnd(8)} ${a.address}  ${a.role}`);
  }
  if (hre.network.name === "sepolia") {
    console.log("Aucun rôle AGENT_ROLE n'a été accordé. Attribuez les rôles depuis l'application.");
  }
  if (!write) console.log("\n(Réseau en mémoire : aucun fichier écrit. Utilisez --network localhost.)");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
