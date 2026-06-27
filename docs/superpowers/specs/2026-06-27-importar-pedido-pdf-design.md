# Importar Pedido por PDF

## Contexto

O fluxo atual de pedidos já permite criar um pedido manualmente, selecionar fornecedor, adicionar itens, editar pedidos aguardando e confirmar recebimento depois. A nova feature deve acelerar apenas o preenchimento dos itens do modal "Novo pedido" a partir de PDFs de pedido de venda recebidos dos fornecedores.

A maioria dos PDFs esperados é textual, com tabela parecida com o modelo da Onun: item, código/SKU, quantidade, unidade, preço unitário e total. Alguns PDFs podem variar de layout, então o fluxo precisa falhar de forma recuperável e permitir preenchimento manual.

## Objetivo

Adicionar uma opção de importar PDF dentro do modal "Novo pedido" para preencher automaticamente linhas de itens com nome, código, quantidade e preço unitário extraídos do documento.

O fornecedor continua sendo selecionado manualmente pelo usuário. A importação não cria pedido, não altera estoque e não grava dados no banco até o usuário revisar e clicar em "Criar pedido".

## Fora de Escopo

- Usar LLM no MVP.
- Identificar fornecedor automaticamente.
- Criar produto automaticamente.
- Criar pedido automaticamente após upload.
- Confirmar recebimento ou movimentar estoque.
- Persistir o PDF original no Supabase Storage.
- Suportar OCR para PDF escaneado ou imagem.

## Abordagem Escolhida

Usar parser determinístico no backend com fallback manual no frontend.

O backend recebe o PDF, extrai texto e tenta interpretar a tabela de itens. O frontend recebe os itens extraídos, tenta casar cada item com produtos já cadastrados e deixa itens sem match pendentes para o usuário resolver manualmente.

Esse caminho evita custo e latência de LLM, preserva previsibilidade e combina com PDFs textuais selecionáveis. Se no futuro os PDFs divergirem muito, uma LLM pode ser adicionada como fallback separado.

## Arquitetura

### Backend

Adicionar endpoint protegido no FastAPI:

```http
POST /api/estoque/pedidos/importar-pdf
Content-Type: multipart/form-data
Authorization: Bearer <Supabase JWT>
```

Entrada:

- `file`: PDF enviado pelo usuário.

Saída de sucesso:

```json
{
  "itens": [
    {
      "nome": "LATTAFA ASAD BOURBON EDP 100ML",
      "codigo": "DB-LA340362",
      "qtd": 4,
      "preco_unitario": 169.99,
      "total": 679.96
    }
  ],
  "avisos": []
}
```

Responsabilidades do backend:

- Validar que o arquivo é PDF.
- Extrair texto de PDF textual.
- Detectar a tabela de itens.
- Interpretar linhas com nome, código/SKU, quantidade, preço unitário e total.
- Normalizar números em formato brasileiro, como `1,00` e `169,99`.
- Retornar avisos quando linhas forem ignoradas ou parcialmente ilegíveis.
- Não consultar nem alterar o banco.

### Frontend

Modificar `NovoPedidoModal` para adicionar o botão "Importar PDF" na seção de itens.

Responsabilidades do frontend:

- Enviar o arquivo para o endpoint do backend usando o JWT da sessão Supabase.
- Mostrar estado de carregamento enquanto o PDF é processado.
- Receber os itens extraídos.
- Tentar casar itens com produtos já carregados no modal.
- Preencher quantidade e preço unitário nas linhas do pedido.
- Manter itens não casados como pendentes, exibindo o nome extraído.
- Permitir edição manual normal depois da importação.

## Casamento de Produtos

O match inicial será por nome normalizado:

- caixa alta/baixa ignorada;
- acentos removidos;
- espaços múltiplos comprimidos;
- pontuação simples ignorada quando não muda o significado;
- comparação exata do nome normalizado.

Se houver match único, o `produto_id` é preenchido.

Se não houver match, a linha fica sem `produto_id` e mostra o nome extraído para o usuário selecionar manualmente ou cadastrar o produto pelo fluxo existente de cadastro rápido.

Se houver match ambíguo, a linha também fica pendente para seleção manual. O sistema não deve escolher entre produtos ambíguos.

## UX

No `NovoPedidoModal`, dentro da seção "Itens", ao lado de `+ Cadastrar produto`, adicionar botão secundário "Importar PDF".

Fluxo:

1. Usuário seleciona fornecedor manualmente.
2. Usuário clica em "Importar PDF".
3. Usuário escolhe o arquivo PDF.
4. Modal mostra "Lendo PDF...".
5. Itens extraídos substituem as linhas atuais do pedido.
6. Itens encontrados automaticamente aparecem com produto selecionado, quantidade e preço.
7. Itens não encontrados exibem aviso discreto com o nome extraído.
8. Usuário revisa, corrige, cadastra produto se necessário e cria o pedido.

Se já houver itens preenchidos no modal, a importação substitui a lista atual. Essa regra é simples, previsível e evita misturar dados antigos com dados importados.

## Tratamento de Erros

Mensagens devem ser exibidas dentro do modal sem fechar o pedido.

Casos:

- arquivo não é PDF;
- PDF sem texto extraível;
- tabela de itens não encontrada;
- nenhum item encontrado;
- quantidade ou preço ilegível;
- falha de rede ou backend;
- resposta inválida da API.

Em qualquer erro, os itens atuais permanecem como estão e o usuário pode continuar preenchendo manualmente.

## Segurança

O endpoint exige JWT Supabase válido, seguindo o padrão dos endpoints FastAPI atuais. O arquivo PDF é processado em memória ou em arquivo temporário descartável no backend e não é salvo permanentemente.

## Testes

### Backend

- Parser extrai itens de texto no formato do PDF Onun.
- Parser converte números brasileiros corretamente.
- Endpoint rejeita arquivo não PDF.
- Endpoint retorna erro claro quando não há texto ou tabela de itens.
- Endpoint não acessa Supabase nem grava banco.

### Frontend

- Botão "Importar PDF" aparece no `NovoPedidoModal`.
- Upload chama o endpoint com `Authorization`.
- Itens com match único preenchem produto, quantidade e preço.
- Itens sem match ficam pendentes com nome extraído visível.
- Erro de importação preserva itens já preenchidos.
- Validação atual impede criar pedido com item importado sem produto.

## Critérios de Aceite

- Usuário consegue importar um PDF textual de pedido e ver os itens preenchidos no modal "Novo pedido".
- Fornecedor é sempre escolhido manualmente.
- Pedido só é salvo quando o usuário clica em "Criar pedido".
- Itens sem produto cadastrado não são salvos até o usuário resolver manualmente.
- Fluxo manual existente continua funcionando sem regressão.
- Testes backend e frontend relevantes passam.
