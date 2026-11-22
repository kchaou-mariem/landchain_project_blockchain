const { task } = require("hardhat/config");

task("history", "Affiche l'historique (événements) d'un bien")
  .addParam("land", "Identifiant du bien, par exemple 1001")
  .setAction(async ({ land }, hre) => {
    const { loadDeployedRegistry } = require("../scripts/lib/deploy");
    const { getLandHistory, printHistory, labelsFromInfo } = require("../scripts/lib/history");
    const { registry, info } = await loadDeployedRegistry(hre);
    console.log(`Historique du bien ${land} :`);
    printHistory(await getLandHistory(registry, land, labelsFromInfo(info)));
  });
