// Données fictives de démonstration (aucune donnée réelle, RM-18).
// La localisation et la superficie restent dans les documents hors chaîne (décision D1).
const LANDS = [
  { id: 1001, ref: "TF-DEMO-TUN-0001", owner: "ahmed", doc: "TF-DEMO-TUN-0001.txt" },
  { id: 1002, ref: "TF-DEMO-SFX-0002", owner: "fatma", doc: "TF-DEMO-SFX-0002.txt" },
  { id: 1003, ref: "TF-DEMO-SOU-0003", owner: "mohamed", doc: "TF-DEMO-SOU-0003.txt" },
  { id: 1004, ref: "TF-DEMO-NAB-0004", owner: "ahmed", doc: "TF-DEMO-NAB-0004.txt" },
  { id: 1005, ref: "TF-DEMO-BIZ-0005", owner: "fatma", doc: "TF-DEMO-BIZ-0005.txt" },
  { id: 1006, ref: "TF-DEMO-KRO-0006", owner: "mohamed", doc: "TF-DEMO-KRO-0006.txt" },
  // Bien détenu par un agent : sert à montrer le refus pour conflit d'intérêts (D3).
  { id: 1007, ref: "TF-DEMO-MON-0007", owner: "agent2", doc: "TF-DEMO-MON-0007.txt" },
];

const STATUS = ["Actif", "TransfertEnCours", "Suspendu"];
const REQUEST_STATUS = ["EnAttente", "Validee", "Refusee", "Annulee"];
const VERIFICATION = ["Match", "Mismatch", "NotFound"];

module.exports = { LANDS, STATUS, REQUEST_STATUS, VERIFICATION };
