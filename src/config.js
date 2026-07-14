const REQUIRED = [
  'SELLBIE_BASE_URL',
  'SELLBIE_COD_LOJA',
  'x_api_key',
  'x_api_token',
  'x_cliente_id',
  'YAMPI_ALIAS',
  'YAMPI_USER_TOKEN',
  'YAMPI_SECRET_KEY',
];

function validarConfig() {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`ERRO: Variaveis de ambiente faltando: ${missing.join(', ')}`);
    console.error('Local: preencha o .env (veja .env.example).');
    console.error('GitHub Actions: cadastre os valores em Settings > Secrets and variables > Actions.');
    process.exit(1);
  }
}

module.exports = { validarConfig, REQUIRED };
