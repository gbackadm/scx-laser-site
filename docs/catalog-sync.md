# Sincronizacao do catalogo

## Fonte e volume

- A rotina percorre todo o catalogo retornado pela Asia Import.
- Em 16/08/2026, a fonte informou 821 registros em 83 paginas de 10 itens.
- Produtos sem dados cruciais continuam registrados na auditoria como bloqueados e nao sao publicados.
- O catalogo aceito possuia 482 produtos apos a carga completa.

## Agendamento

- O Supabase `pg_cron` chama `/admin/api/asia/rotina` a cada 15 minutos.
- Cada chamada processa uma pagina de 10 registros e salva a proxima pagina no banco.
- Com 83 paginas, uma volta completa leva aproximadamente 20 horas e 45 minutos.
- A navegacao do site nao espera a volta completa: cada chamada termina em poucos segundos.
- O estoque do Mercado Livre e conferido por uma rotina separada a cada 10 minutos.
- O agendamento nao depende do Vercel Cron e e compativel com o plano Hobby.
- A rotina automatica do Olist permanece desativada.

## Regras de seguranca

- Falta de imagem, custo valido ou variacao identificavel bloqueia somente o produto afetado.
- Uma falha nao interrompe os demais itens do lote e fica visivel no catalogo administrativo.
- Produtos com menos de 1.000 unidades permanecem inativos pela regra de disponibilidade.

## Filtros administrativos

O catalogo permite combinar busca, categoria, status, canal de ecommerce, faixa de estoque,
origem/fornecedor e presenca de imagens. O filtro `ML com avisos` agrupa anuncios pausados,
com estoque baixo, falha ou divergencia entre anuncios ativos e existentes.
