import { useEffect, useState } from 'react'
import { Check, ChevronRight, CircleAlert, Copy, LogOut, RefreshCw, Wallet, WifiOff } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CopyValue,
  PageHead,
} from '../ui'
import {
  BlockchainError,
  clearWalletAuthentication,
  connectWallet,
  getAuthenticatedWallet,
  getEthereum,
  getLandRegistryContract,
  LANDCHAIN_CHAIN_ID,
  LANDCHAIN_CHAIN_NAME,
  shortenAddress,
} from '../../lib/blockchain'

export function WalletModule({ setModal, notify }: { setModal:(value:string|null)=>void; notify:(message:string)=>void }) {
  const [connected,setConnected]=useState(false)
  const [wrongNetwork,setWrongNetwork]=useState(false)
  const [address,setAddress]=useState('')
  const [error,setError]=useState('')

  useEffect(() => {
    void getAuthenticatedWallet().then(wallet => {
      if (!wallet) return
      setAddress(wallet.address)
      setConnected(true)
      setWrongNetwork(wallet.chainId !== LANDCHAIN_CHAIN_ID)
    }).catch(() => {
      setError('Impossible de lire la session MetaMask actuelle.')
    })
    if (!window.ethereum) return
    const ethereum = getEthereum()
    const handleAccountsChanged = () => {
      setConnected(false)
      setAddress('')
      setError('Le compte MetaMask a changé. Cliquez sur « Connecter MetaMask » pour connecter le compte sélectionné.')
    }
    ethereum.on?.('accountsChanged', handleAccountsChanged)
    return () => ethereum.removeListener?.('accountsChanged', handleAccountsChanged)
  }, [])

  async function handleConnect() {
    setError('')
    try {
      const wallet = await connectWallet()
      const contract = getLandRegistryContract(wallet.provider)
      const code = await wallet.provider.getCode(await contract.getAddress())
      if (code === '0x') {
        throw new BlockchainError(
          'Le contrat LandRegistry est introuvable. Lancez le nœud local puis npm run deploy:local.',
        )
      }
      setAddress(wallet.address)
      setConnected(true)
      setWrongNetwork(false)
      notify('Portefeuille connecté à LandRegistry.')
    } catch (cause) {
      setConnected(false)
      setWrongNetwork(false)
      setError(cause instanceof Error ? cause.message : 'La connexion MetaMask a échoué.')
    }
  }

  function handleDisconnect() {
    clearWalletAuthentication()
    setConnected(false)
    setAddress('')
    setError('')
    notify('Portefeuille déconnecté de cette interface.')
  }

  return <><PageHead title="Portefeuille Web3" description="Gérez votre connexion, votre réseau et vos transactions LANDCHAIN." action={<Badge tone="success">MetaMask · Connecté au backend</Badge>}/>
    <div className="mock-banner"><CircleAlert size={17}/><span><b>Connexion réelle activée.</b> L'adresse et le réseau proviennent de MetaMask. Les opérations affichées proviennent du contrat local LandRegistry.</span></div>
    {error&&<div className="network-warning"><WifiOff size={20}/><div><b>Connexion blockchain impossible</b><span>{error}</span></div></div>}
    {!connected?<Card className="wallet-empty"><span className="wallet-logo"><Wallet size={29}/></span><h2>Portefeuille non connecté</h2><p>Connectez MetaMask pour accéder au contrat local LANDCHAIN.</p><Button onClick={()=>void handleConnect()}><Wallet size={16}/> Connecter MetaMask</Button><small>Réseau attendu : {LANDCHAIN_CHAIN_NAME} · Chain ID {LANDCHAIN_CHAIN_ID.toString()}</small></Card>:<>
      <div className="wallet-overview-grid"><Card className="wallet-main-card"><div className="wallet-card-top"><div className="metamask-mark">M</div><div><span className="eyebrow">PORTEFEUILLE CONNECTÉ</span><h2>MetaMask</h2></div><Badge tone="success">Connecté</Badge></div><div className="wallet-address-large"><div><span>Adresse du portefeuille</span><b>{shortenAddress(address)}</b></div><button className="icon-btn" title="Copier l’adresse du portefeuille" onClick={()=>{void navigator.clipboard?.writeText(address);notify('Adresse du portefeuille copiée.')}}><Copy size={17}/></button></div><div className="wallet-balance"><span>Solde ETH</span><strong>Lu dans MetaMask</strong><small>Le solde du portefeuille local est géré par MetaMask.</small></div><div className="wallet-actions"><Button variant="secondary" onClick={()=>void handleConnect()}>Changer de compte</Button><Button variant="secondary" onClick={handleDisconnect}>Déconnecter</Button></div></Card>
        <Card><div className="card-head"><div><h2>Réseau actif</h2><p>Blockchain utilisée par les opérations LANDCHAIN</p></div><Badge tone={wrongNetwork?'danger':'success'}>{wrongNetwork?'Non pris en charge':'Actif'}</Badge></div>{wrongNetwork?<div className="network-warning"><WifiOff size={20}/><div><b>Réseau non pris en charge</b><span>Basculez MetaMask vers {LANDCHAIN_CHAIN_NAME} (Chain ID {LANDCHAIN_CHAIN_ID.toString()}).</span></div></div>:<div className="network-card"><span className="ethereum-logo">◆</span><div><b>{LANDCHAIN_CHAIN_NAME}</b><small>Chain ID {LANDCHAIN_CHAIN_ID.toString()} · Réseau de développement local</small></div><span className="network-dot"/></div>}<label className="select-field"><span>Sélection du réseau</span><select value={wrongNetwork?'wrong':LANDCHAIN_CHAIN_ID.toString()} onChange={event=>setWrongNetwork(event.target.value==='wrong')}><option value={LANDCHAIN_CHAIN_ID.toString()}>{LANDCHAIN_CHAIN_NAME}</option><option value="wrong">Autre réseau (non pris en charge)</option></select></label>{wrongNetwork&&<Button onClick={()=>void handleConnect()}><RefreshCw size={16}/> Vérifier le réseau</Button>}</Card></div>
      </>}
  </>
}

