import { useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  LoaderCircle,
  Search,
  Wallet,
  X,
  XCircle,
} from 'lucide-react'

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export function Button({ children, variant = 'primary', onClick, disabled, loading, type = 'button' }: { children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; onClick?: () => void; disabled?: boolean; loading?: boolean; type?: 'button' | 'submit' }) {
  return <button type={type} disabled={disabled || loading} onClick={onClick} className={`btn btn-${variant}`}>{loading && <LoaderCircle size={16} className="spin" />}{children}</button>
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: BadgeTone }) {
  return <span className={`badge badge-${tone}`}><span className="badge-dot" />{children}</span>
}

export function statusTone(status: string): BadgeTone {
  if (['Verified', 'Approved', 'Confirmed', 'Approuvée', 'Confirmée', 'Actif'].includes(status)) return 'success'
  if (['Pending', 'En attente', 'Transfert en cours'].includes(status)) return 'warning'
  if (['Rejected', 'Restricted', 'Failed', 'Refusée', 'Refusé', 'Suspendu', 'Échouée'].includes(status)) return 'danger'
  return 'info'
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>
}

export function PageHead({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="page-head"><div><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

export function CopyValue({ children, copyText }: { children: ReactNode; copyText?: string }) {
  const [copied, setCopied] = useState(false)
  const value = copyText ?? (typeof children === 'string' || typeof children === 'number' ? String(children) : '')
  async function copyValue() {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }

  }
  return <span className="mono-copy" title={value || undefined}><span>{children}</span><button type="button" className="copy-value-button" onClick={()=>void copyValue()} aria-label={copied ? 'Copié' : 'Copier la valeur'} title={copied ? 'Copié' : 'Copier la valeur complète'}><Copy size={14} /></button></span>
}

export function AddressValue({ address }: { address: string }) {
  return <CopyValue copyText={address}>{`${address.slice(0, 6)}…${address.slice(-4)}`}</CopyValue>
}

export function Field({ label, placeholder, error, icon: Icon }: { label: string; placeholder: string; error?: string; icon?: LucideIcon }) {
  return <label className="field"><span>{label}</span><div className="input-wrap">{Icon && <Icon size={17} />}<input placeholder={placeholder} /></div>{error && <small>{error}</small>}</label>
}

export function Toolbar({ placeholder = 'Rechercher par identifiant ou référence…', extra = true }: { placeholder?: string; extra?: boolean }) {
  return <div className="toolbar"><label className="search"><Search size={17} /><input placeholder={placeholder} /></label>{extra && <><select aria-label="Filtrer par statut"><option>Tous les statuts</option><option>Vérifié</option><option>En attente</option></select><select aria-label="Filtrer par période"><option>30 derniers jours</option><option>90 derniers jours</option></select></>}</div>
}

export function KpiCard({ label, value, meta, icon: Icon, tone }: { label:string; value:string; meta:string; icon:LucideIcon; tone:string }) {
  return <Card className="stat"><div className={`stat-icon ${tone}`}><Icon size={20}/></div><p>{label}</p><strong>{value}</strong><small><span className={tone === 'amber' ? 'attention' : ''}>{meta}</span></small></Card>
}

export function Pagination({ total }: { total: string }) {
  return <div className="pagination"><span>Affichage de 1 à 5 sur {total}</span><div><button aria-label="Page précédente"><ChevronLeft size={16}/></button><button className="active">1</button><button>2</button><button>3</button><button aria-label="Page suivante"><ChevronRight size={16}/></button></div></div>
}

export function DataTable({ headings, rows, total }: { headings:string[]; rows:ReactNode[][]; total:string }) {
  return <><div className="table-scroll"><table><thead><tr>{headings.map((heading,i)=><th key={`${heading}-${i}`}>{heading}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table></div><Pagination total={total}/></>
}

export function WalletCard({ name, address, connected = true }: { name:string; address:string; connected?:boolean }) {
  return <div className="wallet-card"><span className="wallet-card-icon"><Wallet size={19}/></span><div><b>{name}</b><CopyValue>{address}</CopyValue></div><Badge tone={connected?'success':'neutral'}>{connected?'Connecté':'Déconnecté'}</Badge></div>
}

export function TransactionStatusCard({ status = 'confirmed', title, detail }: { status?:'pending'|'confirmed'|'failed'; title:string; detail:string }) {
  const Icon=status==='pending'?LoaderCircle:status==='confirmed'?CheckCircle2:XCircle
  const statusLabel = status === 'confirmed' ? 'Confirmée' : status === 'pending' ? 'En attente' : 'Échouée'
  return <div className={`transaction-status transaction-status-${status}`}><span><Icon size={18} className={status==='pending'?'spin':''}/></span><div><b>{title}</b><small>{detail}</small></div><Badge tone={status==='confirmed'?'success':status==='pending'?'warning':'danger'}>{statusLabel}</Badge></div>
}

export function EmptyState({ icon:Icon, title, description }: { icon:LucideIcon; title:string; description:string }) {
  return <div className="empty-state"><span><Icon size={26}/></span><h2>{title}</h2><p>{description}</p></div>
}

export function LoadingState({ label='Chargement des données sécurisées…' }: { label?:string }) {
  return <div className="loading-state"><LoaderCircle size={22} className="spin"/><span>{label}</span></div>
}

export function Skeleton({ rows=3 }: { rows?:number }) {
  return <div className="skeleton" aria-label="Loading content">{Array.from({length:rows}).map((_,i)=><span key={i}/>)}</div>
}

export function ErrorState({ retry }: { retry?:()=>void }) {
  return <div className="state-panel error-state"><AlertTriangle size={25}/><div><b>Impossible de charger ces informations</b><span>Vérifiez votre connexion puis réessayez.</span></div>{retry&&<Button variant="secondary" onClick={retry}>Réessayer</Button>}</div>
}

export function Toast({ message, close }: { message:string; close:()=>void }) {
  return <div className="toast" role="status"><CheckCircle2 size={18}/><div><b>Succès</b><span>{message}</span></div><button className="icon-btn" onClick={close} aria-label="Fermer"><X size={16}/></button></div>
}
