/* LexFixer — interface (roda no navegador). Usa JSZip, SheetJS, pdf.js e o motor LEX. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const state = { peticao: null, plan: null, extrato: null, socioTexto: "", arqs: null };

  function low(f) { return (f.name || "").toLowerCase(); }
  function identificar(files) {
    // ignora arquivos temporários de bloqueio do Word/Office (~$...) e ocultos
    const arr = Array.from(files).filter(f => {
      const n = f.name || "";
      return !n.startsWith("~$") && !n.startsWith(".") && !/^~\$|\.tmp$/i.test(n);
    });
    const excl = ["backup", "original", "ajustada", "corrigida", "manual"];
    const isDocx = f => low(f).endsWith(".docx");
    const pdf = pats => arr.find(f => low(f).endsWith(".pdf") && pats.some(p => low(f).indexOf(p) >= 0));
    const peticao = arr.find(f => isDocx(f) && (low(f).indexOf("peti") >= 0) && !excl.some(x => low(f).indexOf(x) >= 0))
      || arr.find(f => isDocx(f) && low(f).indexOf("ocio") < 0 && !excl.some(x => low(f).indexOf(x) >= 0));
    const xlsx = arr.find(f => low(f).endsWith(".xlsx"));
    const extrato = pdf(["extrato", "fatura"]) || pdf(["06"]);
    const docs = pdf(["pessoa", "pessoais"]) || arr.find(f => low(f).endsWith(".pdf") && low(f).indexOf("04") >= 0);
    const procuracao = pdf(["proc"]) || arr.find(f => low(f).endsWith(".pdf") && low(f).indexOf("02") >= 0);
    const validacao = pdf(["valida"]) || arr.find(f => low(f).endsWith(".pdf") && low(f).indexOf("05") >= 0);
    const jus = pdf(["jus", "hipossufi"]) || arr.find(f => low(f).endsWith(".pdf") && low(f).indexOf("03") >= 0);
    const socio = arr.find(f => isDocx(f) && low(f).indexOf("ocio") >= 0);
    // documentos que podem conter o endereço com número
    const residencia = arr.filter(f => low(f).endsWith(".pdf") && f !== extrato &&
      (/proc|jus|residenc|comprovante|declara|pessoa|fatura/.test(low(f))));
    [docs, procuracao].forEach(f => { if (f && residencia.indexOf(f) < 0) residencia.unshift(f); });
    // kits obrigatórios (socioeconômico é o único opcional)
    const OBRIG = [["Petição", peticao], ["Tabela de descontos", xlsx], ["Extrato/Faturas", extrato],
      ["Documentos pessoais (RG/CNH)", docs], ["Procuração", procuracao], ["KIT Validação", validacao],
      ["Declaração de hipossuficiência (JUS)", jus]];
    const faltando = OBRIG.filter(k => !k[1]).map(k => k[0]);
    return { peticao, xlsx, extrato, docs, procuracao, validacao, jus, socio, residencia, faltando };
  }

  // Lê os bytes com 1 retentativa — cobre OneDrive/rede que hidrata o arquivo
  // sob demanda (erro "could not be found at the time an operation was processed").
  async function lerBytes(file) {
    const esperas = [700, 1600, 3000];  // dá tempo do OneDrive baixar arquivo grande
    let ultimo;
    for (let tent = 0; tent <= esperas.length; tent++) {
      try { return await file.arrayBuffer(); }
      catch (e) { ultimo = e; if (tent < esperas.length) await new Promise(r => setTimeout(r, esperas[tent])); }
    }
    throw ultimo;
  }
  async function lerDocxPartes(file) {
    const zip = await JSZip.loadAsync(await lerBytes(file));
    const doc = await zip.file("word/document.xml").async("string");
    let styles = null;
    if (zip.file("word/styles.xml")) styles = await zip.file("word/styles.xml").async("string");
    return { zip, doc, styles };
  }
  async function lerDocxTexto(file) {
    const zip = await JSZip.loadAsync(await lerBytes(file));
    const doc = await zip.file("word/document.xml").async("string");
    return LEX.paraTextos(doc).filter(t => t.trim()).join(" ");
  }
  async function lerXlsxLinhas(file) {
    const wb = XLSX.read(await lerBytes(file), { type: "array" });
    let linhas = [];
    wb.SheetNames.forEach(n => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" });
      linhas = linhas.concat(rows);
    });
    return linhas;
  }
  async function lerPdfTexto(file) {
    const pdf = await pdfjsLib.getDocument({ data: await lerBytes(file) }).promise;
    let t = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const c = await (await pdf.getPage(i)).getTextContent();
      t += c.items.map(x => x.str).join(" ") + "\n";
    }
    return t;
  }
  async function renderPdfImgs(file, n) {
    const pdf = await pdfjsLib.getDocument({ data: await lerBytes(file) }).promise;
    const imgs = [];
    for (let i = 1; i <= Math.min(n, pdf.numPages); i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 1.4 });
      const cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height;
      await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
      imgs.push(cv.toDataURL("image/png"));
    }
    return imgs;
  }

  $("#folder").addEventListener("change", async function (e) {
    const files = e.target.files; if (!files || !files.length) return;
    const arqs = identificar(files);
    const ok = v => v ? "✅ " + v.name : "—";
    $("#arquivos").innerHTML =
      "<b>Petição:</b> " + ok(arqs.peticao) + "<br>" +
      "<b>Tabela:</b> " + ok(arqs.xlsx) + " · <b>Extrato/Faturas:</b> " + ok(arqs.extrato) + "<br>" +
      "<b>Documentos (RG/CNH):</b> " + ok(arqs.docs) + " · <b>Procuração:</b> " + ok(arqs.procuracao) + "<br>" +
      "<b>KIT Validação:</b> " + ok(arqs.validacao) + " · <b>JUS (hipossuficiência):</b> " + ok(arqs.jus) + "<br>" +
      "<b>Socioeconômico:</b> " + (arqs.socio ? "✅ " + arqs.socio.name : "— (opcional)");
    // AVISO de kit obrigatório faltando -> retornar ao documento de origem
    if (arqs.faltando && arqs.faltando.length) {
      $("#arquivos").innerHTML +=
        '<div class="warn-box" style="background:#fdecea;border:1px solid #f5b7b1;color:#7b1a13;margin-top:12px">' +
        '⚠️ <b>Documento obrigatório faltando:</b> ' + arqs.faltando.join(", ") +
        '. <b>Retorne ao documento de origem (ORG DOC)</b> e anexe o(s) kit(s) antes de gerar a peça.</div>';
    }
    if (!arqs.peticao) { alert("Não encontrei a petição (.docx) na pasta."); return; }
    $("#dados").innerHTML = "Lendo arquivos…";
    $("#painel").classList.remove("hidden");
    state.arqs = arqs;   // guarda para a leitura manual reaproveitar os kits
    try {
      await carregarPeticao(arqs.peticao);
    } catch (err) {
      mostrarFalhaPeticao(err);
      return;
    }
    await continuarAposPeticao();
  });

  // dica quando o navegador perde a referência do arquivo (nuvem/rede/aberto)
  function dicaArquivo(e) {
    const m = (e && e.message) || String(e);
    return /not be found|NotFound|could not be read|permission/i.test(m)
      ? m + " — arquivo em nuvem (OneDrive) ou em sincronização. Baixe-o localmente e tente de novo."
      : m;
  }

  async function carregarPeticao(file) {
    state.peticao = await lerDocxPartes(file);
    state.peticao.nomeBase = file.name.replace(/\.docx$/i, "");
    state.peticao.data = LEX.extrairPeticao(LEX.mergeRuns(state.peticao.doc));
  }

  function mostrarFalhaPeticao(err) {
    const nome = (err && err.name) ? err.name : "";
    $("#dados").innerHTML =
      "⚠️ <b>Não consegui abrir a petição</b> " + (nome ? "<span class='hint'>(" + esc(nome) + ")</span>" : "") + ". " +
      "Como a pasta está num <b>servidor de rede</b>, a leitura em lote da pasta às vezes falha (o navegador perde a referência dos arquivos). " +
      "A forma confiável é <b>selecionar os arquivos direto</b>:" +
      "<ol style='margin:8px 0 8px 18px;padding:0'>" +
      "<li>Clique no botão abaixo, <b>abra a pasta do cliente</b> e selecione <b>todos os arquivos</b> (Ctrl+A) → Abrir.</li>" +
      "<li>Alternativa 100%: copie a pasta para o PC (ex.: <b>C:\\Temp</b>) e selecione essa cópia no botão de pasta.</li>" +
      "</ol>" +
      "<button id='btnPetManual' class='dl' style='margin-top:4px'>📄 Selecionar os arquivos da pasta manualmente</button>";
    const b = document.getElementById("btnPetManual");
    if (b) b.addEventListener("click", () => petManualInput().click());
  }

  // input de múltiplos arquivos (criado sob demanda) — leitura fresca, contorna
  // a "foto" desatualizada da varredura de pasta em servidor de rede.
  let _petInput = null;
  function petManualInput() {
    if (_petInput) return _petInput;
    _petInput = document.createElement("input");
    _petInput.type = "file"; _petInput.multiple = true; _petInput.style.display = "none";
    document.body.appendChild(_petInput);
    _petInput.addEventListener("change", async function () {
      const files = this.files; if (!files || !files.length) return;
      $("#dados").innerHTML = "Lendo os arquivos selecionados…";
      try {
        const arqs = identificar(files);
        if (!arqs.peticao) { $("#dados").innerHTML = "⚠️ Não encontrei a <b>petição (.docx)</b> entre os arquivos selecionados. Selecione a pasta inteira (Ctrl+A)."; return; }
        state.arqs = arqs;
        await carregarPeticao(arqs.peticao);
        await continuarAposPeticao();
      } catch (err) { $("#dados").innerHTML = "⚠️ Ainda não consegui ler: " + esc(dicaArquivo(err)); }
    });
    return _petInput;
  }

  async function continuarAposPeticao() {
    const arqs = state.arqs || {};
    // demais kits: cada um isolado — uma falha não derruba o resto
    const avisosLeitura = [];
    try { state.plan = arqs.xlsx ? LEX.extrairPlanilha(await lerXlsxLinhas(arqs.xlsx)) : { rubricas: [] }; }
    catch (err) { state.plan = { rubricas: [] }; avisosLeitura.push("tabela de descontos (" + dicaArquivo(err) + ")"); }
    try { state.extrato = arqs.extrato ? LEX.extrairExtrato(await lerPdfTexto(arqs.extrato)) : {}; }
    catch (err) { state.extrato = {}; avisosLeitura.push("extrato/faturas (" + dicaArquivo(err) + ")"); }
    try { state.socioTexto = arqs.socio ? await lerDocxTexto(arqs.socio) : ""; }
    catch (err) { state.socioTexto = ""; avisosLeitura.push("socioeconômico (" + dicaArquivo(err) + ")"); }

    const p = state.peticao.data, pl = state.plan, ex = state.extrato;
    $("#dados").innerHTML =
      "<b>Endereçamento:</b> " + (p.endereco_juizado ? "Juizado" : (p.endereco_vara_comum ? "Vara Comum" : "?")) + (p.anp ? " <span class='hint'>(ANP → Vara Comum)</span>" : "") +
      " · <b>Comarca:</b> " + (p.comarca || "?") + "<br>" +
      "<b>RG:</b> " + (p.rg || "?") + " · <b>CPF:</b> " + (p.cpf || "?") + "<br>" +
      "<b>Agência/Conta:</b> " + p.agencia + " / " + p.conta + " <span class='hint'>(extrato: " + ex.agencia + " / " + ex.conta + ")</span><br>" +
      "<b>Endereço:</b> " + (p.endereco_logradouro || "?") + (p.endereco_tem_numero ? "" : " <span class='hint'>(sem número)</span>") + "<br>" +
      "<b>Período:</b> " + p.periodo.filter(Boolean).join(" a ") + " · <b>Valor da causa:</b> R$ " + (p.valor_causa || "?") + "<br>" +
      "<b>Tabela:</b> total R$ " + pl.total + " · soma R$ " + pl.soma_conferida + " · dobro R$ " + pl.dobro + "<br>" +
      "<b>Rubricas:</b> " + (pl.rubricas || []).join("; ");
    if (avisosLeitura.length) {
      $("#dados").innerHTML +=
        '<div class="warn-box" style="background:#fdecea;border:1px solid #f5b7b1;color:#7b1a13;margin-top:12px">' +
        "⚠️ Não consegui ler: " + esc(avisosLeitura.join(" · ")) + "</div>";
    }
    if (!p.endereco_tem_numero) $("#numero").value = "";

    $("#rg").innerHTML = "renderizando o documento de identidade…";
    if (arqs.docs) {
      try { const imgs = await renderPdfImgs(arqs.docs, 3); $("#rg").innerHTML = imgs.map(s => '<img src="' + s + '">').join(""); }
      catch (err) { $("#rg").innerHTML = "<span class='hint'>não consegui renderizar a identidade (" + dicaArquivo(err) + ")</span>"; }
    } else $("#rg").innerHTML = "<span class='hint'>kit de documentos não encontrado</span>";

    if (arqs.docs) autoDetectar(arqs);   // preenche nascimento/sexo a partir do documento
  }

  $("#btnGerar").addEventListener("click", async function () {
    if (!state.peticao) { alert("Carregue a pasta primeiro."); return; }
    const nasc = $("#nasc").value.trim();
    if (!nasc) { alert("Informe a data de nascimento (dd/mm/aaaa)."); return; }
    const sexo = document.querySelector("input[name=sexo]:checked").value;
    const numero = $("#numero").value.trim() || null;
    const p = state.peticao.data, pl = state.plan, ex = state.extrato;
    const op = { sexo, nascimento: nasc };
    const chk = LEX.conferir(p, pl, ex, op);
    // Ausência de Notificação Prévia (ANP) → SEMPRE Vara Comum (texto da peça ou nome do arquivo).
    const nomePet = deburr(state.peticao.nomeBase || "");
    const anp = !!(p.anp) || /\bANP\b|NOTIF|AUSENCIA DE NOTIF/.test(nomePet);
    let alvoVara = null;
    if (anp) alvoVara = true;
    else if (chk.temExc) alvoVara = true;
    else if (p.valor_causa != null) alvoVara = p.valor_causa > 64840;
    const ctx = {
      sexo, nascimento: nasc, idade: chk.idade, idoso: chk.idoso,
      numero_endereco: numero, socio_texto: state.socioTexto, alvo_vara_comum: alvoVara,
      valores: [pl.total, pl.dobro, p.valor_causa, 15000],
    };
    const res = LEX.corrigir(state.peticao.doc, state.peticao.styles, ctx);

    // regenera o .docx
    state.peticao.zip.file("word/document.xml", res.doc);
    if (res.styles) state.peticao.zip.file("word/styles.xml", res.styles);
    const blob = await state.peticao.zip.generateAsync({
      type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const nome = state.peticao.nomeBase + " - CORRIGIDA.docx";

    // métricas
    const r = chk.resumo;
    $("#metrics").innerHTML =
      metric(r.OK, "OK") + metric(r.ATENCAO, "Atenção") + metric(r.CORRIGIR, "A corrigir") +
      metric(chk.idade != null ? chk.idade : "?", chk.idoso ? "idade (idoso)" : "idade");

    // relatório .md
    const md = relatorioMd(state.peticao.nomeBase, chk, res.log);
    const urlDoc = URL.createObjectURL(blob);
    const urlMd = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    $("#downloads").innerHTML =
      '<a class="dl" href="' + urlDoc + '" download="' + esc(nome) + '">⬇️ Baixar peça corrigida (.docx)</a>' +
      '<a class="dl" style="background:#5b6470" href="' + urlMd + '" download="RELATORIO.md">⬇️ Baixar relatório (.md)</a>';

    // tabela
    const tb = $("#tabela tbody"); tb.innerHTML = "";
    chk.achados.forEach(a => {
      const tr = document.createElement("tr");
      tr.innerHTML = "<td>" + a.n + "</td><td>" + esc(a.ponto) + "</td><td><span class='badge b-" + a.status + "'>" + a.status + "</span></td><td>" + esc(a.msg) + "</td>";
      tb.appendChild(tr);
    });
    $("#log").innerHTML = res.log.map(x => "<li>" + esc(x) + "</li>").join("");
    let avisos = "";
    if (chk.idoso) avisos += "<div class='warn-box'>Cliente idoso: os itens de prioridade (cabeçalho, tópico e pedido) foram inseridos automaticamente — confira antes de protocolar.</div>";
    if (res.socio && res.socio.pedido && !res.socio.ok)
      avisos += "<div class='warn-box' style='background:#fdecea;border-color:#e74c3c;color:#922'>⚠️ Socioeconômico NÃO individualizado automaticamente (não encontrei onde inseri-lo). Insira o texto manualmente na seção de Gratuidade e <b>retorne ao ORG DOC</b>.</div>";
    $("#warnIdoso").innerHTML = avisos;
    $("#resultado").classList.remove("hidden");
    $("#resultado").scrollIntoView({ behavior: "smooth" });
  });

  /* ---------- Máscara de data (evita "03/061992") ---------- */
  $("#nasc").addEventListener("input", function (e) {
    let v = e.target.value.replace(/\D/g, "").slice(0, 8);
    if (v.length >= 5) v = v.slice(0, 2) + "/" + v.slice(2, 4) + "/" + v.slice(4);
    else if (v.length >= 3) v = v.slice(0, 2) + "/" + v.slice(2);
    e.target.value = v;
  });

  /* ---------- Detecção automática de nascimento/sexo ---------- */
  function det(msg) { $("#detStatus").innerHTML = msg; }

  function parseIdentidade(txt) {
    const up = deburr(txt);
    const pad = n => (n < 10 ? "0" : "") + n;
    function norm(d, m, a) {
      d = +d; m = +m; a = +a;
      if (a < 100) a += (a <= (new Date().getFullYear() % 100) ? 2000 : 1900);
      return (m >= 1 && m <= 12 && d >= 1 && d <= 31 && a >= 1900 && a <= 2015) ? pad(d) + "/" + pad(m) + "/" + a : null;
    }
    // todas as datas do texto (com ou sem separador — OCR às vezes some com a barra)
    const datas = []; let re = /(\d{2})[\/.\- ]?(\d{2})[\/.\- ]?(\d{4})/g, mm;
    while ((mm = re.exec(up))) { const v = norm(mm[1], mm[2], mm[3]); if (v) datas.push({ i: mm.index, v }); }
    const idxNasc = []; (up.match(/NASC|BIRTH/g) || []); let r2 = /NASC|BIRTH/g, m2; while ((m2 = r2.exec(up))) idxNasc.push(m2.index);
    const idxExp = []; let r3 = /EXPEDICAO|EMISSAO|VALIDADE|EXPIRY|ISSUE/g, m3; while ((m3 = r3.exec(up))) idxExp.push(m3.index);
    const mrz = up.match(/\b(\d{2})(\d{2})(\d{2})\d?([MF])[A-Z<0-9]{3,}/);
    let dob = null;
    // 1) data mais próxima de um rótulo de nascimento (a ordem do OCR varia entre
    //    colunas — na CNH o rótulo e a data podem sair separados pelo CPF)
    for (const n of idxNasc) { const c = datas.filter(d => Math.abs(d.i - n) < 60).sort((a, b) => Math.abs(a.i - n) - Math.abs(b.i - n))[0]; if (c) { dob = c.v; break; } }
    // 2) MRZ da CIN (AAMMDD + sexo)
    if (!dob && mrz) dob = norm(mrz[3], mrz[2], mrz[1]);
    // 3) fallback: uma data plausível que NÃO esteja colada em "expedição/validade"
    if (!dob) { const c = datas.find(d => !idxExp.some(e => Math.abs(d.i - e) < 45)); if (c) dob = c.v; }
    // sexo
    let s = up.match(/\bSEXO\b[^A-Z]{0,6}([FM])\b/) || up.match(/SEX[O]?\s*\/?\s*SEX?\s*[:\-]?\s*([FM])\b/);
    const sexo = s ? s[1] : (mrz ? mrz[4] : null);
    return { dob, sexo };
  }

  // Worker de OCR com TODOS os assets no mesmo CDN (jsdelivr) que já carrega o app.
  // Evita o modo curto Tesseract.recognize(), que busca worker/core/idioma em
  // unpkg + tessdata.projectnaptha.com — hosts que a rede do escritório pode
  // bloquear, fazendo o OCR falhar em silêncio (ex.: CNH "não lida").
  const TJS = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/";
  let _ocrWorker = null;
  async function getOcrWorker() {
    if (_ocrWorker) return _ocrWorker;
    _ocrWorker = await Tesseract.createWorker("por", 1, {
      workerPath: TJS + "worker.min.js",
      corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0/",
      langPath: "https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0",
      logger: m => { if (m && m.status && m.progress != null) det("🔎 OCR: " + m.status + " " + Math.round(m.progress * 100) + "%"); },
    });
    return _ocrWorker;
  }
  // realça a foto do documento (cinza + contraste) — ajuda o OCR em CNH/RG fotografados.
  function realcar(cv) {
    const ctx = cv.getContext("2d");
    const im = ctx.getImageData(0, 0, cv.width, cv.height), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      g = (g - 128) * 1.35 + 128;
      g = g < 0 ? 0 : g > 255 ? 255 : g;
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    ctx.putImageData(im, 0, 0);
    return cv;
  }
  async function ocrPdf(file, maxPaginas) {
    const pdf = await pdfjsLib.getDocument({ data: await lerBytes(file) }).promise;
    const worker = await getOcrWorker();
    let full = "";
    const n = Math.min(maxPaginas, pdf.numPages);
    for (let i = 1; i <= n; i++) {
      det("🔎 Lendo a imagem do documento (OCR " + i + "/" + n + ")…");
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 3.0 });
      const cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height;
      await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
      realcar(cv);
      const res = await worker.recognize(cv);
      full += "\n" + res.data.text;
      // se já achou nascimento, não precisa OCR das próximas páginas
      if (parseIdentidade(full).dob) break;
    }
    return full;
  }

  function deburr(s) { return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " "); }

  function detectarNumero(logradouro, texto) {
    if (!logradouro) return null;
    const T = deburr(texto), L = deburr(logradouro);
    const core = L.replace(/^(RUA|AVENIDA|AV|BECO|TRAVESSA|TV|ESTRADA|ROD|RODOVIA|CONJUNTO|CONJ|COMUNIDADE|CM|QUADRA|Q|ALAMEDA|AL)\s+/, "");
    for (const alvo of [L, core]) {
      if (!alvo || alvo.length < 4) continue;
      let idx = T.indexOf(alvo);
      while (idx >= 0) {
        const depois = T.slice(idx + alvo.length, idx + alvo.length + 30);
        const m = depois.match(/^[ ,]*(?:N[O.º°]?\.?\s*)?(\d{1,5}|S\/?N)\b/);
        if (m) return /^S\/?N$/.test(m[1]) ? "S/N" : m[1];
        idx = T.indexOf(alvo, idx + 1);
      }
    }
    return null;
  }

  async function detectarNumeroResidencia(arqs) {
    const logr = state.peticao && state.peticao.data ? state.peticao.data.endereco_logradouro : null;
    if (!logr || !arqs.residencia || !arqs.residencia.length) return null;
    for (const f of arqs.residencia) {
      try {
        const num = detectarNumero(logr, await lerPdfTexto(f));
        if (num) return num;
      } catch (e) { /* segue para o próximo */ }
    }
    return null;
  }

  async function autoDetectar(arqs) {
    if (!arqs) { det("Carregue a pasta do cliente primeiro."); return; }
    det("🔎 Lendo os documentos…");
    const partes = [];
    try {
      // número da residência (camada de texto do comprovante/declaração/procuração)
      const num = await detectarNumeroResidencia(arqs);
      if (num && !$("#numero").value) { $("#numero").value = num; partes.push("nº residência <b>" + num + "</b>"); }
      // nascimento / sexo (texto e, se preciso, OCR do RG)
      let txt = arqs.docs ? await lerPdfTexto(arqs.docs) : "";
      let r = parseIdentidade(txt);
      let usouOcr = false;
      if (!r.dob && arqs.docs && typeof Tesseract !== "undefined") {
        usouOcr = true;
        const otxt = await ocrPdf(arqs.docs, 4);
        r = parseIdentidade(txt + "\n" + otxt);
      }
      if (r.dob) { $("#nasc").value = r.dob; partes.push("nascimento <b>" + r.dob + "</b>"); }
      if (r.sexo) { const el = document.querySelector('input[name=sexo][value="' + r.sexo + '"]'); if (el) el.checked = true; partes.push("sexo <b>" + (r.sexo === "F" ? "Feminino" : "Masculino") + "</b>"); }
      let msg;
      if (partes.length) {
        msg = "✅ Detectado dos documentos: " + partes.join(" · ") + ". Confira e ajuste se necessário.";
        // CNH não traz o campo de sexo — avisa para selecionar manualmente.
        if (r.dob && !r.sexo) msg += " ⚠️ O documento (ex.: CNH) não informa o sexo — selecione manualmente.";
      } else if (usouOcr) {
        msg = "⚠️ Não consegui ler o documento por OCR. Verifique a conexão (o OCR baixa o idioma do jsdelivr) e a nitidez da foto; ou preencha manualmente.";
      } else {
        msg = "⚠️ Não consegui detectar automaticamente — preencha olhando os documentos.";
      }
      det(msg);
    } catch (e) { det("⚠️ Falha na leitura automática (" + e.message + ") — preencha manualmente."); }
  }

  $("#btnDetectar").addEventListener("click", function () { if (state.arqs) autoDetectar(state.arqs); else det("Carregue a pasta do cliente primeiro."); });
  { const lm = document.getElementById("linkManual"); if (lm) lm.addEventListener("click", function (e) { e.preventDefault(); $("#painel").classList.remove("hidden"); petManualInput().click(); }); }

  function metric(n, l) { return '<div class="metric"><div class="n">' + n + '</div><div class="l">' + l + '</div></div>'; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
  function relatorioMd(cli, chk, log) {
    const ic = { OK: "✅", ATENCAO: "⚠️", CORRIGIR: "🔧" };
    let L = ["# Relatório — " + cli, "", "Resumo: " + chk.resumo.OK + " OK · " + chk.resumo.ATENCAO + " atenção · " + chk.resumo.CORRIGIR + " a corrigir",
      "Idade: " + chk.idade + (chk.idoso ? " (idoso)" : ""), "", "## 12 pontos"];
    chk.achados.forEach(a => L.push("- [" + a.status + "] " + a.n + ". " + a.ponto + ": " + a.msg));
    L.push("", "## Correções aplicadas"); log.forEach(x => L.push("- " + x));
    return L.join("\n");
  }
})();
