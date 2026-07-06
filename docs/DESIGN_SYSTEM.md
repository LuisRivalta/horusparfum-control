# 🎨 Design System

> Documentação completa do sistema de design do **Horus Parfum Control**.
> Tema premium dark com identidade visual inspirada na mitologia egípcia (Olho de Horus).

---

## 📋 Visão Geral

O design system do Horus foi construído com foco em **sofisticação e premium feel**, alinhado ao universo da perfumaria artesanal:

| Propriedade | Valor |
|---|---|
| **Tema principal** | Dark mode |
| **Identidade** | Mitologia egípcia (Olho de Horus) |
| **Cor de destaque** | Gold `#C9A84C` |
| **Suporta** | Dark mode + Light mode |
| **CSS Framework** | Tailwind CSS 4 |
| **Abordagem** | Desktop-first, com otimização mobile completa |

> [!NOTE]
> A identidade visual reforça a marca "Horus" — o deus egípcio com olho que tudo vê — simbolizando o controle total sobre a operação da perfumaria.

---

## ✏️ Tipografia

O sistema utiliza **três famílias tipográficas** com propósitos distintos:

### Fontes

| Fonte | Uso | Peso | Exemplo |
|---|---|---|---|
| **Inter** | Corpo de texto, labels, botões, UI geral | 400, 500, 600, 700 | Texto de parágrafos e botões |
| **Cormorant Garamond** | Headings, elementos de marca, títulos premium | 400, 500, 600, 700 | Títulos de módulos e nome do sistema |
| **JetBrains Mono** | Monospace — código, números, dados financeiros | 400, 500 | `R$ 1.234,56` em tabelas |

### Hierarquia Tipográfica

| Nível | Fonte | Tamanho | Peso | Uso |
|---|---|---|---|---|
| **H1** | Cormorant Garamond | 2rem+ | 700 | Título de página |
| **H2** | Cormorant Garamond | 1.5rem | 600 | Título de seção |
| **H3** | Inter | 1.25rem | 600 | Subtítulo |
| **Body** | Inter | 1rem | 400 | Texto corrido |
| **Small** | Inter | 0.875rem | 400 | Labels, captions |
| **Mono** | JetBrains Mono | 0.875rem | 500 | Valores financeiros, IDs |

> [!TIP]
> Use **JetBrains Mono** para exibição de valores financeiros em tabelas e cards. A fonte monospace garante alinhamento visual perfeito das colunas numéricas.

---

## 🎨 Paleta de Cores

### Dark Mode (Tema Principal)

| Token | Cor | Hex | Uso |
|---|---|---|---|
| `--background` | Preto profundo | `#0A0A0B` | Fundo principal da aplicação |
| `--surface` | Cinza escuro | `#141416` | Cards, painéis, containers |
| `--surface-hover` | Cinza médio | `#1C1C1F` | Hover em superfícies |
| `--border` | Cinza sutil | `#2A2A2E` | Bordas de cards e divisores |
| `--accent` | Gold | `#C9A84C` | Destaque principal, botões primários, ícones ativos |
| `--accent-hover` | Gold claro | `#D4B85E` | Hover em elementos gold |
| `--text-primary` | Branco | `#FFFFFF` | Texto principal |
| `--text-secondary` | Cinza claro | `#A1A1AA` | Texto secundário, labels |
| `--text-muted` | Cinza médio | `#71717A` | Texto terciário, placeholders |

### Cores de Status

| Status | Cor | Hex | Uso |
|---|---|---|---|
| 🔴 **Crítico** | Vermelho | `#EF4444` | Estoque crítico, erros, alertas severos |
| 🟠 **Baixo / Atenção** | Laranja | `#F97316` | Estoque baixo, avisos |
| 🟡 **OK / Destaque** | Gold | `#C9A84C` | Status normal, valores em destaque |
| 🟢 **Sucesso** | Verde | `#22C55E` | Operação bem-sucedida, estoque saudável |
| 🔵 **Info** | Azul | `#3B82F6` | Informações, links |

### Light Mode

| Token | Cor | Hex | Uso |
|---|---|---|---|
| `--background` | Branco quente | `#FAFAF8` | Fundo principal |
| `--surface` | Cinza claro | `#F4F4F2` | Cards, painéis |
| `--border` | Cinza suave | `#E4E4E0` | Bordas |
| `--accent` | Gold | `#C9A84C` | Mesmo accent do dark mode |
| `--text-primary` | Preto suave | `#1A1A1A` | Texto principal |
| `--text-secondary` | Cinza | `#6B6B6B` | Texto secundário |

