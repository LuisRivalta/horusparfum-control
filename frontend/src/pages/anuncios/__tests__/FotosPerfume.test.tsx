import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { FotosPerfume } from '../FotosPerfume'

const chamadas: { op: string; args: unknown[] }[] = []
let fotos: unknown[] = []

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: { from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: 'x' } }) }) },
    from: () => {
      const b: Record<string, unknown> = {}
      for (const op of ['select', 'order', 'eq', 'delete', 'update', 'insert']) {
        b[op] = (...args: unknown[]) => { chamadas.push({ op, args }); return b }
      }
      b.then = (res: (v: unknown) => unknown) => res({ data: fotos, error: null })
      return b
    },
  },
}))

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})

beforeEach(() => {
  chamadas.length = 0
  fotos = [
    { id: 'f1', produto_id: 'p', url: 'u1', uso: 'frasco', ordem: 0 },
    { id: 'f2', produto_id: 'p', url: 'u2', uso: 'frasco', ordem: 1 },
    { id: 'f3', produto_id: 'p', url: 'u3', uso: 'decant', ordem: 2 },
  ]
})

describe('FotosPerfume', () => {
  it('mostra as fotos na ordem e o resumo de uso', async () => {
    render(<FotosPerfume produtoId="p" />)
    const imgs = await screen.findAllByRole('img')
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual(['u1', 'u2', 'u3'])
    expect(screen.getByText('Frasco usa 2 fotos · Decant usa 3 fotos (máx. 12)')).toBeTruthy()
  })

  it('clicar no selo alterna o uso', async () => {
    render(<FotosPerfume produtoId="p" />)
    fireEvent.click((await screen.findAllByRole('button', { name: /Uso da foto 1/ }))[0])
    await waitFor(() => expect(chamadas.some((c) => c.op === 'update' && JSON.stringify(c.args[0]) === '{"uso":"decant"}')).toBe(true))
  })

  it('mover para a direita grava a nova ordem', async () => {
    render(<FotosPerfume produtoId="p" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Mover foto 1 para a direita' }))
    await waitFor(() => {
      const ups = chamadas.filter((c) => c.op === 'update').map((c) => JSON.stringify(c.args[0]))
      expect(ups).toEqual(['{"ordem":0}', '{"ordem":1}', '{"ordem":2}'])
    })
    const ids = chamadas.filter((c) => c.op === 'eq' && c.args[0] === 'id').map((c) => c.args[1])
    expect(ids).toEqual(['f2', 'f1', 'f3'])
  })
})
