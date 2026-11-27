import { useEffect, useState, type ReactNode } from 'react'
import {
  Activity, ArrowLeftRight, Bell, Blocks, Check, CheckCircle2, ChevronDown, ChevronLeft,
  ChevronRight, CircleAlert, Clock3, Copy, Database, ExternalLink, FileCheck2, FileText,
  Fingerprint, Home, LandPlot, LayoutDashboard, LockKeyhole, Menu, MoreHorizontal,
  LoaderCircle, Plus, Search, Settings, ShieldCheck, UploadCloud, UsersRound, Wallet, X, XCircle,
  UserRound, LogOut, Globe2, PanelLeftClose, CalendarDays, Mail, AlertTriangle, SlidersHorizontal,
  RefreshCw, WifiOff, ArrowUpRight, ArrowDownLeft, Trash2,
} from 'lucide-react'
import {
  AddressValue, Badge, Button, Card, CopyValue, DataTable, EmptyState, Field, KpiCard, LoadingState,
  PageHead, Toast, Toolbar, TransactionStatusCard, WalletCard, statusTone,
} from './components/ui'
import { WalletDropdown, WalletModule } from './components/wallet/WalletModule'
import { approveLandProposal, approveTransfer, BlockchainError, cancelLandProposal, cancelTransferRequest, clearWalletAuthentication, connectWallet, formatBlockchainError, getAgentAccounts, getAuthenticatedWallet, getBrowserProvider, getDashboardStats, getEthereum, getLandDetails, getLandProposals, getPersonalDashboardStats, getRegistryLands, getTransactionHistory, getTransferRequestDetails, getTransferRequests, getWalletRole, grantAgentRole, LANDCHAIN_CHAIN_ID, LANDCHAIN_CHAIN_NAME, LANDREGISTRY_ADDRESS, registerLand, rejectLandProposal, rejectTransfer, requestTransfer, revokeAgentRole, shortenAddress, submitLandProposal, verifyDocument } from './lib/blockchain'

type Role = 'Administrator' | 'Land agent' | 'User'
type Page = 'landing' | 'wallet' | 'walletdetails' | 'dashboard' | 'registry' | 'register' | 'verify' | 'transfers' | 'history' | 'access' | 'settings' | 'profile' | 'land' | 'transfer'

const nav: { id: Page; label: string; icon: typeof Home }[] = [
  { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'registry', label: 'Registre foncier', icon: LandPlot },
  { id: 'register', label: 'Déposer un bien', icon: Plus },
  { id: 'verify', label: 'Vérifier les documents', icon: FileCheck2 },
  { id: 'transfers', label: 'Demandes de transfert', icon: ArrowLeftRight },
  { id: 'history', label: 'Historique des transactions', icon: Activity },
  { id: 'access', label: 'Gestion des accès', icon: UsersRound },
  { id: 'settings', label: 'Paramètres', icon: Settings },
]

const rolePages: Record<Role, Page[]> = {
  Administrator: ['dashboard', 'registry', 'verify', 'history', 'access', 'settings'],
  'Land agent': ['dashboard', 'registry', 'register', 'verify', 'transfers', 'history', 'settings'],
  User: ['dashboard', 'registry', 'register', 'verify', 'transfers', 'history', 'settings'],
}

function canAccess(role: Role, page: Page) {
  return rolePages[role].includes(page) || ['profile', 'walletdetails', 'land', 'transfer'].includes(page)
}

function formatEventType(type: string) {
  const labels: Record<string, string> = {
    LandRegistered: 'Bien enregistré',
    'Land registered': 'Bien enregistré',
    'Land proposal submitted': 'Proposition de bien déposée',
    'Land proposal approved': 'Proposition de bien approuvée',
    'Land proposal rejected': 'Proposition de bien refusée',
    'Land proposal cancelled': 'Proposition de bien annulée',
    DocumentHashUpdated: 'Empreinte du document mise à jour',
    'Document hash updated': 'Empreinte du document mise à jour',
    TransferRequested: 'Transfert demandé',
    'Transfer requested': 'Transfert demandé',
    TransferApproved: 'Transfert approuvé',
    'Transfer approved': 'Transfert approuvé',
    TransferRejected: 'Transfert refusé',
    'Transfer rejected': 'Transfert refusé',
    TransferCancelled: 'Transfert annulé',
    'Transfer cancelled': 'Transfert annulé',
    LandProposalSubmitted: 'Proposition de bien déposée',
    LandProposalApproved: 'Proposition de bien approuvée',
    LandProposalRejected: 'Proposition de bien refusée',
  }
  return labels[type] ?? type
}

function eventTransactionStatus(type: string): 'pending' | 'confirmed' | 'failed' {
  if (type.includes('rejected') || type.includes('cancelled')) return 'failed'
  if (type.includes('requested') || type.includes('submitted')) return 'pending'
  return 'confirmed'
}

