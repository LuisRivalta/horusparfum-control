import { escolher } from '@/test/escolher'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NovoAnuncio } from '../NovoAnuncio'

type Row = Record<string, unknown>

const { db, api } = vi.hoisted(() => ({
  db: {} as Record<string, Row[]>,
  api: {
    atributosCategoria: vi.fn(),
    calcularPrecos: vi.fn(),
    sugerirFicha: vi.fn(),
    gerarTextos: vi.fn(),
    publicar: vi.fn(),
    qualidade: vi.fn(),
  },
}))

vi.mock('@/lib/apiAnuncios', () => api)

// fotos: um botão que "sobe" uma foto (a galeria real tem teste próprio)
vi.mock('../FotosPerfume', () => ({
  FotosPerfume: ({ onChange }: { onChange: (f: unknown[]) => void }) => (
    <button type="button" onClick={() => onChange([{ id: 'f1', url: 'https://x/1.jpg', uso: 'frasco', ordem: 0 }])}>
      subir foto teste
    </button>
  ),
}))

let seq = 0
let falharUpdate: string | null = null // tabela cujo update devolve erro
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabela: string) => {
      const filtros: ((r: Row) => boolean)[] = []
      let insert: Row | null = null
      let update: Row | null = null
      const linhas = () => (db[tabela] ?? []).filter((r) => filtros.every((f) => f(r)))
      const executar = () => {
        if (insert) {
          const nova = { ...insert, id: `a${++seq}` }
          ;(db[tabela] ??= []).push(nova)
          return [nova]
        }
        if (update) { const ls = linhas(); ls.forEach((r) => Object.assign(r, update)); return ls }
        return linhas()
      }
      const q: Record<string, unknown> = {
        select: () => q,
        order: () => q,
        eq: (c: string, v: unknown) => { filtros.push((r) => r[c] === v); return q },
        in: (c: string, vs: unknown[]) => { filtros.push((r) => vs.includes(r[c])); return q },
        insert: (v: Row) => { insert = v; return q },
        update: (v: Row) => { update = v; return q },
        single: () => Promise.resolve({ data: executar()[0] ?? null, error: null }),
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
          Promise.resolve(update && falharUpdate === tabela
            ? { data: null, error: { message: 'falhou' } }
            : { data: executar(), error: null }).then(ok, ko),
      }
      return q
    },
  },
}))

beforeEach(() => {
  seq = 0
  falharUpdate = null
  Object.keys(db).forEach((k) => delete db[k])
  Object.assign(db, {
    anuncios_config: [{ id: 1, margem_padrao: 0.6, tipo_padrao: 'gold_special', modelo_descricao: '', ia_ativa: false, tamanhos_decant: [2.5, 5, 10], canal_id: 'c1' }],
    marcas: [{ id: 'm1', nome: 'Lattafa' }],
    produtos: [
      { id: 'p1', nome: 'Afeef', marca_id: 'm1', volume_ml: 100, estoque_atual: 2, custo_medio: 180, gtin: null, ficha: {} },
      { id: 'p2', nome: 'Sem Volume', marca_id: 'm1', volume_ml: null, estoque_atual: 1, custo_medio: 90, gtin: null, ficha: {} },
    ],
    frascos_abertos: [{ produto_id: 'p1', ml_restante: 30, status: 'ativo' }],
    insumos: [],
    insumo_listas: [
      { tipo: 'envio_frasco', tamanho_ml: null, peso_g: 300, altura_cm: 10, largura_cm: 10, comprimento_cm: 15, insumo_lista_itens: [] },
      { tipo: 'envio_decant', tamanho_ml: null, peso_g: 100, altura_cm: 5, largura_cm: 5, comprimento_cm: 10, insumo_lista_itens: [] },
    ],
    anuncios: [],
  })
  Object.values(api).forEach((f) => f.mockReset())
  api.atributosCategoria.mockResolvedValue([
    { id: 'BRAND', name: 'Marca', value_type: 'string' },
    { id: 'GENDER', name: 'Gênero', value_type: 'list', values: [{ id: 'g1', name: 'Masculino' }, { id: 'g2', name: 'Feminino' }] },
  ])
  api.calcularPrecos.mockImplementation((body: { itens: { chave: string }[] }) => Promise.resolve({
    itens: body.itens.map((i) => ({
      chave: i.chave,
      gold_special: { preco: 99.9, comissao: 10, taxa_fixa: 6, frete: 0, lucro: 30 },
      gold_pro: { preco: 109.9, comissao: 15, taxa_fixa: 6, frete: 0, lucro: 31 },
    })),
  }))
  api.qualidade.mockResolvedValue({ score: 80, nivel: 'Profissional', pendencias: [] })
})

const abrir = () => render(
  <MemoryRouter initialEntries={['/anuncios/novo']}>
    <Routes><Route path="/anuncios/novo" element={<NovoAnuncio />} /></Routes>
  </MemoryRouter>,
)

