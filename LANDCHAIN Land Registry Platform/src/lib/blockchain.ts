import { BrowserProvider, Contract, EventLog, getAddress, isAddress, JsonRpcProvider, keccak256, Log, toUtf8Bytes, verifyMessage, type DeferredTopicFilter, type JsonRpcSigner, type Provider } from 'ethers'
import landRegistryAbi from './LandRegistry.abi.json'

const isLocalNetwork = import.meta.env.VITE_LANDCHAIN_NETWORK === 'localhost'
export const LANDCHAIN_CHAIN_ID = isLocalNetwork ? 31337n : 11155111n
export const LANDCHAIN_CHAIN_NAME = isLocalNetwork ? 'Hardhat Local' : 'Sepolia'
export const LANDCHAIN_RPC_URL = isLocalNetwork
  ? 'http://127.0.0.1:8545'
  : 'https://ethereum-sepolia-rpc.publicnode.com'
const LANDCHAIN_DEPLOYMENT_BLOCK = import.meta.env.VITE_LANDCHAIN_DEPLOYMENT_BLOCK
const MAX_EVENT_QUERY_BLOCK_RANGE = 40_000
const BLOCKSCOUT_LOGS_API = 'https://eth-sepolia.blockscout.com/api/v2/addresses'
let sepoliaRpcLogsUnavailable = false
let sepoliaReadProvider: JsonRpcProvider | undefined
let sepoliaExplorerLogsCache: { expiresAt: number; logs: Log[] } | undefined
let sepoliaExplorerLogsRequest: Promise<Log[]> | undefined
const AUTH_SESSION_KEY = 'landchain.wallet.auth'
export const LANDREGISTRY_ADDRESS =
  import.meta.env.VITE_LANDREGISTRY_ADDRESS ?? ''

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, listener: (...args: unknown[]) => void) => void
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void
}

declare global {
  interface Window {
    ethereum?: EthereumProvider
  }
}

export class BlockchainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BlockchainError'
  }
}

export function formatBlockchainError(cause: unknown, fallback: string): string {
  if (cause instanceof BlockchainError) return cause.message
  const message = cause instanceof Error ? cause.message : String(cause ?? '')
  const nestedRpcMessage = [...message.matchAll(/"message"\s*:\s*"([^"]+)"/g)]
    .map(match => match[1])
    .find(candidate => candidate && candidate !== 'Internal JSON-RPC error')
  if (nestedRpcMessage) {
    return `Erreur du fournisseur Sepolia : ${nestedRpcMessage}`
  }
  const customError = message.match(/(?:execution reverted:\s*)?([A-Za-z0-9_]+)\(([^)]*)\)/)
  if (customError) {
    const [, name, argumentsText] = customError
    const rawArgument = argumentsText.split(',')[0]?.trim()
    const argument = rawArgument && !/^(uint|address|bytes|string|bool)/.test(rawArgument) ? rawArgument : ''
    const messages: Record<string, string> = {
      LandNotFound: `Le bien ${argument || 'demandé'} n’existe pas dans le registre blockchain.`,
      LandAlreadyExists: `Le bien ${argument || 'indiqué'} existe déjà dans le registre blockchain.`,
      NotLandOwner: 'Le portefeuille connecté n’est pas le propriétaire actuel de ce bien.',
      LandIsSuspended: `Le bien ${argument || 'demandé'} est suspendu et ne peut pas être transféré.`,
      PendingRequestExists: 'Une demande de transfert est déjà en attente pour ce bien.',
      RequestNotFound: `La demande ${argument || 'demandée'} n’existe pas.`,
      RequestNotPending: 'Cette demande a déjà été traitée et ne peut plus être modifiée.',
      ConflictOfInterest: 'Un agent ne peut pas approuver sa propre demande de transfert.',
      OwnerChangedSinceRequest: 'Le propriétaire du bien a changé depuis la création de cette demande.',
      InvalidProposedOwner: 'L’adresse du nouveau propriétaire est invalide.',
      InvalidLandId: 'Le Land ID doit être un nombre différent de zéro.',
      EmptyReference: 'La référence du bien est obligatoire.',
      InvalidOwner: 'L’adresse du propriétaire est invalide.',
      InvalidDocumentHash: 'L’empreinte documentaire est invalide.',
      ProposalNotFound: 'Cette proposition de bien n’existe plus ou a déjà été traitée.',
      ProposalAlreadyExists: 'Une proposition existe déjà pour ce Land ID.',
      AccessControlUnauthorizedAccount: 'Ce portefeuille n’a pas le rôle requis pour effectuer cette opération.',
      NotProposalSubmitter: 'Seul le déposant de cette proposition peut l’annuler.',
    }
    if (messages[name]) return messages[name]
  }
  if (message.includes('ACTION_REJECTED') || message.includes('User rejected')) {
    return 'Transaction annulée dans MetaMask. Aucune modification n’a été effectuée.'
  }
  if (message.includes('insufficient funds')) {
    return `Solde insuffisant pour payer les frais de transaction sur ${LANDCHAIN_CHAIN_NAME}.`
  }
  if (message.includes('could not coalesce error') || message.includes('Internal JSON-RPC error')) {
    return `Le nœud ${LANDCHAIN_CHAIN_NAME} a refusé la requête. Vérifiez que MetaMask et le fournisseur RPC sont disponibles.`
  }
  if (message.includes('missing revert data') || message.includes('CALL_EXCEPTION')) {
    return 'Le smart contract a refusé cette opération. Vérifiez le portefeuille connecté, le rôle requis et l’état du bien.'
  }
  return message || fallback
}

