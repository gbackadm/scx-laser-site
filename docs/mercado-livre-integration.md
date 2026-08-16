# Integracao direta com Mercado Livre

## Objetivo

O Supabase continua sendo a fonte de verdade de produtos, variacoes, imagens,
precos e estoque. O Mercado Livre e um canal de publicacao, sem alterar o
cadastro mestre da SCX.

## Conexao da conta

1. O administrador abre `/admin/mercado-livre` e inicia a conexao.
2. O sistema cria `state` e PKCE unicos, validos por dez minutos.
3. O Mercado Livre autoriza a conta e retorna ao callback HTTPS cadastrado.
4. O callback valida e inutiliza o `state`, troca o codigo por tokens e consulta
   `/users/me` para vincular a conta correta.
5. Access token e refresh token sao criptografados com AES-256-GCM antes de
   serem gravados no Supabase.

O access token e reutilizado enquanto estiver valido. Perto do vencimento, o
sistema renova uma unica vez dentro de uma transacao com bloqueio de linha e
salva imediatamente o novo refresh token rotativo.

## Notificacoes

`/admin/api/mercado-livre/notificacoes` recebe os eventos do aplicativo,
confere `application_id` e usuario conectado, grava o corpo original e responde
rapidamente. Eventos repetidos usam o mesmo identificador e nao criam trabalho
duplicado. O processamento posterior deve sempre consultar o recurso oficial da
API; o webhook e apenas o aviso de que algo mudou.

## Variaveis privadas

- `MERCADO_LIVRE_CLIENT_ID`
- `MERCADO_LIVRE_CLIENT_SECRET`
- `MERCADO_LIVRE_REDIRECT_URI`
- `MERCADO_LIVRE_NOTIFICATION_URL`
- `MERCADO_LIVRE_TOKEN_ENCRYPTION_KEY`

Segredos ficam somente em `.env.local` e nas variaveis privadas da Vercel. A
chave de criptografia precisa ser a mesma em producao para que os tokens
continuem legiveis pela aplicacao.

## Verificacao automatica

- `npm run test:mercado-livre`: PKCE, URL de autorizacao e criptografia.
- `npm run check`: todos os testes e tipos.
- `npm run build`: compilacao equivalente a producao.
- `npm run db:migrate`: tabelas idempotentes da integracao.

## Vinculo dos anuncios

Cada anuncio criado pela aplicacao e gravado em
`scx_catalog_marketplace_offers` com o produto, a variacao, o tamanho do kit,
o SKU SCX e o ID `MLB` retornado pelo Mercado Livre. O vinculo aparece no
catalogo administrativo com as quantidades de anuncios ativos e pausados,
alerta de estoque baixo e atalho para o canal.

Anuncios antigos encontrados na conta, mas ainda sem esse registro, aparecem
como `Somente no ML` e nao entram na automacao de estoque ate serem vinculados.

### Edicao de anuncio vinculado

Na aba `Anuncios publicados`, o botao `Editar` abre o anuncio existente pelo
seu ID `MLB`; ele nunca cria uma segunda publicacao. O editor consulta os dados
atuais do Mercado Livre e permite alterar preco, descricao e selecionar/ordenar
de 2 a 12 fotos da biblioteca completa do produto. A foto na posicao 1 e a
principal do anuncio.

O titulo pode ser alterado somente enquanto `sold_quantity` for zero, conforme
a regra oficial do Mercado Livre. Depois da primeira venda, o campo fica
bloqueado no painel. O estoque nao e editavel nessa janela porque permanece sob
controle da rotina automatica baseada no catalogo.

## Controle de estoque

- A fonte de verdade e o estoque da variacao no Supabase.
- O saldo enviado ao canal e `floor(estoque da variacao / unidades do kit)`.
- Abaixo de `marketplace_low_stock_warning_threshold` (padrao: 50 kits), o
  painel sinaliza o saldo em vermelho, sem bloquear a publicacao.
- Em `marketplace_stock_pause_threshold` ou abaixo (padrao: 2 kits), a rotina
  pausa automaticamente o anuncio.
- Somente anuncios pausados pela propria rotina podem ser reativados
  automaticamente quando o estoque se recuperar. Pausas manuais sao
  preservadas.
- A rota `/admin/api/mercado-livre/estoque` executa a conferencia manual pelo
  painel ou por chamada agendada autenticada com `CRON_SECRET`.

Na aba `Anuncios publicados`, o estoque retornado pelo Mercado Livre e exibido
ao lado do numero de kits calculado pelo banco. A tabela permite filtrar estoque
normal, baixo ou zerado e ordenar pelo saldo no canal.

## Metricas operacionais

A aba `Metricas` consulta a janela movel dos ultimos 30 dias e apresenta:

- visitas oficiais por anuncio e consolidado diario;
- pedidos pagos, unidades vendidas e conversao aproximada por visita;
- vendas brutas e comissao informada nos itens dos pedidos;
- anuncios ativos, pausados, estoque baixo ou zerado;
- perguntas ainda sem resposta;
- busca, filtros, ordenacao e atalho para o anuncio publicado.
- saude atual da conta: termometro de reputacao, MercadoLider, vendas concluidas,
  reclamacoes, atrasos de despacho, cancelamentos e avaliacoes positivas.