async function escolherPerfume(id = 'p1') {
  abrir()
  await waitFor(() => expect(api.atributosCategoria).toHaveBeenCalled())
  await waitFor(() => escolher(screen.getByLabelText('Perfume'), id))
  return screen.findByRole('checkbox', { name: /Frasco/ })
}

const botaoPublicar = () => screen.getByRole('button', { name: /Publicar \d+ anúncios?/ })

describe('NovoAnuncio', () => {
  it('escolher o perfume preenche custo e mostra os 4 anúncios marcados', async () => {
    await escolherPerfume()
    expect(within(screen.getByRole('region', { name: 'Perfume selecionado' })).getByText('R$ 180,00')).toBeInTheDocument()
    for (const nome of [/Frasco/, /Decant 2,5 ml/, /Decant 5 ml/, /Decant 10 ml/]) {
      expect(screen.getByRole('checkbox', { name: nome })).toBeChecked()
    }
  })

  it('perfume sem volume deixa os decants desmarcados com o motivo', async () => {
    await escolherPerfume('p2')
    expect(screen.getByRole('checkbox', { name: /Frasco/ })).toBeChecked()
    const decant = screen.getByRole('checkbox', { name: /Decant 5 ml/ })
    expect(decant).not.toBeChecked()
    expect(decant).toBeDisabled()
    expect(screen.getAllByText('Perfume sem volume (ml)')).toHaveLength(3)
  })

  it('a seção de preço mostra Clássico e Premium com os valores calculados', async () => {
    await escolherPerfume()
    await waitFor(() => expect(screen.getAllByText('R$ 99,90')).toHaveLength(4))
    expect(screen.getAllByText('R$ 109,90')).toHaveLength(4)
    expect(screen.getAllByRole('button', { name: /Clássico/ })[0]).toHaveAttribute('aria-pressed', 'true')
    const corpo = api.calcularPrecos.mock.calls[0][0]
    expect(corpo.itens[0]).toMatchObject({ chave: 'frasco', custo: 180, margem: 0.6, tipo: 'frasco' })
    expect(corpo.pacotes.frasco).toEqual({ peso_g: 300, altura_cm: 10, largura_cm: 10, comprimento_cm: 15 })
  })

  it('Publicar fica desabilitado sem fotos e habilita com foto, título e descrição', async () => {
    await escolherPerfume()
    await waitFor(() => expect(screen.getAllByText('R$ 99,90')).toHaveLength(4))
    expect(botaoPublicar()).toHaveTextContent('Publicar 4 anúncios')
    expect(botaoPublicar()).toBeDisabled()
    expect(screen.getAllByText('Sem fotos').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'subir foto teste' }))
    await waitFor(() => expect(botaoPublicar()).toBeEnabled())
  })

  it('publicar salva os 4, chama publicar com os ids e mostra o erro do que falhou', async () => {
    api.publicar.mockImplementation((ids: string[]) => Promise.resolve({
      resultados: ids.map((id, i) => (i === 1
        ? { id, status: 'erro', erro: 'Título recusado pelo ML' }
        : { id, status: 'publicado', ml_item_id: `MLB${i}` })),
    }))
    await escolherPerfume()
    await waitFor(() => expect(screen.getAllByText('R$ 99,90')).toHaveLength(4))
    fireEvent.click(screen.getByRole('button', { name: 'subir foto teste' }))
    await waitFor(() => expect(botaoPublicar()).toBeEnabled())
    fireEvent.click(botaoPublicar())
    await waitFor(() => expect(api.publicar).toHaveBeenCalledWith(['a1', 'a2', 'a3', 'a4']))
    expect(db.anuncios).toHaveLength(4)
    expect(db.anuncios[0]).toMatchObject({ produto_id: 'p1', tipo: 'frasco', ml: null, status: 'rascunho', preco: 99.9, listing_type: 'gold_special', fotos: ['https://x/1.jpg'] })
    const lateral = screen.getByRole('complementary')
    expect(await within(lateral).findByText('Título recusado pelo ML')).toBeInTheDocument()
    expect(within(lateral).getAllByText('erro').length).toBeGreaterThan(0)
    await waitFor(() => expect(api.qualidade).toHaveBeenCalledTimes(3))
  })

  it('mudar a margem desabilita Publicar até chegar o preço novo', async () => {
    await escolherPerfume()
    fireEvent.click(screen.getByRole('button', { name: 'subir foto teste' }))
    await waitFor(() => expect(botaoPublicar()).toBeEnabled())
    let liberar!: () => void
    api.calcularPrecos.mockImplementationOnce((body: { itens: { chave: string }[] }) => new Promise((ok) => {
      liberar = () => ok({ itens: body.itens.map((i) => ({
        chave: i.chave,
        gold_special: { preco: 120.9, comissao: 10, taxa_fixa: 6, frete: 0, lucro: 40 },
        gold_pro: { preco: 130.9, comissao: 15, taxa_fixa: 6, frete: 0, lucro: 41 },
      })) })
    }))
    const margem = screen.getByLabelText('Margem Frasco')
    fireEvent.change(margem, { target: { value: '80' } })
    fireEvent.blur(margem)
    await waitFor(() => expect(botaoPublicar()).toBeDisabled())
    expect(screen.getByRole('button', { name: /Salvar rascunho/ })).toBeDisabled()
    expect(screen.getByText('Calculando preço…')).toBeInTheDocument()
    expect(screen.queryAllByText('R$ 99,90')).toHaveLength(3) // só os decants: o preço velho do frasco some
    liberar()
    await waitFor(() => expect(botaoPublicar()).toBeEnabled())
    expect(screen.getAllByText('R$ 120,90')).toHaveLength(4)
  })

  it('falha no cálculo do preço deixa Publicar desabilitado', async () => {
    api.calcularPrecos.mockRejectedValue(new Error('ML fora do ar'))
    await escolherPerfume()
    fireEvent.click(screen.getByRole('button', { name: 'subir foto teste' }))
    expect(await screen.findByText('Erro no preço: ML fora do ar')).toBeInTheDocument()
    expect(botaoPublicar()).toBeDisabled()
    expect(screen.getByRole('button', { name: /Salvar rascunho/ })).toBeDisabled()
  })

  it('descrição com emoji e < é salva limpa', async () => {
    await escolherPerfume()
    await waitFor(() => expect(screen.getByRole('button', { name: /Salvar rascunho/ })).toBeEnabled())
    fireEvent.change(screen.getByLabelText('Descrição Frasco'), { target: { value: 'Ótimo 🌸 <b>forte</b>' } })
    fireEvent.click(screen.getByRole('button', { name: /Salvar rascunho/ }))
    await waitFor(() => expect(db.anuncios).toHaveLength(4))
    const desc = db.anuncios[0].descricao as string
    expect(desc).toContain('Ótimo')
    expect(desc).not.toMatch(/[<>]|🌸/)
  })

  it('duas edições rápidas da ficha ficam salvas', async () => {
    api.atributosCategoria.mockResolvedValue([
      { id: 'LINE', name: 'Linha', value_type: 'string' },
      { id: 'GENDER', name: 'Gênero', value_type: 'list', values: [{ id: 'g1', name: 'Masculino' }, { id: 'g2', name: 'Feminino' }] },
    ])
    await escolherPerfume()
    const linha = await screen.findByLabelText('Linha')
    fireEvent.change(linha, { target: { value: 'Oud' } })
    fireEvent.blur(linha)
    escolher(screen.getByLabelText('Gênero'), 'g1')
    await waitFor(() => expect(db.produtos[0].ficha).toEqual({
      LINE: { value_id: null, value_name: 'Oud' },
      GENDER: { value_id: 'g1', value_name: 'Masculino' },
    }))
  })

  it('falha ao salvar a ficha deixa Publicar desabilitado com o motivo', async () => {
    await escolherPerfume()
    fireEvent.click(screen.getByRole('button', { name: 'subir foto teste' }))
    await waitFor(() => expect(botaoPublicar()).toBeEnabled())
    falharUpdate = 'produtos'
    escolher(screen.getByLabelText('Gênero'), 'g1')
    const lateral = screen.getByRole('complementary')
    expect(await within(lateral).findByText('Não foi possível salvar a ficha.')).toBeInTheDocument()
    expect(botaoPublicar()).toBeDisabled()
    falharUpdate = null // nova edição que grava limpa o erro
    escolher(screen.getByLabelText('Gênero'), 'g2')
    await waitFor(() => expect(botaoPublicar()).toBeEnabled())
  })

  it('salvar de novo um rascunho existente atualiza a mesma linha', async () => {
    db.anuncios.push({ id: 'x1', produto_id: 'p1', tipo: 'frasco', ml: null, listing_type: 'gold_pro', margem: 0.6, titulo: 'Título salvo', descricao: 'Desc salva', status: 'rascunho', permalink: null, erro: null })
    await escolherPerfume()
    expect(await screen.findByDisplayValue('Título salvo')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: /Salvar rascunho/ })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /Salvar rascunho/ }))
    expect(await screen.findByText('Rascunho salvo.')).toBeInTheDocument()
    expect(db.anuncios.filter((a) => a.tipo === 'frasco')).toHaveLength(1)
    expect(db.anuncios[0]).toMatchObject({ id: 'x1', titulo: 'Título salvo', listing_type: 'gold_pro', preco: 109.9, status: 'rascunho' })
    expect(db.anuncios).toHaveLength(4) // x1 + 3 decants novos
  })
})
