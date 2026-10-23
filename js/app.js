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
    const isDocxExact = f => low(f).endsWith(".docx");
    // aceita .docx E .doc — o Windows/servidor às vezes devolve o NOME CURTO 8.3
    // (ex.: "1PETIO~1.DOC"), que trunca ".docx" em ".DOC" mas é um .docx de verdade.
    const isWord = f => /\.docx?$/.test(low(f));
    const nomePeticao = f => /peti|inicial|rubrica/.test(low(f));  // "rubrica" = kit NG
    const naoSocio = f => low(f).indexOf("ocio") < 0;
    const naoExcl = f => !excl.some(x => low(f).indexOf(x) >= 0);
    const pdf = pats => arr.find(f => low(f).endsWith(".pdf") && pats.some(p => low(f).indexOf(p) >= 0));
    const peticao =
      // 1) .docx com "petição"/"inicial", que não seja socio nem backup/corrigida
      arr.find(f => isDocxExact(f) && nomePeticao(f) && naoSocio(f) && naoExcl(f))
      // 2) qualquer .docx que não seja socio nem backup/corrigida
      || arr.find(f => isDocxExact(f) && naoSocio(f) && naoExcl(f))
      // 3) .doc (nome curto do Windows) com "petição"/"inicial"
      || arr.find(f => isWord(f) && nomePeticao(f) && naoSocio(f) && naoExcl(f))
      // 4) qualquer Word (.doc/.docx) que não seja socio nem backup/corrigida
      || arr.find(f => isWord(f) && naoSocio(f) && naoExcl(f))
      // 5) último recurso: qualquer Word que não seja o socioeconômico
      || arr.find(f => isWord(f) && naoSocio(f));
    const xlsx = arr.find(f => low(f).endsWith(".xlsx"));
    const extrato = pdf(["extrato", "fatura"]) || pdf(["06"]);
    // kit LEX: "04. KIT DOC PESSOAIS"; kit NG: "4. DOCUMENTO DE IDENTIDADE"
    const docs = pdf(["pessoa", "pessoais", "identidade"]) || arr.find(f => low(f).endsWith(".pdf") && low(f).indexOf("04") >= 0);
    const procuracao = pdf(["proc"]) || arr.find(f => low(f).endsWith(".pdf") && low(f).indexOf("02") >= 0);
    // kit LEX: "05. KIT DOC VALIDAÇÃO"; kit NG: "2.1 RELATÓRIO DE CONFORMIDADE" / "2.2 ICP BRA"
    const validacao = pdf(["valida", "conformidade", "icp bra", "icp-bra", "icpbra"]) || arr.find(f => low(f).endsWith(".pdf") && low(f).indexOf("05") >= 0);
    const jus = pdf(["jus", "hipossufi"]) || arr.find(f => low(f).endsWith(".pdf") && low(f).indexOf("03") >= 0);
    const socio = arr.find(f => isWord(f) && low(f).indexOf("ocio") >= 0);
    // documentos que podem conter o endereço com número (inclui "vida e residência" do kit NG)
    const residencia = arr.filter(f => low(f).endsWith(".pdf") && f !== extrato &&
      (/proc|jus|residenc|comprovante|declara|pessoa|identidade|fatura/.test(low(f))));
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
    // 1) leitura direta com retentativa
    const esperas = [500, 1200, 2500];
    let ultimo;
    for (let tent = 0; tent <= esperas.length; tent++) {
      try { return await file.arrayBuffer(); }
      catch (e) { ultimo = e; if (tent < esperas.length) await new Promise(r => setTimeout(r, esperas[tent])); }
    }
    // 2) fallback: leitura em PEDAÇOS — muito mais tolerante para arquivo grande em rede
    try { return await lerBytesPedacos(file); }
    catch (e) { throw ultimo || e; }
  }
  // lê o arquivo em blocos de 256 KB, cada bloco com retentativa; um bloco pequeno
  // passa na rede onde a leitura inteira (ex.: 3,3 MB) falha.
  async function lerBytesPedacos(file, tam) {
    tam = tam || 262144;
    const partes = [];
    for (let off = 0; off < file.size; off += tam) {
      const bloco = file.slice(off, Math.min(off + tam, file.size));
      let buf = null, err = null;
      for (let i = 0; i < 5; i++) {
        try { buf = await bloco.arrayBuffer(); err = null; break; }
        catch (e) { err = e; await new Promise(r => setTimeout(r, 250 * (i + 1))); }
      }
      if (err) throw err;
      partes.push(new Uint8Array(buf));
    }
    const total = partes.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total); let pos = 0;
    for (const p of partes) { out.set(p, pos); pos += p.length; }
    return out.buffer;
  }
  async function lerDocxPartes(file) {
    const zip = await JSZip.loadAsync(await lerBytes(file));
    const alvo = zip.file("word/document.xml");
    if (!alvo) throw new Error("Este arquivo não é um .docx válido (talvez seja um .doc antigo). Abra no Word e salve como .docx.");
    const doc = await alvo.async("string");
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

  function mostrarArquivos(arqs) {
    const ok = v => v ? "✅ " + v.name : "—";
    let h =
      "<b>Petição:</b> " + ok(arqs.peticao) + "<br>" +
      "<b>Tabela:</b> " + ok(arqs.xlsx) + " · <b>Extrato/Faturas:</b> " + ok(arqs.extrato) + "<br>" +
      "<b>Documentos (RG/CNH):</b> " + ok(arqs.docs) + " · <b>Procuração:</b> " + ok(arqs.procuracao) + "<br>" +
      "<b>KIT Validação:</b> " + ok(arqs.validacao) + " · <b>JUS (hipossuficiência):</b> " + ok(arqs.jus) + "<br>" +
      "<b>Socioeconômico:</b> " + (arqs.socio ? "✅ " + arqs.socio.name : "— (opcional)");
    if (arqs.faltando && arqs.faltando.length) {
      h += '<div class="warn-box" style="background:#fdecea;border:1px solid #f5b7b1;color:#7b1a13;margin-top:12px">' +
        '⚠️ <b>Documento obrigatório faltando:</b> ' + arqs.faltando.join(", ") +
        '. <b>Retorne ao documento de origem (ORG DOC)</b> e anexe o(s) kit(s) antes de gerar a peça.</div>';
    }
    $("#arquivos").innerHTML = h;
  }

  // Processa um conjunto de arquivos (de qualquer origem: pasta, seleção manual
  // ou showDirectoryPicker). Identifica os kits, lê a petição e segue.
  async function processarArquivos(files, ignorados) {
    const arqs = identificar(files);
    $("#painel").classList.remove("hidden");
    if (opAtual() === "RJ") { await carregarRJ(arqs, files); return; }   // LA RJ: monta a peça (não há petição a corrigir)
    mostrarArquivos(arqs);
    if (!arqs.peticao) {
      const nomes = Array.from(files).map(f => f.name).join(", ") || "(nenhum)";
      let msg = "⚠️ Não encontrei a <b>petição (.docx)</b> entre os " + files.length + " arquivo(s) lidos:<br>" +
        "<span class='hint'>" + esc(nomes) + "</span>";
      if (ignorados && ignorados.length) {
        msg += "<br><br>⚠️ <b>Não consegui abrir " + ignorados.length + " arquivo(s)</b> (podem estar sincronizando ou em uso no servidor): " +
          "<span class='hint'>" + esc(ignorados.join(", ")) + "</span>.<br>" +
          "Se a petição está aí, <b>aguarde alguns segundos e clique de novo em “Abrir a pasta”</b>, ou selecione o .docx direto:";
      } else {
        msg += "<br><br>Selecione também o <b>.docx da petição</b> (ou a pasta inteira):";
      }
      msg += "<div style='margin-top:8px'><button id='btnPetManual' class='dl'>📄 Selecionar a petição (.docx) manualmente</button></div>";
      $("#dados").innerHTML = msg;
      const b = document.getElementById("btnPetManual"); if (b) b.addEventListener("click", () => petManualInput().click());
      return;
    }
    state.arqs = arqs;
    // novo cliente: o sexo do cliente anterior não pode ficar marcado
    document.querySelectorAll("input[name=sexo]").forEach(el => { el.checked = false; });
    $("#dados").innerHTML = "Lendo arquivos…";
    try { await carregarPeticao(arqs.peticao); }
    catch (err) { mostrarFalhaPeticao(err); return; }
    await continuarAposPeticao();
  }

  $("#folder").addEventListener("change", async function (e) {
    const files = e.target.files; if (!files || !files.length) return;
    await processarArquivos(files);
  });

  // Leitura direta do servidor de rede via File System Access API (Chrome/Edge):
  // getFile() devolve o conteúdo ATUAL de cada arquivo, sem a "foto" que falha em rede.
  async function abrirPastaServidor() {
    if (!window.showDirectoryPicker) {
      alert("Seu navegador não tem esse recurso (use Chrome ou Edge). Vou abrir a seleção manual de arquivos.");
      petManualInput().click();
      return;
    }
    let dir;
    try { dir = await window.showDirectoryPicker({ mode: "read" }); }
    catch (e) {
      if (e && e.name === "AbortError") return;  // usuário cancelou
      // bloqueado por política/segurança -> cai na seleção manual de arquivos
      alert("Não consegui abrir a pasta por aqui (" + ((e && e.name) || "erro") + "). Vou abrir a seleção manual de arquivos.");
      petManualInput().click();
      return;
    }
    $("#painel").classList.remove("hidden");
    $("#dados").innerHTML = "Lendo a pasta do servidor…";
    // coleta os handles de arquivo
    const entries = [];
    try { for await (const entry of dir.values()) if (entry.kind === "file") entries.push(entry); }
    catch (e) { $("#dados").innerHTML = "⚠️ Não consegui listar a pasta: " + esc((e && e.message) || e); return; }
    if (!entries.length) { $("#dados").innerHTML = "⚠️ A pasta parece vazia ou sem permissão de leitura."; return; }
    // 1ª passada
    const files = []; let falhas = [];
    $("#dados").innerHTML = "Lendo " + entries.length + " arquivo(s) do servidor…";
    for (const e of entries) { try { files.push(await getFileRetry(e)); } catch (_) { falhas.push(e); } }
    // arquivos recém-gravados podem estar sincronizando: espera e retenta (sem reabrir a pasta)
    for (let round = 0; round < 3 && falhas.length; round++) {
      $("#dados").innerHTML = "⏳ Aguardando " + falhas.length + " arquivo(s) do servidor sincronizar… (tentativa " + (round + 1) + ")";
      await new Promise(r => setTimeout(r, 2500));
      const aindaFalha = [];
      for (const e of falhas) { try { files.push(await e.getFile()); } catch (_) { aindaFalha.push(e); } }
      falhas = aindaFalha;
    }
    await processarArquivos(files, falhas.map(e => e.name));
  }
  // getFile() pode falhar em rede quando o arquivo está sendo sincronizado/gravado;
  // tenta algumas vezes antes de desistir.
  async function getFileRetry(handle) {
    let ult;
    for (let i = 0; i < 4; i++) {
      if (i) await new Promise(r => setTimeout(r, 600 * i));
      try { return await handle.getFile(); }
      catch (e) { ult = e; }
    }
    throw ult;
  }
  { const bp = document.getElementById("btnAbrirPasta"); if (bp) bp.addEventListener("click", abrirPastaServidor); }

  // dica quando o navegador perde a referência do arquivo (nuvem/rede/aberto)
  function dicaArquivo(e) {
    const m = (e && e.message) || String(e);
    return /not be found|NotFound|could not be read|permission/i.test(m)
      ? m + " — arquivo em nuvem (OneDrive) ou em sincronização. Baixe-o localmente e tente de novo."
      : m;
  }

  async function carregarPeticao(file) {
    state.peticao = await lerDocxPartes(file);
    state.peticao.nomeBase = file.name.replace(/\.docx?$/i, "");
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
      await processarArquivos(files);
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
    // pré-preenche o campo de texto socioeconômico com o que veio da pasta (a equipe pode
    // editar ou colar direto). Só sobrescreve se o campo ainda estiver vazio.
    { const ta = $("#socioTexto"); if (ta && !ta.value.trim() && state.socioTexto) ta.value = state.socioTexto; }

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
    await auditarAM(arqs);
    if (!p.endereco_tem_numero) $("#numero").value = "";

    $("#rg").innerHTML = "renderizando o documento de identidade…";
    if (arqs.docs) {
      try { const imgs = await renderPdfImgs(arqs.docs, 3); $("#rg").innerHTML = imgs.map(s => '<img src="' + s + '">').join(""); }
      catch (err) { $("#rg").innerHTML = "<span class='hint'>não consegui renderizar a identidade (" + dicaArquivo(err) + ")</span>"; }
    } else $("#rg").innerHTML = "<span class='hint'>kit de documentos não encontrado</span>";

    if (arqs.docs) autoDetectar(arqs);   // preenche nascimento/sexo a partir do documento
  }

  // AM/NG: a mesma auditoria tabela × extrato do RJ + regras da operação. Não mexe na peça do LexPRE: só avisa.
  async function auditarAM(arqs) {
    state.audAM = null;
    if (!arqs.xlsx || !arqs.extrato) return;
    try {
      const pl = LEXRJ.planilhaRJ(await lerXlsxAbas(arqs.xlsx));
      if (!pl.grupos.length) return;
      const lanc = LEXRJ.extratoBradesco(await lerPdfItens(arqs.extrato));
      const aud = lanc.length ? LEXRJ.auditarTabela(pl.grupos, lanc) : null;
      LEXRJ.refazerTotais(pl);
      const op = opAtual(), reg = LEXRJ.regrasOperacao(op, pl.grupos);
      const txtPeca = String((state.peticao && state.peticao.doc) || "").replace(/<[^>]+>/g, "");   // total conferido (ou o dobro) tem de aparecer na peça
      if (txtPeca && txtPeca.indexOf(LEXRJ.fmt(pl.total)) < 0 && txtPeca.indexOf(LEXRJ.fmt(pl.dobro)) < 0)
        reg.avisos.unshift({ grave: true, txt: "O total da tabela conferido no extrato (R$ " + LEXRJ.fmt(pl.total) + ", dobro R$ " + LEXRJ.fmt(pl.dobro) +
          ") não aparece na peça: conferir se todos os descontos (todas as abas e blocos da tabela) estão nela." });
      state.audAM = { pl, aud, reg };
      $("#dados").innerHTML += (aud ? "" : "<div class='hint'>Auditoria tabela × extrato indisponível: extrato em formato diferente do Bradesco.</div>") + caixaAuditoria(aud, reg, op);
      const a1 = document.getElementById("rjBaixarAud"); if (a1) a1.addEventListener("click", function (e) { e.preventDefault(); baixarAuditoriaCsv(aud); });
      const a2 = document.getElementById("rjBaixarTab"); if (a2) a2.addEventListener("click", function (e) { e.preventDefault(); baixarTabelaCorrigida(pl, arqs.xlsx.name); });
    } catch (e) { $("#dados").innerHTML += "<div class='hint'>Auditoria tabela × extrato indisponível (" + esc(dicaArquivo(e)) + ").</div>"; }
  }

  $("#btnGerar").addEventListener("click", async function () {
    if (!state.peticao) { alert("Carregue a pasta primeiro."); return; }
    const nasc = $("#nasc").value.trim();
    if (!nasc) { alert("Informe a data de nascimento (dd/mm/aaaa)."); return; }
    const selSexo = document.querySelector("input[name=sexo]:checked");
    if (!selSexo) { alert("Selecione o sexo do(a) cliente (Feminino ou Masculino) conferindo o documento."); return; }
    const sexo = selSexo.value;
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
    else if (p.valor_causa != null) alvoVara = p.valor_causa > (p.escritorio === "NG" ? 64840 : 50000);  // LA: high ticket R$50k; NG: teto
    // Gratuidade (LA): versão Comum se o foro já é Comum OU se o ÚLTIMO desconto tem mais
    // de 5 anos (prescrição decenal) — exceto parc. cred., bx. ant. finan., título e seguro,
    // que ficam no JEC. Só muda o tópico de gratuidade, não o endereçamento.
    let gratComum = alvoVara, gratMotivo = null;
    if (p.escritorio !== "NG") {
      const datas = [p.periodo[1]].concat((pl.descontos || []).map(d => d.data)).filter(Boolean).map(paraData).filter(Boolean);
      const ultimo = datas.length ? new Date(Math.max.apply(null, datas)) : null;
      const limite = new Date(); limite.setFullYear(limite.getFullYear() - 5);
      const rubs = deburr([p.rubrica_texto, (pl.rubricas || []).join(" "), state.peticao.nomeBase].join(" ")).replace(/[_.]/g, " ");
      const excPrazo = /PARC\s*CRED|BX\s*ANT\s*FIN|TITULO|SEGURO/.test(rubs);
      if (alvoVara) gratMotivo = "foro Vara Comum (valor/rubrica/ANP) → versão COMUM";
      else if (ultimo && ultimo < limite && !excPrazo) { gratComum = true; gratMotivo = "último desconto em " + ultimo.toLocaleDateString("pt-BR") + " (mais de 5 anos) → versão COMUM"; }
      else if (ultimo && ultimo < limite) gratMotivo = "último desconto há mais de 5 anos, mas rubrica é exceção ao prazo (parc. cred./bx. ant. finan./título/seguro) → versão JEC";
      else if (ultimo) gratMotivo = "último desconto em " + ultimo.toLocaleDateString("pt-BR") + " (até 5 anos) e valor ≤ R$ 50.000 → versão JEC";
    }
    // texto socioeconômico: o que estiver colado no campo tem prioridade; senão o da pasta
    const socioTxt = (($("#socioTexto") && $("#socioTexto").value) || "").trim() || state.socioTexto || "";
    const ctx = {
      sexo, nascimento: nasc, idade: chk.idade, idoso: chk.idoso,
      numero_endereco: numero, socio_texto: socioTxt, alvo_vara_comum: alvoVara,
      grat_comum: gratComum, grat_motivo: gratMotivo,
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
    // AUDITORIA DAS TABELAS de valores colocadas na peça
    const audTbl = LEX.auditarTabelas(res.doc);
    if (audTbl && !audTbl.ok)
      avisos += "<div class='warn-box' style='background:#fdecea;border-color:#e74c3c;color:#922'>⚠️ <b>Tabela incorreta — voltar para Organização de documentos (ORG DOC).</b><br>" +
        audTbl.problemas.map(esc).join("<br>") + "</div>";
    if (state.audAM) {   // auditoria tabela × extrato e regras da operação: só avisa (a peça já foi gerada)
      const a = state.audAM.aud, lista = [];
      if (a) {
        const graves = state.audAM.pl.grupos.reduce((n, g) => n + g.descontos.filter(d => d.grave).length, 0);
        if (graves) lista.push(graves + " linha(s) com valor diferente do extrato ou não localizada(s).");
        if (a.compras) lista.push(a.compras + " linha(s) que eram compra no cartão/débito no lugar do desconto.");
        if (a.fora.length) lista.push(a.fora.length + " desconto(s) da mesma rubrica no extrato fora da tabela.");
      }
      state.audAM.reg.avisos.filter(x => x.grave).forEach(x => lista.push(x.txt));
      if (lista.length) avisos += "<div class='warn-box' style='background:#fdecea;border-color:#e74c3c;color:#922'>⚠️ <b>Auditoria tabela × extrato — voltar para Organização de documentos (ORG DOC).</b><br>" +
        lista.map(esc).join("<br>") + "<br><span class='hint'>Detalhes, auditoria (.csv) e tabela corrigida no quadro de dados.</span></div>";
    }
    // Painel de orientação de endereçamento (Luis Albert) — a equipe confere
    if (p.escritorio !== "NG")
      avisos += "<div class='warn-box' style='background:#eef4ff;border-color:#a9c3f0;color:#1a3a6b'>" +
        "📍 <b>Endereçamento — confira as regras do escritório (Luis Albert):</b>" +
        "<ul style='margin:6px 0 0 18px;padding:0'>" +
        "<li><b>High ticket</b>: valor da causa <b>&gt; R$ 50.000 → Vara Comum</b>; ≤ R$ 50.000 → JEC (teto do JEC 06/2026 = R$ 64.840, referência).</li>" +
        "<li><b>Prazo</b>: descontos dos últimos <b>5 anos → priorizar JEC</b>; últimos <b>10 anos → priorizar Vara Comum</b>.</li>" +
        "<li><b>Exceções ao prazo</b>: <i>parc. cred., bx. ant. finan., título e seguro</i> vão ao <b>JEC</b> mesmo se prescritas (quinquenal).</li>" +
        "<li><b>IRDR</b>: <i>mora/encargos</i> e <i>cesta de serviços</i> — <b>NUNCA misturar</b> com gastos com crédito, parc. cred. pess. e bx. ant. finan.</li>" +
        "<li><b>1ª rubrica p/ Vara Comum</b>: sempre <b>gastos com crédito</b>.</li>" +
        "<li><b>Empate parc. cred. × bx.</b>: mandar a <b>parc. para a comum</b> (permite juntar contratos e perícia).</li>" +
        "</ul><span class='hint'>A separação das rubricas acontece na Organização de Documentos; o app orienta, a equipe confere.</span></div>";
    $("#warnIdoso").innerHTML = avisos;
    $("#resultado").classList.remove("hidden");
    $("#resultado").scrollIntoView({ behavior: "smooth" });
  });

  /* ---------- Operação: LA AM / LA RJ / NG ---------- */
  // AM e NG seguem o fluxo de correção de sempre; RJ monta a peça a partir do modelo e dos documentos.
  function opAtual() { const el = document.querySelector("input[name=op]:checked"); return el ? el.value : "AM"; }
  function aplicarOp() {
    const rj = opAtual() === "RJ";
    $("#cardRJ").classList.toggle("hidden", !rj);
    $("#btnGerar").classList.toggle("hidden", rj);
    { const n = $("#numero"); if (n && n.parentElement) n.parentElement.classList.toggle("hidden", rj); }
    try { localStorage.setItem("lexfixer.op", opAtual()); } catch (e) { /* preferência só de conveniência */ }
    if (rj) atualizarStatusModelo();
  }
  try { const s = localStorage.getItem("lexfixer.op"); const el = s && document.querySelector('input[name=op][value="' + s + '"]'); if (el) el.checked = true; } catch (e) { /* sem storage: usa AM */ }
  document.querySelectorAll("input[name=op]").forEach(el => el.addEventListener("change", function () {
    aplicarOp();
    if (state.arqs) $("#dados").innerHTML = "Operação alterada — selecione de novo os arquivos do cliente.";
  }));

  /* ---------- LA RJ: modelo guardado no navegador (não vai para o GitHub) ---------- */
  function idb(modo, fn) {
    return new Promise((ok, erro) => {
      const r = indexedDB.open("lexfixer", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("modelos");
      r.onerror = () => erro(r.error);
      r.onsuccess = () => { const tx = r.result.transaction("modelos", modo); const q = fn(tx.objectStore("modelos")); tx.oncomplete = () => ok(q && q.result); tx.onerror = () => erro(tx.error); };
    });
  }
  const modeloGet = () => idb("readonly", s => s.get("rj")).catch(() => null);
  async function atualizarStatusModelo() {
    const m = await modeloGet();
    $("#rjModeloStatus").innerHTML = m
      ? "<b>Modelo:</b> ✅ " + esc(m.nome) + " <span class='hint'>(guardado neste navegador em " + esc(m.data) + ")</span>"
      : "<b>Modelo:</b> ⚠️ ainda não carregado neste computador — clique no botão abaixo e escolha o .docx do modelo RJ.";
  }
  { const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".docx"; inp.style.display = "none"; document.body.appendChild(inp);
    $("#btnModeloRJ").addEventListener("click", () => inp.click());
    inp.addEventListener("change", async function () {
      const f = this.files && this.files[0]; this.value = ""; if (!f) return;
      try {
        const bytes = await lerBytes(f);
        const xml = await (await JSZip.loadAsync(bytes)).file("word/document.xml").async("string");
        if (xml.indexOf("[DADOS_CLIENTE]") < 0 || xml.indexOf("[RESUMO_DETALHES]") < 0) { alert("Este arquivo não parece ser o modelo RJ (não tem [DADOS_CLIENTE] e [RESUMO_DETALHES])."); return; }
        await idb("readwrite", s => s.put({ nome: f.name, data: new Date().toLocaleString("pt-BR"), bytes }, "rj"));
        atualizarStatusModelo();
      } catch (e) { alert("Não consegui guardar o modelo: " + ((e && e.message) || e)); }
    });
  }
  { const sel = $("#rjReu"); LEXRJ.BANCOS.forEach((b, i) => { const o = document.createElement("option"); o.value = i; o.textContent = b.nome; sel.appendChild(o); });
    const o = document.createElement("option"); o.value = "outro"; o.textContent = "Outro réu (colar a qualificação)"; sel.appendChild(o);
    sel.addEventListener("change", () => $("#rjReuOutro").classList.toggle("hidden", sel.value !== "outro")); }

  async function lerPdfItens(file) {   // palavras do PDF com a posição (x, y) — o extrato do app do Bradesco desalinha no texto corrido
    const pdf = await pdfjsLib.getDocument({ data: await lerBytes(file) }).promise, pags = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const c = await (await pdf.getPage(i)).getTextContent();
      pags.push(c.items.filter(x => x.str.trim()).map(x => ({ s: x.str.trim(), x: Math.round(x.transform[4]), y: Math.round(x.transform[5]) })));
    }
    return pags;
  }
  // Tabela no formato da LEXFINDER (uma aba por rubrica: Data · Descrição · Operação · Valor, VALOR TOTAL e EM DOBRO),
  // com a data e o documento/contrato conferidos no extrato. Os valores são os da tabela original.
  function baixarTabelaCorrigida(pl, nomeOrig) {
    const wb = XLSX.utils.book_new();
    pl.grupos.forEach(g => {
      const L = LEXRJ.linhasPeca(g), aoa = [["Data", "Descrição", "Operação", "Valor"]].concat(L.map(d => [d.data, d.desc, d.op, d.val]));
      aoa.push([], ["VALOR TOTAL", "", "", g.total], ["VALOR EM DOBRO", "", "", Math.round(g.total * 200) / 100]);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      for (let r = 1; r < aoa.length; r++) { const c = ws[XLSX.utils.encode_cell({ r, c: 3 })]; if (c && typeof c.v === "number") c.z = '"R$" #,##0.00'; }
      ws["!cols"] = [{ wch: 12 }, { wch: 40 }, { wch: 40 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, ws, g.aba.slice(0, 31));
    });
    XLSX.writeFile(wb, nomeOrig.replace(/\.xlsx?$/i, "") + " - CORRIGIDA.xlsx");
  }
  function baixarAuditoriaCsv(aud) {
    const q = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const linhas = [["Aba", "Data (tabela)", "Descrição", "Operação (tabela)", "Valor", "Apontamento", "Lançamento no extrato"].map(q).join(";")];
    aud.linhas.filter(x => x.prob.length).forEach(x => linhas.push([x.aba, x.data, x.desc, x.op, LEXRJ.fmt(x.val), x.prob.join(" | "), x.extrato].map(q).join(";")));
    aud.fora.forEach(f => linhas.push(["(fora da tabela)", f.data, f.hist, [f.doc, f.contrato].filter(Boolean).join(" "), LEXRJ.fmt(f.val), "lançamento da mesma rubrica no extrato, ausente da tabela", f.compl].map(q).join(";")));
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + linhas.join("\r\n")], { type: "text/csv" }));
    a.download = "AUDITORIA DA TABELA.csv"; document.body.appendChild(a); a.click(); a.remove();
  }

  async function lerXlsxAbas(file) {
    const wb = XLSX.read(await lerBytes(file), { type: "array" });
    return wb.SheetNames.map(n => ({ nome: n, linhas: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" }) }));
  }

  // Quadro da auditoria tabela × extrato + regras da operação. RJ: a peça sai corrigida; AM/NG: a peça vem do LexPRE, só avisa.
  function caixaAuditoria(aud, reg, modo) {
    const rj = modo === "RJ"; let h = "";
    if (aud) {
      const tipo = re => aud.linhas.filter(x => x.prob.some(p => re.test(p))).length;
      const nd = tipo(/^data/), nc = tipo(/^contrato/), nn = tipo(/^não encontrado/), nv = tipo(/^valor/), nD = tipo(/^documento/);
      h += "<div class='warn-box' style='background:#eef4ff;border-color:#a9c3f0;color:#1a3a6b'>🔎 <b>Auditoria tabela × extrato</b> (" + aud.lancExtrato + " lançamentos lidos): " +
        aud.ok + " linha(s) OK · " + aud.comProb + " com apontamento" +
        (nd ? " · <b>" + nd + "</b> data(s) corrigida(s) pelo extrato" : "") + (nv ? " · <b>" + nv + "</b> valor(es) diferente(s)" : "") +
        (nn ? " · <b>" + nn + "</b> não localizada(s) no extrato" : "") + (nD ? " · " + nD + " sem o nº do documento (completado)" : "") +
        (nc ? " · " + nc + " sem o contrato (completado)" : "") + (aud.compras ? " · <b>" + aud.compras + "</b> linha(s) que eram compra no cartão/débito (corrigida(s) para o desconto da rubrica ou retirada(s))" : "") +
        (aud.fora.length ? " · <b>" + aud.fora.length + "</b> lançamento(s) da mesma rubrica no extrato fora da tabela" : "") +
        ". <a href='#' id='rjBaixarAud'>Baixar a auditoria (.csv)</a> · <a href='#' id='rjBaixarTab'>Baixar a tabela corrigida (.xlsx)</a>" +
        (nd || nc || nD || aud.compras ? (rj ? "<br>✅ A peça sai com a data, o documento e o contrato conferidos no extrato (o valor só muda quando a tabela tinha pegado uma compra no lugar do desconto). Anexe a <b>tabela corrigida</b> no lugar da original."
          : "<br>A peça vem do LexPRE com a tabela original: anexe a <b>tabela corrigida</b>" + (aud.compras ? " e <b>devolva para a Organização de Documentos</b> (o valor mudou)" : "") + ".") : "") +
        (nv || nn ? "<br><b style='color:#922'>⛔ Há linha(s) com valor diferente ou não localizada(s) no extrato: " + (rj ? "a peça só é gerada depois que a Organização de Documentos corrigir a tabela." : "devolver para a Organização de Documentos corrigir a tabela.") + "</b>" : "") +
        (aud.fora.length ? "<br>⚠️ Lançamentos da mesma rubrica fora da tabela: confirmar se ficaram de fora de propósito (período/prescrição)." : "") + "</div>";
    }
    if (reg && reg.avisos.length) {
      const grave = reg.avisos.some(a => a.grave);
      h += "<div class='warn-box'" + (grave ? " style='background:#fdecea;border-color:#e74c3c;color:#922'" : "") + ">⚖️ <b>Regras da operação " + esc(modo) + "</b><br>" +
        reg.avisos.map(a => (a.grave ? "⛔ " : "⚠️ ") + esc(a.txt)).join("<br>") + "</div>";
    }
    return h;
  }

  async function carregarRJ(arqs, files) {
    state.arqs = arqs; state.rj = null;
    document.querySelectorAll("input[name=sexo]").forEach(el => { el.checked = false; });
    $("#nasc").value = ""; $("#rjSaida").innerHTML = "";
    const lista = Array.from(files);
    const hipo = lista.find(f => /hipo/i.test(f.name) && /\.pdf$/i.test(f.name));
    const ok = v => v ? "✅ " + esc(v.name) : "—";
    $("#arquivos").innerHTML = "<b>Tabela de descontos:</b> " + ok(arqs.xlsx) + " · <b>Extrato:</b> " + ok(arqs.extrato) + "<br>" +
      "<b>Procuração:</b> " + ok(arqs.procuracao) + " · <b>JUS:</b> " + ok(arqs.jus) + " · <b>Comprovante de renda (HIPO):</b> " + ok(hipo) + "<br>" +
      "<b>Documentos (RG/CNH):</b> " + ok(arqs.docs) + " · <b>KIT Validação:</b> " + ok(arqs.validacao);
    $("#dados").innerHTML = "Lendo os documentos do cliente…";
    const avisos = []; let pl = null, ext = {}, extTxt = "", outorg = null, cc = null;
    try { pl = arqs.xlsx ? LEXRJ.planilhaRJ(await lerXlsxAbas(arqs.xlsx)) : null; } catch (e) { avisos.push("tabela de descontos (" + dicaArquivo(e) + ")"); }
    let lanc = [];
    try {   // extrato com posição de cada palavra: permite remontar os lançamentos e auditar a tabela
      const pags = arqs.extrato ? await lerPdfItens(arqs.extrato) : [];
      extTxt = pags.map(pg => pg.map(i => i.s).join(" ")).join("\n"); ext = LEX.extrairExtrato(extTxt);
      lanc = LEXRJ.extratoBradesco(pags);
    } catch (e) { avisos.push("extrato (" + dicaArquivo(e) + ")"); }
    for (const f of [arqs.procuracao, arqs.jus]) {
      if (!f || outorg) continue;
      try { outorg = LEXRJ.extrairOutorgante(await lerPdfTexto(f)); } catch (e) { avisos.push(f.name + " (" + dicaArquivo(e) + ")"); }
    }
    try { cc = hipo ? LEXRJ.lerContracheque(await lerPdfTexto(hipo)) : null; } catch (e) { avisos.push("comprovante de renda (" + dicaArquivo(e) + ")"); }
    const nomes = lista.map(f => (f.webkitRelativePath || "") + " " + f.name).join(" ");
    const banco = LEXRJ.detectarBanco(nomes + " " + extTxt.slice(0, 3000));
    const aud = pl && pl.grupos.length && lanc.length ? LEXRJ.auditarTabela(pl.grupos, lanc) : null;   // também completa o contrato (d.opPeca)
    const reg = pl && pl.grupos.length ? LEXRJ.regrasOperacao("RJ", pl.grupos) : null;   // decenal: o que tem mais de 10 anos sai
    if (pl) LEXRJ.refazerTotais(pl);   // linhas de compra/prescritas saem ou são corrigidas
    state.rj = { pl, cc, outorg, aud, reg };

    // preenche o formulário (tudo editável)
    $("#rjQualif").value = outorg ? outorg.qualificacao : "";
    $("#rjCidade").value = outorg && outorg.cidade ? outorg.cidade : "";
    $("#rjAgencia").value = ext.agencia || ""; $("#rjConta").value = ext.conta || "";
    $("#rjReu").value = banco ? String(LEXRJ.BANCOS.indexOf(banco)) : "outro";
    $("#rjReuOutro").classList.toggle("hidden", !!banco);
    const cond = pl ? LEXRJ.classificar(pl.grupos.length ? pl.grupos.map(g => g.aba) : pl.rubricas) : {};
    ["TARIFAS", "CREDITO", "SEGURO", "NAO_IDENTIFICADA"].forEach(k => { $("#rjCond" + k).checked = !!cond[k]; });
    { const ta = $("#socioTexto"); if (ta && cc) ta.value = LEXRJ.textoSocio(cc); }

    let h = "";
    if (pl && pl.grupos.length) {
      h += "<b>Tabela:</b> " + pl.grupos.map(g => esc(g.aba) + " (" + g.descontos.length + ")").join(" · ") +
        "<br><b>Total:</b> R$ " + LEXRJ.fmt(pl.total) + " · <b>Dobro:</b> R$ " + LEXRJ.fmt(pl.dobro);
      if (pl.divergencias.length) h += "<div class='warn-box' style='background:#fdecea;border-color:#e74c3c;color:#922'>⚠️ Soma diferente do VALOR TOTAL da aba — conferir na Organização de Documentos: " + pl.divergencias.map(esc).join(" · ") + "</div>";
      if (/CAP|CARTAO|CART\b|TITULO/.test(pl.grupos.map(g => g.aba).join(" ").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()))
        h += "<div class='hint'>Título de capitalização e cartão não têm fundamento próprio no item 3.2 — ficam nos parágrafos gerais.</div>";
    } else h += "<div class='warn-box' style='background:#fdecea;border-color:#e74c3c;color:#922'>⚠️ Não encontrei lançamentos na tabela de descontos. O modelo RJ é para a tabela LEXFINDER (uma aba por rubrica, com Data · Descrição · Valor).</div>";
    if (aud) h += caixaAuditoria(aud, reg, "RJ");
    else if (pl && pl.grupos.length) h += "<div class='hint'>Auditoria tabela × extrato indisponível: extrato em formato diferente do Bradesco Celular.</div>" + caixaAuditoria(null, reg, "RJ");
    h += "<br><b>Réu:</b> " + (banco ? esc(banco.nome) : "<span style='color:#922'>não identificado — escolha ou cole a qualificação</span>");
    h += "<br><b>Agência/Conta (extrato):</b> " + esc((ext.agencia || "?") + " / " + (ext.conta || "?"));
    if (cc) {
      h += "<br><b>Comprovante de renda:</b> " + esc(cc.orgao || "?") + " · " + cc.meses.map(m => esc(m.comp)).join(", ") + " · bruto médio R$ " + LEXRJ.fmt(cc.bruto) + " · líquido médio R$ " + LEXRJ.fmt(cc.liq);
      if (cc.bruto > 5000) h += "<div class='warn-box'>Renda bruta acima de R$ 5.000,00 (parâmetro da ADC 80): a gratuidade depende da demonstração concreta — o advogado deve avaliar.</div>";
    } else h += "<br><b>Comprovante de renda:</b> <span class='hint'>formato não reconhecido (ou ausente) — escreva o texto socioeconômico abaixo com os dados dos documentos.</span>";
    if (avisos.length) h += "<div class='warn-box' style='background:#fdecea;border:1px solid #f5b7b1;color:#7b1a13;margin-top:12px'>⚠️ Não consegui ler: " + esc(avisos.join(" · ")) + "</div>";
    $("#dados").innerHTML = h;
    { const a = document.getElementById("rjBaixarAud"); if (a) a.addEventListener("click", function (e) { e.preventDefault(); baixarAuditoriaCsv(aud); }); }
    { const a = document.getElementById("rjBaixarTab"); if (a) a.addEventListener("click", function (e) { e.preventDefault(); baixarTabelaCorrigida(pl, arqs.xlsx ? arqs.xlsx.name : "TABELA DE DESCONTOS.xlsx"); }); }

    if (cc && cc.nascimento) $("#nasc").value = cc.nascimento;   // já disponível enquanto o OCR roda
    $("#rg").innerHTML = "renderizando o documento de identidade…";
    if (arqs.docs) {
      try { const imgs = await renderPdfImgs(arqs.docs, 3); $("#rg").innerHTML = imgs.map(s => '<img src="' + s + '">').join(""); }
      catch (err) { $("#rg").innerHTML = "<span class='hint'>não consegui renderizar a identidade (" + dicaArquivo(err) + ")</span>"; }
      await autoDetectar(arqs);   // sexo/nascimento por texto + OCR (Tesseract)
      if (!$("#nasc").value && !(cc && cc.nascimento) && typeof Tesseract !== "undefined") await ocrReforcoRJ(arqs.docs);
    } else $("#rg").innerHTML = "<span class='hint'>kit de documentos não encontrado</span>";
    if (cc && cc.nascimento) {   // contracheque traz o nascimento em texto: mais confiável que o OCR
      $("#nasc").value = cc.nascimento;
      $("#detStatus").innerHTML += " <br>📄 Nascimento confirmado pelo comprovante de renda: <b>" + esc(cc.nascimento) + "</b>.";
    }
  }

  // 2ª tentativa de OCR só no RJ (o OCR do AM/NG não muda): resolução maior acha datas que a escala 3 perde
  // em RG fotografado (caso real: data lida em 4.5, não em 3).
  async function ocrReforcoRJ(file) {
    try {
      const pdf = await pdfjsLib.getDocument({ data: await lerBytes(file) }).promise;
      const worker = await getOcrWorker(); let full = "";
      for (let i = 1; i <= Math.min(4, pdf.numPages); i++) {
        det("🔎 2ª leitura do documento em alta resolução (" + i + "/" + Math.min(4, pdf.numPages) + ")…");
        const page = await pdf.getPage(i), vp = page.getViewport({ scale: 4.5 });
        const cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height;
        await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
        full += "\n" + (await worker.recognize(realcar(cv))).data.text;
        const r = parseIdentidade(full);
        if (r.dob) {
          $("#nasc").value = r.dob;
          if (r.sexo && !document.querySelector("input[name=sexo]:checked")) { const el = document.querySelector('input[name=sexo][value="' + r.sexo + '"]'); if (el) el.checked = true; }
          det("✅ Nascimento lido na 2ª leitura: <b>" + r.dob + "</b>" + (r.sexo ? " · sexo <b>" + (r.sexo === "F" ? "Feminino" : "Masculino") + "</b>" : " · ⚠️ selecione o sexo") + ". Confira no documento.");
          return;
        }
      }
      det("⚠️ Não consegui ler a data de nascimento no documento — preencha olhando a imagem ao lado.");
    } catch (e) { det("⚠️ Falha na 2ª leitura (" + ((e && e.message) || e) + ") — preencha manualmente."); }
  }

  $("#btnGerarRJ").addEventListener("click", async function () {
    const m = await modeloGet();
    if (!m) { alert("Carregue primeiro o modelo da peça RJ (.docx)."); return; }
    const rj = state.rj;
    if (!rj || !rj.pl || !rj.pl.grupos.length) { alert("Não há lançamentos da tabela de descontos para montar a peça."); return; }
    { const graves = rj.pl.grupos.reduce((n, g) => n + g.descontos.filter(d => d.grave).length, 0);   // a tabela nunca pode sair errada
      if (graves) { alert(graves + " linha(s) da tabela com valor diferente do extrato ou não localizada(s). Baixe a auditoria (.csv), devolva para a Organização de Documentos corrigir e carregue a pasta de novo."); return; } }
    const selSexo = document.querySelector("input[name=sexo]:checked");
    if (!selSexo) { alert("Selecione o sexo do(a) cliente (Feminino ou Masculino) conferindo o documento."); return; }
    const nasc = $("#nasc").value.trim();
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(nasc)) { alert("Informe a data de nascimento (dd/mm/aaaa)."); return; }
    const qualif = $("#rjQualif").value.trim(), cidade = $("#rjCidade").value.trim();
    const agencia = $("#rjAgencia").value.trim(), conta = $("#rjConta").value.trim();
    const socio = ($("#socioTexto").value || "").trim(), dano = LEXRJ.num($("#rjDano").value);
    const faltam = [[!qualif, "qualificação"], [!cidade, "comarca/cidade"], [!agencia || !conta, "agência e conta"],
      [!socio, "texto socioeconômico"], [!(dano > 0), "valor do dano moral"]].filter(x => x[0]).map(x => x[1]);
    let banco = null;
    if ($("#rjReu").value === "outro") {
      const t = $("#rjReuOutro").value.trim(), i = t.indexOf(",");
      if (i > 0) banco = { nome: t.slice(0, i).trim(), infos: t.slice(i + 1).trim().replace(/[.,]$/, "") };
      else faltam.push("qualificação do réu (NOME, pessoa jurídica…)");
    } else banco = LEXRJ.BANCOS[+$("#rjReu").value];
    if (faltam.length) { alert("Preencha: " + faltam.join(", ") + "."); return; }
    const idade = LEX.idadeEm(nasc);
    const cond = {}; ["TARIFAS", "CREDITO", "SEGURO", "NAO_IDENTIFICADA"].forEach(k => { cond[k] = $("#rjCond" + k).checked; });
    try {
      const zip = await JSZip.loadAsync(m.bytes);
      const xml = await zip.file("word/document.xml").async("string");
      const r = LEXRJ.preencher(xml, {
        qualificacao: LEXRJ.generoTexto(qualif, selSexo.value), sexo: selSexo.value, banco, conta, agencia,
        rubricas: rj.pl.rubricas, grupos: rj.pl.grupos, total: rj.pl.total, dobro: rj.pl.dobro, danoMoral: dano,
        socio: LEXRJ.generoTexto(socio, selSexo.value), relato: $("#rjRelato").value, cidade, data: new Date(), nasc, idade, cond, extenso: LEX.extenso });
      zip.file("word/document.xml", r.xml);
      const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      const nomeCli = (qualif.split(",")[0] || "CLIENTE").trim();
      const nome = "PETIÇÃO INICIAL RJ - RUBRICAS - " + nomeCli + ".docx";
      let h = '<a class="dl" href="' + URL.createObjectURL(blob) + '" download="' + esc(nome) + '">⬇️ Baixar peça RJ (.docx)</a>';
      const av = [];
      if (r.sobra.length) av.push("<b>Campos não preenchidos:</b> " + esc([...new Set(r.sobra)].join(" ")) + " — completar no Word antes do protocolo.");
      if (idade >= 60) av.push("Cliente com " + idade + " anos: prioridade de pessoa idosa incluída (topo, item 1.5 e pedido)" + (idade >= 80 ? ", com a prioridade especial dos 80+." : "."));
      if (!$("#rjRelato").value.trim()) av.push("Sem relato do dano moral: pela regra da Dra. Marcela, o advogado decide se mantém o pedido e o valor.");
      if (rj.pl.divergencias.length) av.push("Tabela com soma divergente do VALOR TOTAL de alguma aba — conferir.");
      if (rj.aud && rj.aud.comProb) av.push("A tabela original tinha " + rj.aud.comProb + " linha(s) com data, documento ou contrato diferente do extrato, ou com compra no cartão/débito no lugar do desconto — a peça já sai corrigida. Anexe a <b>tabela corrigida (.xlsx)</b> (link no quadro de dados) no lugar da original.");
      else if (!rj.aud) av.push("Tabela NÃO conferida com o extrato (formato de extrato não reconhecido) — conferir manualmente antes de protocolar.");
      av.push("Doença grave, pessoa com deficiência e TEA não são detectadas automaticamente — incluir à mão quando houver documento.");
      h += av.map(a => "<div class='warn-box'>" + a + "</div>").join("");
      $("#rjSaida").innerHTML = h;
    } catch (e) { $("#rjSaida").innerHTML = "<div class='warn-box' style='background:#fdecea;border-color:#e74c3c;color:#922'>⚠️ Falha ao montar a peça: " + esc((e && e.message) || e) + "</div>"; }
  });
  aplicarOp();   // estado inicial da tela conforme a operação escolhida

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
    // MRZ (CIN/passaporte): AAMMDD + dígito verificador + sexo. Só vale se o dígito
    // conferir (ICAO 7-3-1) — sequência solta de números + F no lixo do OCR não passa.
    const dvMrz = s => s.split("").reduce((t, c, i) => t + (+c) * [7, 3, 1][i % 3], 0) % 10;
    let mrz = null; { const rm = /\b(\d{2})(\d{2})(\d{2})(\d)([MF])[A-Z<0-9]{3,}/g; let x;
      while ((x = rm.exec(up))) if (dvMrz(x[1] + x[2] + x[3]) === +x[4] && +x[2] >= 1 && +x[2] <= 12 && +x[3] >= 1 && +x[3] <= 31) { mrz = x; break; } }
    let dob = null;
    // 1) data mais próxima de um rótulo de nascimento (a ordem do OCR varia entre
    //    colunas — na CNH o rótulo e a data podem sair separados pelo CPF)
    for (const n of idxNasc) { const c = datas.filter(d => Math.abs(d.i - n) < 60).sort((a, b) => Math.abs(a.i - n) - Math.abs(b.i - n))[0]; if (c) { dob = c.v; break; } }
    // 2) MRZ da CIN (AAMMDD + sexo)
    if (!dob && mrz) dob = norm(mrz[3], mrz[2], mrz[1]);   // mrz[1..3] = AA, MM, DD
    // 3) fallback: uma data plausível que NÃO esteja colada em "expedição/validade"
    if (!dob) { const c = datas.find(d => !idxExp.some(e => Math.abs(d.i - e) < 45)); if (c) dob = c.v; }
    // sexo — fontes em ordem de confiança. No CIN o fundo de segurança vira "lixo" no OCR
    // (letras F soltas): um F logo após o rótulo "SEXO/SEX" NÃO é confiável sozinho.
    const fontes = [];
    if (mrz) fontes.push(mrz[5]);                                                         // MRZ validada
    const cpf = up.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\s+([FM])\b/); if (cpf) fontes.push(cpf[1]); // CIN: valor ao lado do CPF
    const rot = up.match(/\bSEXO\s*[:\-]?\s*([FM])\b/) || up.match(/\bSEXO\s*\/\s*SEX\s*[:\-]?\s*([FM])\b/);
    if (rot) fontes.push(rot[1]);                                                           // rótulo
    const sexoConflito = new Set(fontes).size > 1;
    const sexo = sexoConflito ? null : (fontes[0] || null);  // fontes divergentes → o colaborador escolhe
    return { dob, sexo, sexoConflito };
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

  // "dd/mm/aaaa" ou "aaaa-mm-dd" → Date (null se inválida)
  function paraData(s) {
    let m = String(s).match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
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
        if (r.sexoConflito) msg += " ⚠️ O documento traz indicações de sexo divergentes (leitura incerta) — selecione manualmente.";
        else if (r.dob && !r.sexo) msg += " ⚠️ O documento (ex.: CNH) não informa o sexo — selecione manualmente.";
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
  { const bs = document.getElementById("btnSelArquivos"); if (bs) bs.addEventListener("click", function () { petManualInput().click(); }); }

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
