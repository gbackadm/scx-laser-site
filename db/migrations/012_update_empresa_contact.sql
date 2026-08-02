DO $$
BEGIN
  IF to_regclass('public.empresa') IS NOT NULL THEN
    UPDATE empresa
SET
  nome_fantasia = 'SCX Laser',
  razao_social = 'DANIEL WOLFF RIBEIRO',
  cnpj = '48.203.168/0001-20',
  telefone = '(47) 99257-4007',
  whatsapp = '(47) 99257-4007',
  email = 'ScxLaser@gmail.com',
  endereco = 'Constantino de Oliveira Borges',
  numero = '208',
  complemento = 'apt 1403',
  bairro = 'João Costa',
  cidade = 'Joinville',
  estado = 'SC',
  cep = '89.209-500',
  horario_funcionamento = '8:00 às 20:00',
  descricao = 'A SCX Laser trabalha com gravação a laser UV de alta precisão para brindes, produtos personalizados e peças técnicas, atendendo pedidos unitários, pequenas quantidades e lotes corporativos com acabamento profissional.',
  atualizado_em = now()
WHERE id = (
  SELECT id
  FROM empresa
  WHERE ativo = true
  ORDER BY id ASC
  LIMIT 1
    );
  END IF;
END $$;

DROP TABLE IF EXISTS scx_site_settings;