function AgentProposalInbox() {
  const [proposals, setProposals] = useState<Awaited<ReturnType<typeof getLandProposals>>>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  async function load() {
    setLoading(true)
    setMessage('')
    try { setProposals(await getLandProposals(getBrowserProvider())) }
    catch (cause) { setMessage(formatBlockchainError(cause, 'Impossible de charger les propositions à valider.')) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  async function decide(proposalId: string, action: 'approve' | 'reject') {
    setSubmitting(true)
    setMessage('')
    try {
      const currentProposals = await getLandProposals(getBrowserProvider())
      if (!currentProposals.some(proposal => proposal.id === proposalId)) {
        await load()
        throw new BlockchainError(`La proposition #${proposalId} n’est plus ouverte. Un autre agent l’a peut-être déjà traitée. La liste a été actualisée.`)
      }
      const { signer } = await connectWallet()
      const receipt = action === 'approve'
        ? await approveLandProposal(signer, BigInt(proposalId))
        : await rejectLandProposal(signer, BigInt(proposalId))
      setMessage(`Proposition #${proposalId} ${action === 'approve' ? 'approuvée' : 'refusée'} dans le bloc ${receipt?.blockNumber ?? 'inconnu'}.`)
      await load()
    } catch (cause) { setMessage(formatBlockchainError(cause, 'La décision sur la proposition a échoué.')) }
    finally { setSubmitting(false) }
  }
  return <Card className="data-card agent-proposal-inbox"><div className="card-head"><div><h2>Propositions de biens à valider</h2><p>Les propositions déposées par les utilisateurs sont à accepter ou refuser.</p></div><Button variant="secondary" onClick={()=>void load()}>Actualiser</Button></div>{message&&<div className="notice notice-error"><CircleAlert size={18}/><p>{message}</p></div>}{loading ? <LoadingState label="Chargement des propositions…" /> : proposals.length ? <DataTable headings={['Proposition','Bien','Référence','Propriétaire','Déposée par','Actions']} total={`${proposals.length} proposition(s) en attente`} rows={proposals.map(proposal => [<span className="mono">#{proposal.id}</span>,proposal.landId,proposal.reference,<span className="mono">{shortenAddress(proposal.owner)}</span>,<span className="mono">{shortenAddress(proposal.submittedBy)}</span>,<><Button variant="danger" loading={submitting} onClick={()=>void decide(proposal.id,'reject')}>Refuser</Button><Button loading={submitting} onClick={()=>void decide(proposal.id,'approve')}>Approuver</Button></>])}/>:<EmptyState icon={LandPlot} title="Aucune proposition en attente" description="Les utilisateurs n’ont pas encore déposé de proposition."/>}</Card>
}

function Dashboard({ go, role }: { go: (p: Page) => void; role: Role }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getDashboardStats>> | null>(null)
  const [personalData, setPersonalData] = useState<Awaited<ReturnType<typeof getPersonalDashboardStats>> | null>(null)
  const [error, setError] = useState('')
  async function loadDashboard() {
    setError('')
    try {
      const provider = getBrowserProvider()
      const globalData = await getDashboardStats(provider)
      setData(globalData)
      if (role === 'User') {
        const accounts = await provider.send('eth_accounts', [])
        const address = (accounts as string[])[0]
        if (!address) throw new BlockchainError('Connectez votre portefeuille pour afficher vos statistiques personnelles.')
        setPersonalData(await getPersonalDashboardStats(provider, address))
      } else {
        setPersonalData(null)
      }
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossible de charger les statistiques blockchain.') }
  }
  useEffect(() => { void loadDashboard() }, [])
  const stats = data ? role !== 'User' ? [
    ['Biens enregistrés', data.registeredProperties.toString(), 'Registre foncier actuel', LandPlot, 'blue'],
    ['Transferts en attente', data.pendingTransfers.toString(), 'Demandes à examiner', ArrowLeftRight, 'amber'],
    ['Documents enregistrés', data.documentRecords.toString(), 'Empreintes sécurisées', FileCheck2, 'green'],
    ['Événements blockchain', data.blockchainEvents.toString(), 'Activité du réseau local', Blocks, 'purple'],
  ] : personalData ? [
    ['Mes biens', personalData.ownedProperties.toString(), 'Biens dont je suis propriétaire', LandPlot, 'blue'],
    ['Mes transactions', personalData.personalTransactions.toString(), 'Activités liées à mes biens', Activity, 'purple'],
    ['Mes demandes', personalData.personalTransfers.toString(), 'Demandes de transfert me concernant', ArrowLeftRight, 'amber'],
    ['Mes documents', personalData.ownedProperties.toString(), 'Empreintes de mes biens', FileCheck2, 'green'],
  ] : [] : []
  return <>
    <PageHead title="Vue d’ensemble de la blockchain" description={role === 'User' ? `Vos statistiques personnelles sur ${LANDCHAIN_CHAIN_NAME}.` : `Statistiques globales du registre sur ${LANDCHAIN_CHAIN_NAME}.`} action={<><Button variant="secondary" onClick={()=>void loadDashboard()}><RefreshCw size={16}/> Actualiser</Button>{role === 'Land agent' && <Button onClick={() => go('register')}><Plus size={17} /> Déposer un bien</Button>}</>} />
    {error&&<div className="network-warning"><CircleAlert size={18}/><span>{error}</span></div>}
    {data ? <div className="stats-grid">{stats.map(([label, value, meta, Icon, color]) => <KpiCard key={label as string} label={label as string} value={value as string} meta={meta as string} icon={Icon as typeof Home} tone={color as string}/>)}</div> : <LoadingState label="Chargement des statistiques blockchain…" />}
    <div className="quick-card">
      <div><span className="eyebrow">ACTIONS RAPIDES</span><h2>Que souhaitez-vous faire ?</h2></div>
      <div className="quick-actions">
        {role === 'Land agent' && <button onClick={() => go('register')}><span><LandPlot size={19} /></span><b>Déposer un bien</b><small>Créer un nouveau dossier</small><ChevronRight size={17} /></button>}
        <button onClick={() => go('verify')}><span><Fingerprint size={19} /></span><b>Vérifier un document</b><small>Contrôler l’empreinte d’un PDF</small><ChevronRight size={17} /></button>
        {role !== 'Administrator' && <button onClick={() => go('transfers')}><span><ArrowLeftRight size={19} /></span><b>Demander un transfert</b><small>Changer le propriétaire du bien</small><ChevronRight size={17} /></button>}
      </div>
    </div>
    <div className="two-col">
      <Card><div className="card-head"><div><h2>Transactions récentes</h2><p>Dernières activités blockchain confirmées</p></div><Button variant="ghost" onClick={() => go('history')}>Tout afficher <ChevronRight size={16} /></Button></div>
        <div className="transaction-list">{data?.recentEvents.map(event => <TransactionStatusCard key={`${event.hash}-${event.type}`} status={eventTransactionStatus(event.type)} title={formatEventType(event.type)} detail={`Bien ${event.landId} · ${shortenAddress(event.actor)} · Bloc n° ${event.block}`}/>)}</div>
        {!data?.recentEvents.length&&<EmptyState icon={Activity} title="Aucun événement récent" description="Aucun événement LandRegistry n’a été trouvé sur ce réseau."/>}
      </Card>
      <Card><div className="card-head"><div><h2>Activité du réseau</h2><p>Réseau de test LandChain</p></div><Badge tone="success">Opérationnel</Badge></div>
        <div className="network-panel"><div className="network-ring"><Blocks size={28} /><span /></div><strong>Connecté à {LANDCHAIN_CHAIN_NAME}</strong><p>Chain ID : {LANDCHAIN_CHAIN_ID.toString()} · Événements du contrat disponibles</p></div>
        <div className="network-stats"><div><span>Dernier bloc</span><b>#{data?.latestBlock ?? '—'}</b></div><div><span>Contrat</span><b>LandRegistry</b></div><div><span>Chain ID</span><b>{LANDCHAIN_CHAIN_ID.toString()}</b></div></div>
      </Card>
    </div>
    {role === 'Land agent' && <AgentProposalInbox />}
  </>
}

function Registry({ go, selectLand, search, role }: { go: (p: Page) => void; selectLand: (landId: string) => void; search: string; role: Role }) {
  const [records, setRecords] = useState<{ id:string; reference:string; owner:string; status:string }[]>([])
  const [error, setError] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)
  const [walletAddress, setWalletAddress] = useState('')
  useEffect(() => {
    const provider = getBrowserProvider()
    void provider.send('eth_accounts', []).then(accounts => setWalletAddress((accounts as string[])[0] ?? ''))
    void getRegistryLands(provider).then(setRecords).catch(cause => {
      setError(cause instanceof Error ? cause.message : 'Impossible de charger le registre blockchain.')
    })
  }, [])
  const filteredRecords = records.filter(record => (!onlyMine || record.owner.toLowerCase() === walletAddress.toLowerCase()) && `${record.id} ${record.reference} ${record.owner} ${record.status}`.toLowerCase().includes(search.toLowerCase()))
  const rows = filteredRecords.map(record => [<span className="mono">{record.id}</span>, record.reference, <AddressValue address={record.owner}/>, '—', '—', <Badge tone={statusTone(record.status)}>{record.status}</Badge>, <button className="icon-btn" onClick={()=>{selectLand(record.id);go('land')}}><MoreHorizontal size={19}/></button>])
  return <><PageHead title="Registre foncier" description="Rechercher et consulter les biens enregistrés sur la blockchain." action={<div className="page-actions">{role === 'Land agent' && <Button onClick={() => go('register')}><Plus size={17} /> Déposer un bien</Button>}<Button variant={onlyMine ? 'primary' : 'secondary'} onClick={()=>setOnlyMine(value=>!value)}>{onlyMine ? 'Afficher tous les biens' : 'Afficher mes biens'}</Button></div>} />
    {error&&<div className="network-warning"><CircleAlert size={18}/><span>{error}</span></div>}<Card className="data-card"><Toolbar />{filteredRecords.length ? <DataTable headings={['Identifiant','Référence','Portefeuille propriétaire','Lieu','Superficie','Statut','']} total={`${filteredRecords.length} bien(s) affiché(s)`} rows={rows}/> : <EmptyState icon={LandPlot} title={records.length ? 'Aucun bien correspondant' : 'Aucun bien enregistré'} description={records.length ? 'Modifiez la recherche ou désactivez le filtre « Mes biens ».' : `Aucun bien n’a été trouvé sur le réseau ${LANDCHAIN_CHAIN_NAME} connecté.`}/>}</Card>
  </>
}
function Register({ role }: { role: Role }) {
  const [landId,setLandId]=useState(''),[landRef,setLandRef]=useState(''),[owner,setOwner]=useState(''),[hash,setHash]=useState(''),[submitting,setSubmitting]=useState(false),[message,setMessage]=useState('')
  const [proposals,setProposals]=useState<{id:string;landId:string;reference:string;owner:string;submittedBy:string;createdAt:number}[]>([])
  const [proposalMessage,setProposalMessage]=useState('')
  async function loadProposals() {
    try {
      const allProposals = await getLandProposals(getBrowserProvider())
      if (role === 'Land agent') setProposals(allProposals)
      else {
        const accounts = (await getBrowserProvider().send('eth_accounts', [])) as string[]
        const connected = accounts[0]?.toLowerCase()
        setProposals(allProposals.filter(proposal => proposal.submittedBy.toLowerCase() === connected))
      }
    }
    catch (cause) { setProposalMessage(formatBlockchainError(cause, 'Impossible de charger les propositions.')) }
  }
  useEffect(() => { void loadProposals() }, [role])
  async function decideProposal(proposalId: string, action: 'approve'|'reject') {
    setProposalMessage('')
    try {
      const currentProposals = await getLandProposals(getBrowserProvider())
      if (!currentProposals.some(proposal => proposal.id === proposalId)) {
        await loadProposals()
        throw new BlockchainError(`La proposition #${proposalId} n’est plus ouverte. Elle a déjà été traitée ou annulée. La liste a été actualisée.`)
      }
      const { signer } = await connectWallet()
      const receipt = action === 'approve'
        ? await approveLandProposal(signer, BigInt(proposalId))
        : await rejectLandProposal(signer, BigInt(proposalId))
      setProposalMessage(`Proposition #${proposalId} ${action === 'approve' ? 'approuvée' : 'refusée'} dans le bloc ${receipt?.blockNumber ?? 'inconnu'}.`)
      await loadProposals()
    } catch (cause) { setProposalMessage(formatBlockchainError(cause, 'La décision sur la proposition a échoué.')) }
  }
  async function submit() {
    setSubmitting(true);setMessage('')
    try {
      if (!landId || !landRef || !owner || !hash) throw new BlockchainError('Remplissez les champs obligatoires et sélectionnez un document PDF.')
      const { signer } = await connectWallet()
      const receipt = role === 'Land agent'
        ? await registerLand(signer, BigInt(landId), landRef, owner, hash)
        : await submitLandProposal(signer, BigInt(landId), landRef, owner, hash)
      setMessage(role === 'Land agent'
        ? `Bien enregistré. Transaction confirmée dans le bloc ${receipt?.blockNumber ?? 'inconnu'}.`
        : `Proposition déposée. Un agent foncier doit la valider avant l’enregistrement définitif (bloc ${receipt?.blockNumber ?? 'inconnu'}).`)
    } catch (cause) {
      setMessage(formatBlockchainError(cause, 'La transaction a échoué.'))
    } finally { setSubmitting(false) }
  }
  async function cancelProposal(proposalId: string) {
    setSubmitting(true);setProposalMessage('')
    try {
      const { signer } = await connectWallet()
      const receipt = await cancelLandProposal(signer, BigInt(proposalId))
      setProposalMessage(`Proposition #${proposalId} annulée dans le bloc ${receipt?.blockNumber ?? 'inconnu'}.`)
      await loadProposals()
    } catch (cause) { setProposalMessage(formatBlockchainError(cause, 'L’annulation de la proposition a échoué.')) }
    finally { setSubmitting(false) }
  }
  async function selectDocument(file: File | undefined) {
    if (!file) return
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    setHash(`0x${Array.from(new Uint8Array(digest)).map(byte=>byte.toString(16).padStart(2,'0')).join('')}`)
  }
  return <><PageHead title={role === 'Land agent' ? 'Enregistrer un nouveau bien' : 'Déposer une proposition de bien'} description={role === 'Land agent' ? 'Créer un dossier foncier permanent sur la blockchain.' : 'Soumettre un bien à l’examen d’un agent foncier autorisé.'} />
    <div className="form-layout"><div>
      <Card><div className="section-title"><span>01</span><div><h2>Identification du bien</h2><p>{role === 'Land agent' ? 'Ces informations sont enregistrées sur la blockchain par le contrat.' : 'Ces informations sont soumises à la blockchain et attendent la validation d’un agent.'}</p></div></div><div className="form-grid"><label className="field"><span>Identifiant numérique du bien</span><input value={landId} onChange={event=>setLandId(event.target.value)} placeholder="ex. 2001" inputMode="numeric"/></label><label className="field"><span>Référence du bien</span><input value={landRef} onChange={event=>setLandRef(event.target.value)} placeholder="ex. LR-KGL-49502"/></label></div></Card>
      <Card><div className="section-title"><span>02</span><div><h2>Propriété</h2><p>Attribuez le propriétaire actuel de ce bien.</p></div></div><label className="field"><span>Adresse du portefeuille du propriétaire</span><input value={owner} onChange={event=>setOwner(event.target.value)} placeholder="0x…" /></label></Card>
      <Card><div className="section-title"><span>03</span><div><h2>Document justificatif</h2><p>Le PDF est haché localement ; seule son empreinte SHA-256 est envoyée sur la blockchain.</p></div></div><label className="dropzone"><UploadCloud size={26}/><b>Déposez votre document ou <u>parcourez</u></b><small>PDF uniquement · Taille maximale : 10 Mo</small><input type="file" accept=".pdf" onChange={event=>void selectDocument(event.target.files?.[0])}/>{hash&&<code>{hash}</code>}</label></Card>
    </div><aside><Card className="summary"><h2>{role === 'Land agent' ? 'Résumé de l’enregistrement' : 'Résumé de la proposition'}</h2><div className="summary-row"><span>Réseau</span><b>{LANDCHAIN_CHAIN_NAME}</b></div><div className="summary-row"><span>Empreinte du document</span><em>{hash ? 'Prête' : 'Calculée après le dépôt'}</em></div><div className="notice"><ShieldCheck size={18}/><p>{role === 'Land agent' ? 'Ce dossier est permanent. Vérifiez toutes les informations avant l’envoi.' : 'Un agent doit approuver cette proposition avant que le bien soit ajouté au registre.'}</p></div>{message&&<div className="notice"><CircleAlert size={18}/><p>{message}</p></div>}<Button loading={submitting} onClick={()=>void submit()}><Blocks size={17}/> {role === 'Land agent' ? 'Envoyer sur la blockchain' : 'Soumettre à un agent'}</Button><small className="center">Votre portefeuille demandera une confirmation</small></Card></aside></div>
  <Card className="data-card"><div className="card-head"><div><h2>{role === 'Land agent' ? 'Propositions en attente' : 'Mes propositions en attente'}</h2><p>{role === 'Land agent' ? 'Les dépôts des utilisateurs doivent être contrôlés avant l’enregistrement.' : 'Vous pouvez annuler une proposition tant qu’elle n’a pas été traitée.'}</p></div><Button variant="secondary" onClick={()=>void loadProposals()}>Actualiser</Button></div>{proposalMessage&&<div className="notice"><CircleAlert size={18}/><p>{proposalMessage}</p></div>}{proposals.length ? <DataTable headings={['Proposition','Identifiant','Référence','Propriétaire proposé','Déposée par','Actions']} total={`${proposals.length} propositions en attente`} rows={proposals.map(proposal => [<span className="mono">#{proposal.id}</span>,proposal.landId,proposal.reference,<span className="mono">{shortenAddress(proposal.owner)}</span>,<span className="mono">{shortenAddress(proposal.submittedBy)}</span>,role === 'Land agent' ? <><Button variant="ghost" onClick={()=>void decideProposal(proposal.id,'reject')}>Refuser</Button><Button onClick={()=>void decideProposal(proposal.id,'approve')}>Approuver</Button></> : <Button variant="danger" loading={submitting} onClick={()=>void cancelProposal(proposal.id)}>Annuler</Button>])}/>:<EmptyState icon={LandPlot} title="Aucune proposition en attente" description={role === 'Land agent' ? 'Les utilisateurs n’ont pas encore déposé de proposition.' : 'Vous n’avez aucune proposition ouverte.'}/>}</Card>
  </>
}

function Verify() {
  const [state, setState] = useState<'idle'|'match'|'mismatch'|'not-found'|'error'>('idle')
  const [landId,setLandId]=useState(''),[hash,setHash]=useState(''),[message,setMessage]=useState(''),[checking,setChecking]=useState(false)
  async function selectDocument(file: File | undefined) {
    if (!file) return
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    setHash(`0x${Array.from(new Uint8Array(digest)).map(byte=>byte.toString(16).padStart(2,'0')).join('')}`)
    setState('idle');setMessage('')
  }
  async function checkDocument() {
    setChecking(true);setMessage('')
    try {
      if (!landId || !/^\d+$/.test(landId) || !hash) throw new BlockchainError('Saisissez un Land ID numérique et sélectionnez un PDF.')
      const result = await verifyDocument(getBrowserProvider(),BigInt(landId),hash)
      setState(result)
    } catch (cause) {
      setState('error');setMessage(formatBlockchainError(cause, 'La vérification a échoué.'))
    } finally { setChecking(false) }
  }
  return <><PageHead title="Vérification d’un document" description="Comparez l’empreinte SHA-256 d’un document avec son enregistrement blockchain." />
    <div className="verify-layout"><Card><div className="section-title no-number"><span><FileCheck2 size={20}/></span><div><h2>Importer un document foncier</h2><p>Le fichier est traité localement pour calculer son empreinte.</p></div></div>
      <label className="field"><span>Identifiant numérique du bien</span><input value={landId} onChange={event=>setLandId(event.target.value)} placeholder="ex. 1001" inputMode="numeric"/></label>
      <label className="dropzone large"><UploadCloud size={30}/><b>Déposez un document PDF ici</b><small>ou cliquez pour parcourir · PDF jusqu’à 10 Mo</small><input type="file" accept=".pdf" onChange={event=>void selectDocument(event.target.files?.[0])}/>{hash&&<code>{hash}</code>}</label>
      <Button loading={checking} onClick={()=>void checkDocument()}><FileCheck2 size={17}/> Vérifier sur la blockchain</Button>
    </Card>
    {state === 'idle' ?     <Card className="result empty-result"><EmptyState icon={Fingerprint} title="Résultat de la vérification" description="Saisissez un identifiant et importez un document pour commencer."/></Card> :
    <Card className={`result result-${state}`}><div className="result-mark">{state === 'match' ? <Check size={28}/> : <X size={28}/>}</div><span className="eyebrow">{state === 'match' ? 'EMPREINTE CORRESPONDANTE' : state === 'not-found' ? 'BIEN INTROUVABLE' : state === 'error' ? 'ERREUR DE VÉRIFICATION' : 'EMPREINTE DIFFÉRENTE'}</span><h2>{state === 'match' ? 'Le document correspond au registre' : state === 'not-found' ? 'Bien introuvable' : state === 'error' ? 'La vérification n’a pas abouti' : 'Le document diffère du registre'}</h2><p>{message || (state === 'match' ? 'L’empreinte SHA-256 calculée correspond à la référence enregistrée sur la blockchain.' : state === 'not-found' ? 'Aucun bien ne correspond à cet identifiant.' : 'L’empreinte calculée ne correspond pas à celle enregistrée.')}</p>{hash&&<div className="hash-box"><span>Empreinte SHA-256 calculée</span><code>{hash}</code></div>}<div className="legal-note"><CircleAlert size={17}/><span>Une correspondance confirme l’intégrité du document par rapport à l’empreinte enregistrée. Elle ne prouve pas la propriété juridique.</span></div></Card>}
    </div>
  </>
}

function Transfers({ go, selectRequest, role }: { go: (p: Page) => void; selectRequest: (requestId: string) => void; role: Role }) {
  const [landId,setLandId]=useState(''),[proposedOwner,setProposedOwner]=useState(''),[message,setMessage]=useState(''),[messageKind,setMessageKind]=useState<'success'|'error'>('success'),[submitting,setSubmitting]=useState(false)
  const [requests,setRequests]=useState<{id:string;landId:string;currentOwner:string;proposedOwner:string;status:string;createdAt:number}[]>([])
  const [loadingRequests,setLoadingRequests]=useState(true)
  const [connectedAddress,setConnectedAddress]=useState('')
  const [onlyMine,setOnlyMine]=useState(false)
  async function loadRequests() {
    setLoadingRequests(true)
    try { setRequests(await getTransferRequests(getBrowserProvider())) }
    catch (cause) { setMessage(formatBlockchainError(cause, 'Impossible de charger les demandes blockchain.')) }
    finally { setLoadingRequests(false) }
  }
  useEffect(() => {
    void loadRequests()
    void getBrowserProvider().send('eth_accounts', []).then(accounts => setConnectedAddress((accounts as string[])[0] ?? ''))
  }, [])
  async function submit() {
    setSubmitting(true);setMessage('')
    try {
      if (!landId || !/^\d+$/.test(landId)) throw new BlockchainError('Saisissez un Land ID numérique.')
      const { signer } = await connectWallet()
      const result = await requestTransfer(signer, BigInt(landId), proposedOwner)
      setMessageKind('success'); setMessage(`Demande de transfert ${result.requestId ? `#${result.requestId}` : ''} confirmée dans le bloc ${result.receipt?.blockNumber ?? 'inconnu'}.`)
      await loadRequests()
    } catch (cause) { setMessageKind('error'); setMessage(formatBlockchainError(cause, 'La demande de transfert a échoué.')) }
    finally { setSubmitting(false) }
  }
  async function decide(requestId:string, action:'approve'|'reject') {
    setSubmitting(true);setMessage('')
    try {
      const request = requests.find(item => item.id === requestId)
      if (request && connectedAddress && [request.currentOwner, request.proposedOwner].some(address => address.toLowerCase() === connectedAddress.toLowerCase())) {
        throw new BlockchainError(
          'Conflit d’intérêts : un agent ne peut pas approuver ou refuser une demande dont il est le propriétaire actuel ou le nouveau propriétaire proposé. Aucune transaction n’a été envoyée.',
        )
      }
      const { signer } = await connectWallet()
      const receipt = action === 'approve' ? await approveTransfer(signer, BigInt(requestId)) : await rejectTransfer(signer, BigInt(requestId))
      setMessageKind('success'); setMessage(`Demande #${requestId} ${action === 'approve' ? 'approuvée' : 'refusée'} dans le bloc ${receipt?.blockNumber ?? 'inconnu'}.`)
      await loadRequests()
    } catch (cause) { setMessageKind('error'); setMessage(formatBlockchainError(cause, 'La décision a échoué.')) }
    finally { setSubmitting(false) }
  }
  async function cancel(requestId:string) {
    setSubmitting(true);setMessage('')
    try {
      const { signer } = await connectWallet()
      const receipt = await cancelTransferRequest(signer, BigInt(requestId))
      setMessageKind('success'); setMessage(`Demande #${requestId} annulée dans le bloc ${receipt?.blockNumber ?? 'inconnu'}.`)
      await loadRequests()
    } catch (cause) { setMessageKind('error'); setMessage(formatBlockchainError(cause, 'L’annulation de la demande a échoué.')) }
    finally { setSubmitting(false) }
  }
  const visibleRequests = onlyMine
    ? requests.filter(request => [request.currentOwner, request.proposedOwner].some(address => address.toLowerCase() === connectedAddress.toLowerCase()))
    : requests
  const realRows = visibleRequests.map(request => {
    const conflict = role === 'Land agent' && Boolean(connectedAddress) && [request.currentOwner, request.proposedOwner].some(address => address.toLowerCase() === connectedAddress.toLowerCase())
    const conflictMessage = conflict
      ? request.currentOwner.toLowerCase() === connectedAddress.toLowerCase()
        ? 'Vous êtes le propriétaire actuel de ce bien.'
        : 'Vous êtes le nouveau propriétaire proposé.'
      : ''
    const isRequester = Boolean(connectedAddress) && request.currentOwner.toLowerCase() === connectedAddress.toLowerCase()
    const actions = request.status === 'En attente' && role === 'Land agent'
      ? <>{conflict && <span className="notice notice-error"><CircleAlert size={15}/>{conflictMessage}</span>}<Button loading={submitting} variant="danger" onClick={()=>void decide(request.id,'reject')}>Refuser</Button><Button loading={submitting} variant="ghost" onClick={()=>{selectRequest(request.id);go('transfer')}}>Détails</Button><Button loading={submitting} onClick={()=>void decide(request.id,'approve')}>Approuver</Button></>
      : request.status === 'En attente' && isRequester
        ? <><Button variant="danger" loading={submitting} onClick={()=>void cancel(request.id)}>Annuler</Button><Button variant="ghost" onClick={()=>{selectRequest(request.id);go('transfer')}}>Détails</Button></>
        : <Button variant="ghost" onClick={()=>{selectRequest(request.id);go('transfer')}}>Détails</Button>
    return [<button className="hash-link" onClick={()=>{selectRequest(request.id);go('transfer')}}>#{request.id}</button>,request.landId,<AddressValue address={request.currentOwner}/>,<AddressValue address={request.proposedOwner}/>,new Date(request.createdAt * 1000).toLocaleString(),<Badge tone={statusTone(request.status)}>{request.status}</Badge>,actions]
  })
  return <><PageHead title="Demandes de transfert" description={role === 'Land agent' ? 'Examinez les demandes en tant qu’agent foncier habilité.' : 'Déposez et suivez les demandes de transfert de vos biens.'} />{role !== 'Administrator' && <Card><div className="section-title"><span><ArrowLeftRight size={20}/></span><div><h2>Nouvelle demande de transfert</h2><p>Le propriétaire actuel doit signer la demande avec son portefeuille.</p></div></div><div className="form-grid"><label className="field"><span>Identifiant numérique du bien</span><input value={landId} onChange={event=>setLandId(event.target.value)} placeholder="ex. 2001"/></label><label className="field"><span>Portefeuille du nouveau propriétaire</span><input value={proposedOwner} onChange={event=>setProposedOwner(event.target.value)} placeholder="0x…"/></label></div>{message&&<div className={`notice ${messageKind === 'error' ? 'notice-error' : 'notice-success'}`}><CircleAlert size={18}/><p>{message}</p></div>}<Button loading={submitting} onClick={()=>void submit()}><Blocks size={17}/> Soumettre la demande</Button></Card>}<Card className="data-card"><div className="card-head"><div><h2>Demandes blockchain</h2><p>Demandes chargées depuis les événements du contrat</p></div><div className="page-actions"><Button variant={onlyMine ? 'primary' : 'secondary'} onClick={()=>setOnlyMine(value=>!value)}>{onlyMine ? 'Afficher toutes les demandes' : 'Afficher mes demandes'}</Button><Button variant="secondary" onClick={()=>void loadRequests()}>Actualiser</Button></div></div>{loadingRequests ? <LoadingState label="Chargement des demandes blockchain…" /> : <DataTable headings={['Demande','Bien','Propriétaire actuel','Nouveau propriétaire','Date','Statut','Actions']} total={`${visibleRequests.length} demande(s) affichée(s)`} rows={realRows}/>}</Card></>
}

function History() {
  const [events, setEvents] = useState<{hash:string;type:string;landId:string;actor:string;block:number;timestamp:number}[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ownedLandIds, setOwnedLandIds] = useState<string[]>([])
  const [onlyMine, setOnlyMine] = useState(false)
  async function loadHistory() {
    setLoading(true)
    setError('')
    try {
      const provider = getBrowserProvider()
      const [nextEvents, lands, accounts] = await Promise.all([
        getTransactionHistory(provider),
        getRegistryLands(provider),
        provider.send('eth_accounts', []),
      ])
      const address = (accounts as string[])[0] ?? ''
      setOwnedLandIds(lands.filter(land => land.owner.toLowerCase() === address.toLowerCase()).map(land => land.id))
      setEvents(nextEvents)
    }
    catch (cause) { setError(formatBlockchainError(cause, 'Impossible de charger l’historique blockchain.')) }
    finally { setLoading(false) }
  }
  useEffect(() => { void loadHistory() }, [])
  const shortenHash = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-8)}`
  const visibleEvents = onlyMine ? events.filter(event => ownedLandIds.includes(event.landId)) : events
  const rows = visibleEvents.map(event => {
    const transactionStatus = eventTransactionStatus(event.type)
    const label = transactionStatus === 'failed' ? 'Refusée / annulée' : transactionStatus === 'pending' ? 'En attente' : 'Confirmée'
    return [<span className="hash-link">{shortenHash(event.hash)} <ExternalLink size={13}/></span>, formatEventType(event.type), event.landId, <AddressValue address={event.actor}/>, `#${event.block}`, new Date(event.timestamp * 1000).toLocaleString(), <Badge tone={transactionStatus === 'failed' ? 'danger' : transactionStatus === 'pending' ? 'warning' : 'success'}>{label}</Badge>]
  })
  return <><PageHead title="Historique des transactions" description="Historique immuable des événements lus depuis le contrat LandRegistry." action={<div className="page-actions"><Button variant={onlyMine ? 'primary' : 'secondary'} onClick={()=>setOnlyMine(value=>!value)}>{onlyMine ? 'Afficher tout l’historique' : 'Afficher mes transactions'}</Button><Button variant="secondary" onClick={()=>void loadHistory()}><RefreshCw size={16}/> Actualiser</Button></div>} />{error&&<div className="network-warning"><CircleAlert size={18}/><span>{error}</span></div>}<Card className="data-card"><Toolbar placeholder="Rechercher une transaction, un bien ou un portefeuille…" />{loading ? <LoadingState label="Chargement de l’historique blockchain…" /> : visibleEvents.length ? <DataTable headings={['Hash de transaction','Type d’événement','Bien','Portefeuille acteur','Bloc','Date','Statut']} total={`${visibleEvents.length} événement(s) affiché(s)`} rows={rows}/> : <EmptyState icon={Activity} title={onlyMine ? 'Aucune transaction pour vos biens' : 'Aucun événement blockchain'} description={onlyMine ? 'Votre portefeuille ne possède actuellement aucun bien enregistré.' : 'Aucun événement LandRegistry n’a été trouvé sur le réseau connecté.'}/>}</Card></>
}

function LandDetails({ go, setModal, landId, role }: { go: (p: Page)=>void; setModal:(v:string|null)=>void; landId: string | null; role: Role }) {
  const [land, setLand] = useState<{id:string;reference:string;owner:string;hash:string;status:string;createdAt:number} | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!landId) return
    void getLandDetails(getBrowserProvider(), BigInt(landId)).then(setLand).catch(cause => setError(cause instanceof Error ? cause.message : 'Impossible de charger ce bien depuis la blockchain.'))
  }, [landId])
  if(!landId) return <><button className="back-link" onClick={()=>go('registry')}><ChevronLeft size={16}/> Retour au registre</button><EmptyState icon={LandPlot} title="Aucun bien sélectionné" description="Sélectionnez un bien depuis le registre blockchain."/></>
  if (error) return <><button className="back-link" onClick={()=>go('registry')}><ChevronLeft size={16}/> Retour au registre</button><div className="network-warning"><CircleAlert size={18}/><span>{error}</span></div></>
  if (!land) return <LoadingState label="Chargement du bien depuis la blockchain…" />
  const registrationDate = new Date(land.createdAt * 1000).toLocaleString()
  return <><button className="back-link" onClick={()=>go('registry')}><ChevronLeft size={16}/> Retour au registre</button><PageHead title={`Bien ${land.id}`} description="Fiche du bien enregistrée et lue depuis la blockchain." action={role !== 'Administrator' ? <Button onClick={()=>setModal('transfer-submit')}><ArrowLeftRight size={16}/> Demander un transfert</Button> : undefined} />
    <div className="details-grid"><Card><div className="card-head"><div><h2>Informations du bien</h2><p>Identification officielle et détails de l’enregistrement</p></div><Badge tone={statusTone(land.status)}>{land.status}</Badge></div><div className="detail-list"><div><span>Identifiant du bien</span><b>{land.id}</b></div><div><span>Référence du bien</span><b>{land.reference}</b></div><div><span>Date d’enregistrement</span><b>{registrationDate}</b></div><div><span>Emplacement / superficie</span><b>Non enregistré sur la blockchain</b></div></div></Card>
    <Card><h2>Propriétaire actuel</h2><div className="owner-card"><div className="avatar">WC</div><div><b>Portefeuille blockchain</b><CopyValue>{land.owner}</CopyValue></div></div><div className="detail-list"><div><span>Adresse du propriétaire</span><CopyValue>{land.owner}</CopyValue></div><div><span>Source</span><b>Contrat LandRegistry</b></div></div></Card></div>
    <Card><div className="card-head"><div><h2>Enregistrement blockchain</h2><p>Preuve cryptographique enregistrée par le contrat</p></div><ShieldCheck size={22} className="green"/></div><div className="chain-grid"><div><span>Empreinte du document</span><CopyValue>{land.hash}</CopyValue></div><div><span>Réseau</span><b>{LANDCHAIN_CHAIN_NAME} ({LANDCHAIN_CHAIN_ID.toString()})</b></div><div><span>Contrat</span><CopyValue>{LANDREGISTRY_ADDRESS}</CopyValue></div></div></Card>
    <Card><div className="card-head"><div><h2>Historique de propriété</h2><p>État actuel de la propriété sur la blockchain</p></div></div><div className="timeline"><div className="timeline-item"><span className="current"><Check size={14}/></span><div><b>Propriétaire actuel enregistré</b><small>{land.owner}</small></div><time>{registrationDate}</time></div></div></Card>
  </>
}

function TransferDetail({ go, setModal, requestId, role }: { go: (p: Page)=>void; setModal:(v:string|null)=>void; requestId: string | null; role: Role }) {
  const [request, setRequest] = useState<{id:string;landId:string;currentOwner:string;proposedOwner:string;status:string;createdAt:number;reviewedBy:string;reviewedAt:number} | null>(null)
  const [land, setLand] = useState<{id:string;reference:string;owner:string;hash:string;status:string;createdAt:number} | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!requestId) return
    void getTransferRequestDetails(getBrowserProvider(), BigInt(requestId)).then(nextRequest => {
      setRequest(nextRequest)
      return getLandDetails(getBrowserProvider(), BigInt(nextRequest.landId))
    }).then(setLand).catch(cause => setError(cause instanceof Error ? cause.message : 'Impossible de charger cette demande depuis la blockchain.'))
  }, [requestId])
  if (!requestId) return <><button className="back-link" onClick={()=>go('transfers')}><ChevronLeft size={16}/> Back to requests</button><EmptyState icon={ArrowLeftRight} title="Aucune demande sélectionnée" description="Sélectionnez une demande depuis la liste blockchain."/></>
  if (error) return <><button className="back-link" onClick={()=>go('transfers')}><ChevronLeft size={16}/> Back to requests</button><div className="network-warning"><CircleAlert size={18}/><span>{error}</span></div></>
  if (!request || !land) return <LoadingState label="Chargement de la demande depuis la blockchain…" />
  const createdDate = new Date(request.createdAt * 1000).toLocaleString()
  const reviewedDate = request.reviewedAt ? new Date(request.reviewedAt * 1000).toLocaleString() : 'Non examinée'
  return <><button className="back-link" onClick={()=>go('transfers')}><ChevronLeft size={16}/> Back to requests</button><PageHead title={`Transfer Request #${request.id}`} description={`Submitted ${createdDate}`} action={<Badge tone={statusTone(request.status)}>{request.status}</Badge>} />
    <div className="details-grid"><Card><h2>Property</h2><div className="property-feature"><span><LandPlot size={23}/></span><div><b>Land {land.id}</b><small>{land.reference}</small></div></div><div className="detail-list"><div><span>Property status</span><b>{land.status}</b></div><div><span>Request date</span><b>{createdDate}</b></div></div><Button variant="ghost" onClick={()=>go('land')}>View property record <ChevronRight size={15}/></Button></Card><Card><h2>Ownership change</h2><div className="wallet-change"><div><span>Current owner</span><CopyValue>{request.currentOwner}</CopyValue></div><ArrowLeftRight size={20}/><div><span>Proposed owner</span><CopyValue>{request.proposedOwner}</CopyValue></div></div><div className="detail-list"><div><span>Decision</span><b>{request.status}</b></div><div><span>Reviewed by</span><CopyValue>{request.reviewedBy === '0x0000000000000000000000000000000000000000' ? 'Not reviewed' : request.reviewedBy}</CopyValue></div><div><span>Reviewed at</span><b>{reviewedDate}</b></div></div></Card></div>
    <Card><div className="card-head"><div><h2>Examen par l’agent</h2><p>État de la décision lu directement depuis le contrat LandRegistry.</p></div><Badge tone="info">Enregistrement blockchain</Badge></div><div className="review-checks"><div><CheckCircle2 size={19}/><span><b>Demande signée par le propriétaire actuel</b><small>{request.currentOwner}</small></span></div><div><CheckCircle2 size={19}/><span><b>Nouveau propriétaire proposé</b><small>{request.proposedOwner}</small></span></div></div>{role === 'Land agent' && request.status === 'En attente' && <div className="review-actions"><Button variant="danger" onClick={()=>setModal('reject')}><XCircle size={17}/> Refuser la demande</Button><Button onClick={()=>setModal('approve')}><CheckCircle2 size={17}/> Approuver le transfert</Button></div>}</Card>
  </>
}

function Access() {
 const [account,setAccount]=useState(''),[message,setMessage]=useState(''),[submitting,setSubmitting]=useState(false),[agents,setAgents]=useState<string[]>([])
 useEffect(() => {
   void getAgentAccounts(getBrowserProvider()).then(setAgents).catch(cause => setMessage(formatBlockchainError(cause, 'Impossible de charger les rôles blockchain.')))
 }, [])
 async function addAgent() {
   setSubmitting(true);setMessage('')
   try {
     const { signer } = await connectWallet()
     const receipt = await grantAgentRole(signer, account)
     setAgents(previous => [...previous, account])
     setAccount('')
     setMessage(`Rôle Agent foncier ajouté. Transaction confirmée dans le bloc ${receipt?.blockNumber ?? 'inconnu'}.`)
   } catch (cause) {
     setMessage(formatBlockchainError(cause, 'L’ajout du rôle a échoué.'))
   } finally { setSubmitting(false) }
 }
 async function removeAgent(agent: string) {
   if (!window.confirm(`Retirer le rôle Agent foncier de ${agent} ?`)) return
   setSubmitting(true);setMessage('')
   try {
     const { signer } = await connectWallet()
     const receipt = await revokeAgentRole(signer, agent)
     setAgents(previous => previous.filter(address => address.toLowerCase() !== agent.toLowerCase()))
     setMessage(`Rôle Agent foncier retiré. Transaction confirmée dans le bloc ${receipt?.blockNumber ?? 'inconnu'}.`)
   } catch (cause) {
     setMessage(formatBlockchainError(cause, 'La révocation du rôle a échoué.'))
   } finally { setSubmitting(false) }
 }
 return <><PageHead title="Gestion des accès" description="Gérez les agents fonciers autorisés et les permissions blockchain." /><div className="admin-notice"><LockKeyhole size={19}/><div><b>Accès administrateur</b><span>Seul un compte administrateur peut attribuer ou retirer le rôle AGENT_ROLE.</span></div></div><Card><div className="section-title"><span><UsersRound size={20}/></span><div><h2>Ajouter un agent foncier</h2><p>Entrez l’adresse 0x complète du compte MetaMask à autoriser.</p></div></div><div className="form-grid"><label className="field"><span>Adresse du portefeuille de l’agent</span><input value={account} onChange={event=>setAccount(event.target.value)} placeholder="0x1234…"/></label><Button loading={submitting} onClick={()=>void addAgent()}><Plus size={16}/> Attribuer le rôle d’agent</Button></div>{message&&<div className="notice"><CircleAlert size={18}/><p>{message}</p></div>}</Card><Card><Toolbar placeholder="Rechercher une adresse d’agent…" extra={false}/><div className="table-scroll"><table><thead><tr><th>Agent</th><th>Adresse du portefeuille</th><th>Rôle</th><th>Permissions</th><th>Action</th></tr></thead><tbody>{agents.map(address=><tr key={address}><td><div className="table-user"><span>AG</span><b>Agent foncier</b></div></td><td><AddressValue address={address}/></td><td><Badge tone="success">Agent foncier</Badge></td><td>Enregistrer et approuver</td><td><Button variant="danger" loading={submitting} onClick={()=>void removeAgent(address)}><Trash2 size={15}/> Retirer</Button></td></tr>)}{agents.length===0&&<tr><td colSpan={5}>Aucun agent actif.</td></tr>}</tbody></table></div></Card></>
}

function ProfilePage({ notify, address, name, email, saveProfile }: { notify:(v:string)=>void; address: string | null; name: string; email: string; saveProfile:(name:string,email:string)=>void }) {
 const [editing,setEditing]=useState(false), [draftName,setDraftName]=useState(name), [draftEmail,setDraftEmail]=useState(email)
 useEffect(() => { setDraftName(name); setDraftEmail(email) }, [name, email])
 const [role,setRole]=useState<'Administrator'|'Land agent'|'User'>('User')
 useEffect(() => { if (address) void getWalletRole(getBrowserProvider(), address).then(setRole).catch(() => setRole('User')) }, [address])
 return <><PageHead title="Profil utilisateur" description="Gérez votre identité, vos informations et votre portefeuille connecté." action={<Button variant={editing?'secondary':'primary'} onClick={()=>setEditing(!editing)}>{editing?'Annuler':'Modifier le profil'}</Button>}/>
 <div className="profile-grid"><Card className="profile-summary"><div className="profile-avatar">{role === 'Administrator' ? 'AD' : role === 'Land agent' ? 'AG' : 'US'}</div><h2>{name}</h2><p>{address ? shortenAddress(address) : 'Portefeuille non connecté'}</p><Badge tone="info">{role === 'Administrator' ? 'Administrateur' : role === 'Land agent' ? 'Agent foncier' : 'Utilisateur'}</Badge><div className="detail-list stacked"><div><span>Adresse du portefeuille</span><CopyValue>{address || 'Non connecté'}</CopyValue></div><div><span>Réseau</span><b>{LANDCHAIN_CHAIN_NAME} ({LANDCHAIN_CHAIN_ID.toString()})</b></div></div></Card>
 <div className="profile-sections"><Card><div className="card-head"><div><h2>Informations personnelles</h2><p>Ces informations sont enregistrées localement ; l’identité blockchain vient de MetaMask.</p></div></div><div className="form-grid"><label className="field"><span>Nom complet</span><input value={draftName} disabled={!editing} onChange={event=>setDraftName(event.target.value)} placeholder="Votre nom"/></label><label className="field"><span>Adresse e-mail</span><div className="input-wrap"><Mail size={17}/><input value={draftEmail} disabled={!editing} onChange={event=>setDraftEmail(event.target.value)} placeholder="vous@exemple.com"/></div></label></div>{editing&&<div className="form-actions"><Button variant="secondary" onClick={()=>{setDraftName(name);setDraftEmail(email);setEditing(false)}}>Annuler</Button><Button onClick={()=>{if(!draftName.trim()||!draftEmail.trim()){notify('Le nom et l’adresse e-mail sont obligatoires.');return}saveProfile(draftName.trim(),draftEmail.trim());setEditing(false);notify('Informations du profil mises à jour.')}}>Enregistrer</Button></div>}</Card>
 <Card><div className="card-head"><div><h2>Informations du portefeuille</h2><p>Votre identité blockchain et l’état de la connexion</p></div></div><WalletCard name="Portefeuille MetaMask" address={address ? shortenAddress(address) : 'Non connecté'}/><div className="detail-list"><div><span>Réseau</span><b>{LANDCHAIN_CHAIN_NAME} ({LANDCHAIN_CHAIN_ID.toString()})</b></div><div><span>Connexion</span><b className={address ? 'green' : ''}>{address ? 'Active' : 'Non connectée'}</b></div></div></Card>
 </div></div></>
}

function SettingsPage({ setModal, notify, address }: { setModal:(v:string|null)=>void; notify:(v:string)=>void; address: string | null }) { return <><PageHead title="Paramètres" description="Gérez votre compte, votre portefeuille, votre sécurité et vos préférences."/><div className="settings-layout"><Card><div className="settings-title"><span><UserRound size={20}/></span><div><h2>Compte général</h2><p>Préférences du compte</p></div></div><label className="select-field"><span>Langue</span><select defaultValue="fr"><option value="fr">Français</option></select></label><Button variant="secondary" onClick={()=>notify('Préférences enregistrées.')}>Enregistrer les préférences</Button></Card><Card><div className="settings-title"><span><Wallet size={20}/></span><div><h2>Portefeuille connecté</h2><p>Votre identité Web3 active</p></div></div><WalletCard name="Portefeuille MetaMask" address={address ? shortenAddress(address) : 'Non connecté'}/></Card><Card><div className="settings-title"><span><Blocks size={20}/></span><div><h2>Réseau blockchain</h2><p>Réseau utilisé par l’application</p></div></div><div className="network-choice"><span className="network-logo">{LANDCHAIN_CHAIN_NAME === 'Sepolia' ? 'S' : 'H'}</span><div><b>{LANDCHAIN_CHAIN_NAME}</b><small>Chain ID : {LANDCHAIN_CHAIN_ID.toString()}</small></div><CheckCircle2 size={20}/></div></Card><Card><div className="settings-title"><span><Bell size={20}/></span><div><h2>Notifications</h2><p>Choisissez les événements qui vous alertent</p></div></div>{['Mises à jour des demandes de transfert','Confirmations de transaction','Modifications de sécurité et d’accès'].map((x,i)=><label className="toggle-row" key={x}><span>{x}</span><input type="checkbox" defaultChecked={i<2}/><i/></label>)}</Card><Card><div className="settings-title"><span><ShieldCheck size={20}/></span><div><h2>Sécurité</h2><p>Protection du portefeuille et de la session</p></div></div><div className="security-line"><CheckCircle2 size={18}/><span><b>Signature du portefeuille requise</b><small>Pour chaque opération blockchain sensible</small></span></div><div className="security-line"><CheckCircle2 size={18}/><span><b>Verrouillage automatique de la session</b><small>Après 15 minutes d’inactivité</small></span></div></Card><Card className="danger-card"><div className="settings-title"><span><LogOut size={20}/></span><div><h2>Session</h2><p>Terminez votre session en toute sécurité</p></div></div><Button variant="danger" onClick={()=>setModal('logout')}>Se déconnecter</Button></Card></div></> }

function NotificationCenter({ close }: { close:()=>void }) {
 const [events,setEvents]=useState<Awaited<ReturnType<typeof getTransactionHistory>>>([])
 useEffect(() => { void getTransactionHistory(getBrowserProvider()).then(setEvents).catch(() => setEvents([])) }, [])
 return <div className="notification-panel"><div className="panel-head"><div><h2>Notifications</h2><p>{events.length ? `${Math.min(events.length, 4)} événement(s) blockchain récent(s)` : 'Aucun événement blockchain'}</p></div><button className="icon-btn" onClick={close} aria-label="Fermer les notifications"><X size={18}/></button></div><div className="notification-list">{events.slice(0, 4).map(event=><div className="notification-item" key={`${event.hash}-${event.type}`}><span className="notification-icon info"><Bell size={18}/></span><div><b>{formatEventType(event.type)}</b><p>{`Bien ${event.landId} · ${shortenAddress(event.actor)}`}</p><small>{`Bloc n° ${event.block}`}</small></div></div>)}</div><div className="panel-empty"><CheckCircle2 size={17}/> Les notifications proviennent des événements LandRegistry.</div></div>
}

function Modal({ type, close, onLogout }: { type:string; close:()=>void; onLogout:()=>void }) {
 if(type==='tx-details') return <div className="modal-backdrop" onMouseDown={close}><div className="modal modal-wide" role="dialog" aria-modal="true" onMouseDown={e=>e.stopPropagation()}><button aria-label="Fermer" className="modal-close" onClick={close}><X size={19}/></button><span className="modal-icon"><ArrowUpRight size={24}/></span><h2>Détails de la transaction</h2><p>Informations de démonstration sur une transaction du réseau de test Ethereum Sepolia.</p><div className="mock-inline"><CircleAlert size={15}/> Données d’exemple, non récupérées depuis Etherscan.</div><div className="transaction-detail-grid"><div><span>Statut</span><Badge tone="success">Confirmée</Badge></div><div><span>Hash de transaction</span><CopyValue>0x7ea89f3c...3b0f31</CopyValue></div><div><span>Expéditeur</span><CopyValue>0xF12C9074...7A81</CopyValue></div><div><span>Destinataire</span><CopyValue>0x84A290C1...9B42</CopyValue></div><div><span>Numéro de bloc</span><b>#5,421,806</b></div><div><span>Gaz utilisé</span><b>84,212</b></div><div><span>Prix du gaz</span><b>21.8 Gwei</b></div><div><span>Réseau</span><b>Ethereum Sepolia</b></div></div><div className="modal-actions"><Button variant="secondary" onClick={close}>Fermer</Button><Button onClick={close}><ExternalLink size={16}/> Voir sur Etherscan</Button></div></div></div>
 if(type==='wallet-flow') return <div className="modal-backdrop" onMouseDown={close}><div className="modal" role="dialog" aria-modal="true" onMouseDown={e=>e.stopPropagation()}><button aria-label="Close dialog" className="modal-close" onClick={close}><X size={19}/></button><span className="modal-icon"><LoaderCircle className="spin" size={24}/></span><h2>Confirm in MetaMask</h2><p>This demonstration does not submit a real transaction. Review the simulated confirmation lifecycle below.</p><div className="flow-steps"><TransactionStatusCard status="pending" title="Waiting for MetaMask confirmation" detail="Approve or reject in your wallet"/><TransactionStatusCard status="confirmed" title="Transaction submitted" detail="Sample hash 0x4be1…c921"/><TransactionStatusCard status="pending" title="Transaction processing" detail="Waiting for Sepolia confirmation"/><TransactionStatusCard status="confirmed" title="Transaction confirmed" detail="Included in sample block #5,421,806"/><TransactionStatusCard status="failed" title="Transaction failed" detail="Displayed if execution is reverted"/></div><div className="modal-actions"><Button variant="secondary" onClick={close}>Close demonstration</Button></div></div></div>
 const approve=type==='approve', reject=type==='reject', revoke=type==='revoke', logout=type==='logout', edit=type==='edit-land', transferSubmit=type==='transfer-submit'
 const destructive=reject||revoke||logout
 const title=approve?'Approve ownership transfer?':reject?'Reject this request?':revoke?'Revoke wallet role?':logout?'Log out of LANDCHAIN?':edit?'Edit land information':transferSubmit?'Submit transfer request?':'Submit land registration?'
 return <div className="modal-backdrop" onMouseDown={close}><div className={`modal ${edit?'modal-wide':''}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title" onMouseDown={e=>e.stopPropagation()}><button aria-label="Close dialog" className="modal-close" onClick={close}><X size={19}/></button><span className={`modal-icon ${destructive?'danger':''}`}>{destructive?<CircleAlert size={24}/>:edit?<LandPlot size={24}/>:<Blocks size={24}/>}</span><h2 id="dialog-title">{title}</h2><p>{logout?'You’ll need to reconnect your wallet and sign in again to continue.':edit?'Review the information before saving.':approve||type==='register'||transferSubmit?'This action will create a permanent blockchain transaction. Your connected wallet will request confirmation.':'This sensitive operation will be recorded in the audit log.'}</p>
 {reject&&<label className="field"><span>Reason for rejection <b className="required">*</b></span><textarea placeholder="Provide a clear reason for the requester…" required/></label>}
 {edit&&<div className="form-grid modal-form"><Field label="Land reference" placeholder="LR-KGL-48391"/><Field label="Total area" placeholder="1,240 m²"/><Field label="Location" placeholder="Kigali, Nyarugenge" icon={LandPlot}/><Field label="Owner wallet" placeholder="0x71C4…38F2" icon={Wallet}/></div>}
 {!destructive&&!edit&&<TransactionStatusCard status="pending" title="Awaiting wallet approval" detail="No transaction has been submitted yet"/>}{!logout&&!edit&&<div className="modal-detail"><span>Network</span><b>{LANDCHAIN_CHAIN_NAME} ({LANDCHAIN_CHAIN_ID.toString()})</b><span>Estimated gas</span><b>Shown by MetaMask</b></div>}<div className="modal-actions"><Button variant="secondary" onClick={close}>Cancel</Button><Button variant={destructive?'danger':'primary'} onClick={logout ? onLogout : close}>{logout?'Log out':reject?'Reject request':revoke?'Revoke role':edit?'Save changes':'Confirm in wallet'}</Button></div></div></div>
}

function Landing({ go }: { go:(p:Page)=>void }) {
  const features=[[ShieldCheck,'Secure registration','Create tamper-evident property records anchored to the blockchain.'],[Fingerprint,'Ownership verification','Compare document fingerprints with trusted on-chain references.'],[ArrowLeftRight,'Transparent transfers','Follow every review and approval step with a complete audit trail.'],[Activity,'Transaction history','Explore an immutable timeline of registered land activity.']]
  return <div className="landing"><header className="landing-nav"><div className="brand dark"><span><LandPlot/></span><div>LAND<span>CHAIN</span><small>LAND REGISTRY</small></div></div><div><Button variant="ghost" onClick={()=>go('dashboard')}>Explore platform</Button><Button onClick={()=>go('wallet')}><Wallet size={17}/> Connect wallet</Button></div></header><main className="landing-main"><div className="hero"><div className="hero-copy"><Badge tone="success">Decentralized land registry</Badge><h1>Land records built for <em>trust, clarity, and permanence.</em></h1><p>LANDCHAIN gives communities a secure and transparent way to register properties, verify records, and manage ownership transfers using blockchain technology.</p><div className="hero-actions"><Button onClick={()=>go('wallet')}><Wallet size={17}/> Connect MetaMask</Button><Button variant="secondary" onClick={()=>go('dashboard')}>Explore platform <ChevronRight size={16}/></Button></div><small><ShieldCheck size={14}/> Academic functional prototype · No legal registry authority</small></div><div className="hero-visual"><div className="visual-top"><span><Blocks size={18}/></span><div><b>Property record secured</b><small>Block #19,842,105</small></div><Badge tone="success">Confirmed</Badge></div><div className="map-mark"><LandPlot size={58}/><span>LC-2024-0842</span></div><div className="visual-data"><div><span>Registered owner</span><b>0x71C4…38F2</b></div><div><span>Document integrity</span><b><CheckCircle2 size={14}/> Hash verified</b></div></div></div></div><section className="feature-section"><span className="eyebrow">BUILT FOR ACCOUNTABILITY</span><h2>A trusted record at every step</h2><p>Purpose-built tools for secure and transparent property administration.</p><div className="feature-grid">{features.map(([Icon,title,text])=><div key={title as string}><span><Icon size={22}/></span><h3>{title as string}</h3><p>{text as string}</p></div>)}</div></section></main></div>
}

function WalletConnect({ go }: { go:(p:Page)=>void }) {
  const [state,setState]=useState<'idle'|'connecting'|'connected'|'error'>('idle')
  const [address,setAddress]=useState('')
  const [error,setError]=useState('')
  const connect=async()=>{setState('connecting');setError('');try{const wallet=await connectWallet();setAddress(wallet.address);setState('connected')}catch(cause){setState('error');setError(cause instanceof Error?cause.message:'La connexion ou la signature MetaMask a échoué.')}} 
  return <div className="connect-page"><button className="back-link connect-back" onClick={()=>go('landing')}><ChevronLeft size={16}/> Retour à l’accueil</button><div className="connect-brand"><span><LandPlot/></span><b>LAND<span>CHAIN</span></b></div><Card className="connect-card"><span className="wallet-logo"><Wallet size={30}/></span>{state==='connected'?<><Badge tone="success">Portefeuille authentifié</Badge><h1>Vous pouvez continuer</h1><p>Votre portefeuille MetaMask est connecté et authentifié par signature.</p><WalletCard name="Portefeuille MetaMask" address={shortenAddress(address)}/><div className="connection-data"><div><span>Réseau</span><b>{LANDCHAIN_CHAIN_NAME}</b></div><div><span>Chain ID</span><b>{LANDCHAIN_CHAIN_ID.toString()}</b></div></div><Button onClick={()=>go('dashboard')}>Continuer vers le tableau de bord <ChevronRight size={16}/></Button></>:<><h1>Connecter votre portefeuille</h1><p>MetaMask sera utilisé pour vous connecter et signer un message d’authentification sans frais.</p><div className="metamask"><div className="fox">M</div><div><b>MetaMask</b><small>Portefeuille navigateur</small></div><Badge tone="success">Recommandé</Badge></div>{state==='connecting'&&<LoadingState label="Validation de la connexion dans MetaMask…"/>}{error&&<div className="network-warning"><WifiOff size={18}/><span>{error}</span></div>}<Button loading={state==='connecting'} onClick={()=>void connect()}><Wallet size={17}/> {state==='connecting'?'Connexion en cours…':'Connecter avec MetaMask'}</Button><div className="connect-note"><LockKeyhole size={15}/><span>LANDCHAIN n’a jamais accès à votre clé privée ni à votre phrase de récupération.</span></div></>}</Card><small className="prototype-note">Ce projet est un prototype académique et non un registre foncier officiel.</small></div>
}

export default function App() {
  const [page,setPage]=useState<Page>('landing'), [mobile,setMobile]=useState(false), [modal,setModal]=useState<string|null>(null), [selectedLandId,setSelectedLandId]=useState<string|null>(null), [selectedRequestId,setSelectedRequestId]=useState<string|null>(null), [search,setSearch]=useState(''), [walletRole,setWalletRole]=useState<Role>('User'), [authReady,setAuthReady]=useState(false)
  const [profileName,setProfileName]=useState(''), [profileEmail,setProfileEmail]=useState('')
  const [collapsed,setCollapsed]=useState(false), [notifications,setNotifications]=useState(false), [userMenu,setUserMenu]=useState(false), [walletMenu,setWalletMenu]=useState(false), [toast,setToast]=useState<string|null>(null)
  const [walletAddress,setWalletAddress]=useState<string|null>(null)
  useEffect(() => {
    void getAuthenticatedWallet().then(wallet => {
      setWalletAddress(wallet?.address ?? null)
      if (wallet) {
        const savedPage = localStorage.getItem('landchain.currentPage') as Page | null
        setPage(savedPage && savedPage !== 'landing' && savedPage !== 'wallet' ? savedPage : 'dashboard')
      }
    }).finally(() => setAuthReady(true))
    if (!window.ethereum) return
    const ethereum = getEthereum()
    const handleAccountsChanged = (accounts: unknown) => {
      const nextAddress = Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : null
      clearWalletAuthentication()
      setWalletAddress(null)
    }
    ethereum.on?.('accountsChanged', handleAccountsChanged)
    return () => ethereum.removeListener?.('accountsChanged', handleAccountsChanged)
  }, [])
  useEffect(() => {
    if (!walletAddress) {
      setWalletRole('User')
      return
    }
    void getWalletRole(getBrowserProvider(), walletAddress).then(setWalletRole).catch(() => setWalletRole('User'))
  }, [walletAddress])
  useEffect(() => {
    if (!walletAddress) {
      setProfileName('')
      setProfileEmail('')
      return
    }
    const profileKey = walletAddress.toLowerCase()
    setProfileName(localStorage.getItem(`landchain.profile.${profileKey}.name`) ?? '')
    setProfileEmail(localStorage.getItem(`landchain.profile.${profileKey}.email`) ?? '')
  }, [walletAddress])
  useEffect(() => {
    if (page !== 'landing' && page !== 'wallet' && !canAccess(walletRole, page)) {
      setPage('dashboard')
      localStorage.setItem('landchain.currentPage', 'dashboard')
      setModal(null)
    }
  }, [page, walletRole])
  const current=nav.find(n=>n.id===page)?.label || (page==='land'?'Détails du bien':page==='profile'?'Profil utilisateur':page==='walletdetails'?'Portefeuille Web3':'Détails du transfert')
  const go=(p:Page)=>{if(!canAccess(walletRole,p)&&p !== 'landing'&&p !== 'wallet'){notify('Cette interface n’est pas disponible pour votre rôle blockchain.');return}setPage(p);if(p !== 'landing' && p !== 'wallet') localStorage.setItem('landchain.currentPage',p);setMobile(false);window.scrollTo(0,0)}
  const notify=(message:string)=>{setToast(message);window.setTimeout(()=>setToast(null),3200)}
  if(!authReady) return <div className="loading-state"><LoaderCircle size={22} className="spin"/><span>Restoring MetaMask session…</span></div>
  if(page==='landing') return <Landing go={go}/>
  if(page==='wallet') return <WalletConnect go={go}/>
  let content:ReactNode
  const saveProfile=(name:string,email:string)=>{
    if (!walletAddress) {
      notify('Connectez un portefeuille avant de modifier le profil.')
      return
    }
    const profileKey = walletAddress.toLowerCase()
    setProfileName(name)
    setProfileEmail(email)
    localStorage.setItem(`landchain.profile.${profileKey}.name`,name)
    localStorage.setItem(`landchain.profile.${profileKey}.email`,email)
    localStorage.removeItem('landchain.profile.name')
    localStorage.removeItem('landchain.profile.email')
  }
  const displayName=profileName || walletRole
  const logout=()=>{clearWalletAuthentication();setWalletAddress(null);setWalletRole('User');setPage('landing');setUserMenu(false);setWalletMenu(false);setModal(null);localStorage.removeItem('landchain.currentPage');notify('Vous êtes déconnecté de LANDCHAIN.')}
  const activePage = canAccess(walletRole, page) ? page : 'dashboard'
  switch(activePage){case'dashboard':content=<Dashboard go={go} role={walletRole}/>;break;case'registry':content=<Registry go={go} selectLand={setSelectedLandId} search={search} role={walletRole}/>;break;case'register':content=<Register role={walletRole}/>;break;case'verify':content=<Verify/>;break;case'transfers':content=<Transfers go={go} selectRequest={setSelectedRequestId} role={walletRole}/>;break;case'history':content=<History/>;break;case'access':content=<Access/>;break;case'settings':content=<SettingsPage setModal={setModal} notify={notify} address={walletAddress}/>;break;case'profile':content=<ProfilePage notify={notify} address={walletAddress} name={displayName} email={profileEmail} saveProfile={saveProfile}/>;break;case'walletdetails':content=<WalletModule setModal={setModal} notify={notify}/>;break;case'land':content=<LandDetails go={go} setModal={setModal} landId={selectedLandId} role={walletRole}/>;break;default:content=<TransferDetail go={go} setModal={setModal} requestId={selectedRequestId} role={walletRole}/>}
  const visibleNav=nav.filter(item=>rolePages[walletRole].includes(item.id))
  return <div className={`app ${collapsed?'sidebar-collapsed':''}`}>
    <aside className={`sidebar ${mobile?'open':''}`}><div className="brand"><span><LandPlot/></span><div>LAND<span>CHAIN</span><small>LAND REGISTRY</small></div></div><nav>{visibleNav.map(n=>{const Icon=n.icon;return <button title={collapsed?n.label:undefined} key={n.id} className={page===n.id?'active':''} onClick={()=>go(n.id)}>{n.id==='access'&&<span className="nav-label">ADMINISTRATION</span>}<Icon size={19}/>    <span>{n.label}</span></button>})}</nav><div className="sidebar-foot"><button className="collapse-btn" onClick={()=>setCollapsed(!collapsed)}><PanelLeftClose size={17}/><span>Collapse sidebar</span></button><div className="network"><span/><div><b>{LANDCHAIN_CHAIN_NAME}</b><small>Chain ID: {LANDCHAIN_CHAIN_ID.toString()}</small></div></div><p>Academic prototype · v1.0</p></div></aside>
    {mobile&&<div className="mobile-cover" onClick={()=>setMobile(false)}/>}
    <main><header><button className="menu-btn" onClick={()=>setMobile(true)}><Menu size={21}/></button><div className="breadcrumb"><span>LandChain</span><ChevronRight size={14}/><b>{current}</b></div><div className="header-search"><Search size={16}/><input value={search} onChange={event=>setSearch(event.target.value)} onFocus={()=>go('registry')} placeholder="Search registry…" /></div><div className="header-actions"><Badge tone="success">{LANDCHAIN_CHAIN_NAME}</Badge><button className="notify" aria-label="Open notifications" onClick={()=>{setNotifications(!notifications);setUserMenu(false);setWalletMenu(false)}}><Bell size={19}/><span/></button><button className="wallet-pill" onClick={()=>{setWalletMenu(!walletMenu);setNotifications(false);setUserMenu(false)}}><Wallet size={17}/><span>{walletAddress ? shortenAddress(walletAddress) : 'Connect wallet'}</span><ChevronDown size={14}/></button><button className="profile" onClick={()=>{setUserMenu(!userMenu);setNotifications(false);setWalletMenu(false)}}><span>{walletRole === 'Administrator' ? 'AD' : walletRole === 'Land agent' ? 'AG' : 'US'}</span><div><b>{walletRole}</b><small>{walletAddress ? shortenAddress(walletAddress) : 'Wallet not connected'}</small></div><ChevronDown size={15}/></button></div>
    {notifications&&<NotificationCenter close={()=>setNotifications(false)}/>}
    {walletMenu&&<WalletDropdown address={walletAddress} close={()=>setWalletMenu(false)} onViewDetails={()=>go('walletdetails')} disconnect={()=>{clearWalletAuthentication();setWalletAddress(null);setPage('landing');localStorage.removeItem('landchain.currentPage');notify('Portefeuille déconnecté de cette interface.')}}/>}
    {userMenu&&<div className="user-menu"><div className="user-menu-head"><span>{walletRole === 'Administrator' ? 'AD' : walletRole === 'Land agent' ? 'AG' : 'US'}</span><div><b>{displayName}</b><small>{profileEmail || (walletAddress ? shortenAddress(walletAddress) : 'Portefeuille non connecté')}</small></div></div><button onClick={()=>{go('profile');setUserMenu(false)}}><UserRound size={16}/> Mon profil</button><button onClick={()=>{go('settings');setUserMenu(false)}}><Settings size={16}/> Paramètres</button><button onClick={()=>{setModal('logout');setUserMenu(false)}} className="danger"><LogOut size={16}/> Se déconnecter</button></div>}</header><div className="content">{content}</div></main>
    {modal&&<Modal type={modal} close={()=>setModal(null)} onLogout={logout}/>}
    {toast&&<Toast message={toast} close={()=>setToast(null)}/>}
  </div>
}