> [!NOTE]
> O **gold (#C9A84C)** é a cor de identidade do sistema e permanece **consistente** entre dark e light mode, garantindo reconhecimento da marca em ambos os temas.

---

## 🧩 Componentes Visuais

### Layout

#### Sidebar Colapsável

| Propriedade | Desktop | Mobile |
|---|---|---|
| **Tipo** | Sidebar fixa à esquerda | Drawer (overlay) |
| **Estado padrão** | Expandida | Fechada |
| **Colapsável** | ✅ Sim, com ícone toggle | ✅ Via botão hamburger |
| **Itens** | Ícone + label | Ícone + label |
| **Animação** | Transição suave de largura | Slide-in da esquerda |

#### Glass Blur Header

- Header com efeito **glassmorphism** (backdrop-filter: blur)
- Transparência parcial do fundo para efeito de profundidade
- Contém: breadcrumb, busca (quando aplicável), UserMenu

#### Module Switcher

Alternador entre módulos **Financeiro** e **Estoque**:

- Indicador deslizante animado (sliding indicator)
- Transição suave entre as abas
- Destaque gold na aba ativa
- Posicionado no header ou sidebar (depende do layout)

#### Smooth Scroll — Lenis

O sistema utiliza a biblioteca **Lenis** para scroll suave:
- Scroll inercial com easing natural
- Aplicado globalmente na página
- Desativado em modais e dropdowns para não interferir

---

### Cards & Efeitos

#### Glow Card

Card com efeito **holográfico** no hover, usado em cards de produtos:

```css
/* Efeito conceitual */
.glow-card:hover {
  box-shadow: 0 0 20px rgba(201, 168, 76, 0.3);
  border-color: rgba(201, 168, 76, 0.5);
  transform: translateY(-2px);
}
```

Comportamento:
- **Idle**: Borda sutil, sombra mínima
- **Hover**: Glow dourado, leve elevação, borda gold
- **Active**: Sombra intensificada

#### Gold Hairline

Linha fina dourada usada como separador ou destaque:

```css
.gold-hairline {
  border-bottom: 1px solid rgba(201, 168, 76, 0.3);
}
```

Usos:
- Separador entre seções
- Underline em títulos
- Borda inferior de headers

#### Glass Blur (Glassmorphism)

Efeito de vidro fosco aplicado em overlays e headers:

```css
.glass-blur {
  background: rgba(10, 10, 11, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
```

---

### 🧊 Elementos 3D (Three.js)

O sistema incorpora elementos 3D renderizados com **Three.js** via **React Three Fiber**:

#### ColorBends

| Propriedade | Valor |
|---|---|
| **Tipo** | Fundo animado com gradientes |
| **Onde** | Página Home, Tela de Login |
| **Tecnologia** | Three.js (shader customizado) |
| **Performance** | Baixo impacto (geometria simples) |

Gradientes animados que fluem suavemente, criando um fundo visualmente rico sem distrair do conteúdo.

#### ModelViewer

| Propriedade | Valor |
|---|---|
| **Tipo** | Modelo 3D de frasco de perfume |
| **Onde** | Tela de Login |
| **Interação** | Rotação automática, drag para girar |
| **Tecnologia** | Three.js + GLTF loader |

Frasco de perfume 3D renderizado na tela de login, reforçando a identidade da marca.

#### FrascoViewer

| Propriedade | Valor |
|---|---|
| **Tipo** | Frasco 3D com indicação de nível de líquido |
| **Onde** | Módulo de Decants |
| **Interação** | Visualização do nível de líquido restante |
| **Tecnologia** | Three.js (geometria procedural) |

Representação visual 3D do frasco aberto, mostrando o **nível de líquido restante** de forma intuitiva:
- Líquido gold/âmbar animado
- Nível proporcional a `ml_restante / volume_ml`
- Frasco transparente com reflexos

---

### 🎮 Elementos Interativos

#### AnimatedButton

Botão com animações de hover e press via CSS:

| Estado | Efeito |
|---|---|
| **Idle** | Background gold, texto escuro |
| **Hover** | Brightening, leve escala (1.02) |
| **Press** | Escala reduzida (0.98), sombra interna |
| **Disabled** | Opacidade reduzida (0.5), cursor not-allowed |

#### DayNightSwitch

Toggle para alternar entre dark e light mode:

| Propriedade | Valor |
|---|---|
| **Dark mode** | Ícone de lua 🌙 com estrelas animadas |
| **Light mode** | Ícone de sol ☀️ com raios animados |
| **Transição** | Animação suave de transformação |
| **Persistência** | Preferência salva em `localStorage` |

#### UserMenu

Menu dropdown do avatar do usuário:

- Avatar com iniciais ou foto
- Dropdown com:
  - Nome do usuário
  - Email
  - Separador
  - Botão "Sair" (sign out)
- Backdrop blur no dropdown

#### Modal

Componente modal genérico reutilizável:

| Propriedade | Valor |
|---|---|
| **Backdrop** | Escuro com blur |
| **Fechamento** | Click fora, botão X, tecla Escape |
| **Animação** | Fade in + scale |
| **Scroll** | Conteúdo scrollável se necessário |

#### ImageCropper

Componente para recorte de fotos de produtos:

| Propriedade | Valor |
|---|---|
| **Onde** | Cadastro/edição de produto |
| **Formato de saída** | Quadrado (1:1) |
| **Interação** | Drag para posicionar, pinch/scroll para zoom |
| **Saída** | Blob (enviado ao Supabase Storage) |

---

### 📊 Gráficos (Recharts)

Os gráficos são implementados com a biblioteca **Recharts** e seguem o design system:

#### EvolucaoChart

| Propriedade | Valor |
|---|---|
| **Tipo** | Gráfico de linhas |
| **Dados** | Evolução mensal financeira |
| **Linhas** | Receitas (verde), Despesas (vermelho), Saldo (gold) |
| **Interação** | Tooltip customizado no hover |
| **Responsivo** | Adapta largura ao container |

#### CategoriaChart

| Propriedade | Valor |
|---|---|
| **Tipo** | Gráfico donut/pizza |
| **Dados** | Distribuição por categoria |
| **Cores** | Paleta customizada com gold como destaque |
| **Interação** | Tooltip + label percentual |
| **Centro** | Valor total no centro (donut) |

#### Charts do Dashboard de Vendas

- Gráfico de barras para vendas por canal
- Gráfico de linhas para evolução diária
- Cards com indicadores (KPIs)

---

## 📱 Responsividade

### Abordagem

O sistema segue uma abordagem **desktop-first** com otimização completa para mobile:

| Breakpoint | Largura | Layout |
|---|---|---|
| **Desktop** | ≥ 1024px | Sidebar expandida + conteúdo principal |
| **Tablet** | 768px – 1023px | Sidebar colapsada + conteúdo adaptado |
| **Mobile** | < 768px | Drawer + layout empilhado |
| **Mobile mínimo** | 360px | Layout otimizado para telas pequenas |

### Adaptações Mobile (implementado na Session 50)

| Componente | Desktop | Mobile |
|---|---|---|
| **Sidebar** | Fixa à esquerda | Drawer com overlay |
| **Cards** | Grid horizontal | Stack vertical |
| **Tabelas** | Horizontal scroll | Cards empilhados ou scroll |
| **Modais** | Centralizados | Full-screen ou bottom sheet |
| **Gráficos** | Tamanho padrão | Largura reduzida, labels simplificados |
| **Botões** | Tamanho padrão | Área de toque mínima 44x44px |

> [!TIP]
> Todas as áreas de toque em mobile respeitam o mínimo de **44×44px** recomendado pelas guidelines de acessibilidade para dispositivos touch.

---

## 🎯 Tokens CSS

### Definição de Variáveis

As cores e tokens são definidos como **variáveis CSS** no arquivo `src/styles/globals.css`:

```css
:root {
  /* Cores de base — Light Mode */
  --background: #FAFAF8;
  --surface: #F4F4F2;
  --border: #E4E4E0;
  --accent: #C9A84C;
  --text-primary: #1A1A1A;
  --text-secondary: #6B6B6B;
}

.dark {
  /* Cores de base — Dark Mode */
  --background: #0A0A0B;
  --surface: #141416;
  --border: #2A2A2E;
  --accent: #C9A84C;
  --text-primary: #FFFFFF;
  --text-secondary: #A1A1AA;
}
```

### Tailwind CSS 4

O projeto utiliza **Tailwind CSS 4** com configuração customizada:

- Classes utilitárias padrão do Tailwind
- Cores customizadas mapeadas para as variáveis CSS
- Plugins: typography, forms, aspect-ratio

### Utilitário `cn()`

Função utilitária para merge de classes CSS, combinando `clsx` + `tailwind-merge`:

```typescript
// src/lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Uso:

```tsx
<div className={cn(
  "rounded-lg p-4",
  isActive && "border-accent bg-surface",
  className
)}>
```

> [!NOTE]
> O `cn()` resolve conflitos de classes Tailwind automaticamente. Por exemplo, `cn("p-4", "p-6")` resulta em `"p-6"`, não `"p-4 p-6"`.

---

## 📎 Documentos Relacionados

- [[ARQUITETURA]] — Visão geral da arquitetura e stack tecnológico
- [[PRD]] — Requisitos do produto e funcionalidades
- [[features/AUTENTICACAO]] — Tela de login com elementos 3D
