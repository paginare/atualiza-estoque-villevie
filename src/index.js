require('dotenv').config();
const cron = require('node-cron');
const { sincronizar } = require('./sync');
const { validarConfig } = require('./config');

const INTERVAL = Number(process.env.SYNC_INTERVAL_MINUTES) || 5;

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

async function executar() {
  try {
    await sincronizar();
  } catch (err) {
    log(`ERRO na sincronizacao: ${err.message}`);
    if (err.response) {
      log(`Status: ${err.response.status} - ${JSON.stringify(err.response.data)}`);
    }
  }
}

// Inicio
validarConfig();
log(`Sincronizador de estoque Sellbie -> Yampi iniciado`);
log(`Intervalo: a cada ${INTERVAL} minutos`);
log(`Loja Sellbie: ${process.env.SELLBIE_COD_LOJA}`);
log(`Yampi Alias: ${process.env.YAMPI_ALIAS}`);

// Executa imediatamente na primeira vez
executar();

// Agenda execucao periodica
cron.schedule(`*/${INTERVAL} * * * *`, executar);

log(`Cron agendado: */${INTERVAL} * * * *`);
log('Pressione Ctrl+C para parar.');