export function getEthereum(): EthereumProvider {
  if (!window.ethereum) {
    throw new BlockchainError('MetaMask est requis pour connecter le portefeuille.')
  }
  return window.ethereum
}

export function getBrowserProvider(): BrowserProvider {
  return new BrowserProvider(getEthereum())
}

function getSepoliaReadProvider(): JsonRpcProvider {
  if (!sepoliaReadProvider) {
    sepoliaReadProvider = new JsonRpcProvider(LANDCHAIN_RPC_URL, Number(LANDCHAIN_CHAIN_ID))
  }
  return sepoliaReadProvider
}

export async function connectWallet(): Promise<{
  address: string
  chainId: bigint
  provider: BrowserProvider
  signer: JsonRpcSigner
}> {
  const ethereum = getEthereum()
  const provider = getBrowserProvider()
  try {
    // Reopen MetaMask's account selector so another imported account can be
    // authorized for this localhost origin.
    await ethereum.request({
      method: 'wallet_requestPermissions',
      params: [{ eth_accounts: {} }],
    })
  } catch (cause) {
    if (!(cause instanceof Error) || !cause.message.includes('Unsupported')) {
      throw cause
    }
  }
  await provider.send('eth_requestAccounts', [])
  const activeAccounts = (await provider.send('eth_accounts', [])) as string[]
  const signer = await provider.getSigner()
  const signerAddress = await signer.getAddress()
  const activeAddress = activeAccounts[0]
  if (!activeAddress || signerAddress.toLowerCase() !== activeAddress.toLowerCase()) {
    throw new BlockchainError(
      `MetaMask utilise l’adresse ${activeAddress ?? 'aucune adresse'}, mais le signer actif est ${signerAddress}. Sélectionnez cette même adresse dans MetaMask puis reconnectez le portefeuille.`,
    )
  }
  const network = await provider.getNetwork()
  const chainId = network.chainId

  if (chainId !== LANDCHAIN_CHAIN_ID) {
    throw new BlockchainError(
      `Réseau incorrect. Utilisez ${LANDCHAIN_CHAIN_NAME} (chain ID ${LANDCHAIN_CHAIN_ID.toString()}).`,
    )
  }

  const address = await signer.getAddress()
  const issuedAt = new Date()
  const expiresAt = new Date(issuedAt.getTime() + 24 * 60 * 60 * 1000)
  const nonce = crypto.randomUUID()
  const message = [
    'Connexion à LANDCHAIN',
    '',
    `Adresse : ${address}`,
    `Réseau : ${LANDCHAIN_CHAIN_NAME} (${LANDCHAIN_CHAIN_ID.toString()})`,
    `Nonce : ${nonce}`,
    `Émis le : ${issuedAt.toISOString()}`,
    `Expire le : ${expiresAt.toISOString()}`,
    '',
    'Cette signature ne déclenche aucune transaction et ne coûte aucun frais.',
  ].join('\n')
  const signature = await signer.signMessage(message)
  const recoveredAddress = verifyMessage(message, signature)
  if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
    throw new BlockchainError('La signature MetaMask ne correspond pas au portefeuille connecté.')
  }
  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ address, chainId: chainId.toString(), message, signature, expiresAt: expiresAt.toISOString() }))

  return {
    address,
    chainId,
    provider,
    signer,
  }
}

