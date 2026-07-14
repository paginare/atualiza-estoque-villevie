require('dotenv').config();
const { buscarEstoque, buscarProdutos } = require('./sellbie');
const { listarTodosProdutos, listarTodosSkus } = require('./yampi');

async function diagnostico() {
  console.log('=== DIAGNÓSTICO: Yampi vs Sellbie ===\n');

  // Buscar dados em paralelo
  console.log('Buscando dados...');
  const [produtosYampi, skusYampi, produtosSellbie, estoqueSellbie] = await Promise.all([
    listarTodosProdutos(),
    listarTodosSkus(),
    buscarProdutos(),
    buscarEstoque(),
  ]);

  // --- YAMPI ---
  console.log(`\n[YAMPI] ${produtosYampi.length} produtos | ${skusYampi.length} SKUs\n`);

  const yampiSkuSet = new Set(skusYampi.map((s) => (s.sku || '').toUpperCase()));
  const yampiErpIds = new Set(produtosYampi.map((p) => String(p.erp_id || '')).filter(Boolean));

  if (produtosYampi.length > 0) {
    console.log('Primeiros 10 produtos na Yampi:');
    produtosYampi.slice(0, 10).forEach((p) => {
      console.log(`  ID:${p.id} | erp_id:${p.erp_id || '(vazio)'} | ${p.name}`);
    });
    if (produtosYampi.length > 10) console.log(`  ... e mais ${produtosYampi.length - 10}`);
  }

  // --- SELLBIE ---
  const estoqueMap = new Map();
  for (const e of estoqueSellbie) {
    estoqueMap.set(e.codigo_produto, e.qtd_disponivel || 0);
  }

  const produtosAtivos = produtosSellbie.filter((p) => p.status === 'Ativo');
  const comEstoque = produtosAtivos.filter((p) => estoqueMap.has(p.sku));
  const codigosBase = [...new Set(comEstoque.map((p) => p.codigo_base))];

  console.log(`\n[SELLBIE] ${produtosSellbie.length} total | ${produtosAtivos.length} ativos | ${comEstoque.length} com estoque`);
  console.log(`[SELLBIE] ${codigosBase.length} produtos únicos (codigo_base)\n`);

  // --- CRUZAMENTO ---
  let yampiTemErpId = 0;
  let yampiSemErpId = 0;
  let podeAtualizar = 0;
  let precisaCriar = 0;
  let skuMatchYampi = 0;
  let skuSemMatch = 0;

  for (const p of produtosYampi) {
    if (p.erp_id) yampiTemErpId++;
    else yampiSemErpId++;
  }

  for (const base of codigosBase) {
    if (yampiErpIds.has(base)) podeAtualizar++;
    else precisaCriar++;
  }

  for (const p of comEstoque) {
    if (yampiSkuSet.has(p.sku.toUpperCase())) skuMatchYampi++;
    else skuSemMatch++;
  }

  console.log('=== RESUMO DO CRUZAMENTO ===');
  console.log(`Produtos Yampi COM erp_id preenchido : ${yampiTemErpId}`);
  console.log(`Produtos Yampi SEM erp_id           : ${yampiSemErpId}`);
  console.log(`\nDos ${codigosBase.length} grupos Sellbie (com estoque):`);
  console.log(`  Já existem na Yampi (via erp_id)  : ${podeAtualizar} → vão ter estoque ATUALIZADO`);
  console.log(`  Não existem na Yampi              : ${precisaCriar} → vão ser CRIADOS`);
  console.log(`\nCruzamento por SKU:`);
  console.log(`  SKUs Sellbie que existem na Yampi : ${skuMatchYampi}`);
  console.log(`  SKUs Sellbie ausentes na Yampi    : ${skuSemMatch}`);

  // Mostrar quais yampi products podem ser atualizados
  if (podeAtualizar > 0) {
    console.log('\nProdutos Yampi que serão ATUALIZADOS (erp_id bate com codigo_base Sellbie):');
    for (const base of codigosBase) {
      if (yampiErpIds.has(base)) {
        const yampiProd = produtosYampi.find((p) => String(p.erp_id) === base);
        const variantes = comEstoque.filter((p) => p.codigo_base === base);
        console.log(`  erp_id:${base} → Yampi "${yampiProd?.name}" | ${variantes.length} SKU(s) Sellbie`);
      }
    }
  }

  // Mostrar amostra de produtos que serão criados
  const paracriar = codigosBase.filter((b) => !yampiErpIds.has(b));
  if (paracriar.length > 0) {
    console.log(`\nAmostra dos primeiros 10 produtos a CRIAR na Yampi:`);
    paracriar.slice(0, 10).forEach((base) => {
      const variantes = comEstoque.filter((p) => p.codigo_base === base);
      const nome = variantes[0]?.nome || '(sem nome)';
      const totalQtd = variantes.reduce((s, v) => s + (estoqueMap.get(v.sku) || 0), 0);
      console.log(`  ${base} | "${nome}" | ${variantes.length} SKU(s) | estoque total: ${totalQtd}`);
    });
    if (paracriar.length > 10) console.log(`  ... e mais ${paracriar.length - 10}`);
  }

  console.log('\n=== FIM DO DIAGNÓSTICO ===');
}

diagnostico().catch((err) => {
  console.error('ERRO:', err.message);
  if (err.response) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});
