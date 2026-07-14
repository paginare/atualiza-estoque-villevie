const { buscarEstoque, buscarProdutos, buscarTamanhos, buscarCores } = require('./sellbie');
const {
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
  api,
} = require('./yampi');

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function decodificarSku(sku, codigoBase, tamNomesOrdenados, coresMap) {
  const suffix = sku.replace(codigoBase, '');
  let tamNome = null;
  let corCodigo = null;

  for (const tn of tamNomesOrdenados) {
    if (suffix.endsWith(tn)) {
      const possibleCor = suffix.slice(0, -tn.length);
      if (possibleCor === '' || coresMap.has(possibleCor)) {
        tamNome = tn;
        corCodigo = possibleCor || null;
        break;
      }
    }
  }

  if (!tamNome) {
    for (const tn of tamNomesOrdenados) {
      if (suffix.endsWith(tn)) {
        tamNome = tn;
        corCodigo = suffix.slice(0, -tn.length) || null;
        break;
      }
    }
  }

  const corNome = corCodigo ? (coresMap.get(corCodigo) || null) : null;
  return { tamNome, corCodigo, corNome };
}

async function garantirVariacao(nome) {
  let variacoes = await listarVariacoes();
  let variacao = variacoes.find(
    (v) => v.name && v.name.toLowerCase() === nome.toLowerCase()
  );

  if (!variacao) {
    try {
      log(`Criando variacao "${nome}" na Yampi...`);
      variacao = await criarVariacao(nome);
    } catch (err) {
      if (err.response?.status === 422) {
        log(`Variacao "${nome}" ja existe, buscando ID via produto...`);
        const produtos = await listarTodosProdutos();
        for (const p of produtos) {
          if (!p.has_variations) continue;
          const { data: detail } = await api.get(`/catalog/products/${p.id}`, {
            params: { include: 'variations' },
          });
          const prod = detail.data || detail;
          const vars = prod.variations?.data || [];
          const found = vars.find((v) => v.name && v.name.toLowerCase() === nome.toLowerCase());
          if (found) { variacao = found; break; }
        }
        if (!variacao) throw new Error(`Variacao "${nome}" existe mas nao foi possivel encontrar o ID`);
      } else {
        throw err;
      }
    }
  }

  log(`Variacao "${nome}" ID: ${variacao.id}`);
  const valoresExistentes = await listarValoresVariacao(variacao.id);
  const mapaValores = new Map();
  for (const v of valoresExistentes) {
    mapaValores.set((v.name || v.value || '').toUpperCase(), v.id);
  }

  return { variacaoId: variacao.id, mapaValores };
}

async function garantirValorVariacao(variacaoId, mapaValores, valor) {
  const key = valor.toUpperCase();
  if (mapaValores.has(key)) return mapaValores.get(key);

  try {
    log(`  Criando valor de variacao: "${valor}"`);
    const novo = await criarValorVariacao(variacaoId, valor);
    mapaValores.set(key, novo.id);
    await sleep(200);
    return novo.id;
  } catch (err) {
    if (err.response?.status === 422) {
      const valores = await listarValoresVariacao(variacaoId);
      for (const v of valores) {
        mapaValores.set((v.name || v.value || '').toUpperCase(), v.id);
      }
      if (mapaValores.has(key)) return mapaValores.get(key);
    }
    throw err;
  }
}

async function garantirMarca() {
  const marcas = await listarMarcas();
  if (marcas.length > 0) return marcas[0].id;
  try {
    log('Criando marca "Ville Vie" na Yampi...');
    const marca = await criarMarca('Ville Vie');
    return marca.id;
  } catch (err) {
    if (err.response?.status === 422) {
      const produtos = await listarTodosProdutos();
      if (produtos.length > 0) {
        const { data: detail } = await api.get(`/catalog/products/${produtos[0].id}`, {
          params: { include: 'brand' },
        });
        const brandId = detail.data?.brand?.data?.id;
        if (brandId) return brandId;
      }
    }
    throw err;
  }
}

