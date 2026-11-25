import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { escolher } from '@/test/escolher'
import { FotosAnuncios } from '../Fotos'

const dados: Record<string, unknown[]> = {
  produtos: [{ id: 'p1', nome: 'Asad', marca_id: 'm1' }, { id: 'p2', nome: 'Khamrah', marca_id: null }],
  marcas: [{ id: 'm1', nome: 'Lattafa' }],
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (t: string) => {
      const b: Record<string, unknown> = {}
      for (const op of ['select', 'order', 'eq']) b[op] = () => b
      b.then = (res: (v: unknown) => unknown) => res({ data: dados[t] ?? [], error: null })
      return b
    },
  },
}))

vi.mock('../FotosPerfume', () => ({
  FotosPerfume: ({ produtoId, nome }: { produtoId: string; nome: string }) => <p>fotos de {produtoId} ({nome})</p>,
}))

describe('FotosAnuncios', () => {
  it('escolher o perfume mostra as fotos dele com o nome com marca', async () => {
    render(<FotosAnuncios />)
    const sel = screen.getByRole('combobox', { name: 'Perfume' })
    await screen.findByText('Escolha o perfume')
    await vi.waitFor(() => escolher(sel, 'p1'))
    expect(await screen.findByText('fotos de p1 (Lattafa Asad)')).toBeTruthy()
  })
})
