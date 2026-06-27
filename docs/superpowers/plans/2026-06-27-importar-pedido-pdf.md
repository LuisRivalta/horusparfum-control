# Importar Pedido por PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PDF import inside the existing "Novo pedido" modal so textual supplier PDFs prefill order items while the user manually selects the supplier and reviews before saving.

**Architecture:** Backend FastAPI parses textual PDFs into item JSON without touching Supabase. Frontend calls the endpoint from `NovoPedidoModal`, matches extracted names against already loaded products, fills item rows, and keeps unmatched rows pending for manual resolution.

**Tech Stack:** FastAPI, Python parser service, `pypdf`, React 19, TypeScript, Vitest Testing Library, Supabase Auth JWT.

---

## File Structure

- Create `backend/app/services/pedido_pdf_import.py`  
  Pure parsing helpers: extract text from uploaded PDF bytes, parse Brazilian numbers, detect item rows, return typed dicts.
- Modify `backend/requirements.txt`  
  Add `pypdf` for text extraction from generated PDFs.
- Modify `backend/app/routers/estoque.py`  
  Add `POST /api/estoque/pedidos/importar-pdf`, protected by `get_current_user`, accepting multipart upload.
- Create `backend/tests/test_pedido_pdf_import.py`  
  Unit tests for parsing text copied from the Onun-style PDF.
- Create `backend/tests/test_estoque_pedido_pdf_router.py`  
  Router tests for content-type validation, auth override, success, and clean parser error.
- Create `frontend/src/lib/pedidoPdfImport.ts`  
  API client, response types, product-name normalization, and match helper.
- Create `frontend/src/lib/__tests__/pedidoPdfImport.test.ts`  
  TDD for matching names and ambiguous/unmatched products.
- Modify `frontend/src/pages/estoque/pedidos/NovoPedidoModal.tsx`  
  Add hidden file input, "Importar PDF" button, upload state, endpoint call, imported-name warning per row.
- Modify `frontend/src/pages/estoque/__tests__/NovoPedidoModal.test.tsx`  
  Cover successful import, unmatched item warning, API authorization, and error preservation.
- Modify `docs/HANDOFF_IA.md` and `docs/LOGS.md`  
  Record implementation state after verification.

---

### Task 1: Backend PDF Parser

**Files:**
- Create: `backend/app/services/pedido_pdf_import.py`
- Test: `backend/tests/test_pedido_pdf_import.py`

- [ ] **Step 1: Write failing parser tests**

Create `backend/tests/test_pedido_pdf_import.py`:

```python
import sys
import types
import unittest

fake_supabase_module = types.ModuleType("supabase")
fake_supabase_module.create_client = lambda *args, **kwargs: object()
sys.modules.setdefault("supabase", fake_supabase_module)

from app.services.pedido_pdf_import import (
    PedidoPdfParseError,
    normalizar_numero_br,
    parse_pedido_pdf_text,
)


ONUN_TEXT = """
Pedido de Venda Nº 135447
Item Código (SKU) / GTIN / NCM Qtd Un Preço un Total
ISABELLE LA BELLE HIDRATANTE
CORPORAL SUPREMACIA 200GR - POTE
DB-SUP597
7898744785597
NCM: 3304.99.10
1,00 un 99,99 99,99
AL RASASI HAWAS BLACK EDP 100ML
DB-AR033
614514331033
NCM: 3303.00.10
1,00 un 189,99 189,99
LATTAFA ASAD BOURBON EDP 100ML
DB-LA340362
6290362340362
NCM: 3303.00.10
4,00 un 169,99 679,96
"""


class PedidoPdfImportTest(unittest.TestCase):
    def test_normaliza_numero_brasileiro(self):
        self.assertEqual(normalizar_numero_br("1,00"), 1.0)
        self.assertEqual(normalizar_numero_br("169,99"), 169.99)
        self.assertEqual(normalizar_numero_br("1.234,56"), 1234.56)

    def test_parseia_itens_do_texto_onun(self):
        resultado = parse_pedido_pdf_text(ONUN_TEXT)

        self.assertEqual(resultado["avisos"], [])
        self.assertEqual(resultado["itens"], [
            {
                "nome": "ISABELLE LA BELLE HIDRATANTE CORPORAL SUPREMACIA 200GR - POTE",
                "codigo": "DB-SUP597",
                "qtd": 1.0,
                "preco_unitario": 99.99,
                "total": 99.99,
            },
            {
                "nome": "AL RASASI HAWAS BLACK EDP 100ML",
                "codigo": "DB-AR033",
                "qtd": 1.0,
                "preco_unitario": 189.99,
                "total": 189.99,
            },
            {
                "nome": "LATTAFA ASAD BOURBON EDP 100ML",
                "codigo": "DB-LA340362",
                "qtd": 4.0,
                "preco_unitario": 169.99,
                "total": 679.96,
            },
        ])

    def test_falha_quando_nao_encontra_itens(self):
        with self.assertRaises(PedidoPdfParseError) as ctx:
            parse_pedido_pdf_text("Pedido sem tabela de itens")

        self.assertEqual(str(ctx.exception), "Nenhum item encontrado no PDF")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run parser tests and confirm failure**

Run:

```bash
cd C:\Horus\backend
python -m pytest tests/test_pedido_pdf_import.py -q
```

Expected: FAIL because `app.services.pedido_pdf_import` does not exist.

- [ ] **Step 3: Implement parser service**

Create `backend/app/services/pedido_pdf_import.py`:

```python
from __future__ import annotations

