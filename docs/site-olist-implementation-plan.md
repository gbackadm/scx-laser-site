# Plano para levar Olist/Tiny ao site

Este documento define o passo a passo para transformar os scripts de
sincronizacao Olist/Tiny em funcionalidades da aplicacao SCX, sem refazer o
fluxo nem subir produto incorreto.

## Estado de partida

- Projeto GitHub remoto: `https://github.com/gbackadm/scx-laser-site`.
- Branch usada como base: `main`.
- Commit atual do GitHub/local base: `c47c859c`.
- Build Netlify configurado em `netlify.toml`:

```text
npm run db:migrate && npm run build
```

Foi criada uma copia limpa do GitHub em:

```text
C:\Users\gabri\Documents\SCX Laser\scx-laser-site-github-current
```

O trabalho de integracao continua em:

```text
C:\Users\gabri\Documents\SCX Laser\scx-laser-site
```

## Regra principal

O site nunca deve enviar produto direto ao Olist sem passar por:

1. Normalizacao.
2. Validacao.
3. Simulacao.
4. Envio controlado.
5. Registro de retorno.

Normalizacao nao e desculpa para subir produto ruim. O sistema deve tentar
normalizar todos os formatos conhecidos. Depois disso, se faltar dado crucial,
o produto deve ficar bloqueado com motivo claro.

## Regras do conector

| Tema | Regra |
| --- | --- |
| Fonte da verdade | Supabase/SCX |
| Canal | Olist/Tiny |
| SKU no canal | `scx_sku` |
| Codigo fornecedor | codigo Asia/fornecedor |
| ID Olist | salvo em `scx_catalog_product_channel_mappings` |
| Estoque minimo ativo | `publication_stock_min_quantity`, padrao 1000 |
| Estoque abaixo de 1000 | envia para Olist, mas `situacao = I` |
| Produto publicado e estoque >= 1000 | `situacao = A` |
| Produto hidden/out_of_stock | `situacao = I` |
| Produto draft | nao entra no envio |
| Imagens | somente `imagens_externas`, maximo 10 URLs |
| Nome no Olist | nome comercial + SKU SCX para evitar duplicidade |
| Categoria | arvore com `>>` |
| Etapas | sempre enviar padrao SCX ou etapas especificas |
| Estrutura/kit | apenas se houver componentes reais |

## Campos cruciais

Produto so pode ir ao Olist se, depois da normalizacao, tiver:

- SKU SCX.
- Nome.
- Preco de venda.
- Custo.
- NCM.
- Peso.
- Altura.
- Largura.
- Comprimento.
- Pelo menos uma imagem.
- Fornecedor mapeado no Olist.

## Etapas de implementacao no site

### Etapa 1 - Consolidar dominio compartilhado

Criar uma camada reutilizavel para montar payload Olist, hoje concentrada nos
scripts. Essa camada deve conter:

- normalizadores de medida, peso, NCM, imagem e categoria;
- validador de elegibilidade;
- decisor de situacao ativo/inativo;
- montagem de payload Tiny/Olist;
- controle de lote e limite de API.

Resultado esperado:

- Scripts passam a usar essa camada.
- Futuras rotas do site usam a mesma camada.
- Nao existe regra duplicada entre script e aplicacao.

### Etapa 2 - Persistir relatorio de simulacao

Criar tabela de execucao de envio Olist com:

- ID da execucao.
- Usuario.
- Modo: simulacao ou envio.
- Total avaliado.
- Total elegivel.
- Total bloqueado.
- Total ativo/inativo.
- Total criar/atualizar.
- Motivos de bloqueio.
- Inicio/fim/status.

Resultado esperado:

- Toda simulacao fica rastreavel.
- O painel consegue abrir historico de lotes.

### Etapa 3 - Criar rotas internas do admin

Criar endpoints autenticados:

- `POST /admin/api/olist/simular`
- `POST /admin/api/olist/enviar`
- `GET /admin/api/olist/execucoes`
- `GET /admin/api/olist/execucoes/:id`

Resultado esperado:

- O site consegue simular antes de enviar.
- Envio sem simulacao deve ser bloqueado.

### Etapa 4 - Criar tela no admin

Criar tela em `/admin/olist` com:

- botao `Simular envio`;
- resumo de elegiveis/bloqueados;
- contagem de ativos/inativos;
- lista de bloqueios por motivo;
- lista de produtos que serao criados;
- lista de produtos que serao atualizados;
- botao `Enviar elegiveis`;
- historico de execucoes.

Resultado esperado:

- Operador entende o que vai acontecer antes de enviar.
- Produto bloqueado mostra link para correcao.

### Etapa 5 - Envio controlado

Executar envio em lotes:

- maximo 20 produtos por chamada;
- maximo 5 chamadas de lote por minuto;
- salvar ID Olist a cada retorno OK;
- registrar erros por produto;
- permitir reprocessar apenas falhas.

