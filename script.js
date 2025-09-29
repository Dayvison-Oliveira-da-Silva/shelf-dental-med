// npm i axios
const axios = require("axios");

const TOKEN = "f28f7306025b8e321b5a17c954476c02460655c4e0413cc272b8f2024033d28a";

const URL_INCLUIR = "https://api.tiny.com.br/api2/contato.incluir.php";
const URL_ALTERAR = "https://api.tiny.com.br/api2/contato.alterar.php";

// --- dados do contato (exemplo) ---
const contato = {
  sequencia: "1",
  nome: "Dayvison Oliveira da Silva",
  situacao: "A",
  tipo_pessoa: "F",
  cpf_cnpj: "03686383241",         // <- chave para localizar na alteração
  email: "dayvison.shelf@gmail.com",
  fone: "(92) 981717118",
  endereco: "Rua Exemplo",
  numero: "100",
  bairro: "Novo Aleixo",
  cep: "69099-039",
  obs: "teste api",
  tipos_contato:[{
    tipo: "Cliente"
  }]
};

function formBody(urlencodedObj) {
  return new URLSearchParams(urlencodedObj).toString();
}

function isDuplicateError(resp) {
  const ret = resp?.retorno;
  if (!ret || ret.status !== "Erro") return false;
  // codigo_erro 30 e/ou mensagem com "duplicidade"
  const registros = ret.registros || [];
  return registros.some(r =>
    r?.registro?.codigo_erro === "30" ||
    r?.registro?.codigo_erro === 30 ||
    (r?.registro?.erros || []).some(e =>
      String(e?.erro || "").toLowerCase().includes("duplicidade")
    )
  );
}

async function incluir(payload) {
  const data = formBody({
    token: TOKEN,
    formato: "JSON",
    contato: JSON.stringify({ contatos: [ { contato: payload } ] })
  });
  const { data: resp } = await axios.post(URL_INCLUIR, data, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 30000
  });
  return resp;
}

async function alterarPorCpf(payload) {
  // O alterar aceita localizar por id, codigo ou cpf_cnpj; aqui usamos cpf_cnpj.
  // Basta enviar o mesmo objeto "contato" (em array) incluindo o cpf_cnpj.
  const data = formBody({
    token: TOKEN,
    formato: "JSON",
    contato: JSON.stringify({ contatos: [ { contato: payload } ] })
  });
  const { data: resp } = await axios.post(URL_ALTERAR, data, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 30000
  });
  return resp;
}

(async function run() {
  try {
    console.log("➡️ Incluindo contato...");
    const respInc = await incluir(contato);
    console.dir(respInc, { depth: null });

    if (isDuplicateError(respInc)) {
      console.log("⚠️ Duplicado. Tentando alterar pelo CPF/CNPJ...");
      const respAlt = await alterarPorCpf(contato);
      console.dir(respAlt, { depth: null });
    }

    console.log("✅ Finalizado.");
  } catch (err) {
    console.error("❌ Falha:", err?.response?.data ?? err.message);
  }
})();