import io
import re
from typing import Any

from pypdf import PdfReader


class PedidoPdfParseError(ValueError):
    pass


MONEY_RE = r"\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}"
ROW_TOTAL_RE = re.compile(
    rf"^(?P<qtd>{MONEY_RE})\s+(?P<un>[A-Za-z]+)\s+(?P<preco>{MONEY_RE})\s+(?P<total>{MONEY_RE})$"
)


def normalizar_numero_br(valor: str) -> float:
    limpo = valor.strip().replace(".", "").replace(",", ".")
    return float(limpo)


def extrair_texto_pdf(pdf_bytes: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
    except Exception as exc:
        raise PedidoPdfParseError("PDF inválido ou ilegível") from exc

    partes = []
    for page in reader.pages:
        partes.append(page.extract_text() or "")

    texto = "\n".join(partes).strip()
    if not texto:
        raise PedidoPdfParseError("PDF sem texto extraível")
    return texto


def _is_noise(line: str) -> bool:
    upper = line.upper()
    return (
        not line
        or upper.startswith("PEDIDO DE VENDA")
        or upper.startswith("ITEM ")
        or upper.startswith("NCM:")
        or upper in {"UN"}
        or bool(re.fullmatch(r"\d{8,14}", line))
    )


def _is_codigo(line: str) -> bool:
    return bool(re.match(r"^[A-Z]{1,4}-[A-Z0-9]+$", line.strip(), re.I))


def parse_pedido_pdf_text(texto: str) -> dict[str, Any]:
    linhas = [linha.strip() for linha in texto.splitlines()]
    itens: list[dict[str, Any]] = []
    avisos: list[str] = []
    buffer_nome: list[str] = []
    codigo: str | None = None

    for linha in linhas:
        if _is_noise(linha):
            continue

        row_match = ROW_TOTAL_RE.match(linha)
        if row_match:
            if not buffer_nome:
                avisos.append(f"Linha ignorada sem nome de produto: {linha}")
                codigo = None
                continue

            itens.append({
                "nome": " ".join(buffer_nome).strip(),
                "codigo": codigo,
                "qtd": normalizar_numero_br(row_match.group("qtd")),
                "preco_unitario": normalizar_numero_br(row_match.group("preco")),
                "total": normalizar_numero_br(row_match.group("total")),
            })
            buffer_nome = []
            codigo = None
            continue

        if _is_codigo(linha):
            codigo = linha
            continue

        buffer_nome.append(linha)

    if not itens:
        raise PedidoPdfParseError("Nenhum item encontrado no PDF")

    return {"itens": itens, "avisos": avisos}


def parse_pedido_pdf_bytes(pdf_bytes: bytes) -> dict[str, Any]:
    return parse_pedido_pdf_text(extrair_texto_pdf(pdf_bytes))
```

- [ ] **Step 4: Add dependency**

Modify `backend/requirements.txt` to include:

```txt
pypdf
```

- [ ] **Step 5: Run parser tests and commit**

Run:

```bash
cd C:\Horus\backend
python -m pytest tests/test_pedido_pdf_import.py -q
```

Expected: PASS, 3 tests.

Commit:

```bash
git add backend/app/services/pedido_pdf_import.py backend/tests/test_pedido_pdf_import.py backend/requirements.txt
git commit -m "feat(api): adiciona parser de pedido em pdf"
```

---

### Task 2: Backend Import Endpoint

**Files:**
- Modify: `backend/app/routers/estoque.py`
- Test: `backend/tests/test_estoque_pedido_pdf_router.py`

- [ ] **Step 1: Write failing endpoint tests**

Create `backend/tests/test_estoque_pedido_pdf_router.py`:

```python
import sys
import types
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

fake_supabase_module = types.ModuleType("supabase")
fake_supabase_module.create_client = lambda *args, **kwargs: object()
sys.modules.setdefault("supabase", fake_supabase_module)

from app.auth.deps import get_current_user
from app.main import app
from app.services.pedido_pdf_import import PedidoPdfParseError


class EstoquePedidoPdfRouterTest(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.previous_overrides = dict(app.dependency_overrides)
        app.dependency_overrides[get_current_user] = lambda: {"sub": "user-1", "email": "user@example.com"}

    def tearDown(self):
        app.dependency_overrides = self.previous_overrides

    def test_rejeita_arquivo_nao_pdf(self):
        response = self.client.post(
            "/api/estoque/pedidos/importar-pdf",
            files={"file": ("pedido.txt", b"abc", "text/plain")},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {"detail": "Envie um arquivo PDF"})

    def test_retorna_itens_extraidos(self):
        payload = {
            "itens": [{"nome": "Perfume X", "codigo": "DB-X1", "qtd": 2.0, "preco_unitario": 10.5, "total": 21.0}],
            "avisos": [],
        }

        with patch("app.routers.estoque.parse_pedido_pdf_bytes", return_value=payload) as parser:
            response = self.client.post(
                "/api/estoque/pedidos/importar-pdf",
                files={"file": ("pedido.pdf", b"%PDF fake", "application/pdf")},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), payload)
        parser.assert_called_once_with(b"%PDF fake")

    def test_retorna_erro_limpo_do_parser(self):
        with patch("app.routers.estoque.parse_pedido_pdf_bytes", side_effect=PedidoPdfParseError("PDF sem texto extraível")):
            response = self.client.post(
                "/api/estoque/pedidos/importar-pdf",
                files={"file": ("pedido.pdf", b"%PDF fake", "application/pdf")},
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {"detail": "PDF sem texto extraível"})


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run endpoint tests and confirm failure**

Run:

```bash
cd C:\Horus\backend
python -m pytest tests/test_estoque_pedido_pdf_router.py -q
```

Expected: FAIL with 404 because the endpoint is not implemented.

- [ ] **Step 3: Implement endpoint**

Modify imports in `backend/app/routers/estoque.py`:

```python
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from app.services.pedido_pdf_import import PedidoPdfParseError, parse_pedido_pdf_bytes
```

Add before `@router.get("/vendas/dashboard")`:

```python
@router.post("/pedidos/importar-pdf")
async def importar_pedido_pdf(
    file: UploadFile = File(...),
    _user: dict = Depends(get_current_user),
):
    content_type = (file.content_type or "").lower()
    filename = (file.filename or "").lower()
    if content_type != "application/pdf" and not filename.endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Envie um arquivo PDF",
        )

    pdf_bytes = await file.read()
    try:
        return parse_pedido_pdf_bytes(pdf_bytes)
    except PedidoPdfParseError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Erro ao ler PDF: {exc}",
        )
```

- [ ] **Step 4: Add multipart support dependency**

Add to backend/requirements.txt:

```txt
python-multipart
```

Install locally if the environment does not already have it:

```bash
cd C:\Horus\backend
python -m pip install python-multipart pypdf
```

- [ ] **Step 5: Run endpoint and backend suite, then commit**

Run:

```bash
cd C:\Horus\backend
python -m pytest tests/test_estoque_pedido_pdf_router.py tests/test_pedido_pdf_import.py -q
python -m pytest tests -q
```

Expected: all backend tests pass.

Commit:

```bash
git add backend/app/routers/estoque.py backend/tests/test_estoque_pedido_pdf_router.py backend/requirements.txt
git commit -m "feat(api): expõe importação de pedido por pdf"
```

---

### Task 3: Frontend Import Client and Product Matching

**Files:**
- Create: `frontend/src/lib/pedidoPdfImport.ts`
- Test: `frontend/src/lib/__tests__/pedidoPdfImport.test.ts`

- [ ] **Step 1: Write failing frontend lib tests**

Create `frontend/src/lib/__tests__/pedidoPdfImport.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { casarItemImportado, normalizarNomeProduto } from '../pedidoPdfImport'

const produtos = [
  { id: 'p1', nome: 'Lattafa Asad Bourbon EDP 100ml' },
  { id: 'p2', nome: 'Al Rasasi Hawas Black EDP 100ML' },
  { id: 'p3', nome: 'Perfume Duplicado' },
  { id: 'p4', nome: 'Perfume-Duplicado' },
]

describe('pedidoPdfImport', () => {
  it('normaliza nome ignorando acento, pontuação e caixa', () => {
    expect(normalizarNomeProduto('  Perfúme   Teste - 100ML ')).toBe('perfume teste 100ml')
  })

  it('casa item importado por nome normalizado', () => {
    const result = casarItemImportado(
      { nome: 'LATTAFA ASAD BOURBON EDP 100ML', qtd: 4, preco_unitario: 169.99 },
      produtos
    )

    expect(result.produto_id).toBe('p1')
    expect(result.importado_nome).toBe('LATTAFA ASAD BOURBON EDP 100ML')
    expect(result.qtd).toBe('4')
    expect(result.preco).toBe('169.99')
    expect(result.matchStatus).toBe('matched')
  })

  it('deixa pendente quando não encontra produto', () => {
    const result = casarItemImportado(
      { nome: 'PRODUTO NOVO 200ML', qtd: 1, preco_unitario: 99.9 },
      produtos
    )

    expect(result.produto_id).toBe('')
    expect(result.matchStatus).toBe('unmatched')
  })

  it('deixa pendente quando encontra match ambíguo', () => {
    const result = casarItemImportado(
      { nome: 'Perfume Duplicado', qtd: 1, preco_unitario: 50 },
      produtos
    )

    expect(result.produto_id).toBe('')
    expect(result.matchStatus).toBe('ambiguous')
  })
})
```

- [ ] **Step 2: Run lib tests and confirm failure**

Run:

```bash
cd C:\Horus\frontend
npm run test:run -- src/lib/__tests__/pedidoPdfImport.test.ts
```

Expected: FAIL because `pedidoPdfImport.ts` does not exist.

- [ ] **Step 3: Implement frontend lib**

Create `frontend/src/lib/pedidoPdfImport.ts`:

```ts
export interface ProdutoOpcao {
  id: string
  nome: string
}

export interface PedidoPdfItem {
  nome: string
  codigo?: string | null
  qtd: number
  preco_unitario: number
  total?: number
}

export interface PedidoPdfResponse {
  itens: PedidoPdfItem[]
  avisos: string[]
}

export type MatchStatus = 'matched' | 'unmatched' | 'ambiguous'

export interface ItemImportadoForm {
  produto_id: string
  qtd: string
  preco: string
  importado_nome: string
  importado_codigo?: string | null
  matchStatus: MatchStatus
}

export function normalizarNomeProduto(nome: string) {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function casarItemImportado(item: PedidoPdfItem, produtos: ProdutoOpcao[]): ItemImportadoForm {
  const alvo = normalizarNomeProduto(item.nome)
  const matches = produtos.filter(produto => normalizarNomeProduto(produto.nome) === alvo)
  const unico = matches.length === 1 ? matches[0] : null

  return {
    produto_id: unico?.id ?? '',
    qtd: String(item.qtd),
    preco: String(item.preco_unitario),
    importado_nome: item.nome,
    importado_codigo: item.codigo ?? null,
    matchStatus: unico ? 'matched' : matches.length > 1 ? 'ambiguous' : 'unmatched',
  }
}

export async function importarPedidoPdf(params: {
  file: File
  token: string
  apiUrl: string
}): Promise<PedidoPdfResponse> {
  const formData = new FormData()
  formData.append('file', params.file)

  const response = await fetch(`${params.apiUrl}/api/estoque/pedidos/importar-pdf`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.token}`,
    },
    body: formData,
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.detail || 'Falha ao importar PDF')
  }
  if (!data || !Array.isArray(data.itens)) {
    throw new Error('Resposta inválida da API')
  }

  return {
    itens: data.itens,
    avisos: Array.isArray(data.avisos) ? data.avisos : [],
  }
}
```

- [ ] **Step 4: Run lib tests and commit**

Run:

```bash
cd C:\Horus\frontend
npm run test:run -- src/lib/__tests__/pedidoPdfImport.test.ts
```

Expected: PASS.

Commit:

```bash
git add frontend/src/lib/pedidoPdfImport.ts frontend/src/lib/__tests__/pedidoPdfImport.test.ts
git commit -m "feat(frontend): adiciona cliente de importacao de pedido pdf"
```

---

### Task 4: Integrate PDF Import into NovoPedidoModal

**Files:**
- Modify: `frontend/src/pages/estoque/pedidos/NovoPedidoModal.tsx`
- Modify: `frontend/src/pages/estoque/__tests__/NovoPedidoModal.test.tsx`

- [ ] **Step 1: Extend tests for import behavior**

Modify frontend/src/pages/estoque/__tests__/NovoPedidoModal.test.tsx.

Add this constant near the other mock state:

```ts
const getSessionMock = vi.fn(() => Promise.resolve({
  data: { session: { access_token: 'jwt-test' } },
}))
```

Then add this auth property inside the existing supabase mock, immediately before the existing from: vi.fn(...) property:

```ts
auth: {
  getSession: getSessionMock,
},
```

The resulting mock must still keep the current from, insert, update and delete behavior used by the existing tests.

Add these tests inside the existing NovoPedidoModal test suite, after the existing submit/edit tests:

```ts
it('importa PDF e preenche item com produto encontrado', async () => {
  const user = userEvent.setup()
  const fetchMock = vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      itens: [{ nome: 'Perfume X', codigo: 'DB-X', qtd: 2, preco_unitario: 123.45, total: 246.9 }],
      avisos: [],
    }),
  })) as unknown as typeof fetch
  vi.stubGlobal('fetch', fetchMock)

  render(<NovoPedidoModal open onClose={vi.fn()} onSaved={vi.fn()} />)

  await waitFor(() => expect(screen.getByRole('button', { name: /importar pdf/i })).toBeInTheDocument())
  const file = new File(['%PDF fake'], 'pedido.pdf', { type: 'application/pdf' })
  await user.upload(screen.getByLabelText(/arquivo pdf do pedido/i), file)

  await waitFor(() => {
    expect((screen.getByLabelText(/produto 1/i) as HTMLSelectElement).value).toBe('pr1')
  })
  expect((screen.getByLabelText(/qtd 1/i) as HTMLInputElement).value).toBe('2')
  expect((screen.getByLabelText(/preço 1/i) as HTMLInputElement).value).toBe('123.45')
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/api/estoque/pedidos/importar-pdf'),
    expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer jwt-test' },
    })
  )

  vi.unstubAllGlobals()
})

