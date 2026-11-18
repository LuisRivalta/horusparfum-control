import { escolher, opcoes } from '@/test/escolher'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LigarShopify } from '../LigarShopify'

const { api } = vi.hoisted(() => ({ api: { apiShopify: { variantes: vi.fn(), ligar: vi.fn(), desligar: vi.fn() } } }))

vi.mock('@/lib/apiShopify', () => api)
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => Promise.resolve({ data: [
    { id: 't1', nome: 'Perfume', vende_decant: true }, { id: 't2', nome: 'Camiseta', vende_decant: false }] }) }) },
}))
vi.mock('../novo/carregar', () => ({
  carregarBase: () => Promise.resolve({
    config: { tamanhos_decant: [5, 10] },
    produtos: [
      { id: 'p1', nome: 'Asad', marca: 'Lattafa', tipo_id: 't1', volume_ml: 100 },
      { id: 'p2', nome: 'Boné', marca: 'Horus', tipo_id: 't2', volume_ml: null },
    ],
  }),
}))

const v = (o = {}) => ({ produto_id_ext: '1', produto_titulo: 'Lattafa Asad', variante_id: 'V1', variante_titulo: 'Frasco',
  sku: null, estoque_id: 'gid://inv/1', vinculo: null, ...o })

beforeEach(() => vi.clearAllMocks())
const abrir = () => render(<MemoryRouter><LigarShopify /></MemoryRouter>)

describe('LigarShopify', () => {
  it('liga uma variante como decant e tira da lista', async () => {
    api.apiShopify.variantes.mockResolvedValue({ itens: [v()], proximo: null })
    api.apiShopify.ligar.mockResolvedValue({ enviados: 1, erros: [] })
    abrir()
    const tipo = await screen.findByRole('combobox', { name: /Tipo de/ })
    expect(screen.getByRole('combobox', { name: /Perfume de/ })).toHaveTextContent('Lattafa Asad')
    escolher(tipo, 'decant-5')
    fireEvent.click(screen.getByRole('button', { name: 'Ligar' }))
    await waitFor(() => expect(api.apiShopify.ligar).toHaveBeenCalledWith({
      variante_id: 'V1', produto_ext_id: '1', estoque_id: 'gid://inv/1', titulo: 'Frasco',
      produto_id: 'p1', tipo: 'decant', ml: 5 }))
    expect(await screen.findByText(/Ligado: Lattafa Asad · Decant 5 ml/)).toBeInTheDocument()
  })

  it('só oferece decant para produto que vende decant', async () => {
    api.apiShopify.variantes.mockResolvedValue({ itens: [v()], proximo: null })
    abrir()
    const perfume = await screen.findByRole('combobox', { name: /Perfume de/ })
    const tipo = screen.getByRole('combobox', { name: /Tipo de/ })
    expect(opcoes(tipo)).toEqual(['Frasco/unidade', 'Decant 5 ml', 'Decant 10 ml'])
    escolher(perfume, 'p2')
    expect(opcoes(tipo)).toEqual(['Frasco/unidade'])
  })

  it('carrega mais com o cursor', async () => {
    api.apiShopify.variantes.mockResolvedValueOnce({ itens: [v()], proximo: 'C2' })
      .mockResolvedValueOnce({ itens: [v({ variante_id: 'V2', variante_titulo: 'Outra' })], proximo: null })
    abrir()
    fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }))
    expect(await screen.findByText('Outra')).toBeInTheDocument()
    expect(api.apiShopify.variantes).toHaveBeenLastCalledWith('C2')
  })
})
