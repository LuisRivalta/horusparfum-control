// frontend/src/pages/estoque/__tests__/Decants.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { EstDecants } from '../Decants'

vi.mock('@/pages/estoque/decants/FrascoViewer', () => ({
  FrascoViewer: ({ percentual }: { percentual: number }) => (
    <div data-testid="frasco-viewer" data-pct={percentual} />
  ),
}))
vi.mock('@/pages/estoque/decants/AbrirFrascoModal', () => ({
  AbrirFrascoModal: () => <div data-testid="abrir-modal" />,
}))
vi.mock('@/pages/estoque/decants/DecantModal', () => ({
  DecantModal: () => <div data-testid="decant-modal" />,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() =>
          Promise.resolve({
            data: [
              {
                id: 'f1',
                produto_id: 'p1',
                ml_total: 100,
                ml_restante: 70,
                status: 'ativo',
                aberto_em: '2026-06-15T10:00:00Z',
                produtos: { nome: 'Asad', foto_url: null, volume_ml: 100 },
              },
              {
                id: 'f2',
                produto_id: 'p2',
                ml_total: 50,
                ml_restante: 0,
                status: 'esgotado',
                aberto_em: '2026-06-14T10:00:00Z',
                produtos: { nome: 'Lattafa 50ml', foto_url: null, volume_ml: 50 },
              },
            ],
            error: null,
          })
        ),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    })),
  },
}))

describe('EstDecants', () => {
  it('renderiza cards de frascos ativos e esgotados', async () => {
    render(<EstDecants />)
    await waitFor(() => expect(screen.getByText('Asad')).toBeInTheDocument())
    expect(screen.getByText('Lattafa 50ml')).toBeInTheDocument()
  })

  it('mostra ml restante / total', async () => {
    render(<EstDecants />)
    await waitFor(() => expect(screen.getByText('70')).toBeInTheDocument())
    expect(screen.getByText('/100ml')).toBeInTheDocument()
  })

  it('mostra badge Esgotado no frasco vazio', async () => {
    render(<EstDecants />)
    await waitFor(() => expect(screen.getByText('Esgotado')).toBeInTheDocument())
  })

  it('mostra estado vazio quando não há frascos', async () => {
    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.from).mockReturnValueOnce({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
    } as never)
    render(<EstDecants />)
    await waitFor(() =>
      expect(screen.getByText('Nenhum frasco aberto')).toBeInTheDocument()
    )
  })
})