function nomeBaseProduto(nome, corNome, tamNome) {
  let base = nome.trim();
  if (tamNome) {
    const regex = new RegExp(`\\s+${tamNome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    base = base.replace(regex, '');
  }
  if (corNome) {
    const regex = new RegExp(`\\s+${corNome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    base = base.replace(regex, '');
  }
  return base.trim();
}

async function sincronizar() {
  log('=== Iniciando sincronizacao de estoque ===');

  log('Buscando dados da Sellbie...');
  const [estoqueSellbie, produtosSellbie, tamanhosSellbie, coresSellbie] = await Promise.all([
    buscarEstoque(),
    buscarProdutos(),
    buscarTamanhos(),
    buscarCores(),
  ]);

  if (!Array.isArray(produtosSellbie) || produtosSellbie.length === 0) {
    log('ERRO: Nenhum produto retornado da Sellbie.');
    return;
  }

  log(`Sellbie: ${produtosSellbie.length} produtos, ${estoqueSellbie.length} registros de estoque`);

  // Mapa SKU -> quantidade disponível (ausente = 0)
  const estoqueMap = new Map();
  for (const e of estoqueSellbie) {
    estoqueMap.set(e.codigo_produto, e.qtd_disponivel || 0);
  }

  const coresMap = new Map(coresSellbie.map((c) => [c.codigo, c.nome]));
  const tamNomesOrdenados = tamanhosSellbie.map((t) => t.nome).sort((a, b) => b.length - a.length);

  log('Buscando dados da Yampi...');
  const [skusYampi, produtosYampi, estoques] = await Promise.all([
    listarTodosSkus(),
    listarTodosProdutos(),
    listarEstoques(),
  ]);

  const estoquePadrao = estoques[0];
  if (!estoquePadrao) {
    log('ERRO: Nenhum estoque cadastrado na Yampi.');
    return;
  }
  log(`Yampi: ${produtosYampi.length} produtos, ${skusYampi.length} SKUs`);
  log(`Estoque padrao: "${estoquePadrao.name}" (ID: ${estoquePadrao.id})`);

  let estoquesAtualizados = 0;
  let estoquesZerados = 0;
  let precosAtualizados = 0;
  let produtosCriados = 0;
  let erros = 0;

  // ---------------------------------------------------------------
  // FASE 1: Atualizar estoque e preços de todos os SKUs já existentes na Yampi
  // SKUs sem correspondência no Sellbie recebem quantidade 0
  // ---------------------------------------------------------------
  log(`\n--- FASE 1: Atualizando ${skusYampi.length} SKUs existentes na Yampi ---`);

  const yampiSkuSet = new Set(skusYampi.map((s) => (s.sku || '').toUpperCase()));

  // Mapa SKU code → produto Sellbie (para buscar preços atualizados)
  const sellbieSkuMap = new Map();
  for (const p of produtosSellbie) {
    sellbieSkuMap.set((p.sku || '').toUpperCase(), p);
  }

  for (const sku of skusYampi) {
    const skuCode = sku.sku || '';
    const qtdNova = estoqueMap.get(skuCode) ?? 0;

    try {
      const estoqueAtual = await listarEstoquesSku(sku.id);
      if (estoqueAtual.length > 0) {
        const stock = estoqueAtual[0];
        const qtdAtual = Number(stock.quantity ?? 0);
        if (qtdAtual !== qtdNova) {
          await atualizarEstoqueSku(sku.id, stock.id, stock.stock_id, qtdNova);
          if (qtdNova === 0) {
            log(`  ZERADO "${skuCode}": ${qtdAtual} -> 0`);
            estoquesZerados++;
          } else {
            log(`  ATUALIZADO "${skuCode}": ${qtdAtual} -> ${qtdNova}`);
            estoquesAtualizados++;
          }
        }
      } else {
        await criarEstoqueSku(sku.id, estoquePadrao.id, qtdNova);
        if (qtdNova > 0) {
          log(`  CRIADO estoque "${skuCode}": ${qtdNova}`);
          estoquesAtualizados++;
        }
      }
    } catch (err) {
      const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      log(`  ERRO SKU "${skuCode}" (id:${sku.id}): ${detail}`);
      erros++;
    }

    // Atualizar preços (custo e venda) se houver diferença — nunca toca imagens
    const sellbieProd = sellbieSkuMap.get(skuCode.toUpperCase());
    if (sellbieProd) {
      const pcAtual = round2(sku.price_cost);
      const pvAtual = round2(sku.price_sale);
      const pcNovo = round2(sellbieProd.valor_compra);
      const pvNovo = round2(sellbieProd.valor_venda);

      if (pcAtual !== pcNovo || pvAtual !== pvNovo) {
        try {
          await atualizarSku(sku.id, { price_cost: pcNovo, price_sale: pvNovo });
          log(`  PRECO "${skuCode}": custo ${pcAtual}->${pcNovo}, venda ${pvAtual}->${pvNovo}`);
          precosAtualizados++;
        } catch (precoErr) {
          const msg = precoErr.response?.data?.message || precoErr.message;
          log(`  WARN preco "${skuCode}": ${msg}`);
        }
        await sleep(100);
      }
    }

    await sleep(150);
  }

  // ---------------------------------------------------------------
  // FASE 2: Criar produtos Sellbie que ainda não existem na Yampi
  // Só cria se tiver pelo menos um SKU com estoque disponível
  // ---------------------------------------------------------------
  const gruposPorBase = new Map();
  for (const p of produtosSellbie) {
    if (p.status !== 'Ativo') continue;
    if (!estoqueMap.has(p.sku)) continue; // sem estoque, não cria
    if (yampiSkuSet.has(p.sku.toUpperCase())) continue; // já existe na Yampi
    const base = p.codigo_base;
    if (!gruposPorBase.has(base)) gruposPorBase.set(base, []);
    gruposPorBase.get(base).push(p);
  }

  // Remove grupos onde algum SKU já existe na Yampi (produto parcialmente criado)
  for (const [base, variantes] of gruposPorBase) {
    if (variantes.some((v) => yampiSkuSet.has(v.sku.toUpperCase()))) {
      gruposPorBase.delete(base);
    }
  }

  log(`\n--- FASE 2: Criando ${gruposPorBase.size} novos produtos na Yampi ---`);

  if (gruposPorBase.size > 0) {
    const varTamanho = await garantirVariacao('Tamanho');
    const varCor = await garantirVariacao('Cor');
    const marcaId = await garantirMarca();

    // Mapa nome normalizado → produto Yampi (para fallback quando nome já existe)
    const yampiPorNome = new Map();
    for (const p of produtosYampi) {
      if (p.name) yampiPorNome.set(p.name.trim().toUpperCase(), p);
    }

    for (const [codigoBase, variantes] of gruposPorBase) {
      try {
        const skusDecodificados = [];
        const coresUnicas = new Set();
        const tamanhosUnicos = new Set();

        for (const v of variantes) {
          const { tamNome, corCodigo, corNome } = decodificarSku(v.sku, v.codigo_base, tamNomesOrdenados, coresMap);
          skusDecodificados.push({ ...v, tamNome, corCodigo, corNome });
          if (tamNome) tamanhosUnicos.add(tamNome);
          if (corNome) coresUnicas.add(corNome);
        }

        const primeiro = skusDecodificados[0];
        const nomeBase = nomeBaseProduto(primeiro.nome, primeiro.corNome, primeiro.tamNome);
        const temTamanho = tamanhosUnicos.size > 0;
        const todosTemCor = skusDecodificados.every((v) => v.corNome);
        const temCor = coresUnicas.size > 0 && todosTemCor;
        const isSimple = !temTamanho && !temCor;

        const variationsIds = [];
        if (temCor) variationsIds.push(varCor.variacaoId);
        if (temTamanho) variationsIds.push(varTamanho.variacaoId);

        const skusList = [];
        for (const v of skusDecodificados) {
          const qtd = estoqueMap.get(v.sku) || 0;
          const variationsValuesIds = [];

          if (temCor && v.corNome) {
            const corValorId = await garantirValorVariacao(varCor.variacaoId, varCor.mapaValores, v.corNome);
            variationsValuesIds.push(corValorId);
          }
          if (v.tamNome) {
            const tamValorId = await garantirValorVariacao(varTamanho.variacaoId, varTamanho.mapaValores, v.tamNome);
            variationsValuesIds.push(tamValorId);
          }

          skusList.push({
            sku: v.sku,
            erp_id: v.sku,
            price_cost: v.valor_compra || 0,
            price_sale: v.valor_venda || 0,
            weight: 0.3,
            height: 5,
            width: 30,
            length: 40,
            quantity_managed: true,
            availability: qtd,
            availability_soldout: 0,
            blocked_sale: false,
            variations_values_ids: variationsValuesIds,
          });
        }

        const novoProduto = {
          name: nomeBase,
          erp_id: codigoBase,
          brand_id: marcaId,
          simple: isSimple,
          active: true,
          searchable: true,
          ncm: primeiro.ncm || '',
          variations_ids: variationsIds,
          skus: skusList,
        };

        log(`CRIANDO "${nomeBase}" (${codigoBase}) | ${coresUnicas.size} cor(es), ${tamanhosUnicos.size} tam(s), ${skusList.length} SKU(s)`);

        let skusCriados = null;
        try {
          const criado = await criarProduto(novoProduto);
          produtosCriados++;
          skusCriados = criado?.skus?.data || [];

          // Registra o produto recem-criado no mapa de nomes para que grupos
          // seguintes com o MESMO nome (ex.: multiplos "CORSET BRASIL" no Sellbie)
          // sejam vinculados a ele via fallback, em vez de falhar por nome em uso.
          if (criado?.id) {
            yampiPorNome.set(nomeBase.trim().toUpperCase(), {
              id: criado.id,
              name: nomeBase,
              simple: isSimple,
              brand_id: marcaId,
              active: true,
            });
          }
        } catch (err) {
          const isNameConflict =
            err.response?.status === 422 &&
            err.response?.data?.errors?.name;

          if (!isNameConflict) {
            const msg = err.response?.data?.message || err.message;
            const detail = err.response?.data ? JSON.stringify(err.response.data) : '';
            log(`ERRO produto base "${codigoBase}": ${msg} ${detail}`);
            erros++;
            await sleep(300);
            continue;
          }

          // Fallback: produto já existe por nome — vincular erp_id e criar SKUs
          const yampiProd = yampiPorNome.get(nomeBase.toUpperCase());
          if (!yampiProd) {
            log(`ERRO produto base "${codigoBase}": nome em uso mas não encontrado no mapa local`);
            erros++;
            await sleep(300);
            continue;
          }

          log(`VINCULANDO "${nomeBase}" (${codigoBase}) → produto Yampi ID ${yampiProd.id}`);
          try {
            await atualizarProduto(yampiProd.id, {
              name: yampiProd.name,
              erp_id: codigoBase,
              simple: yampiProd.simple ?? isSimple,
              brand_id: yampiProd.brand_id || marcaId,
              active: yampiProd.active ?? true,
              variations_ids: variationsIds,
            });

            skusCriados = [];
            for (const skuData of skusList) {
              try {
                const criado = await criarSkuAvulso({ ...skuData, product_id: yampiProd.id });
                skusCriados.push(criado);
                await sleep(150);
              } catch (skuErr) {
                const skuMsg = skuErr.response?.data?.message || skuErr.message;
                log(`  WARN SKU "${skuData.sku}": ${skuMsg}`);
              }
            }
            produtosCriados++;
          } catch (linkErr) {
            const msg = linkErr.response?.data?.message || linkErr.message;
            log(`ERRO ao vincular "${codigoBase}": ${msg}`);
            erros++;
            await sleep(300);
            continue;
          }
        }

        for (const skuCriado of skusCriados) {
          const qtd = estoqueMap.get(skuCriado.sku) || 0;
          try {
            await criarEstoqueSku(skuCriado.id, estoquePadrao.id, qtd);
            estoquesAtualizados++;
          } catch (err) {
            const msg = err.response?.data?.message || err.message;
            if (!msg.includes('ja existe') && !msg.includes('already')) {
              log(`  WARN estoque SKU ${skuCriado.sku}: ${msg}`);
            }
          }
          await sleep(150);
        }

        await sleep(300);
      } catch (err) {
        const msg = err.response?.data?.message || err.message;
        const detail = err.response?.data ? JSON.stringify(err.response.data) : '';
        log(`ERRO produto base "${codigoBase}": ${msg} ${detail}`);
        erros++;
      }
    }
  } // fim if gruposPorBase.size > 0

  log(`\n=== Sincronizacao concluida ===`);
  log(`Estoques atualizados (quantidade alterada): ${estoquesAtualizados}`);
  log(`Estoques zerados (saiu do Sellbie)        : ${estoquesZerados}`);
  log(`Precos atualizados                        : ${precosAtualizados}`);
  log(`Produtos criados                          : ${produtosCriados}`);
  log(`Erros                                     : ${erros}`);

  return { estoquesAtualizados, estoquesZerados, precosAtualizados, produtosCriados, erros };
}

module.exports = { sincronizar };
