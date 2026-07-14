// Executa uma unica sincronizacao. E este o entrypoint usado pelo GitHub Actions.
require('dotenv').config();
const { sincronizar } = require('./sync');
const { validarConfig } = require('./config');

async function main() {
  validarConfig();

  let resultado;
  try {
    resultado = await sincronizar();
  } catch (err) {
    console.error('ERRO:', err.message);
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data:', JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
  }

  console.log('\nResultado:', resultado);

  // Erros parciais precisam derrubar o job, senao o Actions fica verde
  // escondendo produtos que nao sincronizaram.
  if (resultado.erros > 0) {
    console.error(`\nFALHA: ${resultado.erros} erro(s) durante a sincronizacao.`);
    process.exit(1);
  }
}

main();
