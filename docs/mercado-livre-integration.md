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

## Proximas etapas do canal

1. Conectar e validar a conta real.
2. Implementar categorizacao e validacao previa por categoria.
3. Montar familias e User Products usando as variacoes atuais.
4. Publicar primeiro um produto piloto com imagens por variacao.
5. Ativar lotes, estoque e precos somente depois da auditoria do piloto.
