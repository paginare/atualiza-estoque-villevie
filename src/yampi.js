const axios = require('axios');

const ALIAS = process.env.YAMPI_ALIAS;
const BASE = `https://api.dooki.com.br/v2/${ALIAS}`;

const headers = {
  'Content-Type': 'application/json',
  'User-Token': process.env.YAMPI_USER_TOKEN,
  'User-Secret-Key': process.env.YAMPI_SECRET_KEY,
};

const api = axios.create({ baseURL: BASE, headers, timeout: 30000 });

// Busca todos os SKUs paginando automaticamente
async function listarTodosSkus() {
  const allSkus = [];
  let page = 1;
  let lastPage = 1;

  do {
    const { data } = await api.get('/catalog/skus', {
      params: { page, limit: 100 },
    });

    const pagination = data.meta?.pagination || data.meta || data.pagination;
    if (pagination) {
      lastPage = pagination.total_pages || pagination.last_page || pagination.totalPages || 1;
    }

    const items = data.data || data;
    if (Array.isArray(items)) {
      allSkus.push(...items);
    }

    page++;
  } while (page <= lastPage);

  return allSkus;
}

// Busca todos os produtos paginando
async function listarTodosProdutos() {
  const all = [];
  let page = 1;
  let lastPage = 1;

  do {
    const { data } = await api.get('/catalog/products', {
      params: { page, limit: 100 },
    });

    const pagination = data.meta?.pagination || data.meta || data.pagination;
    if (pagination) {
      lastPage = pagination.total_pages || pagination.last_page || pagination.totalPages || 1;
    }

    const items = data.data || data;
    if (Array.isArray(items)) {
      all.push(...items);
    }

    page++;
  } while (page <= lastPage);

  return all;
}

// Busca estoques de um SKU especifico
async function listarEstoquesSku(skuId) {
  const { data } = await api.get(`/catalog/skus/${skuId}/stocks`);
  return data.data || data;
}

// Atualiza quantidade de estoque de um SKU
// entryId = id da entrada de estoque (usado na URL)
// warehouseStockId = stock_id do warehouse (usado no body)
async function atualizarEstoqueSku(skuId, entryId, warehouseStockId, quantity) {
  const { data } = await api.put(`/catalog/skus/${skuId}/stocks/${entryId}`, {
    stock_id: warehouseStockId,
    quantity,
    min_quantity: 0,
  });
  return data;
}

// Cria estoque para um SKU (caso nao exista)
async function criarEstoqueSku(skuId, stockId, quantity) {
  const { data } = await api.post(`/catalog/skus/${skuId}/stocks`, {
    stock_id: stockId,
    quantity,
    min_quantity: 0,
  });
  return data;
}

// Busca a lista de estoques (warehouses) da loja
async function listarEstoques() {
  const { data } = await api.get('/logistics/stocks');
  return data.data || data;
}

// Busca variacoes existentes (ex: Tamanho)
async function listarVariacoes() {
  const { data } = await api.get('/catalog/variations');
  return data.data || data;
}

// Cria uma variacao (ex: Tamanho)
async function criarVariacao(name) {
  const { data } = await api.post('/catalog/variations', { name });
  return data.data || data;
}

// Lista valores de uma variacao (paginado)
async function listarValoresVariacao(variationId) {
  const all = [];
  let page = 1;
  let lastPage = 1;
  do {
    const { data } = await api.get(`/catalog/variations/${variationId}/values`, {
      params: { page, limit: 100 },
    });
    const pagination = data.meta?.pagination || data.meta || data.pagination;
    if (pagination) {
      lastPage = pagination.total_pages || pagination.last_page || pagination.totalPages || 1;
    }
    const items = data.data || data;
    if (Array.isArray(items)) all.push(...items);
    page++;
  } while (page <= lastPage);
  return all;
}

// Cria valor de variacao (ex: "38", "M", "G")
async function criarValorVariacao(variationId, value) {
  const { data } = await api.post(`/catalog/variations/${variationId}/values`, {
    name: value,
  });
  return data.data || data;
}

// Busca marcas
async function listarMarcas() {
  const { data } = await api.get('/catalog/brands');
  return data.data || data;
}

// Cria marca
async function criarMarca(name) {
  const { data } = await api.post('/catalog/brands', {
    name,
    active: true,
    featured: false,
  });
  return data.data || data;
}

// Cria produto com SKUs
async function criarProduto(produto) {
  const { data } = await api.post('/catalog/products', produto);
  return data.data || data;
}

// Atualiza campos de um produto existente (erp_id, name, etc.)
async function atualizarProduto(productId, campos) {
  const { data } = await api.put(`/catalog/products/${productId}`, campos);
  return data.data || data;
}

// Cria um SKU avulso vinculado a um produto existente
async function criarSkuAvulso(skuData) {
  const { data } = await api.post('/catalog/skus', skuData);
  return data.data || data;
}

// Atualiza campos de um SKU existente (preços, peso, etc.) — nunca envia imagens
async function atualizarSku(skuId, campos) {
  const { data } = await api.put(`/catalog/skus/${skuId}`, campos);
  return data.data || data;
}

module.exports = {
  api,
  listarTodosSkus,
  listarTodosProdutos,
  listarEstoquesSku,
  atualizarEstoqueSku,
  criarEstoqueSku,
  listarEstoques,
  listarVariacoes,
  criarVariacao,
  listarValoresVariacao,
  criarValorVariacao,
  listarMarcas,
  criarMarca,
  criarProduto,
  atualizarProduto,
  criarSkuAvulso,
  atualizarSku,
};
