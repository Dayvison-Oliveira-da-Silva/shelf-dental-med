/**
 * Servidor de cadastro • Shelf Dental Med
 * - Firebase Functions (HTTPS)
 * - Realtime Database
 * - Integração Tiny (incluir/alterar)
 * - Validação: origem (whitelist) + chave "x-shelf-key"
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

// ====== CONFIGURAÇÕES ======
const REALTIME_DB_URL = "https://cadastros-shelf-dental-med-default-rtdb.firebaseio.com/";

// Token Tiny (conforme informado)
const TINY_TOKEN = "f28f7306025b8e321b5a17c954476c02460655c4e0413cc272b8f2024033d28a";

// Endpoints Tiny
const URL_INCLUIR = "https://api.tiny.com.br/api2/contato.incluir.php";
const URL_ALTERAR = "https://api.tiny.com.br/api2/contato.alterar.php";

// Chave compartilhada que o cliente deve enviar no header "x-shelf-key"
const SHARED_KEY = "dayvison";

// Whitelist de origens (você pode preencher depois; enquanto vazio, libera "*")
const ALLOWED_ORIGINS = [
  // ex.: "https://www.seusite.com.br", "https://shelf-dental-med.com"
];

// ====== BOOTSTRAP FIREBASE ======
if (!admin.apps.length) {
  admin.initializeApp({
    databaseURL: REALTIME_DB_URL
  });
}
const db = admin.database();

// ====== CORS BÁSICO ======
function corsSetHeaders(req, res) {
  const origin = req.headers.origin || "";

  // Quando a lista estiver vazia, libere para testes locais; depois é só preencher ALLOWED_ORIGINS
  const allowAll = ALLOWED_ORIGINS.length === 0;
  const allowed = allowAll || ALLOWED_ORIGINS.includes(origin);

  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, x-shelf-key, x-ref");

  if (allowed) {
    res.set("Access-Control-Allow-Origin", allowAll ? "*" : origin);
  }
  return allowed;
}

// ====== HELPERS ======
function onlyDigits(v) {
  return String(v || "").replace(/\D+/g, "");
}

function isCPF(v) {
  return onlyDigits(v).length === 11;
}

// indicador pode ser:
// - vendedor: "1"…"4"
// - cpf de quem indicou: 11 dígitos
function parseIndicador(refRaw) {
  const raw = (refRaw || "").trim();
  if (!raw) return { indicador: "", indicadorTipo: "", indicadorValor: "" };

  const digits = onlyDigits(raw);
  if (digits && digits.length === 11) {
    return { indicador: raw, indicadorTipo: "cpf", indicadorValor: digits };
  }
  if (/^[1-4]$/.test(raw)) {
    return { indicador: raw, indicadorTipo: "vendedor", indicadorValor: Number(raw) };
  }
  // não reconhecido
  return { indicador: raw, indicadorTipo: "", indicadorValor: raw };
}

// Observação do Tiny: Universidade + Período + Data (sem hora)
function buildObsTiny({ universidade, periodo }) {
  const agora = new Date();
  const dataBR = agora.toLocaleDateString("pt-BR", { timeZone: "America/Manaus" }); // ex: 03/08/2025
  return `Universidade: ${universidade || ""} | Período: ${periodo || ""} | Data: ${dataBR}`;
}

function formBody(urlencodedObj) {
  return new URLSearchParams(urlencodedObj).toString();
}

function isDuplicateError(resp) {
  const ret = resp?.retorno;
  if (!ret || ret.status !== "Erro") return false;
  const registros = ret.registros || [];
  return registros.some(r =>
    r?.registro?.codigo_erro === "30" ||
    r?.registro?.codigo_erro === 30 ||
    (r?.registro?.erros || []).some(e =>
      String(e?.erro || "").toLowerCase().includes("duplicidade")
    )
  );
}

async function tinyIncluir(contato) {
  const data = formBody({
    token: TINY_TOKEN,
    formato: "JSON",
    contato: JSON.stringify({ contatos: [{ contato }] })
  });
  const { data: resp } = await axios.post(URL_INCLUIR, data, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 30000
  });
  return resp;
}

async function tinyAlterar(contato) {
  const data = formBody({
    token: TINY_TOKEN,
    formato: "JSON",
    contato: JSON.stringify({ contatos: [{ contato }] })
  });
  const { data: resp } = await axios.post(URL_ALTERAR, data, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 30000
  });
  return resp;
}

// Monta o payload do Tiny baseado nos dados do cadastro
function montarContatoTiny(d) {
  return {
    sequencia: "1",
    nome: d.nome || "",
    situacao: "A",
    tipo_pessoa: "F",
    cpf_cnpj: onlyDigits(d.cpf || ""),
    email: d.email || "",
    fone: d.telefone || "",
    endereco: d.rua || "",
    numero: String(d.numero || ""),
    bairro: d.bairro || "",
    cep: d.cep || "",
    obs: buildObsTiny({ universidade: d.universidade, periodo: d.periodo }),
    tipos_contato: [{ tipo: "Cliente" }]
  };
}

// ====== FUNÇÃO HTTP ======
exports.cadastro = functions.https.onRequest(async (req, res) => {
  const allowed = corsSetHeaders(req, res);

  if (req.method === "OPTIONS") {
    // Preflight
    return res.status(204).send("");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Use POST" });
  }

  if (!allowed) {
    return res.status(403).json({ ok: false, error: "Origin not allowed" });
  }

  // Valida chave compartilhada
  const clientKey = req.headers["x-shelf-key"];
  if (clientKey !== SHARED_KEY) {
    return res.status(401).json({ ok: false, error: "Chave inválida" });
  }

  try {
    const body = req.body || {};

    // Aceita indicador via corpo, query ou header
    const refRaw = body.ref || req.query.ref || req.headers["x-ref"];
    const indicadorInfo = parseIndicador(refRaw);

    // Valida campos mínimos
    const obrigatorios = [
      "nome", "cpf", "rua", "numero", "bairro", "cep",
      "cidade", "estado", "telefone", "email", "universidade", "periodo"
    ];
    const faltando = obrigatorios.filter(k => !String(body[k] || "").trim());
    if (faltando.length) {
      return res.status(400).json({ ok: false, error: "Campos obrigatórios faltando", campos: faltando });
    }

    // Salva no Firebase (gerando uma chave por push(), para histórico completo)
    const refCad = db.ref("cadastros").push();
    const cadastroId = refCad.key;

    const agora = Date.now();
    const registro = {
      id: cadastroId,
      nome: body.nome,
      cpf: onlyDigits(body.cpf),
      rua: body.rua,
      numero: String(body.numero || ""),
      bairro: body.bairro,
      cep: body.cep,
      cidade: body.cidade,
      estado: body.estado,
      telefone: body.telefone,
      telefone2: body.telefone2 || "",
      email: body.email,
      universidade: body.universidade,
      universidade_outro: body.universidade_outro || "",
      periodo: body.periodo,
      enviadoTiny: 0,                 // flag de envio
      indicador: indicadorInfo.indicador,
      indicadorTipo: indicadorInfo.indicadorTipo,
      indicadorValor: indicadorInfo.indicadorValor,
      criadoEm: agora,
      origem: req.headers.origin || ""
    };

    await refCad.set(registro);

    // Prepara e envia ao Tiny
    const contatoTiny = montarContatoTiny(registro);

    let tinyResp = await tinyIncluir(contatoTiny);
    let tinyStatus = "incluido";

    if (isDuplicateError(tinyResp)) {
      // Já existe: tenta alterar por CPF/CNPJ
      tinyResp = await tinyAlterar(contatoTiny);
      tinyStatus = "alterado";
    }

    // Atualiza flag no Firebase
    await refCad.update({
      enviadoTiny: 1,
      tinyStatus,
      tinyBruto: tinyResp?.retorno?.status || ""
    });

    return res.json({
      ok: true,
      id: cadastroId,
      tinyStatus,
      tinyRetorno: tinyResp
    });
  } catch (err) {
    console.error("Erro no cadastro:", err?.response?.data || err);
    return res.status(500).json({
      ok: false,
      error: err?.response?.data || err?.message || "Erro interno"
    });
  }
});
