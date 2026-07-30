/* LexFixer — interface (roda no navegador). Usa JSZip, SheetJS, pdf.js e o motor LEX. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const state = { peticao: null, plan: null, extrato: null, socioTexto: "" };

  function low(f) { return (f.name || "").toLowerCase(); }
  function identificar(files) {
    const arr = Array.from(files);
    const excl = ["backup", "original", "ajustada", "corrigida", "manual"];
    const isDocx = f => low(f).endsWith(".docx");
    const peticao = arr.find(f => isDocx(f) && (low(f).indexOf("peti") >= 0) && !excl.some(x => low(f).indexOf(x) >= 0))
      || arr.find(f => isDocx(f) && low(f).indexOf("ocio") < 0 && !excl.some(x => low(f).indexOf(x) >= 0));
    const xlsx = arr.find(f => low(f).endsWith(".xlsx"));
    const extrato = arr.find(f => low(f).endsWith(".pdf") && low(f).indexOf("extrato") >= 0)
      || arr.find(f => low(f).endsWith(".pdf") && /(^|[^a-z])06[^a-z]/.test(low(f)));
    const docs = arr.find(f => low(f).endsWith(".pdf") && (low(f).indexOf("pessoa") >= 0 || low(f).indexOf("pessoais") >= 0))
      || arr.find(f => low(f).endsWith(".pdf") && low(f).indexOf("doc") >= 0 && f !== extrato);
    const socio = arr.find(f => isDocx(f) && low(f).indexOf("ocio") >= 0);
    return { peticao, xlsx, extrato, docs, socio };
  }

  async function lerDocxPartes(file) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const doc = await zip.file("word/document.xml").async("string");
    let styles = null;
    if (zip.file("word/styles.xml")) styles = await zip.file("word/styles.xml").async("string");
    return { zip, doc, styles };
  }
  async function lerDocxTexto(file) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const doc = await zip.file("word/document.xml").async("string");
    return LEX.paraTextos(doc).filter(t => t.trim()).join(" ");
  }
  async function lerXlsxLinhas(file) {
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    let linhas = [];
    wb.SheetNames.forEach(n => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" });
      linhas = linhas.concat(rows);
    });
    return linhas;
  }
  async function lerPdfTexto(file) {
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    let t = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const c = await (await pdf.getPage(i)).getTextContent();
      t += c.items.map(x => x.str).join(" ") + "\n";
    }
    return t;
  }
  async function renderPdfImgs(file, n) {
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
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
    $("#arquivos").innerHTML =
      "<b>Petição:</b> " + (arqs.peticao ? arqs.peticao.name : "— não encontrada —") + "<br>" +
      "<b>Tabela:</b> " + (arqs.xlsx ? arqs.xlsx.name : "—") + " · <b>Extrato:</b> " + (arqs.extrato ? arqs.extrato.name : "—") + "<br>" +
      "<b>Documentos:</b> " + (arqs.docs ? arqs.docs.name : "—") + " · <b>Socioeconômico:</b> " + (arqs.socio ? arqs.socio.name : "—");
    if (!arqs.peticao) { alert("Não encontrei a petição (.docx) na pasta."); return; }
    $("#dados").innerHTML = "Lendo arquivos…";
    $("#painel").classList.remove("hidden");
    try {
      state.peticao = await lerDocxPartes(arqs.peticao);
      state.peticao.nomeBase = arqs.peticao.name.replace(/\.docx$/i, "");
      state.peticao.data = LEX.extrairPeticao(LEX.mergeRuns(state.peticao.doc));
      state.plan = arqs.xlsx ? LEX.extrairPlanilha(await lerXlsxLinhas(arqs.xlsx)) : { rubricas: [] };
      state.extrato = arqs.extrato ? LEX.extrairExtrato(await lerPdfTexto(arqs.extrato)) : {};
      state.socioTexto = arqs.socio ? await lerDocxTexto(arqs.socio) : "";
    } catch (err) { $("#dados").innerHTML = "Erro ao ler: " + err.message; return; }

    const p = state.peticao.data, pl = state.plan, ex = state.extrato;
    $("#dados").innerHTML =
      "<b>Endereçamento:</b> " + (p.endereco_juizado ? "Juizado" : (p.endereco_vara_comum ? "Vara Comum" : "?")) +
      " · <b>Comarca:</b> " + (p.comarca || "?") + "<br>" +
      "<b>RG:</b> " + (p.rg || "?") + " · <b>CPF:</b> " + (p.cpf || "?") + "<br>" +
      "<b>Agência/Conta:</b> " + p.agencia + " / " + p.conta + " <span class='hint'>(extrato: " + ex.agencia + " / " + ex.conta + ")</span><br>" +
      "<b>Endereço:</b> " + (p.endereco_logradouro || "?") + (p.endereco_tem_numero ? "" : " <span class='hint'>(sem número)</span>") + "<br>" +
      "<b>Período:</b> " + p.periodo.filter(Boolean).join(" a ") + " · <b>Valor da causa:</b> R$ " + (p.valor_causa || "?") + "<br>" +
      "<b>Tabela:</b> total R$ " + pl.total + " · soma R$ " + pl.soma_conferida + " · dobro R$ " + pl.dobro + "<br>" +
      "<b>Rubricas:</b> " + (pl.rubricas || []).join("; ");
    if (!p.endereco_tem_numero) $("#numero").value = "";

    $("#rg").innerHTML = "renderizando…";
    if (arqs.docs) {
      try { const imgs = await renderPdfImgs(arqs.docs, 2); $("#rg").innerHTML = imgs.map(s => '<img src="' + s + '">').join(""); }
      catch (err) { $("#rg").innerHTML = "<span class='hint'>não consegui renderizar (" + err.message + ")</span>"; }
    } else $("#rg").innerHTML = "<span class='hint'>kit de documentos não encontrado</span>";
  });

  $("#btnGerar").addEventListener("click", async function () {
    if (!state.peticao) { alert("Carregue a pasta primeiro."); return; }
    const nasc = $("#nasc").value.trim();
    if (!nasc) { alert("Informe a data de nascimento (dd/mm/aaaa)."); return; }
    const sexo = document.querySelector("input[name=sexo]:checked").value;
    const numero = $("#numero").value.trim() || null;
    const p = state.peticao.data, pl = state.plan, ex = state.extrato;
    const op = { sexo, nascimento: nasc };
    const chk = LEX.conferir(p, pl, ex, op);
    let alvoVara = null;
    if (chk.temExc) alvoVara = true;
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
    $("#warnIdoso").innerHTML = chk.idoso
      ? "<div class='warn-box'>Cliente idoso: os itens de prioridade (cabeçalho, tópico e pedido) foram inseridos automaticamente — confira antes de protocolar.</div>" : "";
    $("#resultado").classList.remove("hidden");
    $("#resultado").scrollIntoView({ behavior: "smooth" });
  });

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
