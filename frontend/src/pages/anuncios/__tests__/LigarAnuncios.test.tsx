import { escolher } from '@/test/escolher'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LigarAnuncios } from '../LigarAnuncios'

const { api } = vi.hoisted(() => ({ api: { itensDaConta: vi.fn(), ligarAnuncio: vi.fn() } }))

vi.mock('@/lib/apiAnuncios', () => api)
vi.mock('../novo/carregar', () => ({
  carregarBase: () => Promise.resolve({
    produtos: [
      { id: 'p1', nome: 'Asad', marca: 'Lattafa', volume_ml: 100 },
      { id: 'p2', nome: 'Khamrah', marca: 'Lattafa', volume_ml: 100 },
    ],
  }),
}))

const item = (o = {}) => ({ ml_item_id: 'MLB1', titulo: 'Decant Lattafa Asad EDP 5ml', preco: 29.9, quantidade: 3,
  status: 'active', permalink: 'https://ml/1', volume_ml: 5, ligado: false, ...o })

beforeEach(() => vi.clearAllMocks())

describe('LigarAnuncios', () => {
  it('sugere perfume e decant e liga', async () => {
    api.itensDaConta.mockResolvedValue({ itens: [item(), item({ ml_item_id: 'MLB2', titulo: 'Ja ligado', ligado: true })] })
    api.ligarAnuncio.mockResolvedValue({})
    render(<MemoryRouter><LigarAnuncios /></MemoryRouter>)
    expect(await screen.findByText('Decant Lattafa Asad EDP 5ml')).toBeInTheDocument()
    expect(screen.queryByText('Ja ligado')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /Perfume de/ })).toHaveTextContent('Lattafa Asad')
    expect(screen.getByRole('combobox', { name: /Tipo de/ })).toHaveTextContent('Decant 5 ml')

    fireEvent.click(screen.getByRole('button', { name: 'Ligar' }))
    await waitFor(() => expect(api.ligarAnuncio).toHaveBeenCalledWith(
      { ml_item_id: 'MLB1', produto_id: 'p1', tipo: 'decant', ml: 5 }))
    await waitFor(() => expect(screen.queryByText('Decant Lattafa Asad EDP 5ml')).not.toBeInTheDocument())
  })

  it('permite corrigir o perfume e mostra erro da API', async () => {
    api.itensDaConta.mockResolvedValue({ itens: [item()] })
    api.ligarAnuncio.mockRejectedValue(new Error('Anúncio já ligado'))
    render(<MemoryRouter><LigarAnuncios /></MemoryRouter>)
    escolher(await screen.findByRole('combobox', { name: /Perfume de/ }), 'p2')
    fireEvent.click(screen.getByRole('button', { name: 'Ligar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Anúncio já ligado')
    expect(api.ligarAnuncio).toHaveBeenCalledWith({ ml_item_id: 'MLB1', produto_id: 'p2', tipo: 'decant', ml: 5 })
  })
})