it('importa PDF e mantém item sem match pendente', async () => {
  const user = userEvent.setup()
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      itens: [{ nome: 'Produto Novo 200ML', codigo: 'DB-NOVO', qtd: 1, preco_unitario: 99.99 }],
      avisos: [],
    }),
  })))

  render(<NovoPedidoModal open onClose={vi.fn()} onSaved={vi.fn()} />)

  await waitFor(() => expect(screen.getByLabelText(/arquivo pdf do pedido/i)).toBeInTheDocument())
  await user.upload(screen.getByLabelText(/arquivo pdf do pedido/i), new File(['%PDF fake'], 'pedido.pdf', { type: 'application/pdf' }))

  await waitFor(() => expect(screen.getByText(/produto não encontrado: produto novo 200ml/i)).toBeInTheDocument())
  expect((screen.getByLabelText(/produto 1/i) as HTMLSelectElement).value).toBe('')

  vi.unstubAllGlobals()
})

it('preserva itens atuais quando importação falha', async () => {
  const user = userEvent.setup()
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: false,
    json: () => Promise.resolve({ detail: 'PDF sem texto extraível' }),
  })))

  render(<NovoPedidoModal open onClose={vi.fn()} onSaved={vi.fn()} />)

  await waitFor(() => expect(screen.getByLabelText(/produto 1/i)).toBeInTheDocument())
  await user.selectOptions(screen.getByLabelText(/produto 1/i), 'pr1')
  await user.upload(screen.getByLabelText(/arquivo pdf do pedido/i), new File(['bad'], 'pedido.pdf', { type: 'application/pdf' }))

  await waitFor(() => expect(screen.getByText(/pdf sem texto extraível/i)).toBeInTheDocument())
  expect((screen.getByLabelText(/produto 1/i) as HTMLSelectElement).value).toBe('pr1')

  vi.unstubAllGlobals()
})
```

- [ ] **Step 2: Run modal tests and confirm failure**

Run:

```bash
cd C:\Horus\frontend
npm run test:run -- src/pages/estoque/__tests__/NovoPedidoModal.test.tsx
```

Expected: FAIL because the import button/input are not implemented.

- [ ] **Step 3: Implement modal import state and item type**

Modify imports in `NovoPedidoModal.tsx`:

```ts
import { useState, useEffect, useRef } from 'react'
import { casarItemImportado, importarPedidoPdf, type MatchStatus } from '@/lib/pedidoPdfImport'
```

Extend `ItemForm`:

```ts
interface ItemForm {
  produto_id: string
  qtd: string
  preco: string
  importado_nome?: string
  importado_codigo?: string | null
  matchStatus?: MatchStatus
}
```

Add state:

```ts
const fileInputRef = useRef<HTMLInputElement>(null)
const [importandoPdf, setImportandoPdf] = useState(false)
```

- [ ] **Step 4: Implement import handler**

Add inside `NovoPedidoModal` before `handleSubmit`:

```ts
async function handlePdfFileChange(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (e.target) e.target.value = ''
  if (!file || importandoPdf) return

  setErro(null)
  setImportandoPdf(true)
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) throw new Error('Sessão expirada. Faça login novamente.')

    const apiUrl = import.meta.env.VITE_API_URL || ''
    const resultado = await importarPedidoPdf({ file, token, apiUrl })
    if (resultado.itens.length === 0) throw new Error('Nenhum item encontrado no PDF')

    setItens(resultado.itens.map(item => casarItemImportado(item, produtos)))
    if (resultado.avisos.length > 0) {
      setErro(resultado.avisos.join(' '))
    }
  } catch (err) {
    setErro(err instanceof Error ? err.message : 'Falha ao importar PDF')
  } finally {
    setImportandoPdf(false)
  }
}
```

- [ ] **Step 5: Add UI controls and row warnings**

In the section header currently containing `+ Cadastrar produto`, replace the right-side button with:

```tsx
<div className="flex items-center gap-3">
  <input
    ref={fileInputRef}
    type="file"
    accept="application/pdf,.pdf"
    aria-label="Arquivo PDF do pedido"
    className="hidden"
    onChange={handlePdfFileChange}
  />
  <button
    type="button"
    onClick={() => fileInputRef.current?.click()}
    disabled={importandoPdf}
    className="text-xs text-text-2 hover:text-gold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
  >
    {importandoPdf ? 'Lendo PDF...' : 'Importar PDF'}
  </button>
  <button
    type="button"
    onClick={() => setQuickOpen(!quickOpen)}
    className="text-xs text-gold hover:underline cursor-pointer"
  >
    + Cadastrar produto
  </button>