export async function getAuthenticatedWallet(): Promise<{
  address: string
  chainId: bigint
} | null> {
  if (!window.ethereum) return null
  const provider = getBrowserProvider()
  const accounts = (await provider.send('eth_accounts', [])) as string[]
  if (accounts.length === 0) return null
  const network = await provider.getNetwork()
  if (network.chainId !== LANDCHAIN_CHAIN_ID) return null

  const rawSession = sessionStorage.getItem(AUTH_SESSION_KEY)
  if (!rawSession) return null
  try {
    const session = JSON.parse(rawSession) as {
      address: string
      chainId: string
      message: string
      signature: string
      expiresAt: string
    }
    if (session.address.toLowerCase() !== accounts[0].toLowerCase() ||
      session.chainId !== network.chainId.toString() ||
      Date.parse(session.expiresAt) <= Date.now()) {
      sessionStorage.removeItem(AUTH_SESSION_KEY)
      return null
    }
    const recoveredAddress = verifyMessage(session.message, session.signature)
    if (recoveredAddress.toLowerCase() !== accounts[0].toLowerCase()) {
      sessionStorage.removeItem(AUTH_SESSION_KEY)
      return null
    }
    return { address: accounts[0], chainId: network.chainId }
  } catch {
    sessionStorage.removeItem(AUTH_SESSION_KEY)
    return null
  }
}

export function clearWalletAuthentication() {
  sessionStorage.removeItem(AUTH_SESSION_KEY)
}

export async function getConnectedWallet(): Promise<{
  address: string
  chainId: bigint
} | null> {
  if (!window.ethereum) return null

  const provider = getBrowserProvider()
  const accounts = (await provider.send('eth_accounts', [])) as string[]
  if (accounts.length === 0) return null

  const network = await provider.getNetwork()
  return { address: accounts[0], chainId: network.chainId }
}

export function getLandRegistryContract(
  providerOrSigner: Provider | JsonRpcSigner,
): Contract {
  if (!isAddress(LANDREGISTRY_ADDRESS)) {
    throw new BlockchainError(
      'Adresse du contrat LandRegistry manquante ou invalide. Définissez VITE_LANDREGISTRY_ADDRESS dans le fichier .env.local du frontend.',
    )
  }
  return new Contract(getAddress(LANDREGISTRY_ADDRESS), landRegistryAbi, providerOrSigner)
}

async function assertWalletNetwork(signer: JsonRpcSigner) {
  const provider = signer.provider
  if (!provider) {
    throw new BlockchainError('Le fournisseur MetaMask est indisponible.')
  }
  const chainId = await provider.send('eth_chainId', []) as string
  if (BigInt(chainId) !== LANDCHAIN_CHAIN_ID) {
    throw new BlockchainError(
      `MetaMask est connectée au réseau ${BigInt(chainId).toString()} (${chainId}), alors que l’application utilise ${LANDCHAIN_CHAIN_NAME} (chain ID ${LANDCHAIN_CHAIN_ID.toString()}). Sélectionnez Sepolia dans MetaMask puis réessayez.`,
    )
  }
}

