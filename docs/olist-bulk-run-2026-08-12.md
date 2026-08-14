# Envio em massa Olist - 2026-08-12

## Resultado

Foram avaliados 79 produtos do banco SCX/Supabase com status publicavel para
Olist/Tiny.

Resultado final apos normalizacao e reprocessamento:

| Item | Quantidade |
| --- | ---: |
| Produtos avaliados | 79 |
| Produtos elegiveis | 79 |
| Produtos criados/atualizados e mapeados | 79 |
| Produtos bloqueados | 0 |
| Produtos elegiveis pendentes de criacao | 0 |
| Produtos ativos no canal | 59 |
| Produtos inativos no canal | 20 |

## Bloqueios

Os bloqueios iniciais foram resolvidos por normalizacao. Ao final do
reprocessamento nao restaram produtos bloqueados.

| Motivo | Quantidade |
| --- | ---: |
| Sem medidas normalizadas | 0 |
| Sem NCM | 0 |

Observacao: os bloqueios iniciais eram causados por variacao de nomes de campos
no payload da Asia, como `dimensao-do-produto`, `dimensao-produto`,
`dimensao-da-embalagem`, medidas com `diametro` por extenso e NCM presente em
variacoes.

## Ajustes feitos durante o envio

- O envio em massa passou a validar elegibilidade antes de chamar a API.
- Produtos bloqueados nao sao enviados.
- Categoria passou a ser enviada em arvore, usando `>>`.
- Etapas de producao passaram a ser enviadas em todos os produtos.
- Estrutura/kit so e enviada quando houver componentes reais cadastrados.
- O nome no Tiny/Olist passou a receber o SKU SCX no final para evitar rejeicao
  por nome duplicado.
- O ID retornado pelo Olist e salvo no banco para atualizacoes futuras.
- O normalizador passou a ler medidas e peso em `propriedades` e
  `propriedades2`.
- Medidas bidimensionais passam a usar largura como comprimento quando nao ha
  profundidade explicita.
- NCM pode vir do campo principal ou da primeira variacao com NCM.
- Na execucao original, as imagens foram enviadas como `imagens_externas`. Essa
  decisao foi substituida pelo uso de `anexos`, que importa os arquivos para a
  biblioteca interna da Olist e permite associa-los as variacoes.
- A regra de estoque minimo passou a ser aplicada no conector Olist: produtos com
  estoque abaixo de 1000 unidades continuam sendo enviados ao Tiny/Olist, mas com
  `situacao = I`.

## Regra final aplicada

| Campo | Regra |
| --- | --- |
| `codigo` | SKU SCX |
| `codigo_pelo_fornecedor` | SKU/codigo Asia |
| `nome` | Nome comercial + SKU SCX |
| `situacao` | `A` somente para `published` com estoque >= minimo de publicacao; `I` para `hidden`, `out_of_stock` ou estoque abaixo do minimo |
| `categoria` | Arvore do fornecedor com `>>` |
| `etapas` | Padrao SCX ou etapas especificas do produto |
| `estrutura` | Apenas componentes reais |

## Conferencia final

A simulacao final retornou:

| Item | Quantidade |
| --- | ---: |
| Produtos avaliados | 79 |
| Produtos elegiveis | 79 |
| Produtos bloqueados | 0 |
| Produtos pendentes para criar | 0 |
| Produtos mapeados para atualizar | 79 |
| Estoque minimo de publicacao | 1000 |
| Produtos que vao como ativos | 59 |
| Produtos que vao como inativos | 20 |

Para conferir novamente:

```powershell
node scripts\olist-bulk-products.mjs --all
```

Para atualizar tudo novamente:

```powershell
node scripts\olist-bulk-products.mjs --all --execute
```
