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

Exemplo:

| Campo | Valor |
| --- | --- |
| SKU no canal | `SCX-CAN-0006` |
| Codigo pelo fornecedor | `CM17725B` |
| Fornecedor | `Asia Import` |

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

Se faltar algum dado, o produto fica bloqueado e o motivo aparece no relatorio
do lote. Produto bloqueado nao deve ser enviado manualmente para contornar regra.

Estoque abaixo do minimo de publicacao nao bloqueia envio ao Tiny/Olist. O
produto deve ser cadastrado/atualizado no canal, mas com `situacao = I`
inativo. O minimo atual vem de `publication_stock_min_quantity` da regra global
de precos/publicacao; o padrao e 1000 unidades.

## Dados gerais

Dados gerais do Tiny/Olist recebem os campos operacionais:

- SKU SCX em `codigo`.
- Nome em `nome`, com SKU SCX no final para evitar rejeicao por nome duplicado
  no Tiny/Olist.
- Unidade `UN`.
- Preco de venda calculado.
- Preco de custo.
- NCM.
- Origem ICMS.
- Situacao: `A` somente quando `published` e estoque maior ou igual ao minimo de
  publicacao; `I` quando `hidden`, `out_of_stock` ou estoque abaixo do minimo.
- Tipo `P`.
- Classe do produto `S` para produto simples.
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
- produtos com ID Olist salvo sao atualizados;
- produtos sem ID Olist salvo sao criados;
- retornos OK gravam/atualizam o mapeamento no banco.

## Tela futura no site

A tela do site deve ter:

- botao `Simular envio Olist`;
- botao `Enviar elegiveis`;
- resumo de elegiveis e bloqueados;
- lista de bloqueios por motivo;
- status por produto: novo, atualizar, bloqueado, erro ou enviado;
- link para corrigir produto bloqueado;
- log do payload enviado e resposta recebida;
- acao para reprocessar somente falhas.

O site nao deve enviar produto direto sem passar pela simulacao e pela validacao.