async function queryFilterInChunks(
  contract: Contract,
  filter: DeferredTopicFilter,
) {
  const fromBlock = isLocalNetwork ? 0 : Number(LANDCHAIN_DEPLOYMENT_BLOCK)
  if (!Number.isSafeInteger(fromBlock) || fromBlock < 0) {
    throw new BlockchainError(
      'Bloc de déploiement Sepolia manquant ou invalide. Définissez VITE_LANDCHAIN_DEPLOYMENT_BLOCK dans .env.local.',
    )
  }

  const connectedProvider = contract.runner?.provider
  if (!connectedProvider) {
    throw new BlockchainError('Aucun fournisseur blockchain disponible pour lire les événements.')
  }
  const provider = isLocalNetwork ? connectedProvider : getSepoliaReadProvider()
  const eventContract = isLocalNetwork
    ? contract
    : new Contract(await contract.getAddress(), contract.interface, provider)
  let latestBlock: number
  try {
    latestBlock = await provider.getBlockNumber()
  } catch (cause) {
    throw new BlockchainError(
      `Impossible de lire le dernier bloc sur ${LANDCHAIN_CHAIN_NAME} : ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  }
  if (fromBlock > latestBlock) {
    throw new BlockchainError(
      `Le bloc de déploiement configuré (${fromBlock}) est supérieur au dernier bloc du réseau (${latestBlock}).`,
    )
  }

  const useExplorerFallback = !isLocalNetwork && sepoliaRpcLogsUnavailable
  const events: EventLog[] = []
  if (!useExplorerFallback) {
    for (let startBlock = fromBlock; startBlock <= latestBlock; startBlock += MAX_EVENT_QUERY_BLOCK_RANGE) {
      const endBlock = Math.min(startBlock + MAX_EVENT_QUERY_BLOCK_RANGE - 1, latestBlock)
      try {
        const chunk = await eventContract.queryFilter(filter, startBlock, endBlock)
        for (const event of chunk) {
          if (!(event instanceof EventLog)) {
            throw new BlockchainError('Un événement du contrat LandRegistry n’a pas pu être décodé.')
          }
          events.push(event)
        }
      } catch (cause) {
        if (isLocalNetwork) {
          throw new BlockchainError(
            `Impossible de lire les événements sur le nœud local : ${cause instanceof Error ? cause.message : String(cause)}`,
          )
        }
        sepoliaRpcLogsUnavailable = true
        break
      }
    }
    if (!sepoliaRpcLogsUnavailable) return events
  }

  const topics = await filter.getTopicFilter()
  if (topics.some(topic => topic !== null && typeof topic !== 'string' && !Array.isArray(topic))) {
    throw new BlockchainError('Le filtre d’événements demandé ne peut pas être utilisé avec le fournisseur Sepolia.')
  }
  const allLogs = await getSepoliaExplorerLogs(await eventContract.getAddress(), provider)
  return allLogs
    .filter(log => log.blockNumber >= fromBlock && log.blockNumber <= latestBlock)
    .filter(log => topics.every((topic, index) => {
      if (topic === null) return true
      const expectedTopics = Array.isArray(topic) ? topic : [topic]
      return expectedTopics.some(expected => log.topics[index]?.toLowerCase() === expected.toLowerCase())
    }))
    .map(log => new EventLog(log, contract.interface, filter.fragment))
}

async function getSepoliaExplorerLogs(address: string, provider: Provider): Promise<Log[]> {
  if (sepoliaExplorerLogsCache && sepoliaExplorerLogsCache.expiresAt > Date.now()) {
    return sepoliaExplorerLogsCache.logs
  }
  if (!sepoliaExplorerLogsRequest) {
    sepoliaExplorerLogsRequest = (async () => {
      const logs: Log[] = []
      const nextPage = new URLSearchParams()
      const visitedPages = new Set<string>()
      while (true) {
        const url = new URL(`${BLOCKSCOUT_LOGS_API}/${address}/logs`)
        nextPage.forEach((value, key) => url.searchParams.set(key, value))
        if (visitedPages.has(url.toString())) {
          throw new BlockchainError('L’explorateur Sepolia a retourné une pagination invalide.')
        }
        visitedPages.add(url.toString())

        let response: Response
        try {
          response = await fetch(url)
        } catch (cause) {
          throw new BlockchainError(
            `La lecture RPC des événements a échoué et l’explorateur Sepolia est inaccessible : ${cause instanceof Error ? cause.message : String(cause)}`,
          )
        }
        if (!response.ok) {
          throw new BlockchainError(`L’explorateur Sepolia a refusé la lecture des événements (HTTP ${response.status}).`)
        }
        const payload = await response.json() as {
          items?: Array<{
            block_hash: string
            block_number: number
            data: string
            index: number
            topics: string[]
            transaction_hash: string
            transaction_index: number
          }>
          next_page_params?: Record<string, string | number> | null
        }
        if (!Array.isArray(payload.items)) {
          throw new BlockchainError('L’explorateur Sepolia a retourné une réponse invalide pour les événements.')
        }

        for (const rawLog of payload.items) {
          logs.push(new Log({
            address,
            blockHash: rawLog.block_hash,
            blockNumber: rawLog.block_number,
            data: rawLog.data,
            index: rawLog.index,
            removed: false,
            topics: rawLog.topics,
            transactionHash: rawLog.transaction_hash,
            transactionIndex: rawLog.transaction_index,
          }, provider))
        }

        if (!payload.next_page_params) break
        nextPage.forEach((_value, key) => nextPage.delete(key))
        for (const [key, value] of Object.entries(payload.next_page_params)) {
          nextPage.set(key, String(value))
        }
      }
      return logs
    })()
  }

  const request = sepoliaExplorerLogsRequest
  try {
    const logs = await request
    sepoliaExplorerLogsCache = { expiresAt: Date.now() + 5_000, logs }
    return logs
  } finally {
    if (sepoliaExplorerLogsRequest === request) sepoliaExplorerLogsRequest = undefined
  }
}

export function formatLandStatus(status: bigint | number): 'Actif' | 'Transfert en cours' | 'Suspendu' {
  const labels = ['Actif', 'Transfert en cours', 'Suspendu'] as const
  return labels[Number(status)] ?? 'Suspendu'
}

export async function getRegistryLands(provider: Provider) {
  const contract = getLandRegistryContract(provider)
  const [registeredEvents, approvedProposalEvents] = await Promise.all([
    queryFilterInChunks(contract, contract.filters.LandRegistered()),
    queryFilterInChunks(contract, contract.filters.LandProposalApproved()),
  ])
  const landIds = new Set(
    [...registeredEvents, ...approvedProposalEvents]
      .filter(event => 'args' in event && event.args)
      .map(event => (
        event.fragment?.name === 'LandProposalApproved'
          ? (event.args![1] as bigint)
          : (event.args![0] as bigint)
      ).toString()),
  )
  const lands = await Promise.all([...landIds].map(async landIdValue => {
    const landId = BigInt(landIdValue)
    try {
      const land = await contract.getLand(landId)
      return {
        id: landId.toString(),
        reference: land.landRef as string,
        owner: land.owner as string,
        hash: land.documentHash as string,
        status: formatLandStatus(land.status as bigint),
        createdAt: Number(land.createdAt),
      }
    } catch {
      return null
    }
  }))
  return lands.filter((land): land is NonNullable<typeof land> => Boolean(land))
}

export async function getLandDetails(provider: Provider, landId: bigint) {
  const contract = getLandRegistryContract(provider)
  const land = await contract.getLand(landId)
  return {
    id: landId.toString(),
    reference: land.landRef as string,
    owner: land.owner as string,
    hash: land.documentHash as string,
    status: formatLandStatus(land.status as bigint),
    createdAt: Number(land.createdAt),
  }
}

export async function verifyDocument(
  provider: Provider,
  landId: bigint,
  documentHash: string,
): Promise<'match' | 'mismatch' | 'not-found'> {
  const contract = getLandRegistryContract(provider)
  const result = Number(await contract.verifyDocument(landId, documentHash))
  if (result === 0) return 'match'
  if (result === 1) return 'mismatch'
  return 'not-found'
}

export async function registerLand(
  signer: JsonRpcSigner,
  landId: bigint,
  landRef: string,
  owner: string,
  documentHash: string,
) {
  if (!isAddress(owner)) {
    throw new BlockchainError('Adresse propriétaire invalide. Utilisez une adresse 0x complète, sans ….')
  }

  const contract = getLandRegistryContract(signer)
  const agentRole = keccak256(toUtf8Bytes('AGENT_ROLE'))
  const account = await signer.getAddress()
  if (!(await contract.hasRole(agentRole, account))) {
    throw new BlockchainError('Ce portefeuille ne possède pas le rôle Agent foncier.')
  }
  const transaction = await contract.registerLand(landId, landRef, owner, documentHash)
  return transaction.wait()
}

export async function submitLandProposal(
  signer: JsonRpcSigner,
  landId: bigint,
  landRef: string,
  proposedOwner: string,
  documentHash: string,
) {
  if (!isAddress(proposedOwner)) {
    throw new BlockchainError('Adresse propriétaire invalide. Utilisez une adresse 0x complète, sans ….')
  }
  const contract = getLandRegistryContract(signer)
  const transaction = await contract.submitLandProposal(landId, landRef, proposedOwner, documentHash)
  return transaction.wait()
}

export async function getLandProposals(provider: Provider) {
  const contract = getLandRegistryContract(provider)
  const [submittedEvents, approvedEvents, rejectedEvents, cancelledEvents] = await Promise.all([
    queryFilterInChunks(contract, contract.filters.LandProposalSubmitted()),
    queryFilterInChunks(contract, contract.filters.LandProposalApproved()),
    queryFilterInChunks(contract, contract.filters.LandProposalRejected()),
    queryFilterInChunks(contract, contract.filters.LandProposalCancelled()),
  ])
  const processedProposalIds = new Set(
    [...approvedEvents, ...rejectedEvents, ...cancelledEvents]
      .filter(event => 'args' in event && event.args)
      .map(event => (event.args![0] as bigint).toString()),
  )
  const events = submittedEvents.filter(event =>
    'args' in event &&
    event.args &&
    !processedProposalIds.has((event.args[0] as bigint).toString()),
  )
  const proposals = await Promise.all(events.map(async event => {
    if (!('args' in event) || !event.args) return null
    const proposalId = event.args[0] as bigint
    try {
      const proposal = await contract.getLandProposal(proposalId)
      return {
        id: proposalId.toString(),
        landId: (proposal.landId as bigint).toString(),
        reference: proposal.landRef as string,
        owner: proposal.proposedOwner as string,
        submittedBy: proposal.submittedBy as string,
        documentHash: proposal.documentHash as string,
        createdAt: Number(proposal.createdAt),
      }
    } catch {
      return null
    }
  }))
  return proposals.filter((proposal): proposal is NonNullable<typeof proposal> => Boolean(proposal))
}

export async function cancelLandProposal(signer: JsonRpcSigner, proposalId: bigint) {
  const contract = getLandRegistryContract(signer)
  const transaction = await contract.cancelLandProposal(proposalId)
  return transaction.wait()
}

async function ensureTransactionFunds(signer: JsonRpcSigner, gasEstimate: Promise<bigint>) {
  const provider = signer.provider
  if (!provider) throw new BlockchainError('Le fournisseur MetaMask est indisponible.')
  await assertWalletNetwork(signer)
  const [balance, gasLimit, feeData] = await Promise.all([
    provider.getBalance(await signer.getAddress()),
    gasEstimate,
    provider.getFeeData(),
  ])
  const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n
  const required = gasLimit * gasPrice
  if (balance < required) {
    throw new BlockchainError(
      `Solde ETH insuffisant pour ce portefeuille (${(balance / 10n ** 18n).toString()} ETH). Demandez des ETH de test ${LANDCHAIN_CHAIN_NAME} depuis un faucet officiel.`,
    )
  }
}

export async function approveLandProposal(signer: JsonRpcSigner, proposalId: bigint) {
  const contract = await assertAgent(signer)
  const account = await signer.getAddress()
  try {
    await contract.getLandProposal(proposalId)
    await contract.approveLandProposal.staticCall(proposalId)
    await ensureTransactionFunds(signer, contract.approveLandProposal.estimateGas(proposalId))
  } catch (cause) {
    throw new BlockchainError(
      `Approbation impossible pour la proposition #${proposalId} avec le portefeuille ${account}. ${formatBlockchainError(cause, 'La proposition est peut-être déjà traitée ou invalide.')}`,
    )
  }
  const transaction = await contract.approveLandProposal(proposalId)
  return transaction.wait()
}

