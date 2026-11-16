import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fotosDoAnuncio, type Foto } from '@/lib/anuncios'
import { ImageCropper } from '@/components/shared/ImageCropper'
import { Button } from '@/components/shared/FormControls'
import { Icon } from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

const TABELA = 'produto_fotos'

// Em jsdom a imagem nunca carrega: o timeout evita travar.
function medir(file: File): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    const fim = (v: { w: number; h: number } | null) => { URL.revokeObjectURL(url); resolve(v) }
    img.onload = () => fim({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => fim(null)
    setTimeout(() => fim(null), 3000)
    img.src = url
  })
}

export function FotosPerfume({ produtoId, onChange }: { produtoId: string; onChange?: (fotos: Foto[]) => void }) {
  const [fotos, setFotos] = useState<Foto[]>([])
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')
  const [erro, setErro] = useState('')
  const [arrastando, setArrastando] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const aplicar = useCallback((lista: Foto[]) => { setFotos(lista); onChange?.(lista) }, [onChange])

  useEffect(() => {
    supabase.from(TABELA).select('id, url, uso, ordem').eq('produto_id', produtoId).order('ordem')
      .then(({ data }: { data: Foto[] | null }) => aplicar(data ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtoId])

  async function falha(r: { error: unknown } | undefined | null) {
    if (r?.error) setErro('Não foi possível salvar. Tente de novo.')
    return !!r?.error
  }

  async function alternarUso(f: Foto) {
    const uso = f.uso === 'frasco' ? 'decant' : 'frasco'
    if (await falha(await supabase.from(TABELA).update({ uso }).eq('id', f.id))) return
    aplicar(fotos.map((x) => (x.id === f.id ? { ...x, uso } : x)))
  }

  async function mover(de: number, para: number) {
    if (para < 0 || para >= fotos.length || de === para) return
    const nova = [...fotos]
    nova.splice(para, 0, nova.splice(de, 1)[0])
    const ordenada = nova.map((f, i) => ({ ...f, ordem: i }))
    for (const f of ordenada) {
      if (await falha(await supabase.from(TABELA).update({ ordem: f.ordem }).eq('id', f.id))) return
    }
    aplicar(ordenada)
  }

  async function excluir(f: Foto) {
    if (await falha(await supabase.from(TABELA).delete().eq('id', f.id))) return
    aplicar(fotos.filter((x) => x.id !== f.id))
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

  async function subir(file: File) {
    setCropSrc(null)
    setErro('')
    const dim = await medir(file)
    setAviso(dim && (dim.w < 500 || dim.h < 500) ? 'Foto menor que 500 px — o ML pode recusar' : '')
    const path = `${crypto.randomUUID()}.${file.name.split('.').pop()}`
    const up = await supabase.storage.from('produtos').upload(path, file)
    if (up.error) { setErro('Não foi possível enviar a foto.'); return }
    const url = supabase.storage.from('produtos').getPublicUrl(path).data.publicUrl
    const ordem = fotos.reduce((m, f) => Math.max(m, f.ordem), -1) + 1
    const { data, error } = await supabase.from(TABELA)
      .insert({ produto_id: produtoId, url, uso: 'frasco', ordem }).select('id, url, uso, ordem').single()
    if (error || !data) { setErro('Não foi possível salvar a foto.'); return }
    aplicar([...fotos, data as Foto])
  }

  const nFrasco = fotosDoAnuncio(fotos, { tipo: 'frasco', ml: null }).length
  const nDecant = fotosDoAnuncio(fotos, { tipo: 'decant', ml: 5 }).length

  return (
    <div className="gold-hairline bg-surface border border-line rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text">Fotos do perfume</h3>
        <Button size="sm" variant="secondary" type="button" onClick={() => inputRef.current?.click()}>
          <Icon name="plus" size={14} /> Subir foto
        </Button>
        <input ref={inputRef} type="file" accept="image/*" hidden aria-label="Arquivo da foto" onChange={escolher} />
      </div>

      <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {fotos.map((f, i) => (
          <li
            key={f.id}
            draggable
            onDragStart={() => setArrastando(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (arrastando !== null) mover(arrastando, i); setArrastando(null) }}
            className="bg-surface-2 border border-line rounded-lg p-2 space-y-2 cursor-grab"
          >
            <img src={f.url} alt={`Foto ${i + 1}`} className="aspect-square w-full object-cover rounded-md" />
            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
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
                <Button type="button" variant="ghost" size="sm" disabled={i === 0} aria-label={`Mover foto ${i + 1} para a esquerda`} onClick={() => mover(i, i - 1)}>
                  <Icon name="chevron" size={14} className="rotate-180" />
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={i === fotos.length - 1} aria-label={`Mover foto ${i + 1} para a direita`} onClick={() => mover(i, i + 1)}>
                  <Icon name="chevron" size={14} />
                </Button>
                <Button type="button" variant="ghost" size="sm" aria-label={`Excluir foto ${i + 1}`} onClick={() => excluir(f)}>
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