O periodo pode ser alternado entre 7, 30, 60, 90 e 150 dias. A escolha fica na
URL e cada janela possui cache independente, evitando novas chamadas ao voltar
para um periodo consultado recentemente. A aba `Operacao` permanece fixa em 30
dias para manter uma referencia operacional consistente.

Pedidos, unidades, faturamento e comissao incluem todos os pedidos pagos da
janela, inclusive vendas de anuncios antigos que ja nao aparecem na listagem
atual da conta. Quantidade de anuncios ativos e alertas de estoque representam
o estado atual e, por isso, nao mudam quando o periodo historico e alterado.
Os indicadores de reputacao usam o periodo oficial devolvido pelo ML, que pode
ser diferente da janela escolhida para visitas e pedidos.

As visitas sao armazenadas por 10 minutos em
`scx_mercado_livre_listing_metrics`. Esse cache persiste entre reinicios e
deploys, evita dezenas de chamadas repetidas e sinaliza leituras indisponiveis
em vez de transforma-las silenciosamente em zero. O comando
`npm run mercado-livre:check-metrics` valida a tabela e a ultima leitura antes
de um deploy.

## Central de operacao

A aba `Operacao` transforma dados do canal em uma fila priorizada. Ela centraliza:

- perguntas ainda sem resposta;
- vendas pagas recentes;
- anuncios sem estoque ou abaixo do limite configurado;
- pausas automaticas por estoque e divergencia entre estoque local e remoto;
- falhas da ultima sincronizacao;
- anuncios ativos com trafego e nenhuma venda no periodo;
- anuncios vendidos sem custo confiavel vinculado.

O total `Resolver agora` soma somente ocorrencias acionaveis. A tela nunca inventa
um custo para anuncios antigos sem vinculo com produto/variacao: esses casos viram
pendencias explicitas ate que o relacionamento seja corrigido.

## Margem conhecida

A aba `Metricas` apresenta faturamento, comissao, custo dos produtos vendidos e
margem de contribuicao conhecida por anuncio. O custo usa
`variant.cost_amount_in_cents * units_per_pack * quantidade vendida`.

Essa margem nao e lucro liquido: frete, impostos e despesas operacionais ainda nao
sao descontados. Quando qualquer custo necessario estiver ausente, o valor aparece
como indisponivel e o anuncio entra na Central de operacao.

## Prazo de producao

Ao gerar uma nova previa, a aplicacao consulta os termos de venda aceitos pela
categoria. Quando `MANUFACTURING_TIME` estiver disponivel, o anuncio recebe cinco
dias de producao por padrao. O editor permite alterar o prazo entre 1 e 60 dias ou
desativa-lo para produtos com estoque imediato.

O mesmo controle aparece na edicao de anuncios vinculados. Categorias incompativeis
mantem o campo desabilitado, evitando enviar um termo que o Mercado Livre removeria.
O prazo nao deve ser usado em anuncios Flex ou Full e pode reduzir a exposicao do
anuncio, portanto deve representar somente o tempo real de preparacao/personalizacao.

## Proxima etapa de producao

Ao preparar o deploy, agendar a rota de estoque na Vercel usando o mesmo
segredo das rotinas privadas. O agendamento so deve ser ativado depois do
deploy final aprovado, evitando consumo de builds durante o desenvolvimento.

## Produtos e categorias futuras

O catalogo atual e uma amostra de validacao, nao uma lista fechada de produtos.
Quando um produto novo ou uma categoria nova aparecer, o fluxo deve:

1. consultar a descoberta de dominio do Mercado Livre usando o titulo do produto;
2. exigir confirmacao humana da categoria antes de gerar a previa;
3. consultar os atributos atuais da categoria diretamente na API;
4. pre-preencher valores comprovados pelo banco, incluindo marca `SCX Laser`,
   modelo/SKU do fornecedor, material inferivel e cor da variacao;
5. persistir novos campos obrigatorios para que possam ser revisados e reutilizados;
6. validar a oferta na API oficial antes de habilitar a publicacao.

Uma categoria sugerida nunca e gravada automaticamente como regra global. Um
grupo amplo do catalogo pode conter produtos que pertencem a categorias
diferentes no Mercado Livre.

`npm run mercado-livre:audit-categories` escolhe uma amostra por categoria
existente, consulta as regras atuais do canal e separa pendencias de categoria,
atributos, imagens, estoque e logistica. A automacao deve ser executada sempre
que uma categoria nova entrar no catalogo e antes de uma publicacao em massa.

O seletor nao usa uma lista local fechada: ele consulta a arvore vigente do
Mercado Livre e exibe o caminho completo ate a categoria folha. Por exemplo,
uma chave de fenda pode aparecer em `Ferramentas > Ferramentas Manuais >
Fixacao > Chaves de Fenda`. `npm run mercado-livre:backfill-category-paths`
completa essa trilha nos produtos configurados antes da migracao 039.