Resultado esperado:

- Sem duplicar produto.
- Sem estourar limite da API.
- Falha parcial nao perde o lote inteiro.

### Etapa 6 - Rotina diaria

Criar rotina para atualizar pelo menos:

- estoque;
- situacao ativo/inativo;
- preco quando regra mudar;
- dados gerais quando produto for corrigido.

Resultado esperado:

- Produto com estoque abaixo de 1000 fica inativo no canal.
- Produto corrigido e com estoque suficiente volta ativo.

## Ordem pratica que vamos seguir agora

1. [feito] Comparar projeto limpo do GitHub com a pasta atual.
2. [feito] Separar codigo reaproveitavel dos scripts em modulo de dominio.
3. [feito] Fazer os scripts usarem o modulo novo.
4. [feito] Rodar simulacao e garantir que o resultado continua 79/79.
5. [feito] Criar tabela de execucao Olist.
6. [feito] Criar rota de simulacao.
7. [feito] Criar tela minima de simulacao.
8. [pendente] So depois criar rota de envio pela tela.

## Implementacao iniciada no site

Arquivos adicionados:

- `src/domain/olist/core.js`: regras de normalizacao, validacao, ativo/inativo,
  payload Tiny/Olist e resumo de lote.
- `src/domain/olist/core.d.ts`: tipos usados pelo Next.
- `src/domain/olist/package.json`: marca a pasta como modulo ES para o Node.
- `src/domain/olist/repository.ts`: consulta no Supabase para simular o lote.
- `src/app/admin/api/olist/simular/route.ts`: rota interna autenticada.
- `src/app/admin/olist/page.tsx`: tela inicial do Olist no admin.
- `src/components/admin/OlistSimulationPanel.tsx`: painel de simulacao.
- `db/migrations/018_olist_sync_settings_and_runs.sql`: configuracoes Olist
  e historico de execucoes.
- `src/app/admin/olist/actions.ts`: salvamento das configuracoes pelo admin.
- `src/app/admin/api/olist/rotina/route.ts`: rota protegida para rotina.
- `netlify/functions/olist-scheduled.mjs`: funcao Netlify agendada a cada hora.

Estado atual:

- A tela ja simula e salva historico.
- O painel permite alterar origem fiscal, tamanho de lote, limite de chamadas,
  rotina automatica e intervalo.
- O botao de envio real existe apenas desabilitado.
- A rota de simulacao usa a permissao `supplier:import`.
- A simulacao nao chama a API do Olist/Tiny.
- O script `scripts/olist-bulk-products.mjs` ja usa o modulo comum.
- A rotina Netlify roda a cada hora e consulta o banco para decidir se executa.
- Por seguranca, a rotina automatica atual registra simulacao; envio automatico
  fica bloqueado ate a rota de envio controlado ser criada.
- Build do site passou.
- Migration `018_olist_sync_settings_and_runs.sql` aplicada no Supabase.
- Simulacao final: 79 avaliados, 79 elegiveis, 0 bloqueados, 59 ativos,
  20 inativos, 0 criacoes, 79 atualizacoes, 4 chamadas estimadas.
- Proximo passo antes do envio: criar rota de envio controlado reaproveitando
  uma simulacao salva.

## Rotina automatica Asia Import

Tambem foi criada uma rotina recorrente para manter os produtos da Asia Import
atualizados no banco SCX.

Arquivos adicionados/alterados:

- `db/migrations/019_supplier_auto_sync_settings.sql`: configuracao da rotina
  por fornecedor.
- `src/domain/suppliers/asiaImportRepository.ts`: execucao em lote dos produtos
  Asia vinculados ao catalogo.
- `src/app/admin/api/asia/rotina/route.ts`: rota protegida para a rotina.
- `netlify/functions/asia-import-scheduled.mjs`: funcao agendada Netlify.
- `src/app/admin/importacao/page.tsx`: painel de configuracao da rotina.
- `src/app/admin/importacao/actions.ts`: salvamento das configuracoes.

Estado atual da Asia Import:

- Rotina ativa.
- Intervalo: 10 minutos.
- Lote: 10 produtos por execucao.
- Filtro: todos os produtos da Asia.
- A rotina atualiza produtos ja vinculados ao catalogo, priorizando os mais
  antigos por `last_imported_at`.
- Ultimo teste executado: 10 produtos atualizados.
- Proxima execucao calculada pelo banco a partir da configuracao.

## Criterios de seguranca

- Nunca sobrescrever mudancas locais sem revisao.
- Nunca enviar produto sem simulacao.
- Nunca ativar produto com estoque abaixo de 1000.
- Nunca usar codigo Asia como SKU do canal.
- Nunca usar tag como ficha tecnica.
- Nunca enviar mais de 10 imagens externas.
- Nunca inventar kit/estrutura sem componentes reais.
