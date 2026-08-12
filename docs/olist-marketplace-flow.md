# Fluxo Olist/Tiny para marketplace

Este documento define como a aplicacao SCX deve enviar produtos ao Olist/Tiny em
massa. O objetivo e evitar que o fluxo precise ser redesenhado quando virar tela
no site.

## Fonte da verdade

O banco SCX/Supabase e a fonte da verdade. O Olist/Tiny e um canal de
distribuicao para marketplaces, nao o cadastro mestre.

Todo produto enviado ao Olist deve nascer de:

- `scx_catalog_products`: produto curado SCX.
- `scx_catalog_supplier_products`: dados brutos do fornecedor, como Asia Import.
- `scx_catalog_product_images`: imagens do produto.
- `scx_catalog_supplier_channel_mappings`: fornecedor cadastrado no canal.
- `scx_catalog_product_channel_mappings`: ID externo do produto no Olist.
- `scx_catalog_product_variants`: SKU, grade, preco, custo e estoque de cada
  opcao vendavel.
- `scx_catalog_product_variant_images`: imagens especificas de cada variacao.
- `scx_catalog_product_variant_channel_mappings`: ID externo de cada variacao
  no Olist.
- `scx_catalog_product_components`: componentes reais de kit/estrutura, quando
  houver.
- `scx_catalog_product_production_steps`: etapas especificas do produto, quando
  houver.

## Identidade do produto

| Campo | Regra |
| --- | --- |
| SKU no Olist/Tiny | Sempre SKU SCX (`scx_sku`). |
| Codigo do fornecedor | Codigo do fornecedor (`SupplierProduct.externalId`). |
| ID do Olist | Salvo em `scx_catalog_product_channel_mappings.external_id`. |
| SKU da variacao | SKU SCX filho, unico e com no maximo 30 caracteres. |
| ID da variacao no Olist | Salvo por SKU filho para atualizacoes sem duplicidade. |

Exemplo:

| Campo | Valor |
| --- | --- |
| SKU no canal | `SCX-CAN-0006` |
| Codigo pelo fornecedor | `CM17725B` |
| Fornecedor | `Asia Import` |

## Titulo comercial

O titulo e texto de venda. SKU SCX, codigo do fornecedor e ID do canal ficam
somente nos campos de identificacao e nunca devem ser anexados ao nome.

Regra automatica para todo produto novo ou atualizado:

- limpar espacos, simbolos e pontuacao desnecessaria;
- expandir abreviacoes como `c/` e `Conj.`;
- remover SKU SCX, codigo do fornecedor, condicao e chamadas promocionais;
- preservar palavras inteiras ao atingir o limite;
- usar 60 caracteres como teto conservador para Mercado Livre;
- aceitar limite informado pelo canal/categoria quando a integracao o fornecer;
- manter variacao de cor, tamanho e modelo na grade, sem repetir no titulo pai.

O formato comercial segue `produto + marca + modelo + especificacao relevante`,
somente quando os dados forem conhecidos. A funcao central e
`buildMarketplaceTitle`; cadastro manual, Asia Import e Olist usam a mesma
regra.

## Elegibilidade

O envio em massa deve avaliar todos os produtos com status:

- `published`
- `hidden`
- `out_of_stock`

Produtos `draft` nao entram no envio.

O produto so pode ser enviado se tiver:

- SKU SCX.
- Nome.
- Preco de venda maior que zero.
- Custo maior que zero.
- NCM.
- Peso do produto normalizado.
- Medidas normalizadas.
- Pelo menos uma imagem.
- Fornecedor mapeado no Olist.
- Quando houver variacoes: pelo menos uma ativa, SKU SCX filho, codigo do
  fornecedor, preco, custo e grade sem duplicidade.

Se faltar algum dado, o produto fica bloqueado e o motivo aparece no relatorio
do lote. Produto bloqueado nao deve ser enviado manualmente para contornar regra.

Estoque abaixo do minimo de publicacao nao bloqueia envio ao Tiny/Olist. O
produto deve ser cadastrado/atualizado no canal, mas com `situacao = I`
inativo. O minimo atual vem de `publication_stock_min_quantity` da regra global
de precos/publicacao; o padrao e 1000 unidades.

## Dados gerais

Dados gerais do Tiny/Olist recebem os campos operacionais:

- SKU SCX em `codigo`.
- Titulo comercial limpo em `nome`, sem SKU SCX ou codigo do fornecedor.
- Unidade `UN`.
- Preco de venda calculado.
- Preco de custo.
- NCM.
- Origem ICMS.
- Situacao: `A` somente quando `published` e estoque maior ou igual ao minimo de
  publicacao; `I` quando `hidden`, `out_of_stock` ou estoque abaixo do minimo.
- Tipo `P`.
- Classe do produto `S` para simples e `V` quando houver variacoes.
- Categoria em arvore com `>>`.
- Descricao complementar limpa.
- Estoque atual.
- Fornecedor e codigo pelo fornecedor.
- Unidade por caixa.
- Peso liquido e bruto.
- Tipo e medidas de embalagem.
- Dias de preparacao.
- Imagens externas por URL. Nao usar `anexos` no envio em massa, porque o
  Tiny/Olist pode rejeitar imagens baixadas acima de 2 MB.
- Enviar no maximo 10 URLs de imagens externas por produto, limite aceito pelo
  Tiny/Olist.
- SEO.

## Categoria

A categoria enviada ao Olist deve usar a arvore do fornecedor quando existir em
`raw_payload.categorias`.

Exemplo:

```text
Canetas >> Metalicas >> Escritorio >> Touch
```

Se a arvore do fornecedor nao existir, usar a categoria curada do SCX.

