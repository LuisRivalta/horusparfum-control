import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AnunciosConfig } from '../AnunciosConfig'

const updates: unknown[] = []

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'tok' } } }) },
    from: (tabela: string) => {
      const dados = tabela === 'canais'
        ? [{ id: 'c1', nome: 'Mercado Livre', ativo: true }]
        : { id: 1, margem_padrao: 0.6, tipo_padrao: 'gold_special', modelo_descricao: 'x', ia_ativa: true, tamanhos_decant: [2.5, 5, 10], canal_id: 'c1' }
      const b: Record<string, unknown> = {}
      for (const op of ['select', 'eq', 'order', 'single']) b[op] = () => b
      b.update = (v: unknown) => { updates.push(v); return b }
      b.then = (res: (v: unknown) => unknown) => res({ data: dados, error: null })
      return b
    },
  },
}))

beforeEach(() => {
  updates.length = 0
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: true, json: () => Promise.resolve({ conectado: true, nickname: 'LOJA', user_product: false }),
  })))
})

const abrir = (url = '/anuncios/config') =>
  render(<MemoryRouter initialEntries={[url]}><AnunciosConfig /></MemoryRouter>)

describe('AnunciosConfig', () => {
  it('mostra a conta conectada', async () => {
    abrir()
    expect(await screen.findByText(/Conectado como LOJA/)).toBeInTheDocument()
  })

  it('salva margem 45 como 0.45', async () => {
    abrir()
    const campo = await screen.findByLabelText(/Margem padrão/i)
    await waitFor(() => expect((campo as HTMLInputElement).value).toBe('60'))
    fireEvent.change(campo, { target: { value: '45' } })
    fireEvent.click(screen.getByRole('button', { name: /Salvar/i }))
    await waitFor(() => expect(updates[0]).toMatchObject({ margem_padrao: 0.45 }))
  })

  it('avisa quando a conexão falhou', async () => {
    abrir('/anuncios/config?ml=erro')
    expect(await screen.findByText(/Não foi possível conectar/)).toBeInTheDocument()
  })
})