</div>
```

After each item row, render warning:

```tsx
{item.importado_nome && item.matchStatus !== 'matched' && (
  <p className="text-xs text-warn -mt-1">
    {item.matchStatus === 'ambiguous'
      ? `Produto ambíguo: ${item.importado_nome}`
      : `Produto não encontrado: ${item.importado_nome}`}
  </p>
)}
```

Wrap each mapped item in a div.flex.flex-col so the warning can render directly below the row. Keep the existing row contents unchanged inside that wrapper.

- [ ] **Step 6: Run modal and focused frontend tests, then commit**

Run:

```bash
cd C:\Horus\frontend
npm run test:run -- src/pages/estoque/__tests__/NovoPedidoModal.test.tsx src/lib/__tests__/pedidoPdfImport.test.ts
```

Expected: PASS.

Commit:

```bash
git add frontend/src/pages/estoque/pedidos/NovoPedidoModal.tsx frontend/src/pages/estoque/__tests__/NovoPedidoModal.test.tsx
git commit -m "feat(frontend): importa pdf no novo pedido"
```

---

### Task 5: Final Verification and Docs

**Files:**
- Modify: `docs/HANDOFF_IA.md`
- Modify: `docs/LOGS.md`

- [ ] **Step 1: Run backend verification**

Run:

```bash
cd C:\Horus\backend
python -m pytest tests -q
```

Expected: all backend tests pass.

- [ ] **Step 2: Run frontend verification**

Run:

```bash
cd C:\Horus\frontend
npm run test:run
npm run build
```

Expected: all frontend tests pass and production build succeeds.

- [ ] **Step 3: Update handoff**

Add a new numbered entry near the latest completed session in `docs/HANDOFF_IA.md`:

```md
33. **Importação de itens de pedido por PDF (Sessão 27)**
    - `POST /api/estoque/pedidos/importar-pdf` recebe PDF textual, extrai itens e retorna JSON sem gravar banco
    - Parser backend em `pedido_pdf_import.py` usa `pypdf`, normaliza números brasileiros e cobre PDFs no padrão Onun
    - `NovoPedidoModal` ganhou botão "Importar PDF" na seção de itens; fornecedor segue manual
    - Frontend casa itens por nome normalizado com produtos já cadastrados e deixa pendências para seleção manual
    - Sem migração de banco; não usa LLM/OCR no MVP
    - Testes backend e frontend adicionados para parser, endpoint, matching e preenchimento do modal