## Descricao

A descricao complementar deve ser texto comercial limpo. Nao colocar ficha
tecnica, medidas, caixa-mae ou tags dentro da descricao.

## Ficha tecnica e atributos

A aba `Ficha tecnica > Atributos` e camada de enriquecimento para anuncios e
canais como Mercado Livre e Shopee.

Esses atributos podem nascer dos dados da Asia, do SCX ou de regras por
categoria, mas nao devem ser enviados como tags nem como descricao.

Enquanto a API correta para essa aba nao estiver implementada, os atributos ficam
estruturados no banco em `scx_catalog_product_attributes`.

## Variacoes

Variacao nao e tag e nao e ficha tecnica. Ela representa uma opcao compravel do
mesmo produto pai, como uma combinacao de cor, tamanho, capacidade ou modelo.

Cada variacao guarda:

- SKU SCX filho e codigo correspondente no fornecedor;
- nome da opcao;
- preco, custo e estoque proprios;
- grade flexivel com ate tres pares, como `Cor=Azul` e `Tamanho=G`;
- imagens proprias opcionais, herdando as fotos do produto quando vazias;
- ID retornado pelo Olist para atualizacoes futuras.

No envio, o pai recebe `classe_produto = V` e cada filho entra em `variacoes`
com `codigo`, `preco`, `estoque_atual` e `grade`. Variacao desativada que ja
existe no Olist continua no payload com estoque zero para nao permanecer
vendavel no canal.

Todas as variacoes do mesmo pai devem usar exatamente os mesmos nomes de grade.
Na Asia, a chave original do atributo vira o nome (`cor` -> `Cor`) e o campo
`value` vira o valor (`Azul`). Como a API nao aceita acrescentar a primeira grade
a um produto simples existente, a migracao usa duas chamadas: o cadastro antigo
e inativado, recebe um codigo deterministico `LEG-*` e um nome marcado com seu
ID antigo; somente se isso for confirmado e criado um novo pai variavel com o
SKU SCX e o nome originais. O ID novo substitui o antigo no mapeamento do banco.

O cadastro manual exige pelo menos uma variacao. Fotos gerais do produto sao
obrigatorias e validadas novamente no servidor. A Asia Import e normalizada para
as mesmas tabelas, portanto o fluxo do Olist nao depende do formato original do
fornecedor.

## Kit, estrutura e etapas

Etapas de producao devem ser enviadas em todo produto novo.

Se o produto nao tiver etapas especificas cadastradas, usar o padrao SCX:

1. Separacao fornecedor.
2. Conferencia SCX.
3. Personalizacao e embalagem.
4. Expedicao.

Kit/estrutura so deve ser enviado quando houver componentes reais cadastrados em
`scx_catalog_product_components`.

Produto simples da Asia, sem componentes, nao deve receber estrutura inventada.

## Envio em massa

O script de massa e:

```powershell
node scripts\olist-bulk-products.mjs --all
```

Esse comando faz apenas simulacao e mostra:

- total selecionado;
- total elegivel;
- total bloqueado;
- motivos de bloqueio;
- quantos serao criados;
- quantos serao atualizados;
- chamadas estimadas da API;
- tempo estimado.

Para enviar:

```powershell
node scripts\olist-bulk-products.mjs --all --execute
```

O envio respeita:

- lote maximo de 20 produtos;
- maximo de 5 chamadas de lote por minuto;
- migracoes simples -> variavel consomem dois lotes e respeitam o mesmo limite;
- produtos com ID Olist salvo sao atualizados;
- produtos sem ID Olist salvo sao criados;
- retornos OK gravam/atualizam o mapeamento no banco.
- erro geral do provedor interrompe os lotes seguintes e marca os mapeamentos
  afetados como `failed`; uma resposta de erro nunca e tratada como sucesso.
- atualizacoes em massa carregam as variacoes e seus IDs antes de montar o
  payload, preservando a classe `V` e a grade existente.

Em 12/08/2026, a simulacao de atualizacao encontrou 93 produtos elegiveis e
nenhum bloqueio. A execucao foi recusada pelo Olist/Tiny com `Plano nao tem
acesso a API`; por isso os mapeamentos foram marcados como falha e os nomes do
canal nao foram alterados. Antes da proxima execucao, regularizar o acesso da
conta a API ou migrar o conector para o endpoint autorizado pelo plano.

## Tela no site

A tela do admin possui:

- botao `Simular envio Olist`;
- botao `Enviar elegiveis`;
- resumo de elegiveis e bloqueados;
- lista de bloqueios por motivo;
- status por produto: novo, atualizar, bloqueado, erro ou enviado;
- link para corrigir produto bloqueado;
- log do payload enviado e resposta recebida;
- acao para reprocessar somente falhas.

O envio manual e a rotina automatica passam pelo mesmo validador. A rotina roda
a cada hora, processa um lote logico de ate vinte registros por execucao e
prioriza produtos nunca sincronizados ou com sincronizacao mais antiga.
Migracoes podem usar duas chamadas dentro desse lote. Essa divisao evita o
limite de tempo da funcao Netlify. Todo resultado fica registrado em
`scx_olist_sync_runs`.

A concorrencia e controlada por uma reserva atomica de `next_auto_sync_after`.
Ela nao usa bloqueio de sessao, portanto uma funcao interrompida nao consegue
prender as execucoes seguintes.

Se o Tiny confirmar a criacao, mas a funcao for interrompida antes de salvar os
IDs, a tentativa seguinte detecta o erro de SKU duplicado, pesquisa o pai pelo
SKU SCX, obtem os filhos e recompõe ate cinco mapeamentos por execucao. Nenhum
produto e recriado durante essa recuperacao.
