// frontend/src/pages/estoque/Insumos.tsx
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { Icon } from '@/components/shared/Icon'
import { Modal } from '@/components/shared/Modal'
import { Button, Input } from '@/components/shared/FormControls'
import { abaixoDoMinimo } from '@/lib/insumos'
import { CompraInsumoModal, formatCusto, type Insumo } from './insumos/CompraInsumoModal'
import { ListasInsumos } from './insumos/ListasInsumos'

type Dialogo =
  | { tipo: 'compra'; insumo: Insumo }
  | { tipo: 'acerto'; insumo: Insumo }
  | { tipo: 'editar'; insumo: Insumo | null }

export function EstInsumos() {
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [emUso, setEmUso] = useState<Set<string>>(new Set())
  const [erro, setErro] = useState<string | null>(null)
  const [dialogo, setDialogo] = useState<Dialogo | null>(null)

  async function carregar() {
    const [ins, mov, itens] = await Promise.all([
      supabase.from('insumos').select('*').order('nome'),
      supabase.from('insumo_movimentacoes').select('insumo_id'),
      supabase.from('insumo_lista_itens').select('insumo_id'),
    ])
    if (ins.error) { setErro(ins.error.message); return }
    setInsumos((ins.data as Insumo[]) ?? [])
    const usados = [...(mov.data ?? []), ...(itens.data ?? [])] as { insumo_id: string }[]
    setEmUso(new Set(usados.map((u) => u.insumo_id)))
  }
  useEffect(() => { carregar() }, [])

  const fechar = () => setDialogo(null)
  const salvou = () => { fechar(); carregar() }

  // exclui só se nunca foi usado; senão inativa (histórico e listas preservados)
  async function removerOuInativar(i: Insumo) {
    const { error } = emUso.has(i.id)
      ? await supabase.from('insumos').update({ ativo: !i.ativo }).eq('id', i.id)
      : await supabase.from('insumos').delete().eq('id', i.id)
    if (error) { setErro(error.message); return }
    carregar()
  }

  return (
    <>
      <div className="flex flex-col gap-6 stagger">
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold flex items-center gap-2">
              <span className="w-1 h-1 bg-gold rotate-45" />
              Estoque / Insumos
            </p>
            <h1 className="text-4xl tracking-tight mt-1.5">Insumos</h1>
          </div>
          <Button onClick={() => setDialogo({ tipo: 'editar', insumo: null })}>
            <Icon name="plus" size={16} />
            Novo insumo
          </Button>
        </div>

        {erro && <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>}

        <div className="gold-hairline bg-surface border border-line rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-mono uppercase tracking-[.14em] text-muted">
                <th className="p-3">Insumo</th><th className="p-3">Un.</th><th className="p-3">Estoque</th>
                <th className="p-3">Mínimo</th><th className="p-3">Custo médio</th><th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {insumos.length === 0 && (
                <tr className="border-t border-line">
                  <td colSpan={6} className="p-8 text-center text-sm text-muted">
                    Nenhum insumo cadastrado. Clique em <span className="text-gold">Novo insumo</span> para começar.
                    <br />Cada insumo aparece aqui com os botões Comprar, Acertar estoque, Editar e Excluir.
                  </td>
                </tr>
              )}
              {insumos.map((i) => {
                const acao = emUso.has(i.id) ? (i.ativo ? 'Inativar' : 'Reativar') : 'Excluir'
                return (
                  <tr key={i.id} className={cn('border-t border-line', !i.ativo && 'opacity-50')}>
                    <td className="p-3 font-medium">{i.nome}{!i.ativo && <span className="ml-2 text-xs text-muted">Inativo</span>}</td>
                    <td className="p-3 text-muted">{i.unidade}</td>
                    <td
                      data-testid={`estoque-${i.id}`}
                      className={cn('p-3 font-mono tabular-nums', (abaixoDoMinimo(i.estoque_atual, i.estoque_minimo) || i.estoque_atual < 0) && 'text-down')}
                    >
                      {i.estoque_atual}
                    </td>
                    <td className="p-3 font-mono tabular-nums text-muted">{i.estoque_minimo}</td>
                    <td className="p-3 font-mono tabular-nums">{formatCusto(i.custo_medio)}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1.5">
                        {i.ativo && (
                          <>
                            <Button size="sm" aria-label={`Comprar ${i.nome}`} onClick={() => setDialogo({ tipo: 'compra', insumo: i })}>Comprar</Button>
                            <Button size="sm" variant="secondary" aria-label={`Acertar estoque ${i.nome}`} onClick={() => setDialogo({ tipo: 'acerto', insumo: i })}>Acertar estoque</Button>
                          </>
                        )}
                        <Button size="sm" variant="secondary" aria-label={`Editar ${i.nome}`} onClick={() => setDialogo({ tipo: 'editar', insumo: i })}>
                          <Icon name="edit" size={14} /> Editar
                        </Button>
                        <Button
                          size="sm" variant="danger" aria-label={`${acao} ${i.nome}`}
                          title={acao === 'Excluir' ? undefined : 'Já foi usado: inativar guarda o histórico'}
                          onClick={() => removerOuInativar(i)}
                        >
                          {acao === 'Excluir' && <Icon name="trash" size={14} />} {acao}
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <ListasInsumos insumos={insumos} onChange={carregar} />
      </div>

      {dialogo?.tipo === 'compra' && <CompraInsumoModal insumo={dialogo.insumo} onClose={fechar} onSaved={salvou} />}
      {dialogo?.tipo === 'acerto' && <AcertoModal insumo={dialogo.insumo} onClose={fechar} onSaved={salvou} />}
      {dialogo?.tipo === 'editar' && <EditarModal insumo={dialogo.insumo} onClose={fechar} onSaved={salvou} />}
    </>
  )
}

function AcertoModal({ insumo, onClose, onSaved }: { insumo: Insumo; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth()
  const [contado, setContado] = useState(String(insumo.estoque_atual))
  const [erro, setErro] = useState<string | null>(null)

  async function confirmar() {
    const { error } = await supabase.rpc('acertar_estoque_insumo', {
      p_insumo_id: insumo.id, p_saldo_contado: Number(contado), p_responsavel: user?.email ?? null,
    })
    if (error) { setErro(error.message); return }
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={`Acertar estoque — ${insumo.nome}`} size="sm">
      <div className="flex flex-col gap-4 p-5">
        {erro && <div className="px-3 py-2 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>}
        <Input label="Saldo contado" type="number" step="any" value={contado} onChange={(e) => setContado(e.target.value)} />
        <Button onClick={confirmar} disabled={contado === ''}>Confirmar acerto</Button>
      </div>
    </Modal>
  )
}

function EditarModal({ insumo, onClose, onSaved }: { insumo: Insumo | null; onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState(insumo?.nome ?? '')
  const [unidade, setUnidade] = useState(insumo?.unidade ?? 'un')
  const [minimo, setMinimo] = useState(String(insumo?.estoque_minimo ?? 0))
  const [erro, setErro] = useState<string | null>(null)

  async function salvar() {
    const dados = { nome: nome.trim(), unidade: unidade.trim() || 'un', estoque_minimo: Number(minimo) || 0 }
    const { error } = insumo
      ? await supabase.from('insumos').update(dados).eq('id', insumo.id)
      : await supabase.from('insumos').insert(dados)
    if (error) { setErro(error.message); return }
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={insumo ? `Editar — ${insumo.nome}` : 'Novo insumo'} size="sm">
      <div className="flex flex-col gap-4 p-5">
        {erro && <div className="px-3 py-2 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>}
        <Input label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        <Input label="Unidade" value={unidade} onChange={(e) => setUnidade(e.target.value)} />
        <Input label="Estoque mínimo" type="number" min="0" step="any" value={minimo} onChange={(e) => setMinimo(e.target.value)} />
        <Button onClick={salvar} disabled={!nome.trim()}>Salvar</Button>
      </div>
    </Modal>
  )
}