export async function rejectLandProposal(signer: JsonRpcSigner, proposalId: bigint) {
  const contract = await assertAgent(signer)
  const account = await signer.getAddress()
  try {
    await contract.getLandProposal(proposalId)
    await contract.rejectLandProposal.staticCall(proposalId)
    await ensureTransactionFunds(signer, contract.rejectLandProposal.estimateGas(proposalId))
  } catch (cause) {
    throw new BlockchainError(
      `Refus impossible pour la proposition #${proposalId} avec le portefeuille ${account}. ${formatBlockchainError(cause, 'La proposition est peut-être déjà traitée ou invalide.')}`,
    )
  }

  const transaction = await contract.rejectLandProposal(proposalId)
  return transaction.wait()
}

export async function grantAgentRole(signer: JsonRpcSigner, account: string) {
  if (!isAddress(account)) {
    throw new BlockchainError('Adresse du compte invalide. Utilisez une adresse 0x complète.')
  }
  await assertWalletNetwork(signer)
  const contract = getLandRegistryContract(signer)
  const role = keccak256(toUtf8Bytes('AGENT_ROLE'))
  const adminRole = await contract.DEFAULT_ADMIN_ROLE() as string
  const admin = await signer.getAddress()
  if (!(await contract.hasRole(adminRole, admin))) {
    throw new BlockchainError(`Le portefeuille ${admin} n’a pas le rôle administrateur de ce contrat.`)
  }
  const target = getAddress(account)
  if (await contract.hasRole(role, target)) {
    throw new BlockchainError(`Le portefeuille ${target} possède déjà le rôle Agent foncier.`)
  }
  try {
    await contract.grantRole.staticCall(role, target)
    await ensureTransactionFunds(signer, contract.grantRole.estimateGas(role, target))
  } catch (cause) {
    throw new BlockchainError(
      `Impossible d’autoriser ${target}. ${formatBlockchainError(cause, 'Vérifiez le compte administrateur, le réseau Sepolia et le solde en ETH de test.')}`,
    )
  }
  const transaction = await contract.grantRole(role, target)
  const receipt = await transaction.wait()
  sepoliaExplorerLogsCache = undefined
  return receipt
}

