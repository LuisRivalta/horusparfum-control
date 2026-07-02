# Importacao PDF com Parser Robusto e Match Inteligente

## Objetivo

Melhorar a importacao de PDFs de pedidos para extrair itens corretamente em PDFs textuais do fornecedor Onuh e reconhecer produtos cadastrados mesmo quando o nome do PDF nao for identico ao cadastro.

## Escopo

- Ajustar o parser backend para ignorar cabecalho, cliente, totais e demais linhas fora da tabela de itens.
- Suportar itens em dois formatos comuns:
  - nome/codigo/GTIN/NCM em linhas separadas, seguido de `qtd un preco total`;
  - nome, NCM, quantidade, unidade, preco e total na mesma linha.
- Retornar avisos quando o numero de itens extraidos divergir do numero declarado no PDF.
- Melhorar o matching frontend:
  - match exato normalizado continua com prioridade;
  - fallback por similaridade de tokens;
  - volume em ml aumenta confianca quando coincide;
  - matches fortes selecionam automaticamente;
  - ambiguos ou fracos ficam pendentes para selecao manual.

## Fora de escopo

- LLM ou OCR neste ciclo.
- Gravacao automatica no banco durante a importacao.
- Cadastro automatico de produtos nao encontrados.

## UX

O botao "Importar PDF" continua no modal de Novo pedido. A importacao preenche itens reconhecidos automaticamente e mantem os demais pendentes, com mensagem de "Produto nao encontrado" ou "Produto ambiguo" quando a confianca nao for suficiente.

## Validacao

- Testes backend cobrem parser Onuh com linhas separadas e inline.
- Testes frontend cobrem match exato, fuzzy forte, match fraco e ambiguo.
- Suite frontend, backend e build devem passar antes de finalizar.
