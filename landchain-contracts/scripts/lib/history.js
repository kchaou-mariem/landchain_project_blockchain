const { STATUS } = require("./demoData");

const short = (h) => (h ? `${h.slice(0, 10)}…${h.slice(-4)}` : "");

/**
 * Reconstitue l'historique d'un bien à partir des événements de la chaîne (RM-19).
 * Pour chaque événement : date du bloc, numéro de bloc, hash de transaction,
 * émetteur, type d'opération (exigence §5.6 du cahier des charges).
 * `labels` : table adresse -> nom lisible (optionnelle).
 */
async function getLandHistory(registry, landId, labels = {}) {
  const f = registry.filters;
  const id = BigInt(landId);
  const queries = [
    f.LandRegistered(id),
    f.DocumentHashUpdated(id),
    f.LandStatusChanged(id),
    f.TransferRequested(null, id),
    f.TransferApproved(null, id),
    f.TransferRejected(null, id),
    f.TransferCancelled(null, id),
    f.OwnershipChanged(id),
  ];

  const logs = [];
  for (const q of queries) logs.push(...(await registry.queryFilter(q)));
  logs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);

  const who = (addr) => (labels[addr.toLowerCase()] ? `${labels[addr.toLowerCase()]}` : short(addr));

  const entries = [];
  for (const log of logs) {
    const block = await log.getBlock();
    const tx = await log.getTransaction();
    const a = log.args;
    let details = "";
    switch (log.eventName) {
      case "LandRegistered":
        details = `titulaire=${who(a.owner)} empreinte=${short(a.documentHash)}`;
        break;
      case "DocumentHashUpdated":
        details = `${short(a.oldHash)} → ${short(a.newHash)}`;
        break;
      case "LandStatusChanged":
        details = `${STATUS[Number(a.oldStatus)]} → ${STATUS[Number(a.newStatus)]}`;
        break;
      case "TransferRequested":
        details = `demande #${a.requestId} : ${who(a.currentOwner)} → ${who(a.proposedOwner)}`;
        break;
      case "TransferApproved":
      case "TransferRejected":
      case "TransferCancelled":
        details = `demande #${a.requestId}`;
        break;
      case "OwnershipChanged":
        details = `${who(a.previousOwner)} → ${who(a.newOwner)} (demande #${a.requestId})`;
        break;
    }
    entries.push({
      date: new Date(block.timestamp * 1000).toISOString().replace("T", " ").slice(0, 19),
      blockNumber: log.blockNumber,
      txHash: log.transactionHash,
      from: tx.from,
      fromLabel: who(tx.from),
      event: log.eventName,
      details,
    });
  }
  return entries;
}

function printHistory(entries, log = console.log) {
  if (entries.length === 0) {
    log("Aucun événement pour ce bien.");
    return;
  }
  for (const e of entries) {
    log(
      `${e.date} | bloc ${String(e.blockNumber).padStart(3)} | ${short(e.txHash)} | ` +
        `${e.fromLabel.padEnd(10)} | ${e.event.padEnd(20)} | ${e.details}`
    );
  }
}

function labelsFromInfo(info) {
  const labels = {};
  for (const a of info.accounts) labels[a.address.toLowerCase()] = a.label;
  return labels;
}

module.exports = { getLandHistory, printHistory, labelsFromInfo };
