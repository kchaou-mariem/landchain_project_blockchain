const fs = require("fs");
const path = require("path");
const { getActors, describeActors } = require("./accounts");

const DEPLOY_DIR = path.join(__dirname, "..", "..", "deployments");

/**
 * Déploie LandRegistry et attribue AGENT_ROLE aux deux agents.
 * Si `write` est vrai, écrit deployments/<réseau>.json et deployments/LandRegistry.abi.json
 * (adresse et ABI lus par le frontend, décision A8).
 */
async function deployLandRegistry(hre, { write = false, log = () => {} } = {}) {
  const { ethers, network, artifacts } = hre;
  const actors = await getActors(ethers);
  const adminAddress = await actors.admin.getAddress();

  const Factory = await ethers.getContractFactory("LandRegistry", actors.admin);
  const registry = await Factory.deploy(adminAddress);
  const deployTx = registry.deploymentTransaction();
  await registry.waitForDeployment();
  const deployReceipt = await deployTx.wait();
  const address = await registry.getAddress();
  log(`LandRegistry déployé : ${address} (bloc ${deployReceipt.blockNumber}, gaz ${deployReceipt.gasUsed})`);

  const AGENT_ROLE = await registry.AGENT_ROLE();
  const grants = [];
  for (const key of ["agent1", "agent2"]) {
    const configuredAddress = network.name === "localhost" && key === "agent2"
      ? process.env.LANDCHAIN_AGENT2_ADDRESS
      : undefined;
    const agentAddress = configuredAddress ?? await actors[key].getAddress();
    if (!ethers.isAddress(agentAddress)) {
      throw new Error(`Adresse ${key} invalide : ${agentAddress}`);
    }
    const tx = await registry.connect(actors.admin).grantRole(AGENT_ROLE, agentAddress);
    const receipt = await tx.wait();
    grants.push({ agent: agentAddress, txHash: receipt.hash, gasUsed: receipt.gasUsed.toString() });
    log(`AGENT_ROLE attribué à ${key} : ${agentAddress}`);
    if (configuredAddress && (await ethers.provider.getBalance(agentAddress)) < ethers.parseEther("1")) {
      await (await actors.admin.sendTransaction({
        to: agentAddress,
        value: ethers.parseEther("100"),
      })).wait();
      log(`Solde local attribué à ${key} : 100 ETH`);
    }
  }

  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const info = {
    network: network.name,
    chainId,
    deployedAt: new Date().toISOString(),
    contract: {
      name: "LandRegistry",
      address,
      deployTxHash: deployReceipt.hash,
      blockNumber: deployReceipt.blockNumber,
      deployGasUsed: deployReceipt.gasUsed.toString(),
    },
    roles: { admin: adminAddress, agentGrants: grants },
    accounts: await describeActors(actors),
  };

  if (write) {
    fs.mkdirSync(DEPLOY_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(DEPLOY_DIR, `${network.name}.json`),
      JSON.stringify(info, null, 2) + "\n"
    );
    const artifact = await artifacts.readArtifact("LandRegistry");
    fs.writeFileSync(
      path.join(DEPLOY_DIR, "LandRegistry.abi.json"),
      JSON.stringify(artifact.abi, null, 2) + "\n"
    );
    log(`Fichiers écrits dans deployments/ (${network.name}.json, LandRegistry.abi.json)`);
  }

  return { registry, actors, info };
}

/** Recharge le contrat déjà déployé à partir de deployments/<réseau>.json. */
async function loadDeployedRegistry(hre) {
  const { ethers, network } = hre;
  const file = path.join(DEPLOY_DIR, `${network.name}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(
      `Fichier ${file} introuvable. Lancez d'abord : npm run deploy:local`
    );
  }
  const info = JSON.parse(fs.readFileSync(file, "utf8"));
  const address = info.contract.address;
  const code = await ethers.provider.getCode(address);
  if (code === "0x") {
    throw new Error(
      `Aucun contrat à l'adresse ${address}. Le nœud Hardhat a probablement été redémarré ` +
        `(sa chaîne repart de zéro). Relancez : npm run setup:local`
    );
  }
  const registry = await ethers.getContractAt("LandRegistry", address);
  const actors = await getActors(ethers);
  return { registry, actors, info };
}

module.exports = { DEPLOY_DIR, deployLandRegistry, loadDeployedRegistry };