export async function revokeAgentRole(signer: JsonRpcSigner, account: string) {
  if (!isAddress(account)) {
    throw new BlockchainError('Adresse du compte invalide. Utilisez une adresse 0x complète.')
  }
  await assertWalletNetwork(signer)
  const contract = getLandRegistryContract(signer)
  const role = keccak256(toUtf8Bytes('AGENT_ROLE'))
  const transaction = await contract.revokeRole(role, getAddress(account))
  const receipt = await transaction.wait()
  sepoliaExplorerLogsCache = undefined
  return receipt
}

export async function requestTransfer(
  signer: JsonRpcSigner,
  landId: bigint,
  proposedOwner: string,
) {
  if (!isAddress(proposedOwner)) {
    throw new BlockchainError('Adresse du nouveau propriétaire invalide. Utilisez une adresse 0x complète.')
  }
  const contract = getLandRegistryContract(signer)
  const land = await contract.getLand(landId)
  const account = await signer.getAddress()
  if ((land.owner as string).toLowerCase() !== account.toLowerCase()) {
    throw new BlockchainError(`Seul le propriétaire actuel (${land.owner}) peut demander le transfert de ce bien.`)
  }
  const transaction = await contract.requestTransfer(landId, getAddress(proposedOwner))
  const receipt = await transaction.wait()
  const events = await contract.queryFilter(contract.filters.TransferRequested(), receipt?.blockNumber, receipt?.blockNumber)
  const event = events[events.length - 1]
  return { receipt, requestId: event && 'args' in event && event.args ? (event.args[0] as bigint) : undefined }
}

