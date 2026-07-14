const axios = require('axios');

const SELLBIE_BASE_URL = process.env.SELLBIE_BASE_URL;
const COD_LOJA = process.env.SELLBIE_COD_LOJA;

const headers = {
  x_api_key: process.env.x_api_key,
  x_api_token: process.env.x_api_token,
  x_cliente_id: process.env.x_cliente_id,
};

async function buscarEstoque() {
  const url = `${SELLBIE_BASE_URL}/estoque`;
  const params = {
    cod_loja: COD_LOJA,
    only_disp: 1,
  };

  const { data } = await axios.get(url, { params, headers, timeout: 30000 });
  return data;
}

async function buscarProdutos() {
  const url = `${SELLBIE_BASE_URL}/produtos`;
  const { data } = await axios.get(url, { headers, timeout: 30000 });
  return data;
}

async function buscarTamanhos() {
  const url = `${SELLBIE_BASE_URL}/tamanhos`;
  const { data } = await axios.get(url, { headers, timeout: 30000 });
  return data;
}

async function buscarCores() {
  const url = `${SELLBIE_BASE_URL}/cores`;
  const { data } = await axios.get(url, { headers, timeout: 30000 });
  return data;
}

module.exports = { buscarEstoque, buscarProdutos, buscarTamanhos, buscarCores };
