async function carregarProduto(sku, card = null) {
  const url = `https://produtos-shelf-dental-med-default-rtdb.firebaseio.com/produtos/${sku}.json`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Produto não encontrado");

    const dados = await res.json();

    // Se veio do clique em uma opção, restringe update só no card daquele SKU
    if (!card) {
      // Carregamento inicial: pega todos os cards desse SKU
      document.querySelectorAll(`.produto-card [data-sku="${sku}"]`).forEach(el => atualizarCard(el.closest('.produto-card'), dados, sku));
    } else {
      // Veio de um clique: só atualiza esse card
      atualizarCard(card, dados, sku);
    }

  } catch (erro) {
    console.error(`Erro ao carregar dados do SKU ${sku}:`, erro);
  }
}

// Função auxiliar para atualizar o card inteiro
function atualizarCard(card, dados, sku) {
  // === Descrição ===
  card.querySelectorAll(`.descricao[data-sku]`).forEach(el => {
    el.textContent = dados.nome || "(Sem nome)";
  });

  // === Marca ===
  card.querySelectorAll(`.marca[data-sku]`).forEach(el => {
    el.textContent = dados.marca || "(Sem marca)";
  });

  // === Imagem ===
  const urlImagem =
    dados.anexos && dados.anexos.length > 0 && dados.anexos[0].url
      ? dados.anexos[0].url
      : "img/logo-nav.png";

  card.querySelectorAll(`.produto-card-img img`).forEach(img => {
    img.src = urlImagem;
    img.alt = dados.nome || "Produto";
  });

  // === Preço e Desconto ===
  const preco = parseFloat(dados.preco || 0);
  const promocional = parseFloat(dados.precoPromocional || 0);

  card.querySelectorAll(`.produto-card-price`).forEach(container => {
    const divPreco = container.querySelector('.price');
    const divDesconto = container.querySelector('.desconto');

    if (promocional > 0 && promocional < preco) {
      const descontoPercent = Math.round(((preco - promocional) / preco) * 100);
      divPreco.innerHTML = `
        <span style="text-decoration: line-through; color: #888; font-size: 12px;">R$ ${preco.toFixed(2)}</span><br>
        <span style="color: #e91e63; font-size: 16px; font-weight: bold;">R$ ${promocional.toFixed(2)}</span>
      `;
      divDesconto.innerHTML = `<span style="background: #e91e63; color: white; font-size: 11px; padding: 2px 6px; border-radius: 6px;">-${descontoPercent}% OFF</span>`;
    } else {
      divPreco.innerHTML = `<span style="color: #222; font-size: 16px; font-weight: bold;">R$ ${preco.toFixed(2)}</span>`;
      if (divDesconto) divDesconto.innerHTML = "";
    }
  });

  // === Controle de quantidade e estoque ===
  card.querySelectorAll(`.quantidade`).forEach(container => {
    const btnMenos = container.querySelector('.menos');
    const btnMais = container.querySelector('.mais');
    const input = container.querySelector('input');
    const estoque = parseInt(dados.estoqueAtual || 0);

    // Sempre habilita controles primeiro
    container.style.pointerEvents = "";
    if (btnMenos) btnMenos.disabled = false;
    if (btnMais) btnMais.disabled = false;
    if (input) {
      input.value = 1;
      input.max = estoque > 0 ? estoque : 1;
      input.disabled = false;
    }
    const btnAdd = card.querySelector('.produto-card-sold button');
    if (btnAdd) btnAdd.disabled = false;

    // Se não tem estoque, só desativa controles de compra
    if (estoque === 0) {
      container.style.pointerEvents = "none";
      if (btnMenos) btnMenos.disabled = true;
      if (btnMais) btnMais.disabled = true;
      if (input) input.disabled = true;
      if (btnAdd) btnAdd.disabled = true;
      card.style.opacity = "0.5";
    } else {
      card.style.opacity = "";
    }

    // Adiciona os eventos dos botões de quantidade (sempre remove antes para evitar duplicidade)
    if (btnMenos && btnMais && input && estoque > 0) {
      btnMenos.onclick = () => {
        let atual = parseInt(input.value);
        if (atual > 1) input.value = atual - 1;
      };
      btnMais.onclick = () => {
        let atual = parseInt(input.value);
        if (atual < estoque) input.value = atual + 1;
      };
    }
  });
}

// === Disparar tudo quando a página carregar ===
document.addEventListener("DOMContentLoaded", () => {
  // Carrega todos os SKUs únicos da página (ideal para múltiplos cards)
  const elementosComSku = document.querySelectorAll("[data-sku]");
  const skusUnicos = [...new Set([...elementosComSku].map(el => el.dataset.sku))];
  skusUnicos.forEach(sku => {
    document.querySelectorAll(`.produto-card [data-sku="${sku}"]`).forEach(cardEl => {
      carregarProduto(sku, cardEl.closest('.produto-card'));
    });
  });

  // === Lidar com seleção de opções (variações de SKU) ===
  document.querySelectorAll('.produto-card').forEach(card => {
    card.querySelectorAll('.opcoes span[data-sku]').forEach(opcao => {
      opcao.style.cursor = "pointer";
      opcao.addEventListener('click', function () {
        // Destaca visualmente a opção selecionada
        card.querySelectorAll('.opcoes span[data-sku]').forEach(o => {
          o.style.background = "";
          o.style.color = "";
          o.style.fontWeight = "";
        });
        opcao.style.background = "#09f";
        opcao.style.color = "#fff";
        opcao.style.fontWeight = "bold";

        // Atualiza o card inteiro com o novo SKU
        const novoSku = opcao.dataset.sku;
        carregarProduto(novoSku, card);
      });
    });
  });
});