export async function cancelTransferRequest(signer: JsonRpcSigner, requestId: bigint) {
  const contract = getLandRegistryContract(signer)
  const transaction = await contract.cancelTransferRequest(requestId)
  return transaction.wait()
}

export async function getTransferRequests(provider: Provider) {
  const contract = getLandRegistryContract(provider)
  const events = await queryFilterInChunks(contract, contract.filters.TransferRequested())
  return Promise.all(events.map(async event => {
    if (!('args' in event) || !event.args) return null
    const requestId = event.args[0] as bigint
    const request = await contract.getTransferRequest(requestId)
    const statuses = ['En attente', 'Approuvée', 'Refusée', 'Annulée']
    return {
      id: requestId.toString(),
      landId: (request.landId as bigint).toString(),
      currentOwner: request.currentOwner as string,
      proposedOwner: request.proposedOwner as string,
      status: statuses[Number(request.status)] ?? 'Unknown',
      createdAt: Number(request.createdAt),
    }
  })).then(requests => requests.filter(Boolean))
}

export async function getTransferRequestDetails(provider: Provider, requestId: bigint) {
  const contract = getLandRegistryContract(provider)
  const request = await contract.getTransferRequest(requestId)
  const statuses = ['En attente', 'Approuvée', 'Refusée', 'Annulée']
  return {
    id: requestId.toString(),
    landId: (request.landId as bigint).toString(),
    currentOwner: request.currentOwner as string,
    proposedOwner: request.proposedOwner as string,
    status: statuses[Number(request.status)] ?? 'Unknown',
    createdAt: Number(request.createdAt),
    reviewedBy: request.reviewedBy as string,
    reviewedAt: Number(request.reviewedAt),
  }
}

export async function getTransactionHistory(provider: Provider) {
  const contract = getLandRegistryContract(provider)
  const eventQueries = [
    ['Land registered', queryFilterInChunks(contract, contract.filters.LandRegistered())],
    ['Land proposal submitted', queryFilterInChunks(contract, contract.filters.LandProposalSubmitted())],
    ['Land proposal approved', queryFilterInChunks(contract, contract.filters.LandProposalApproved())],
    ['Land proposal rejected', queryFilterInChunks(contract, contract.filters.LandProposalRejected())],
    ['Land proposal cancelled', queryFilterInChunks(contract, contract.filters.LandProposalCancelled())],
    ['Document hash updated', queryFilterInChunks(contract, contract.filters.DocumentHashUpdated())],
    ['Land status changed', queryFilterInChunks(contract, contract.filters.LandStatusChanged())],
    ['Transfer requested', queryFilterInChunks(contract, contract.filters.TransferRequested())],
    ['Transfer approved', queryFilterInChunks(contract, contract.filters.TransferApproved())],
    ['Transfer rejected', queryFilterInChunks(contract, contract.filters.TransferRejected())],
    ['Transfer cancelled', queryFilterInChunks(contract, contract.filters.TransferCancelled())],
    ['Ownership changed', queryFilterInChunks(contract, contract.filters.OwnershipChanged())],
  ] as const
  const groups = await Promise.all(eventQueries.map(async ([type, query]) => {
    const events = await query
    return Promise.all(events.map(async event => {
      if (!('args' in event) || !event.args || !('transactionHash' in event) || event.blockNumber === undefined) return null
      const args = event.args
      const block = await provider.getBlock(event.blockNumber)
      const landId = type === 'Transfer requested' || type === 'Transfer approved' || type === 'Transfer rejected' || type === 'Transfer cancelled' ||
        type === 'Land proposal submitted' || type === 'Land proposal approved' || type === 'Land proposal rejected' || type === 'Land proposal cancelled'
        ? args[1] as bigint
        : args[0] as bigint
      const actor = type === 'Land registered' ? args[3] as string
        : type === 'Land proposal submitted' ? args[5] as string
        : type === 'Land proposal approved' || type === 'Land proposal rejected' || type === 'Land proposal cancelled' ? args[2] as string
        : type === 'Document hash updated' ? args[3] as string
        : type === 'Land status changed' ? args[3] as string
        : type === 'Transfer requested' ? args[2] as string
        : type === 'Transfer approved' || type === 'Transfer rejected' || type === 'Transfer cancelled' ? args[2] as string
        : type === 'Ownership changed' ? args[1] as string
        : ''
      return {
        hash: event.transactionHash,
        type,
        landId: landId.toString(),
        actor,
        block: event.blockNumber,
        timestamp: block?.timestamp ?? 0,
      }
    }))
  }))
  return groups.flat().filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => b.block - a.block)
}

