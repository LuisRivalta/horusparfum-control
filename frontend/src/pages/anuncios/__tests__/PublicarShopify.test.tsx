import { escolher } from '@/test/escolher'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { precoShopify } from '@/lib/canais'
import { PublicarShopify } from '../PublicarShopify'

const { api } = vi.hoisted(() => ({ api: { apiShopify: { publicar: vi.fn() } } }))

vi.mock('@/lib/apiShopify', () => api)
vi.mock('../FotosPerfume', () => ({
  FotosPerfume: ({ onChange }: { onChange: (f: unknown[]) => void }) => (
    <button onClick={() => onChange([{ id: 'f1', url: 'http://x/1.jpg', uso: 'frasco', ordem: 0 }])}>fotos</button>
  ),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (t: string) => ({ select: () => t === 'canais'
    ? { eq: () => ({ maybeSingle: () => Promise.resolve({ data: { taxa_padrao: 10 } }) }) }
    : Promise.resolve({ data: [{ id: 't1', nome: 'Perfume', vende_decant: true }, { id: 't2', nome: 'Creme', vende_decant: false }] }) }) },
}))
vi.mock('../novo/carregar', () => ({
  carregarBase: () => Promise.resolve({
    config: { tamanhos_decant: [5, 10], margem_padrao: 0.6, modelo_descricao: '' },
    produtos: [
      { id: 'p1', nome: 'Asad', marca: 'Lattafa', tipo_id: 't1', volume_ml: 100, custo_medio: 100, ficha: {} },
      { id: 'p2', nome: 'Hidratante', marca: 'Horus', tipo_id: 't2', volume_ml: null, custo_medio: 20, ficha: {} },
    ],
    listas: [], custoPorInsumo: {},
  }),
}))

beforeEach(() => vi.clearAllMocks())
const abrir = () => render(<MemoryRouter><PublicarShopify /></MemoryRouter>)
const escolherProduto = async (id: string) => escolher(await screen.findByRole('combobox', { name: 'Produto' }), id)

describe('PublicarShopify', () => {
  it('creme não oferece decant e o título usa o tipo', async () => {
    abrir(); await escolherProduto('p2')
    expect(await screen.findByLabelText('Frasco/unidade')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Decant/)).toBeNull()
    expect(screen.getByLabelText('Título')).toHaveValue('Creme Horus Hidratante')
  })

  it('preço sugerido segue precoShopify e o editado vai no publicar, só das marcadas', async () => {
    api.apiShopify.publicar.mockResolvedValue({ produto_ext_id: '9', variantes: 2 })
    abrir(); await escolherProduto('p1')
    expect(await screen.findByLabelText('Preço Frasco/unidade')).toHaveValue(String(precoShopify(100, 0.6, 10)))
    fireEvent.click(screen.getByLabelText('Decant 5 ml'))
    fireEvent.change(screen.getByLabelText('Preço Decant 5 ml'), { target: { value: '29.9' } })
    fireEvent.click(screen.getByText('fotos'))
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }))
    await waitFor(() => expect(api.apiShopify.publicar).toHaveBeenCalledWith(expect.objectContaining({
      produto_id: 'p1', fotos: ['http://x/1.jpg'],
      variantes: [{ tipo: 'frasco', ml: null, preco: precoShopify(100, 0.6, 10) }, { tipo: 'decant', ml: 5, preco: 29.9 }],
    })))
    expect(await screen.findByText(/Publicado na Shopify/)).toBeInTheDocument()
  })

  it('409 mostra a mensagem com link para Ligar', async () => {
    api.apiShopify.publicar.mockRejectedValue(new Error('Produto já está na Shopify: use Ligar produtos'))
    abrir(); await escolherProduto('p1')
    await screen.findByLabelText('Preço Frasco/unidade')
    fireEvent.click(screen.getByText('fotos'))
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }))
    expect(await screen.findByText(/já está na Shopify/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ligar/ })).toHaveAttribute('href', '/anuncios/shopify/ligar')
  })
})
