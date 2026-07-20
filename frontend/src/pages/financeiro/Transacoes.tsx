import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/shared/Icon'
import { Modal } from '@/components/shared/Modal'
import { EditarVendaModal } from '@/pages/estoque/vendas/EditarVendaModal'
import { CorrigirConsumoDecantModal } from '@/pages/estoque/decants/CorrigirConsumoDecantModal'
import { Button, Input, Select } from '@/components/shared/FormControls'
import { formatBRL } from '@/lib/utils'

interface Transacao {
  id: string
  descricao: string
  tipo: string
  valor: number
  categoria: string | null
  forma_pagamento: string | null
  responsavel: string | null
  created_at: string
  origem?: string
  venda_id?: string | null
  decant_id?: string | null
}

export function FinTransacoes() {
  const [transacoes, setTransacoes] = useState<Transacao[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const [editandoManual, setEditandoManual] = useState<Transacao | null>(null)
  const [excluindoTransacao, setExcluindoTransacao] = useState<Transacao | null>(null)
  const [visualizandoTransacao, setVisualizandoTransacao] = useState<Transacao | null>(null)
  const [editandoVendaId, setEditandoVendaId] = useState<string | null>(null)
  const [corrigindoDecant, setCorrigindoDecant] = useState<Transacao | null>(null)

  const [form, setForm] = useState({
    descricao: '',
    tipo: 'entrada',
    valor: '',
    categoria: '',
    forma_pagamento: '',
    responsavel: '',
  })

  async function fetchData() {
    setLoading(true)
    const { data } = await supabase.from('transacoes').select('*').order('created_at', { ascending: false })
    setTransacoes(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload = {
      descricao: form.descricao,
      tipo: form.tipo,
      valor: Number(form.valor),
      categoria: form.categoria || null,
      forma_pagamento: form.forma_pagamento || null,
      responsavel: form.responsavel || null,
    }

    if (editandoManual) {
      await supabase.from('transacoes').update(payload).eq('id', editandoManual.id).eq('origem', 'manual')
      setEditandoManual(null)
    } else {
      await supabase.from('transacoes').insert(payload)
      setModalOpen(false)
    }
    
    setForm({ descricao: '', tipo: 'entrada', valor: '', categoria: '', forma_pagamento: '', responsavel: '' })
    fetchData()
  }

  function handleEdit(t: Transacao) {
    setEditandoManual(t)
    setForm({
      descricao: t.descricao,
      tipo: t.tipo,
      valor: t.valor.toString(),
      categoria: t.categoria || '',
      forma_pagamento: t.forma_pagamento || '',
      responsavel: t.responsavel || '',
    })
  }

  async function handleDelete() {
    if (!excluindoTransacao) return
    if (excluindoTransacao.origem === 'venda' && excluindoTransacao.venda_id) {
      await supabase.rpc('cancelar_venda', { p_venda_id: excluindoTransacao.venda_id })
    } else if (excluindoTransacao.origem === 'decant' && excluindoTransacao.decant_id) {
      await supabase.rpc('cancelar_consumo_decant', { p_decant_id: excluindoTransacao.decant_id })
    } else {
      await supabase.from('transacoes').delete().eq('id', excluindoTransacao.id)
    }
    setExcluindoTransacao(null)
    fetchData()
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  const categoriaOpts = [
    { value: 'Vendas', label: 'Vendas' },
    { value: 'Fornecedores', label: 'Fornecedores' },
    { value: 'Marketing', label: 'Marketing' },
    { value: 'Operacional', label: 'Operacional' },
    { value: 'Outros', label: 'Outros' },
  ]

  const pagamentoOpts = [
    { value: 'Pix', label: 'Pix' },
    { value: 'Cartão', label: 'Cartão' },
    { value: 'Boleto', label: 'Boleto' },
    { value: 'Transferência', label: 'Transferência' },
    { value: 'Dinheiro', label: 'Dinheiro' },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold">Financeiro</p>
          <h1 className="text-3xl font-medium tracking-tight mt-1">Transações</h1>
          <p className="text-muted text-sm mt-1">Registro de entradas e saídas</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Icon name="plus" size={16} />
          Nova transação
        </Button>
      </div>

      <div className="border border-line rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line bg-surface">
              <th className="text-left px-4 py-3 text-text-2 font-medium">Data</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Descrição</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Tipo</th>
              <th className="text-right px-4 py-3 text-text-2 font-medium">Valor</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Categoria</th>
              <th className="text-left px-4 py-3 text-text-2 font-medium">Pagamento</th>
              <th className="text-right px-4 py-3 text-text-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">Carregando...</td></tr>
            ) : transacoes.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">Nenhuma transação registrada</td></tr>
            ) : (
              transacoes.map((t) => (
                <tr key={t.id} onClick={() => setVisualizandoTransacao(t)} className="border-b border-line last:border-0 hover:bg-surface-2/50 cursor-pointer">
                  <td className="px-4 py-3 text-text-2 text-xs">{formatDate(t.created_at)}</td>
                  <td className="px-4 py-3 font-medium">
                    {t.descricao}
                    {t.origem === 'venda' && (
                      <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[0.6rem] font-medium bg-gold-dim text-gold align-middle">
                        venda
                      </span>
                    )}
                    {t.origem === 'decant' && (
                      <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[0.6rem] font-medium bg-surface-2 text-text-2 border border-line align-middle">
                        decant
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${t.tipo === 'entrada' ? 'bg-up/15 text-up' : 'bg-down/15 text-down'}`}>
                      {t.tipo === 'entrada' ? '↑ Entrada' : '↓ Saída'}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-right font-mono ${t.tipo === 'entrada' ? 'text-up' : 'text-down'}`}>
                    {t.tipo === 'saida' ? '- ' : ''}{formatBRL(t.valor)}
                  </td>
                  <td className="px-4 py-3 text-text-2">{t.categoria || '—'}</td>
                  <td className="px-4 py-3 text-text-2">{t.forma_pagamento || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {(!t.origem || t.origem === 'manual') && (
                        <Button size="sm" variant="ghost" aria-label={`Editar transação ${t.descricao}`} title="Editar transação" onClick={(e) => { e.stopPropagation(); handleEdit(t); }}>
                          <Icon name="edit" size={14} />
                        </Button>
                      )}
                      {t.origem === 'venda' && (
                        <Button size="sm" variant="ghost" aria-label={`Corrigir ${t.descricao.match(/Venda #\d+/)?.[0] || 'venda'}`} title="Corrigir venda" onClick={(e) => { e.stopPropagation(); setEditandoVendaId(t.venda_id || ''); }}>
                          <Icon name="edit" size={14} />
                        </Button>
                      )}
                      {t.origem === 'decant' && (
                        <Button size="sm" variant="ghost" aria-label={`Corrigir consumo ${t.descricao}`} title="Corrigir consumo" onClick={(e) => { e.stopPropagation(); setCorrigindoDecant(t); }}>
                          <Icon name="edit" size={14} />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" aria-label={`Excluir transação ${t.descricao}`} title="Excluir transação" onClick={(e) => { e.stopPropagation(); setExcluindoTransacao(t); }}>
                        <Icon name="trash" size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      <Modal open={modalOpen || !!editandoManual} onClose={() => { setModalOpen(false); setEditandoManual(null) }} title={editandoManual ? "Editar transação" : "Nova transação"}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label="Descrição" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} required placeholder="Descrição da transação" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label="Tipo" options={[{ value: 'entrada', label: 'Entrada' }, { value: 'saida', label: 'Saída' }]} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} required />
            <Input label="Valor (R$)" type="number" step="0.01" min="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label="Categoria" options={categoriaOpts} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
            <Select label="Forma de pagamento" options={pagamentoOpts} value={form.forma_pagamento} onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value })} />
          </div>
          <Input label="Responsável" value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} />
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end mt-2">
            <Button type="button" variant="secondary" onClick={() => { setModalOpen(false); setEditandoManual(null) }}>Cancelar</Button>
            <Button type="submit">Salvar</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!excluindoTransacao} onClose={() => setExcluindoTransacao(null)} title="Excluir transação">
        <div className="flex flex-col gap-4">
          <p className="text-text-2">
            Tem certeza que deseja excluir a transação <strong>{excluindoTransacao?.descricao}</strong>?
            <br /><br />
            {excluindoTransacao?.origem === 'venda' && (
              <span className="text-down text-sm">
                <strong>Atenção:</strong> Isso estornará toda a Venda vinculada, devolvendo os produtos ao estoque e removendo todas as outras transações financeiras geradas por ela.
              </span>
            )}
            {excluindoTransacao?.origem === 'decant' && (
              <span className="text-down text-sm">
                <strong>Atenção:</strong> Isso devolverá o líquido do consumo ao frasco original.
              </span>
            )}
            {(!excluindoTransacao?.origem || excluindoTransacao.origem === 'manual') && (
              <span>Esta ação não pode ser desfeita.</span>
            )}
          </p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end mt-2">
            <Button type="button" variant="secondary" onClick={() => setExcluindoTransacao(null)}>Cancelar</Button>
            <Button type="button" onClick={handleDelete} className="bg-down text-surface border-transparent hover:bg-down/90">
              Excluir
            </Button>
          </div>
        </div>
      </Modal>

      <EditarVendaModal
        open={!!editandoVendaId}
        vendaId={editandoVendaId ?? ''}
        onClose={() => setEditandoVendaId(null)}
        onSaved={() => { setEditandoVendaId(null); fetchData() }}
      />

      <CorrigirConsumoDecantModal
        open={!!corrigindoDecant}
        transacao={corrigindoDecant as any}
        onClose={() => setCorrigindoDecant(null)}
        onSaved={() => { setCorrigindoDecant(null); fetchData() }}
      />

      <Modal open={!!visualizandoTransacao} onClose={() => setVisualizandoTransacao(null)} title="Detalhes da Transação">
        {visualizandoTransacao && (
          <div className="flex flex-col gap-5 text-sm">
            <div className="flex flex-col gap-1 border-b border-line pb-4">
              <span className="text-[0.65rem] text-muted uppercase tracking-wider font-semibold">Descrição</span>
              <span className="font-medium text-lg text-text">{visualizandoTransacao.descricao}</span>
            </div>
            
            <div className="grid grid-cols-2 gap-y-5 gap-x-4">
              <div className="flex flex-col gap-1">
                <span className="text-[0.65rem] text-muted uppercase tracking-wider font-semibold">Valor</span>
                <span className={`font-mono text-base font-medium ${visualizandoTransacao.tipo === 'entrada' ? 'text-up' : 'text-down'}`}>
                  {visualizandoTransacao.tipo === 'saida' ? '- ' : ''}{formatBRL(visualizandoTransacao.valor)}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[0.65rem] text-muted uppercase tracking-wider font-semibold">Data</span>
                <span className="text-text-2">{formatDate(visualizandoTransacao.created_at)}</span>
              </div>
              
              <div className="flex flex-col gap-1">
                <span className="text-[0.65rem] text-muted uppercase tracking-wider font-semibold">Categoria</span>
                <span className="text-text-2">{visualizandoTransacao.categoria || '—'}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[0.65rem] text-muted uppercase tracking-wider font-semibold">Pagamento</span>
                <span className="text-text-2">{visualizandoTransacao.forma_pagamento || '—'}</span>
              </div>
              
              <div className="flex flex-col gap-1">
                <span className="text-[0.65rem] text-muted uppercase tracking-wider font-semibold">Origem</span>
                <span className="capitalize text-text-2">{visualizandoTransacao.origem || 'manual'}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[0.65rem] text-muted uppercase tracking-wider font-semibold">Responsável</span>
                <span className="text-text-2">{visualizandoTransacao.responsavel || '—'}</span>
              </div>
            </div>
            
            <div className="flex justify-end mt-2 pt-4 border-t border-line">
              <Button type="button" onClick={() => setVisualizandoTransacao(null)}>Fechar</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
