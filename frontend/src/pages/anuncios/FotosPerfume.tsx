import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fotosDoAnuncio, nomeArquivoFoto, type Foto } from '@/lib/anuncios'
import { ImageCropper } from '@/components/shared/ImageCropper'
import { Button } from '@/components/shared/FormControls'
import { Icon } from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

const TABELA = 'produto_fotos'
const COLS = 'id, url, uso, ordem'

// Em jsdom a imagem nunca carrega: o timeout evita travar.
function medir(file: File): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    let t: ReturnType<typeof setTimeout>
    const fim = (v: { w: number; h: number } | null) => { clearTimeout(t); URL.revokeObjectURL(url); resolve(v) }
    img.onload = () => fim({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => fim(null)
    t = setTimeout(() => fim(null), 3000)
    img.src = url
  })
}

async function baixar(url: string, arquivo: string) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(String(r.status))
  const href = URL.createObjectURL(await r.blob())
  const a = document.createElement('a')
  a.href = href
  a.download = arquivo
  a.click()
  URL.revokeObjectURL(href)
}

export function FotosPerfume({ produtoId, nome = 'foto', onChange }: { produtoId: string; nome?: string; onChange?: (fotos: Foto[]) => void }) {
  const [fotos, setFotos] = useState<Foto[]>([])
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')
  const [erro, setErro] = useState('')
  const [arrastando, setArrastando] = useState<number | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const aplicar = useCallback((lista: Foto[]) => { setFotos(lista); onChangeRef.current?.(lista) }, [])

  const carregar = useCallback(async (vivo: () => boolean = () => true) => {
    const { data, error } = await supabase.from(TABELA).select(COLS).eq('produto_id', produtoId).order('ordem')
    if (!vivo()) return
    if (error) setErro('Não foi possível carregar as fotos.')
    else aplicar((data ?? []) as Foto[])
  }, [produtoId, aplicar])

  useEffect(() => {
    let vivo = true
    carregar(() => vivo)
    return () => { vivo = false }
  }, [carregar])

  // Uma operação por vez: evita snapshots velhos de `fotos`.
  async function exec(fn: () => Promise<void>) {
    if (ocupado) return
    setOcupado(true)
    setErro('')
    try { await fn() } finally { setOcupado(false) }
  }

  const falhou = (r: { error: unknown } | null | undefined) => {
    if (r?.error) setErro('Não foi possível salvar. Tente de novo.')
    return !!r?.error
  }

  const alternarUso = (f: Foto) => exec(async () => {
    const uso = f.uso === 'frasco' ? 'decant' : 'frasco'
    if (falhou(await supabase.from(TABELA).update({ uso }).eq('id', f.id))) return
    aplicar(fotos.map((x) => (x.id === f.id ? { ...x, uso } : x)))
  })

  const mover = (de: number, para: number) => exec(async () => {
    if (para < 0 || para >= fotos.length || de === para) return
    const nova = [...fotos]
    nova.splice(para, 0, nova.splice(de, 1)[0])
    const ordenada = nova.map((f, i) => ({ ...f, ordem: i }))
    for (const f of ordenada) {
      if (falhou(await supabase.from(TABELA).update({ ordem: f.ordem }).eq('id', f.id))) {
        await carregar() // parte já gravada: volta a mostrar o que está no banco
        return
      }
    }
    aplicar(ordenada)
  })

  const excluir = (f: Foto) => exec(async () => {
    if (falhou(await supabase.from(TABELA).delete().eq('id', f.id))) return
    aplicar(fotos.filter((x) => x.id !== f.id))
  })

  // Na ordem da tela; uma falha para o resto e avisa.
  async function baixarFotos(lista: { f: Foto; i: number }[]) {
    setErro('')
    try { for (const { f, i } of lista) await baixar(f.url, nomeArquivoFoto(nome, i, f.url)) }
    catch { setErro('Não foi possível baixar a foto.') }
  }

  function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = () => setCropSrc(reader.result as string)
      reader.readAsDataURL(file)
    }
    e.target.value = ''
  }

  const subir = (file: File) => exec(async () => {
    setCropSrc(null)
    const dim = await medir(file)
    setAviso(dim && (dim.w < 500 || dim.h < 500) ? 'Foto menor que 500 px — o ML pode recusar' : '')
    const path = `${crypto.randomUUID()}.${file.name.split('.').pop()}`
    const up = await supabase.storage.from('produtos').upload(path, file)
    if (up.error) { setErro('Não foi possível enviar a foto.'); return }
    const url = supabase.storage.from('produtos').getPublicUrl(path).data.publicUrl
    const ordem = fotos.reduce((m, f) => Math.max(m, f.ordem), -1) + 1
    const { data, error } = await supabase.from(TABELA)
      .insert({ produto_id: produtoId, url, uso: 'frasco', ordem }).select(COLS).single()
    if (error || !data) { setErro('Não foi possível salvar a foto.'); return }
    aplicar([...fotos, data as Foto])
  })

  const nFrasco = fotosDoAnuncio(fotos, { tipo: 'frasco', ml: null }).length
  const nDecant = fotosDoAnuncio(fotos, { tipo: 'decant', ml: 5 }).length

  return (
    <div className="gold-hairline bg-surface border border-line rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text">Fotos do perfume</h3>
        <div className="flex gap-2">
          {fotos.length > 0 && (
            <Button size="sm" variant="ghost" type="button" onClick={() => baixarFotos(fotos.map((f, i) => ({ f, i })))}>
              <Icon name="download" size={14} /> Baixar todas
            </Button>
          )}
          <Button size="sm" variant="secondary" type="button" disabled={ocupado} onClick={() => inputRef.current?.click()}>
            <Icon name="plus" size={14} /> Subir foto
          </Button>
        </div>
        <input ref={inputRef} type="file" accept="image/*" hidden aria-label="Arquivo da foto" onChange={escolher} />
      </div>

      <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {fotos.map((f, i) => (
          <li
            key={f.id}
            draggable={!ocupado}
            onDragStart={() => setArrastando(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (arrastando !== null) mover(arrastando, i); setArrastando(null) }}
            className="bg-surface-2 border border-line rounded-lg p-2 space-y-2 cursor-grab"
          >
            <img src={f.url} alt={`Foto ${i + 1}`} className="aspect-square w-full object-cover rounded-md" />
            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                disabled={ocupado}
                aria-label={`Uso da foto ${i + 1}: ${f.uso === 'frasco' ? 'Frasco' : 'Decant'}`}
                onClick={() => alternarUso(f)}
                className={cn(
                  'px-2 py-0.5 rounded-full text-[11px] font-medium border cursor-pointer',
                  f.uso === 'frasco' ? 'border-gold-line text-gold bg-gold/10' : 'border-line text-muted',
                )}
              >
                {f.uso === 'frasco' ? 'Frasco' : 'Decant'}
              </button>
              <div className="flex">
                <Button type="button" variant="ghost" size="sm" disabled={ocupado || i === 0} aria-label={`Mover foto ${i + 1} para a esquerda`} onClick={() => mover(i, i - 1)}>
                  <Icon name="chevron" size={14} className="rotate-180" />
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={ocupado || i === fotos.length - 1} aria-label={`Mover foto ${i + 1} para a direita`} onClick={() => mover(i, i + 1)}>
                  <Icon name="chevron" size={14} />
                </Button>
                <Button type="button" variant="ghost" size="sm" aria-label={`Baixar foto ${i + 1}`} onClick={() => baixarFotos([{ f, i }])}>
                  <Icon name="download" size={14} />
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={ocupado} aria-label={`Excluir foto ${i + 1}`} onClick={() => excluir(f)}>
                  <Icon name="trash" size={14} />
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {aviso && <p className="text-xs text-warn">{aviso}</p>}
      {erro && <p className="text-xs text-down" role="alert">{erro}</p>}
      <p className="text-xs text-muted">Frasco usa {nFrasco} fotos · Decant usa {nDecant} fotos (máx. 12)</p>

      <ImageCropper open={!!cropSrc} imageSrc={cropSrc} aspect={1} onCancel={() => setCropSrc(null)} onConfirm={subir} />
    </div>
  )
}
