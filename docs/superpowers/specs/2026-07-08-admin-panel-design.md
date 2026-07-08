# Painel admin simples

## Contexto

O Horus usa Supabase Auth no frontend e valida JWT no FastAPI. CRUDs simples usam Supabase direto no frontend, mas acoes administrativas destrutivas nao podem expor service_role no navegador. A feature adiciona um painel admin minimo para controlar logins e excluir dados por acoes prontas, sem SQL livre.

## Objetivos

- Criar uma area /admin acessivel apenas ao usuario byhorusco@gmail.com.
- Permitir listar, criar e remover usuarios do Supabase Auth.
- Permitir exclusoes destrutivas em cascata por entidade, com confirmacao forte.
- Manter SUPABASE_SERVICE_ROLE_KEY exclusivamente no backend.
- Retornar resumo auditavel do que foi removido em cada acao.

## Fora de escopo

- SQL livre no navegador.
- Lixeira, restauracao ou soft delete.
- Sistema completo de papeis/permissoes.
- Auditoria persistida em tabela propria. O MVP retorna resumo na resposta da API.
- Edicao de usuarios existentes ou reset de senha avancado.

## Acesso e seguranca

- O frontend mostra rota e atalho admin apenas quando o email da sessao for byhorusco@gmail.com.
- A autorizacao real fica no backend em uma dependency get_admin_user.
- get_admin_user reutiliza o JWT validado pelo Supabase Auth e rejeita qualquer email diferente de byhorusco@gmail.com com 403.
- Endpoints admin usam somente o client backend com service role.
- O admin nao pode remover o proprio usuario byhorusco@gmail.com pela tela.

## Experiencia da tela

A tela /admin usa o layout interno existente e tem duas abas.

### Logins

- Lista usuarios do Supabase Auth com email, criacao e ultimo login quando disponivel.
- Botao para criar login com email e senha temporaria.
- Botao para remover login com confirmacao.
- Bloqueia remocao do proprio admin.

### Exclusoes

- Filtro por entidade: produtos, pedidos, vendas, transacoes, contas, metas, categorias, marcas, fornecedores, canais e embalagens.
- Busca simples por nome, numero ou descricao conforme a entidade.
- Cada linha tem acao Excluir.
- A confirmacao exige digitar EXCLUIR antes de chamar a API.
- Apos sucesso, exibe resumo retornado pelo backend e atualiza a lista.

## Backend

- Criar backend/app/routers/admin.py e registrar em app.main com prefixo /api/admin.
- Adicionar get_admin_user em backend/app/auth/deps.py.
- Criar service backend/app/services/admin.py com funcoes pequenas por entidade.
- Endpoints principais:
  - GET /api/admin/users
  - POST /api/admin/users
  - DELETE /api/admin/users/{user_id}
  - GET /api/admin/{entity} para listar itens excluiveis
  - DELETE /api/admin/{entity}/{id} para exclusao destrutiva

## Exclusao em cascata

As rotinas serao explicitas por entidade. Nada de executor SQL livre.

- Venda: remove transacoes vinculadas, itens da venda, decants gerados pela venda quando houver, e a venda.
- Pedido: remove divergencias, itens e pedido.
- Produto: remove dependencias operacionais ligadas ao produto, incluindo movimentacoes, itens e divergencias de pedido relacionadas, frascos e decants, itens e vendas afetadas e transacoes dessas vendas, depois o produto.
- Cadastros: categoria, marca, fornecedor, canal e embalagem terao rotina propria para resolver vinculos relacionados antes do delete quando aplicavel.
- Financeiro simples: transacoes, contas e metas apagam direto.

Cada delete retorna um resumo estruturado com contadores por tabela removida.

## Frontend

- Criar frontend/src/pages/admin/Admin.tsx.
- Registrar rota protegida em App.tsx.
- Adicionar entrada discreta no menu ou no UserMenu apenas para o admin.
- Reutilizar padroes visuais existentes: abas, tabelas, botoes, modal de confirmacao e formatBRL quando houver valores monetarios.
- Usar o JWT da sessao Supabase no header Authorization Bearer token para chamadas ao FastAPI.

## Tratamento de erros

- 401: sessao invalida ou expirada; o frontend mostra erro e orienta relogar.
- 403: usuario nao autorizado; esconder atalhos no frontend e mostrar mensagem simples se acessado diretamente.
- Erros de FK ou inconsistencia: backend retorna 400 com mensagem clara e nenhum resumo de sucesso.
- Falhas parciais devem ser reduzidas com operacoes ordenadas e validacoes previas. Sem RPC administrativa no MVP, nao ha promessa de rollback automatico entre multiplas chamadas; o service deve parar no primeiro erro e retornar mensagem clara.

## Testes

Backend:

- get_admin_user libera byhorusco@gmail.com e rejeita outro email com 403.
- Rotas admin exigem autenticacao.
- Usuarios: listar, criar e remover com Supabase client mockado.
- Exclusoes: validar ordem e resumo usando client mockado para produto, venda e pedido.

Frontend:

- Painel e atalho admin aparecem apenas para byhorusco@gmail.com.
- Usuario comum nao ve atalho e acesso direto mostra bloqueio.
- Confirmacao de exclusao exige digitar EXCLUIR.
- Fluxos de criar e remover usuario chamam endpoints corretos e exibem erro ou sucesso.

## Decisoes aprovadas

- Acesso exclusivo ao email byhorusco@gmail.com.
- Controle de logins inclui listar, criar e remover usuarios.
- Exclusoes cobrem dados operacionais e cadastros.
- Exclusao e destrutiva em cascata, com confirmacao forte.
- Implementacao escolhida: endpoints FastAPI por entidade, nao SQL livre e nao RPCs administrativas no MVP.
