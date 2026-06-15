# Spec — Controle de Decants

**Data:** 2026-06-15
**Sessão:** 7

---

## Visão geral

Módulo de controle de frascos abertos para decants de perfume. O usuário "abre" um frasco do estoque — que é consumido como unidade — e passa a controlar os ML disponíveis dentro dele. Conforme decants são feitos, os ML diminuem. O histórico de cada decant fica registrado para relatórios futuros.

---

## Banco de dados

### Tabela `frascos_abertos`

| Coluna | Tipo | Restrições |
|--------|------|------------|
| `id` | uuid | PK, default gen_random_uuid() |
| `produto_id` | uuid | FK → produtos, UNIQUE (só 1 frasco aberto por perfume) |
| `ml_total` | int | NOT NULL — copiado de `produto.volume_ml` ao abrir |
| `ml_restante` | int | NOT NULL, CHECK (ml_restante >= 0) — começa igual a `ml_total` |
| `status` | text | NOT NULL, default `'ativo'` — `'ativo'` ou `'esgotado'` |
| `aberto_em` | timestamptz | NOT NULL, default now() |

### Tabela `decants`

| Coluna | Tipo | Restrições |
|--------|------|------------|
| `id` | uuid | PK, default gen_random_uuid() |
| `frasco_id` | uuid | FK → frascos_abertos ON DELETE CASCADE |
| `produto_id` | uuid | FK → produtos — desnormalizado para relatórios sem JOIN |
| `ml` | int | NOT NULL, CHECK (ml > 0) |
| `created_at` | timestamptz | NOT NULL, default now() |

RLS: policy `authenticated` com acesso total (padrão do projeto).

### Fluxo de dados

**Abrir frasco:**
1. `produtos.estoque_atual -= 1` (via UPDATE)
2. INSERT em `frascos_abertos` com `ml_total = produto.volume_ml`, `ml_restante = ml_total`

**Registrar decant:**
1. `frascos_abertos.ml_restante -= ml` (via UPDATE)
2. Se `ml_restante <= 0`: `status = 'esgotado'`, `ml_restante = 0`
3. INSERT em `decants` com `frasco_id`, `produto_id`, `ml`

**Excluir frasco:**
- DELETE em `frascos_abertos` (cascade deleta os `decants` vinculados)
- Não reverte o estoque (o frasco físico já foi aberto)

---

## Navegação

- Rota: `/estoque/decants`
- Sidebar: entrada "Decants" na seção Estoque (após Divergências)
- Ícone: `droplet` — **adicionar ao `Icon.tsx`** (SVG: `<path d="M12 3C8 8 5 12 5 16a7 7 0 0014 0c0-4-3-8-7-13z" />`)

---

## Componentes

### `Decants.tsx` — página principal

**Topbar:** título "Decants" + botão primário "Abrir frasco".

**Grid de cards** (1 coluna mobile, 2 tablet, 3 desktop). Um card por frasco em `frascos_abertos`:

- Foto do produto (pequena, no canto) + nome do perfume
- `FrascoViewer` (tamanho pequeno, ~80px) mostrando nível atual
- Texto `ml_restante / ml_total` em `tabular-nums`
- Barra de progresso dourada (largura = `ml_restante / ml_total * 100%`)
- **Ativo:** card clicável — abre `DecantModal`
- **Esgotado:** card acinzentado, badge "Esgotado", botão excluir (ícone lixeira), não abre modal

**Estado vazio:** mensagem "Nenhum frasco aberto" com CTA para abrir o primeiro.

**Loading / erro:** spinner e mensagem de erro padrão do projeto.

### `AbrirFrascoModal.tsx`

Modal simples com:
- Select de produto — filtra apenas produtos com `estoque_atual > 0` e sem frasco em `frascos_abertos` (status `'ativo'`)
- Exibe volume automaticamente ao selecionar: "Este frasco tem **100ml**"
- Botão "Confirmar" — executa o fluxo de abertura

Validações:
- Produto obrigatório
- Produto deve ter estoque ≥ 1 (backend valida também)

### `DecantModal.tsx`

Modal dividido em duas colunas:

**Esquerda:** `FrascoViewer` grande (~200px), animado — ao confirmar, o nível desce suavemente para o novo percentual antes do modal fechar.

**Direita:**
- Nome do perfume (título serifado)
- ML disponível: `ml_restante ml disponíveis`
- Três botões rápidos: **2ml · 5ml · 10ml** (estilo toggle — highlight dourado no selecionado)
- Input numérico para valor customizado (ao digitar, deseleciona botões rápidos)
- Botão "Registrar decant"

Validações:
- ML obrigatório, > 0, inteiro
- ML não pode exceder `ml_restante` (mensagem: "Quantidade maior que o disponível")

### `FrascoViewer.tsx`

Componente React com canvas Three.js. Props: `{ percentual: number, size?: 'sm' | 'lg' }`.

**Geometria:**
- Corpo: `CylinderGeometry` com raio superior ligeiramente menor (afunila para gargalo)
- Gargalo: segundo cilindro menor no topo
- Tampa: disco plano achatado
- Câmera fixa em ângulo 3/4 (sem OrbitControls)

**Líquido:**
- `BoxGeometry` ou `CylinderGeometry` menor dentro do frasco, altura proporcional ao `percentual`
- Material: `MeshStandardMaterial` com `color: #C9A84C`, `opacity: 0.75`, `transparent: true`
- Efeito `emissive` leve para brilho âmbar

**Vidro (frasco):**
- `MeshStandardMaterial` com `opacity: 0.22`, `transparent: true`, `color: #E8E0CC`
- Wireframe não — faces sólidas semitransparentes

**Animação:**
- `lerp` no `requestAnimationFrame` para interpolação suave do nível quando `percentual` muda
- Tamanho `sm`: canvas 80×100px — estático, sem animação de abertura (performance)
- Tamanho `lg`: canvas 140×200px — animado

**Esgotado:** `percentual = 0`, sem cor âmbar (frasco vazio transparente)

**Cleanup:** `renderer.dispose()` no `useEffect` cleanup para não vazar recursos WebGL.

---

## Lógica pura — `lib/decants.ts`

Funções testáveis isoladamente:

```typescript
// Valida se um produto pode ter frasco aberto
function podeFrasco(produto: { estoque_atual: number }, abertos: FrascoAberto[]): boolean

// Calcula novo ml_restante após decant; retorna null se excede disponível
function calcularNovoML(mlRestante: number, mlDecant: number): number | null

// Retorna status após update ('ativo' | 'esgotado')
function statusAposDecant(novoML: number): 'ativo' | 'esgotado'
```

TDD: testes em `src/lib/__tests__/decants.test.ts` antes da implementação.

---

## Testes

- `lib/__tests__/decants.test.ts` — lógica pura (TDD)
- `pages/estoque/__tests__/Decants.test.tsx` — lista de frascos (mocks Supabase)
- `pages/estoque/__tests__/AbrirFrascoModal.test.tsx` — abertura de frasco
- `pages/estoque/__tests__/DecantModal.test.tsx` — registro de decant + validação de ML

`FrascoViewer` não é testado (Three.js não roda em jsdom — mesmo padrão dos charts recharts).

---

## Fora de escopo

- Integração financeira (venda de decant → transação): futuro
- Validação início ≤ fim em relatórios: futuro
- Histórico/relatório de decants na própria página (dashboard separado futuro)
- Reverter estoque ao excluir frasco (frasco aberto = consumido)
- Múltiplos frascos do mesmo perfume abertos simultaneamente