export async function getDashboardStats(provider: Provider) {
  const contract = getLandRegistryContract(provider)
  const [landCount, pendingRequestCount, history, latestBlock] = await Promise.all([
    contract.landCount() as Promise<bigint>,
    contract.pendingRequestCount() as Promise<bigint>,
    getTransactionHistory(provider),
    provider.getBlockNumber(),
  ])
  return {
    registeredProperties: Number(landCount),
    pendingTransfers: Number(pendingRequestCount),
    documentRecords: Number(landCount),
    blockchainEvents: history.length,
    latestBlock,
    recentEvents: history.slice(0, 4),
  }
}

export async function getPersonalDashboardStats(provider: Provider, address: string) {
  const normalizedAddress = address.toLowerCase()
  const [lands, history, requests] = await Promise.all([
    getRegistryLands(provider),
    getTransactionHistory(provider),
    getTransferRequests(provider),
  ])
  const ownedLandIds = new Set(
    lands
      .filter(land => land.owner.toLowerCase() === normalizedAddress)
      .map(land => land.id),
  )
  return {
    ownedProperties: ownedLandIds.size,
    personalTransactions: history.filter(event => ownedLandIds.has(event.landId)).length,
    personalTransfers: requests.filter(request =>
      [request.currentOwner, request.proposedOwner]
        .some(owner => owner.toLowerCase() === normalizedAddress),
    ).length,
  }
}

async function assertAgent(signer: JsonRpcSigner) {
  const contract = getLandRegistryContract(signer)
  const role = keccak256(toUtf8Bytes('AGENT_ROLE'))
  const account = await signer.getAddress()
  const activeAccounts = (await signer.provider?.send('eth_accounts', [])) as string[] | undefined
  if (!activeAccounts?.[0] || activeAccounts[0].toLowerCase() !== account.toLowerCase()) {
    throw new BlockchainError(
      `MetaMask utilise une autre adresse (${activeAccounts?.[0] ?? 'aucune adresse'}) que celle demandée pour la transaction (${account}). Sélectionnez le bon compte puis reconnectez le portefeuille.`,
    )
  }
  if (!(await contract.hasRole(role, account))) {
    throw new BlockchainError(
      `Le portefeuille connecté (${account}) ne possède pas le rôle Agent foncier. Sélectionnez l’adresse d’un agent autorisé.`,
    )
  }
  return contract
}

export async function approveTransfer(signer: JsonRpcSigner, requestId: bigint) {
  const contract = await assertAgent(signer)
  const transaction = await contract.approveTransfer(requestId)
  return transaction.wait()
}

export async function rejectTransfer(signer: JsonRpcSigner, requestId: bigint) {
  const contract = await assertAgent(signer)
  const transaction = await contract.rejectTransfer(requestId)
  return transaction.wait()
}

export async function getAgentAccounts(provider: Provider): Promise<string[]> {
  const contract = getLandRegistryContract(provider)
  const role = keccak256(toUtf8Bytes('AGENT_ROLE'))
  const [grantedEvents, revokedEvents] = await Promise.all([
    queryFilterInChunks(contract, contract.filters.RoleGranted(role)),
    queryFilterInChunks(contract, contract.filters.RoleRevoked(role)),
  ])
  const roleEvents = [...grantedEvents, ...revokedEvents].sort((left, right) => {
    const blockOrder = left.blockNumber - right.blockNumber
    if (blockOrder !== 0) return blockOrder
    return (left.index ?? 0) - (right.index ?? 0)
  })
  const accounts = new Map<string, string>()
  for (const event of roleEvents) {
    if (!('args' in event) || !event.args) continue
    const account = event.args[1] as string
    const key = account.toLowerCase()
    if (event.fragment.name === 'RoleGranted') accounts.set(key, account)
    else accounts.delete(key)
  }
  return [...accounts.values()]
}

export async function getWalletRole(provider: Provider, account: string): Promise<'Administrator' | 'Land agent' | 'User'> {
  const contract = getLandRegistryContract(provider)
  const [adminRole, agentRole] = await Promise.all([
    contract.DEFAULT_ADMIN_ROLE() as Promise<string>,
    contract.AGENT_ROLE() as Promise<string>,
  ])
  if (await contract.hasRole(adminRole, account)) return 'Administrator'
  if (await contract.hasRole(agentRole, account)) return 'Land agent'
  return 'User'
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}
