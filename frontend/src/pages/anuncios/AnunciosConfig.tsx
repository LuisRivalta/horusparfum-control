import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button, Input, Select } from '@/components/shared/FormControls'
import { conexaoML, conectarML, desconectarML, type ConexaoML } from '@/lib/apiAnuncios'
import { apiShopify, type ConexaoShopify, type ResultadoSync } from '@/lib/apiShopify'
import { cn } from '@/lib/utils'

interface Canal { id: string; nome: string; ativo: boolean }
interface Config {
  margem_padrao: number; tipo_padrao: string; modelo_descricao: string | null
  ia_ativa: boolean; tamanhos_decant: number[] | null; canal_id: string | null
}

const TAMANHOS = [2.5, 5, 10]
const PLACEHOLDERS = '{marca} {nome} {tipo} {volume} {genero} {notas} {familias}'
const fmtMl = (n: number) => String(n).replace('.', ',')
const card = 'gold-hairline bg-surface border border-line rounded-xl p-5 flex flex-col gap-4'
const rotulo = 'text-xs font-medium uppercase tracking-[.08em] text-muted'

export function AnunciosConfig() {
  const [params] = useSearchParams()
  const ml = params.get('ml')
  const [conexao, setConexao] = useState<ConexaoML | null>(null)
  const [canais, setCanais] = useState<Canal[]>([])
  const [margem, setMargem] = useState('')
  const [tipo, setTipo] = useState('gold_special')
  const [canalId, setCanalId] = useState('')
  const [tamanhos, setTamanhos] = useState<number[]>([])
  const [iaAtiva, setIaAtiva] = useState(false)
  const [modelo, setModelo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [carregado, setCarregado] = useState(false)

  const [shopify, setShopify] = useState<ConexaoShopify | null>(null)
  const [sync, setSync] = useState<ResultadoSync | null>(null)
  const [ocupadoShopify, setOcupadoShopify] = useState(false)

  const carregarConexao = () =>
    conexaoML().then(setConexao).catch((e: Error) => setErro(e.message))

  async function acaoShopify(f: () => Promise<unknown>) {
    setOcupadoShopify(true); setErro(null)
    try { await f() } catch (e) { setErro((e as Error).message) } finally { setOcupadoShopify(false) }
  }
  const conectarShopify = () => acaoShopify(async () => setShopify(await apiShopify.conectar()))
  const sincronizarShopify = () => acaoShopify(async () => setSync(await apiShopify.sincronizarTudo()))

  useEffect(() => {
    carregarConexao()
    apiShopify.conexao().then(setShopify).catch((e: Error) => setErro(e.message))
    supabase.from('canais').select('*').order('nome').then(({ data }) => setCanais((data as Canal[]) || []))
    supabase.from('anuncios_config').select('*').eq('id', 1).single().then(({ data, error }) => {
      const c = data as Config | null
      if (!c) { setErro(error?.message ?? 'Configuração dos anúncios não encontrada'); return }
      setCarregado(true)
      setMargem(String(Math.round(Number(c.margem_padrao) * 10000) / 100))
      setTipo(c.tipo_padrao)
      setCanalId(c.canal_id ?? '')
      setTamanhos((c.tamanhos_decant ?? []).map(Number))
      setIaAtiva(c.ia_ativa)
      setModelo(c.modelo_descricao ?? '')
    })
  }, [])

  async function conectar() {
    try { window.location.href = (await conectarML()).url } catch (e) { setErro((e as Error).message) }
  }

  async function desconectar() {
    try { await desconectarML(); await carregarConexao() } catch (e) { setErro((e as Error).message) }
  }

  async function salvar() {
    const pct = Number(margem.replace(',', '.'))
    if (margem.trim() === '' || !Number.isFinite(pct) || pct < 0 || pct > 9999.99) { setErro('Margem deve ficar entre 0 e 9999%'); return }
    const { data, error } = await supabase.from('anuncios_config').update({
      margem_padrao: Math.round(pct * 100) / 10000,
      tipo_padrao: tipo,
      canal_id: canalId || null,
      tamanhos_decant: [...tamanhos].sort((a, b) => a - b),
      ia_ativa: iaAtiva,
      modelo_descricao: modelo,
    }).eq('id', 1).select()
    const ok = !error && !!data?.length
    setErro(error ? error.message : ok ? null : 'Nada foi salvo: configuração não encontrada')
    setSalvo(ok)
  }

  const alternar = (t: number) =>
    setTamanhos((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))

  return (
    <div className="flex flex-col gap-6 max-w-[720px]">
      <div>
        <p className="font-mono text-[0.66rem] uppercase tracking-[.28em] text-gold">Anúncios / Configuração</p>
        <h1 className="text-4xl font-medium tracking-tight">Configuração</h1>
      </div>

      {ml === 'ok' && <div className="px-3 py-2.5 rounded-lg bg-up/10 border border-up/30 text-up text-sm">Conta do Mercado Livre conectada.</div>}
      {ml === 'erro' && <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">Não foi possível conectar a conta do Mercado Livre. Tente de novo.</div>}
      {erro && <div className="px-3 py-2.5 rounded-lg bg-down/10 border border-down/30 text-down text-sm">{erro}</div>}

      <section className={card}>
        <h2 className="text-sm font-medium uppercase tracking-[.08em] text-muted">Conta do Mercado Livre</h2>
        <div className="flex items-center gap-3">
          <span className="flex-1 text-sm">
            {conexao?.conectado ? `Conectado como ${conexao.nickname ?? ''}` : conexao ? 'Não conectado' : 'Verificando...'}
          </span>
          {conexao?.conectado
            ? <Button variant="ghost" size="sm" onClick={desconectar}>Desconectar</Button>
            : <Button size="sm" onClick={conectar}>Conectar</Button>}
        </div>
      </section>

      <section className={card}>
        <h2 className="text-sm font-medium uppercase tracking-[.08em] text-muted">Loja Shopify</h2>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex-1 text-sm">
            {shopify?.conectado ? `Loja conectada${shopify.loja ? `: ${shopify.loja}` : ''}` : shopify ? 'Não conectada' : 'Verificando...'}
          </span>
          <Button variant={shopify?.conectado ? 'ghost' : 'primary'} size="sm" disabled={ocupadoShopify} onClick={conectarShopify}>
            {shopify?.conectado ? 'Reconectar' : 'Conectar'}
          </Button>
          {shopify?.conectado && (
            <>
              <Link to="/anuncios/shopify/ligar"><Button variant="secondary" size="sm">Ligar produtos</Button></Link>
              <Button size="sm" disabled={ocupadoShopify} onClick={sincronizarShopify}>Sincronizar tudo</Button>
            </>
          )}
        </div>
        {sync && (
          <div role="status" className="text-sm">
            <p>{sync.enviados} {sync.enviados === 1 ? 'estoque enviado' : 'estoques enviados'}.</p>
            {sync.erros.map((m) => <p key={m} className="text-down">{m}</p>)}
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="text-sm font-medium uppercase tracking-[.08em] text-muted">Padrões dos anúncios</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input label="Margem padrão (%)" type="number" step="0.01" min="0" value={margem}
            onChange={(e) => { setMargem(e.target.value); setSalvo(false) }} />
          <Select label="Tipo padrão" placeholder={false} value={tipo} onChange={(e) => { setTipo(e.target.value); setSalvo(false) }}
            options={[{ value: 'gold_special', label: 'Clássico' }, { value: 'gold_pro', label: 'Premium' }]} />
          <Select label="Canal" value={canalId} onChange={(e) => { setCanalId(e.target.value); setSalvo(false) }}
            options={canais.filter((c) => c.ativo).map((c) => ({ value: c.id, label: c.nome }))} />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={rotulo}>Tamanhos de decant ativos</span>
          <div className="flex gap-2">
            {TAMANHOS.map((t) => (
              <button key={t} type="button" aria-pressed={tamanhos.includes(t)}
                onClick={() => { alternar(t); setSalvo(false) }}
                className={cn('px-3.5 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors',
                  tamanhos.includes(t) ? 'bg-gold-dim border-gold-line text-gold' : 'border-line text-muted hover:text-text')}>
                {fmtMl(t)} ml
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={iaAtiva} onChange={(e) => { setIaAtiva(e.target.checked); setSalvo(false) }} />
          Usar IA para sugerir ficha e textos
        </label>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="modelo-descricao" className={rotulo}>Modelo de descrição</label>
          <textarea id="modelo-descricao" rows={8} value={modelo}
            onChange={(e) => { setModelo(e.target.value); setSalvo(false) }}
            className="w-full px-3.5 py-2.5 rounded-lg border border-line bg-surface-2 text-text text-sm focus:outline-none focus:border-gold/60" />
          <p className="text-xs text-faint font-mono">Campos: {PLACEHOLDERS}</p>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={salvar} disabled={!carregado}>Salvar</Button>
          {salvo && <span className="text-sm text-up">Salvo</span>}
        </div>
      </section>
    </div>
  )
}