export function WalletDropdown({ close, onViewDetails, disconnect, address }: { close:()=>void; onViewDetails:()=>void; disconnect:()=>void; address: string | null }) {
  const [copied,setCopied]=useState(false)
  const displayAddress = address ? shortenAddress(address) : 'Non connecté'
  async function copyAddress() {
    if (!address) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(address)
      } else {
        const input = document.createElement('textarea')
        input.value = address
        input.setAttribute('readonly', '')
        input.style.position = 'fixed'
        input.style.opacity = '0'
        document.body.appendChild(input)
        input.select()
        const copiedWithFallback = document.execCommand('copy')
        input.remove()
        if (!copiedWithFallback) throw new Error('Clipboard copy was refused.')
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }
  return <div className="wallet-dropdown"><div className="wallet-drop-head"><div className="metamask-mark">M</div><div><b title={address || undefined}>{displayAddress}</b><small><span/> {address ? 'Connecté avec MetaMask' : 'Portefeuille non connecté'}</small></div><button className="icon-btn" disabled={!address} aria-label={copied ? 'Adresse copiée' : 'Copier l’adresse complète'} title={copied ? 'Adresse copiée' : address || 'Portefeuille non connecté'} onClick={()=>void copyAddress()}>{copied ? <Check size={15}/> : <Copy size={15}/>}</button></div><div className="wallet-drop-network"><span className="ethereum-logo">◆</span><div><span>Réseau actif</span><b>{LANDCHAIN_CHAIN_NAME}</b></div><Badge tone="success">Chain {LANDCHAIN_CHAIN_ID.toString()}</Badge></div><div className="wallet-drop-balance"><span>Solde <em>Étape 2</em></span><b>Non chargé</b></div><button onClick={()=>{onViewDetails();close()}}><Wallet size={16}/> Voir les détails <ChevronRight size={15}/></button><button className="danger" onClick={()=>{disconnect();close()}}><LogOut size={16}/> Déconnecter le portefeuille</button></div>
}