```

Update the "Estado atual" test counts after running the real suites.

- [ ] **Step 4: Update logs**

Add to the top of `docs/LOGS.md`:

```md
## 2026-06-27 — Importação de pedido por PDF

- Criada importação de itens por PDF textual dentro do modal "Novo pedido".
- Backend FastAPI ganhou endpoint protegido `POST /api/estoque/pedidos/importar-pdf`.
- Parser usa `pypdf`, extrai texto, interpreta linhas de item e normaliza quantidade/preços em formato brasileiro.
- Frontend envia PDF com JWT, preenche itens encontrados e marca itens sem match para seleção manual.
- Fornecedor continua manual e pedido só é salvo após revisão do usuário.
- Verificação: `python -m pytest tests -q`, `npm run test:run`, `npm run build`.
```

- [ ] **Step 5: Commit docs and final state**

Run:

```bash
git status --short
git add docs/HANDOFF_IA.md docs/LOGS.md
git commit -m "docs: atualiza handoff da importacao por pdf"
```

Expected: working tree clean except any intentionally uncommitted environment/cache files.

---

## Self-Review

- Spec coverage: backend endpoint, no DB writes, supplier manual, no LLM/OCR, frontend matching, unmatched manual resolution, error handling and tests are covered by Tasks 1-5.
- Placeholder scan: no TBD/TODO placeholders; all tasks include concrete files, code, commands, and expected outcomes.
- Type consistency: backend response keys are `itens`/`avisos`; frontend uses `nome`, `codigo`, `qtd`, `preco_unitario`, `total`; `ItemForm` extensions are optional so existing submit payload remains unchanged.
