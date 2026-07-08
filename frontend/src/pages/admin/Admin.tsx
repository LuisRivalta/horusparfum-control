import { useEffect, useMemo, useState } from 'react'
import { Button, Input, Select } from '@/components/shared/FormControls'
import { useAuth } from '@/contexts/AuthContext'

const ADMIN_EMAIL = 'byhorusco@gmail.com'
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '')

type Tab = 'logins' | 'exclusoes'

interface AdminUser {
  id: string
  email: string
  created_at?: string | null
  last_sign_in_at?: string | null
}

interface AdminItem {
  id: string
  nome?: string
  label?: string
  descricao?: string
  numero?: number
  cliente?: string
}

const ENTITIES = [
  { value: 'produtos', label: 'Produtos' },
  { value: 'pedidos', label: 'Pedidos' },
  { value: 'vendas', label: 'Vendas' },
  { value: 'transacoes', label: 'Transações' },
  { value: 'contas', label: 'Contas' },
  { value: 'metas', label: 'Metas' },
  { value: 'categorias', label: 'Categorias' },
  { value: 'marcas', label: 'Marcas' },
  { value: 'fornecedores', label: 'Fornecedores' },
  { value: 'canais', label: 'Canais' },
  { value: 'embalagens', label: 'Embalagens' },
]

function itemLabel(item: AdminItem) {
  return item.nome || item.label || item.descricao || item.cliente || (item.numero ? `#${item.numero}` : item.id)
}

export function Admin() {
  const { user, session } = useAuth()
  const [tab, setTab] = useState<Tab>('logins')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [items, setItems] = useState<AdminItem[]>([])
  const [entity, setEntity] = useState('metas')
  const [search, setSearch] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [pendingDelete, setPendingDelete] = useState<{ kind: 'user' | 'item'; id: string; label: string } | null>(null)
  const [confirmText, setConfirmText] = useState('')

  const isAdmin = user?.email === ADMIN_EMAIL
  const headers = useMemo(() => ({
    Authorization: `Bearer ${session?.access_token ?? ''}`,
    'Content-Type': 'application/json',
  }), [session?.access_token])

  async function api(path: string, init: RequestInit = {}) {
    const response = await fetch(`${API_URL}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } })
    const data = await response.json()
    if (!response.ok) throw new Error(data.detail || 'Erro administrativo')
    return data
  }

  async function loadUsers() {
    const data = await api('/api/admin/users')
    setUsers(data.users || [])
  }

  async function loadItems() {
    const suffix = search ? `?search=${encodeURIComponent(search)}` : ''
    const data = await api(`/api/admin/${entity}${suffix}`)
    setItems(data.items || [])
  }

  useEffect(() => {
    if (!isAdmin) return
    loadUsers().catch((error) => setMessage(error.message))
    loadItems().catch((error) => setMessage(error.message))
  }, [isAdmin, entity])

  async function handleCreateUser(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      await api('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      setEmail('')
      setPassword('')
      setMessage('Login criado')
      await loadUsers()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao criar login')
    } finally {
      setLoading(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || confirmText !== 'EXCLUIR') return
    setLoading(true)
    setMessage('')
    try {
      if (pendingDelete.kind === 'user') {
        await api(`/api/admin/users/${pendingDelete.id}`, { method: 'DELETE' })
        await loadUsers()
      } else {
        await api(`/api/admin/${entity}/${pendingDelete.id}`, { method: 'DELETE' })
        await loadItems()
      }
      setMessage('Exclusão concluída')
      setPendingDelete(null)
      setConfirmText('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao excluir')
    } finally {
      setLoading(false)
    }
  }

  if (!isAdmin) {
    return (
      <section className="page-enter">
        <h1>Acesso administrativo restrito</h1>
        <p className="mt-2 text-text-2">Esta área é exclusiva para o administrador principal.</p>
      </section>
    )
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-[.18em] text-gold">Admin</p>
        <h1>Painel admin</h1>
      </div>

      <div className="flex gap-2">
        <Button variant={tab === 'logins' ? 'primary' : 'secondary'} onClick={() => setTab('logins')} aria-pressed={tab === 'logins'}>Logins</Button>
        <Button variant={tab === 'exclusoes' ? 'primary' : 'secondary'} onClick={() => setTab('exclusoes')} aria-pressed={tab === 'exclusoes'}>Exclusões</Button>
      </div>

      {message && <div className="rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm text-text-2">{message}</div>}

      {tab === 'logins' ? (
        <div className="space-y-5">
          <form onSubmit={handleCreateUser} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
            <Input label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <Input label="Senha temporaria" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} />
            <Button type="submit" disabled={loading}>Criar login</Button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead><tr><th>Email</th><th>Criado em</th><th>Último login</th><th></th></tr></thead>
              <tbody>
                {users.map((adminUser) => (
                  <tr key={adminUser.id}>
                    <td>{adminUser.email}</td>
                    <td>{adminUser.created_at || '-'}</td>
                    <td>{adminUser.last_sign_in_at || '-'}</td>
                    <td className="text-right">
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={adminUser.email === ADMIN_EMAIL}
                        onClick={() => setPendingDelete({ kind: 'user', id: adminUser.id, label: adminUser.email })}
                      >
                        Remover
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-[220px_1fr_auto] items-end">
            <Select label="Entidade" value={entity} onChange={(event) => setEntity(event.target.value)} options={ENTITIES} />
            <Input label="Busca" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, numero ou descricao" />
            <Button variant="secondary" onClick={() => loadItems()}>Buscar</Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead><tr><th>Registro</th><th>ID</th><th></th></tr></thead>
              <tbody>
                {items.map((item) => {
                  const label = itemLabel(item)
                  return (
                    <tr key={item.id}>
                      <td>{label}</td>
                      <td className="font-mono text-xs text-muted">{item.id}</td>
                      <td className="text-right">
                        <Button
                          variant="danger"
                          size="sm"
                          aria-label={`Excluir ${label}`}
                          onClick={() => setPendingDelete({ kind: 'item', id: item.id, label })}
                        >
                          Excluir
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-line bg-surface p-5 shadow-2xl">
            <h2 className="text-lg font-semibold text-text">Confirmar exclusão</h2>
            <p className="mt-2 text-sm text-text-2">Esta ação é destrutiva para {pendingDelete.label}. Digite EXCLUIR para confirmar.</p>
            <div className="mt-4">
              <Input label="Digite EXCLUIR" value={confirmText} onChange={(event) => setConfirmText(event.target.value)} />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setPendingDelete(null); setConfirmText('') }}>Cancelar</Button>
              <Button variant="danger" disabled={confirmText !== 'EXCLUIR' || loading} onClick={confirmDelete}>Excluir</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
