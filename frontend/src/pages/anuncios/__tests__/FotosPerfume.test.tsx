import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { FotosPerfume } from '../FotosPerfume'

const chamadas: { op: string; args: unknown[] }[] = []
let fotos: unknown[] = []
let updatesOrdem = 0
let falhaNoSegundo = false
let gate: Promise<void> = Promise.resolve()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: { from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: 'x' } }) }) },
    from: () => {
      const ops: { op: string; args: unknown[] }[] = []
      const b: Record<string, unknown> = {}
      for (const op of ['select', 'order', 'eq', 'delete', 'update', 'insert']) {
        b[op] = (...args: unknown[]) => { chamadas.push({ op, args }); ops.push({ op, args }); return b }
      }
      b.then = (res: (v: unknown) => unknown) => {
        const upd = ops.find((o) => o.op === 'update')
        if (!upd) return res({ data: fotos, error: null })
        if ('ordem' in (upd.args[0] as object)) {
          updatesOrdem++
          if (falhaNoSegundo && updatesOrdem === 2) return res({ data: null, error: { message: 'x' } })
        }
        return gate.then(() => res({ data: null, error: null }))
      }
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
  updatesOrdem = 0
  falhaNoSegundo = false
  gate = Promise.resolve()
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

  it('falha no meio da reordenação recarrega do banco e mostra o erro', async () => {
    falhaNoSegundo = true
    render(<FotosPerfume produtoId="p" />)
    await screen.findAllByRole('img')
    const selects = () => chamadas.filter((c) => c.op === 'select').length
    const antes = selects()
    fireEvent.click(screen.getByRole('button', { name: 'Mover foto 1 para a direita' }))
    await screen.findByRole('alert')
    expect(selects()).toBe(antes + 1)
  })

  it('desabilita os botões enquanto uma ação está pendente', async () => {
    let soltar!: () => void
    gate = new Promise<void>((r) => { soltar = r })
    render(<FotosPerfume produtoId="p" />)
    await screen.findAllByRole('img')
    const excluir = () => screen.getByRole('button', { name: 'Excluir foto 1' }) as HTMLButtonElement
    fireEvent.click(screen.getByRole('button', { name: 'Mover foto 1 para a direita' }))
    await waitFor(() => expect(excluir().disabled).toBe(true))
    soltar()
    await waitFor(() => expect(excluir().disabled).toBe(false))
  })
})

describe('FotosPerfume — baixar', () => {
  it('baixar foto busca a imagem e salva com o nome do perfume', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) })
    vi.stubGlobal('fetch', fetchMock)
    URL.createObjectURL = vi.fn(() => 'blob:1')
    URL.revokeObjectURL = vi.fn()
    const nomes: string[] = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { nomes.push(this.download) })
    render(<FotosPerfume produtoId="p" nome="Asad" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Baixar foto 1' }))
    await waitFor(() => expect(nomes).toEqual(['asad-01.jpg']))
    expect(fetchMock).toHaveBeenCalledWith('u1')
    fireEvent.click(screen.getByRole('button', { name: 'Baixar todas' }))
    await waitFor(() => expect(nomes).toEqual(['asad-01.jpg', 'asad-01.jpg', 'asad-02.jpg', 'asad-03.jpg']))
    click.mockRestore()
    vi.unstubAllGlobals()
  })

  it('falha ao baixar mostra o erro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rede')))
    render(<FotosPerfume produtoId="p" nome="Asad" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Baixar foto 1' }))
    expect(await screen.findByText('Não foi possível baixar a foto.')).toBeTruthy()
    vi.unstubAllGlobals()
  })
})
