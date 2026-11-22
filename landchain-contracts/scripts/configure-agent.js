const fs = require("fs");
const path = require("path");

const AGENT_ADDRESS = process.env.LANDCHAIN_AGENT2_ADDRESS;
if (!AGENT_ADDRESS) {
  throw new Error("Définissez LANDCHAIN_AGENT2_ADDRESS avant de lancer ce script.");
}

async function main() {
  const { ethers } = require("hardhat");
  if (!ethers.isAddress(AGENT_ADDRESS)) {
    throw new Error(`Adresse Agent 2 invalide : ${AGENT_ADDRESS}`);
  }

  const deploymentPath = path.join(__dirname, "..", "deployments", "localhost.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const [admin] = await ethers.getSigners();
  const registry = await ethers.getContractAt("LandRegistry", deployment.contract.address, admin);
  const agentRole = await registry.AGENT_ROLE();

  if (!(await registry.hasRole(agentRole, AGENT_ADDRESS))) {
    await (await registry.grantRole(agentRole, AGENT_ADDRESS)).wait();
  }

  const currentBalance = await ethers.provider.getBalance(AGENT_ADDRESS);
  if (currentBalance < ethers.parseEther("1")) {
    await (await admin.sendTransaction({
      to: AGENT_ADDRESS,
      value: ethers.parseEther("100"),
    })).wait();
  }

  console.log(`Agent 2 configuré : ${AGENT_ADDRESS}`);
  console.log(`Solde : ${ethers.formatEther(await ethers.provider.getBalance(AGENT_ADDRESS))} ETH`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
