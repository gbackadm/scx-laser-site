# Area administrativa local

Esta base cria uma area administrativa local com login real, sessoes seguras,
catalogo em PostgreSQL e importacao manual da Asia Import. Segredos devem ficar
somente em `.env.local` ou variaveis do ambiente.

## Rotas

- `/admin/login`: login real da area administrativa local.
- `/admin/catalogo`: painel de catalogo com busca, filtros, status, categoria,
  preco, estoque e links de revisao.
- `/admin/catalogo/[id]/editar`: revisao/edicao de produto, imagens,
  publicacao/despublicacao e auditoria.
- `/admin/importacao`: importacao manual da Asia Import e conversao de itens
  importados em rascunhos.
- `/catalogo`: catalogo publico novo, listando apenas produtos publicados.

## Variaveis de ambiente

Copie `.env.example` para `.env.local` no desenvolvimento local.

```bash
ADMIN_DEMO_MODE=enabled
```

Nao versionar `.env.local`. Quando houver autenticacao real, adicionar variaveis
como `AUTH_SECRET`, credenciais do provedor e `DATABASE_URL` apenas em ambiente
seguro.

Para usar o PostgreSQL local restaurado, adicione tambem:

```bash
DATABASE_URL=postgresql://usuario:senha@localhost:5433/scx_db
```

Se o site estiver rodando dentro do Docker e o PostgreSQL estiver exposto no host,
troque `localhost` por `host.docker.internal`.

Depois crie/verifique as tabelas do catalogo:

```bash
npm run db:migrate
npm run db:check
```

Esses comandos criam apenas tabelas com prefixo `scx_catalog_` e nao apagam nem
sobrescrevem dados restaurados.

## Desenvolvimento sem Docker

```bash
npm install
npm run dev
```

Depois acesse `http://localhost:3000/admin/login`.

## Execucao com Docker

```bash
docker compose up --build
```

Depois acesse `http://localhost:3000/admin/login`.

## Autenticacao local

O admin usa sessao opaca em cookie `HttpOnly`, `SameSite=Lax`, caminho `/admin`
e `Secure` automaticamente em producao. A senha e armazenada com hash `scrypt`;
senha em texto puro nunca deve ser gravada em arquivo, codigo ou banco.

Antes do primeiro login, rode as migracoes:

```bash
npm run db:migrate
```

Depois crie o primeiro usuario administrativo com o comando interativo:

```bash
npm run admin:create-user
```

O comando pede nome, e-mail, papel (`owner`, `manager` ou `seller`) e senha. Nao
existe usuario padrao nem senha fixa.

Para encerrar a sessao, use o botao `Sair` no painel.

## Papeis iniciais

| Papel | Uso esperado |
| --- | --- |
| `owner` | Proprietario, com permissao total prevista para catalogo, usuarios e auditoria. |
| `manager` | Gestor, com permissao prevista para catalogo, publicacao, importacao e auditoria. |
| `seller` | Vendedor, com permissao de visualizacao do catalogo. |

## Importacao Asia Import

O manual da Asia Import descreve chamadas `POST` para
`https://api.asiaimport.com.br/` usando `form-data` com `api_key`,
`secret_key`, `funcao=listarProdutos2` e filtros opcionais como `pagina`,
`por_pagina`, `nome`, `referencia`, `cor` e `status`.

Cadastre as credenciais somente em `.env.local` ou no ambiente local:

```bash
ASIA_IMPORT_API_KEY=sua_chave
ASIA_IMPORT_SECRET_KEY=sua_senha_api
ASIA_IMPORT_BASE_URL=https://api.asiaimport.com.br/
```

Depois reinicie a previa e acesse:

```text
http://localhost:3004/admin/importacao
```

A primeira sincronizacao manual limita `por_pagina` a no maximo 10 produtos.
Produtos entram em `scx_catalog_supplier_products` como `pending_review`. Eles
nao sao publicados automaticamente. Ao clicar em `Criar rascunho`, o item entra
em `scx_catalog_products` com `publication_status='draft'` e abre a tela de
revisao.

## Revisao e publicacao

Use `/admin/importacao` para revisar produtos importados e criar rascunhos. Use
`/admin/catalogo` para buscar e abrir cada rascunho em
`/admin/catalogo/[id]/editar`.

Na tela de edicao e possivel ajustar titulo, descricao, categoria, preco de
venda, estoque, status interno e URLs de imagens publicas. Custos, payload bruto
e dados do fornecedor continuam restritos ao banco/admin e nao aparecem em
`/catalogo`.

Permissoes:

| Papel | Permissao no fluxo |
| --- | --- |
| `owner` | Edita, publica, despublica e importa. |
| `manager` | Edita, publica, despublica e importa. |
| `seller` | Visualiza o catalogo administrativo em modo somente leitura. |

Produtos so aparecem em `/catalogo` quando `publication_status='published'`.
Rascunhos e ocultos permanecem fora do catalogo publico.

## Proxima etapa minima para evoluir autenticacao

1. Definir politica de troca/recuperacao de senha.
2. Decidir se o catalogo publico tera pagina individual por produto.
3. Confirmar fonte final de imagens e regras de preco/margem.
4. Integrar banco/API definitiva quando o modelo de dados real for confirmado.
