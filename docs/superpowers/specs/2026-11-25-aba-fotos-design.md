# Aba Fotos — design

> 2026-11-25. Tamanho: pequeno. Feito em modo autônomo (/goal), sem rodada de perguntas: as escolhas abaixo são calls do Claude.

## Por quê

O Luis faz as fotos dos anúncios no Canva. Quando vai anunciar o mesmo perfume em outra plataforma (ou criar o anúncio na mão), precisa voltar ao Canva ou caçar no PC. As fotos já ficam no banco (`produto_fotos` + bucket `produtos`) quando passam pelo criador de anúncios, mas não há um lugar próprio para guardar e baixar.

## Viabilidade (Supabase free)

1 GB de Storage. As fotos sobem recortadas em JPEG (~200–400 KB): 50 perfumes × 8 fotos ≈ 150 MB. Cabe com folga. Egress é pequeno (ver na tela e baixar de vez em quando).

## Objetivos

- Tela `/anuncios/fotos`: escolher perfume e subir, ordenar, apagar e **baixar** as fotos dele.
- Baixar uma foto ou todas, com nome legível (`<perfume>-01.jpg`).
- As mesmas fotos continuam aparecendo nos criadores (ML e Shopify), sem mudança.

## Fora do escopo

- Zip (precisaria de dependência nova; baixa uma por uma).
- Mudar o recorte quadrado do upload.
- Banco: nada novo (`produto_fotos` já existe).

## Abordagens

1. **Tela nova que reaproveita `FotosPerfume` + botões de baixar no próprio componente** — escolhida: upload, ordem (arrastar e setas) e exclusão já existem e estão testados; o download fica disponível também nos criadores.
2. Tela com componente próprio — descartada: duplicaria upload/ordem/exclusão.
3. Baixar em zip com JSZip — descartada: dependência nova para algo que o navegador faz uma por uma.

## Decisões (calls do Claude)

- Download por `fetch` → `Blob` → `<a download>` (o atributo `download` não vale para URL de outra origem sem isso).
- Nome do arquivo: nome do perfume sem acento/símbolos, minúsculo, com hífens, + número com 2 dígitos + extensão da URL (padrão `jpg`).
- "Baixar todas" baixa em sequência, na ordem da tela.
- Item "Fotos" no menu do módulo Anúncios, depois de "Controle".
- Seletor de perfume: o `Select` de `FormControls`, rótulo `marca nome`, como em `PublicarShopify`.
