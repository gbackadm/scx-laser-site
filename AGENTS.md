# SCX Laser: regras de trabalho

## Objetivo

Evitar redescoberta, comandos repetidos e validacoes maiores que a mudanca. Use os
scripts do projeto como fonte oficial para verificacao.

## Validacao proporcional

- Alteracao em titulos ou catalogo: `npm run test:catalog`.
- Alteracao na montagem ou envio ao Olist: `npm run test:olist`.
- Imagens de pai e variacoes no Olist: `npm run olist:audit-images`.
- Confirmacao no proprio Olist, apenas quando necessaria: `npm run olist:audit-images:remote`.
- Alteracao comum em TypeScript/React: `npm run check`.
- Antes de commit, deploy ou entrega ampla: `npm run verify`.
- Banco, sincronizacao ou regras de elegibilidade: `npm run health` alem do teste
  especifico.
- Problema local pouco claro: `npm run diagnose` antes de investigar arquivos.
- Cache ou modulos inconsistentes do Next: `npm run dev:reset -- -p 3005 -H 127.0.0.1`.

Nao execute `npm run build` depois de cada mudanca pequena. Nao execute `build`
enquanto um servidor `next dev` estiver usando a mesma pasta `.next`; pare o servidor
ou use `npm run dev:reset` depois da compilacao.

## Fluxo do produto

O fluxo principal e Asia ou cadastro manual -> Supabase -> catalogo -> Olist e,
posteriormente, marketplaces. O Supabase e a fonte central do catalogo. SKU de venda
usa o codigo SCX; fornecedor e referencias de origem preservam os dados da Asia.

Produtos devem manter dados gerais, precos, medidas, imagens, atributos, fornecedor,
estoque e variacoes. Produtos com estoque abaixo do limite configurado continuam no
Olist como inativos. Imagens devem ficar associadas ao produto pai e as variacoes
correspondentes.

## Economia de contexto

- Comece por `git status`, arquivos alterados e o teste especifico.
- Prefira buscas direcionadas; nao releia modulos inteiros sem necessidade.
- Reutilize os scripts existentes em `scripts/` antes de criar consultas avulsas.
- Resuma saidas longas e registre novas regras permanentes neste arquivo ou em `docs/`.
- Nao exponha valores de `.env.local`, tokens ou credenciais em logs e respostas.
- Nao reverta alteracoes locais que nao pertencem a tarefa atual.
