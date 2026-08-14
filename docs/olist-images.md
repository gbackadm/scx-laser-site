# Imagens de produtos no Olist

## Regra

- O produto pai recebe ate 10 imagens em `anexos`, priorizando as imagens do pai e
  usando imagens das variacoes como fallback. A Olist importa cada URL para a
  biblioteca interna do produto; o conector nao usa `imagens_externas`.
- Em atualizacoes, o pai e enviado sem reconstruir a grade. Cada variacao e
  atualizada pelo proprio ID com nome, grade, preco, estoque, situacao e anexo.
- Toda variacao ativa precisa ter ao menos uma imagem propria no catalogo.
- A imagem da variacao e enviada ao ID individual da variacao depois que o pai e suas
  grades foram incluidos ou atualizados.
- A rotina usa exclusivamente a API V2 e o campo `anexos`; OAuth e API V3 nao
  fazem parte deste fluxo.
- A carga manual percorre todos os produtos mapeados em lotes, respeitando o
  limite de chamadas configurado. A rotina recorrente processa o lote mais antigo
  a cada 10 minutos e, assim, inclui produtos novos e reaplica correcoes.
- O nome interno inclui a referencia do fornecedor para atender a unicidade do ERP;
  os titulos comerciais dos marketplaces continuam separados no SEO. Arquivos com
  mais de 2 MB sao filtrados antes do envio, conforme o limite da API V2.

## Motivo das duas etapas

A API 2.0 aceita URLs em `anexos` no produto e as importa para a biblioteca interna,
mas nao aceita anexos dentro da estrutura aninhada `variacoes[].variacao`. Por isso,
o primeiro lote atualiza o pai e descobre os IDs das variacoes; o segundo lote chama
`produto.alterar.php` para esses IDs e grava suas imagens. Os lotes reutilizam o
tamanho configurado no painel.

## Verificacao

- `npm run test:olist`: valida a montagem dos payloads sem acessar servicos externos.
- `npm run olist:audit-images`: compara a cobertura de imagens e mapeamentos no banco.
- `npm run olist:audit-images:remote`: confere uma amostra de cinco pais e respectivas
  variacoes diretamente no Olist. Esse modo consome chamadas da API e exige acesso
  liberado no plano.

Falhas na segunda etapa marcam o produto como `failed`, permitindo que a proxima
rotina tente novamente em vez de registrar uma sincronizacao incompleta como sucesso.
A rotina horaria executa o reparo V2 antes do envio normal e reutiliza os lotes
configurados no painel.
