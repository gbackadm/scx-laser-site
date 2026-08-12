# Imagens e variacoes do catalogo

## Regra operacional

1. O payload bruto da Asia Import permanece preservado no banco.
2. Cada produto pai recebe uma galeria deduplicada com as imagens de todas as variacoes validas.
3. Cada variacao recebe seu proprio SKU SCX, SKU do fornecedor, estoque, preco, atributos e imagem.
4. A cor e lida primeiro do atributo do fornecedor. Quando ele vier vazio, o sistema infere pelo nome e pelo sufixo do SKU, como `AZ`, `PT`, `VM`, `VD`, `CZ` e `BR`.
5. Uma imagem declarada na variacao sempre tem prioridade. O fallback so e aceito quando o SKU aparece no nome do arquivo ou quando existe uma unica variacao e uma unica imagem.
6. O sistema nao associa uma foto por semelhanca incerta. Produto sem foto, sem custo ou sem variacao identificavel fica em `sync_error` e nao e publicado automaticamente.
7. Produtos com estoque agregado menor que o minimo configurado entram como `out_of_stock`; os demais entram como `published`.

## Situacao em 12/08/2026

- 123 registros brutos da Asia Import.
- 94 produtos completos no catalogo.
- 73 publicados e 21 inativos pela regra de estoque.
- 224 variacoes ativas.
- 224 variacoes com imagem propria e atributo `Cor`.
- 94 produtos com galeria e imagem principal saudaveis.
- 29 registros bloqueados: 28 sem qualquer imagem na origem e 1 com imagens, mas custo zero.

## Sincronizacao automatica

A rotina processa uma pagina da API por execucao e grava `next_page` para continuar na rodada seguinte. Uma atualizacao atomica reserva a execucao, evitando duas rotinas simultaneas. Execucoes interrompidas por limite de tempo sao encerradas como falha antes da nova tentativa.

Ao receber um produto novo, a rotina atualiza o registro bruto, valida os dados cruciais, cria ou atualiza o pai, reconstrui a galeria, sincroniza as variacoes e recalcula estoque e status. O mesmo SKU sempre atualiza o mesmo produto.
