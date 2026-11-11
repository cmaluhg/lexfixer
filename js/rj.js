/* LexFixer — operação LA RJ: monta a peça "rubricas reunidas" a partir do MODELO ENXUTO da Dra. Marcela
   (carregado pelo colaborador, nunca publicado) e dos documentos do cliente. Não altera o motor AM/NG (engine.js). */
(function () {
  "use strict";
  const R = {};

  // Qualificação dos réus copiada das petições geradas pelo LexPRE (pasta teste). Banco fora da lista: o colaborador cola.
  R.BANCOS = [
    { re: /BRADESCO/, nome: "BANCO BRADESCO S.A.", infos: "pessoa jurídica de direito privado registrado no CNPJ sob o nº 60.746.948/0001-12, situada em NUC CIDADE DE DEUS, S/N - VILA YARA - OSASCO/SP - 06.029-900" },
    { re: /ITAU|ITAÚ/, nome: "ITAU UNIBANCO S.A.", infos: "pessoa jurídica de direito privado registrado no CNPJ sob o nº 60.701.190/0001-04, situada em PC ALFREDO EGYDIO DE SOUZA ARANHA, 100 BLOCO TORRE OLAVO SETUBAL - PARQUE JABAQUARA - SAO PAULO/SP - 04.344-902" },
    { re: /\bCSF\b|CARREFOUR/, nome: "BANCO CSF S/A", infos: "pessoa jurídica de direito privado registrado no CNPJ sob o nº 08.357.240/0001-50, situada em AV DRA RUTH CARDOSO, 4777 ANDAR 2 - JARDIM UNIVERSIDADE PINHEIROS - SAO PAULO/SP - 05.477-903" },
    { re: /IPANEMA/, nome: "IPANEMA CONSULTORIA DE CREDITO E DE INVESTIMENTO LTDA", infos: "pessoa jurídica de direito privado registrado no CNPJ sob o nº 18.076.267/0001-28, situada em RUA ALVES GUIMARÃES, 1212 - PINHEIROS/SP - 05410-002" },
  ];
  const up = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  R.detectarBanco = function (texto) { const t = up(texto); return R.BANCOS.find(b => b.re.test(t)) || null; };

  // Rubrica (ou nome da aba da planilha LEXFINDER, mais confiável) → bloco do item 3.2. Capitalização e cartão não têm bloco próprio (ficam nos parágrafos gerais).
  const RE_TARIFA = /\bTAR\b|TARIFA|CESTA|PACOTE DE SERV|EXTRATO|SAQUE|2 ?A? ?VIA|ANUIDADE CONTA/;
  const RE_CRED = /CRED|OPERAC|EMPREST|\bEMP\b|FINANC|ENCARGO|MORA|LIQUID|CONTR|ADIANT|JUROS|\bIOF\b|LIMITE|DESCOBERTO|\bPARC|\bBX\b/;
  const RE_SEG = /SEGURO|\bSEG\b|VIDA E PREV|PREVIDENCIA|PRESTAMISTA/;
  const RE_SEM_BLOCO = /\bCAP\b|CAPITALIZ|TITULO|CARTAO|\bCART\b/;
  R.classificar = function (rubricas) {
    const c = { TARIFAS: false, CREDITO: false, SEGURO: false, NAO_IDENTIFICADA: false };
    for (const r of rubricas || []) {
      const t = up(r);
      if (RE_SEG.test(t)) c.SEGURO = true;
      else if (RE_TARIFA.test(t)) c.TARIFAS = true;
      else if (RE_CRED.test(t)) c.CREDITO = true;
      else if (!RE_SEM_BLOCO.test(t)) c.NAO_IDENTIFICADA = true;
    }
    return c;
  };

  // Qualificação do cliente: trecho "OUTORGANTE: …" da procuração (ou da declaração de hipossuficiência).
  R.extrairOutorgante = function (texto) {
    const t = String(texto || "").replace(/\s+/g, " ").replace(/(\d)\s+-\s+(\d)/g, "$1-$2");   // pdf.js: "977 - 00"
    const m = t.match(/(?:OUTORGANTE|CONTRATANTE)\s*:\s*(.+?)(?:\.?\s*N[úu]mero para contato|\s+OUTORGAD[OA]|\s+Eu,\s)/i);
    if (!m) return null;
    let q = m[1].trim().replace(/\s+,/g, ",").replace(/\.$/, "");
    q = q.replace(/(\d)\s+residente/, "$1, residente");     // "CPF … 49 residente" → "49, residente"
    const cid = q.match(/CEP:?\s*[\d.\-]+,\s*([^,]+?)\s*[-\/]\s*([A-Z]{2})\s*$/i);
    return { qualificacao: q, cidade: cid ? cid[1].trim() : null, uf: cid ? cid[2].toUpperCase() : null };
  };

  // Gênero só nos textos do cliente (no texto fixo há "companheiro(a)", que não é do cliente).
  R.generoTexto = function (s, sexo) {
    const fem = String(sexo || "").toUpperCase().charAt(0) === "F";
    s = String(s || "").replace(/([A-Za-zÀ-ÿ]+)\(([aA])\)/g, (m, w, a) => fem ? (/[oO]$/.test(w) ? w.slice(0, -1) : w) + a : w);
    if (fem) s = s.replace(/\bportador do\b/g, "portadora do").replace(/\binscrito no\b/g, "inscrita no")
      .replace(/\bresidente e domiciliado\b/g, "residente e domiciliada");
    return s;
  };

  R.fmt = v => { const s = (Math.round(v * 100) / 100).toFixed(2).split("."); return s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + s[1]; };
  R.valorExtenso = (v, extenso) => R.fmt(v) + (extenso ? " (" + extenso(v) + ")" : "");
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  R.dataExtenso = d => d.getDate() + " de " + MESES[d.getMonth()] + " de " + d.getFullYear();
  R.titulo = s => String(s || "").toLowerCase().replace(/(^|[\s-])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, w => w.toLowerCase());
  R.listaRubricas = rs => { rs = (rs || []).map(r => String(r).trim()).filter(Boolean); return rs.length < 2 ? rs.join("") : rs.slice(0, -1).join(", ") + " e " + rs[rs.length - 1]; };

  // Prioridade de pessoa idosa: textos da Dra. Marcela (PROMPTS_PRIORIDADE / peça revisada), sem alteração de conteúdo.
  R.IDOSO_CAB = "PRIORIDADE DE TRAMITAÇÃO – PESSOA IDOSA";
  R.idosoTopico = function (nasc, idade) {
    const t = ["1.5. DA PRIORIDADE DE TRAMITAÇÃO – PESSOA IDOSA",
      "A parte autora nasceu em " + nasc + " e conta com " + idade + " anos de idade, conforme o documento de identificação anexo.",
      "A Lei nº 10.741/2003 (Estatuto da Pessoa Idosa), em seu art. 71, assegura prioridade na tramitação dos processos e procedimentos em que figure como parte pessoa com idade igual ou superior a 60 (sessenta) anos, garantia reproduzida no art. 1.048, I, do Código de Processo Civil."];
    if (idade >= 80) t.push("Além disso, o art. 71, § 5º, do mesmo Estatuto estabelece que, dentre os processos de pessoas idosas, dar-se-á prioridade especial aos maiores de 80 (oitenta) anos, hipótese em que se enquadra a parte autora.");
    t.push("O documento de identificação anexo comprova a condição da parte autora. Requer, assim, o deferimento da prioridade de tramitação, com a identificação própria dos autos e a adoção das providências necessárias ao seu cumprimento, observando-se que a tramitação prioritária deve ser concedida diante da prova da condição de beneficiário(a) e não cessa com a morte do(a) beneficiário(a), estendendo-se ao cônjuge supérstite ou companheiro(a) em união estável (art. 1.048, §§ 2º, 3º e 4º, do CPC).");
    return t;
  };
  R.idosoPedido = idade => "o deferimento da prioridade de tramitação, nos termos do art. 1.048, I, do CPC e do art. 71 da Lei nº 10.741/2003" +
    (idade >= 80 ? ", com a prioridade especial prevista no art. 71, § 5º, do mesmo diploma;" : ";");

  /* ------------------------------ planilha por aba ------------------------------ */
  // Planilha LEXFINDER: uma aba por rubrica, cada uma com VALOR TOTAL/EM DOBRO. Valor pode vir número ou texto BR/US.
  R.num = function (v) {
    if (typeof v === "number") return v;
    let s = String(v == null ? "" : v).replace(/R\$|\s/g, "");
    if (!s) return null;
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");   // 1.234,56
    else s = s.replace(/,/g, "");                                             // 1,234.56
    const n = parseFloat(s); return isFinite(n) ? n : null;
  };
  const dataCel = v => {
    if (typeof v === "number" && v > 20000 && v < 80000) {   // data serial do Excel
      const d = new Date(Math.round((v - 25569) * 86400000)); const p = n => (n < 10 ? "0" : "") + n;
      return p(d.getUTCDate()) + "/" + p(d.getUTCMonth() + 1) + "/" + d.getUTCFullYear();
    }
    const s = String(v || "").trim(); return /^\d{2}\/\d{2}\/\d{4}/.test(s) ? s.slice(0, 10) : null;
  };
  R.planilhaRJ = function (abas) {   // abas: [{ nome, linhas: [[...]] }]
    const grupos = [];
    for (const a of abas) {
      const g = { aba: a.nome, descontos: [], totalDecl: null };
      for (const l of a.linhas) {
        const c0 = up(l[0]).trim();
        if (c0.indexOf("VALOR TOTAL") === 0) { if (g.totalDecl == null) g.totalDecl = R.num(l[l.length - 1] !== "" ? l[l.length - 1] : l.filter(x => x !== "").pop()); continue; }
        const data = dataCel(l[0]); if (!data) continue;
        const vals = l.slice(1).filter(x => x !== "" && x != null);
        const val = R.num(vals[vals.length - 1]); const desc = String(l[1] || "").trim();
        if (val != null && desc) g.descontos.push({ data, desc, val, op: vals.length >= 3 ? String(vals[vals.length - 2]).trim() : "" });   // Data · Descrição · Operação · Valor
      }
      if (g.descontos.length) { g.total = Math.round(g.descontos.reduce((s, d) => s + d.val, 0) * 100) / 100; grupos.push(g); }
    }
    // aba consolidada ("Todos os Descontos") repete as linhas das abas por rubrica: não soma de novo
    const chave = d => d.data + "|" + d.val.toFixed(2), consol = g => /TODOS|RESUMO|CONSOLID|GERAL/.test(up(g.aba));
    grupos.slice().sort((a, b) => consol(b) - consol(a)).forEach(g => {
      const outras = {}; grupos.filter(o => o !== g).forEach(o => o.descontos.forEach(d => { outras[chave(d)] = (outras[chave(d)] || 0) + 1; }));
      const contida = g.descontos.every(d => outras[chave(d)]-- > 0);
      if (contida && (consol(g) || g.descontos.length >= 3)) grupos.splice(grupos.indexOf(g), 1);
    });
    const total = Math.round(grupos.reduce((s, g) => s + g.total, 0) * 100) / 100;
    const divergencias = grupos.filter(g => g.totalDecl != null && Math.abs(g.totalDecl - g.total) > 0.01)
      .map(g => g.aba + ": soma R$ " + R.fmt(g.total) + " × VALOR TOTAL da aba R$ " + R.fmt(g.totalDecl));
    const rub = {}; grupos.forEach(g => g.descontos.forEach(d => { rub[d.desc.toUpperCase()] = 1; }));
    return { grupos, total, dobro: Math.round(total * 200) / 100, rubricas: Object.keys(rub).sort(), divergencias };
  };

  /* ------------------------------ extrato "Bradesco Celular" (07. KIT DOC EXTRATOS) ------------------------------ */
  // pags: [[{ s, x, y }]] (itens do pdf.js com posição). Cada lançamento: histórico (linha de cima), linha com
  // Docto./valores logo abaixo e, às vezes, complemento (ex.: "CONTR 288818690 PARC 016/024").
  // DATA: impressa só no 1º lançamento de cada dia; vale para ele e para os de baixo até a próxima data. O topo da página sem
  // data herda a última data da página anterior. Prova: lançamentos com a data no próprio texto (saque 24h/ATM, transferência):
  // 397 confirmam esta regra e 0 a contrária nos 3 extratos de teste. As linhas desenhadas do PDF NÃO servem de prova
  // (há linha cheia sob toda linha com data, nas duas hipóteses).
  const RE_DIN = /^(?:-\s?)?\d{1,3}(?:\.\d{3})*,\d{2}$/, RE_DATA = /^\d{2}\/\d{2}\/(?:\d{4}|\d{2})$/;   // "Internet Banking": dd/mm/aa e débito "- 7,20"
  const ano4 = s => s.length === 8 ? s.slice(0, 6) + "20" + s.slice(6) : s;
  R.extratoBradesco = function (pags) {
    const lanc = []; let col = null, dataAtual = null;
    pags.forEach((itens, ip) => {
      const h = n => itens.find(i => i.s.indexOf(n) === 0);
      if (h("Docto.") && h("Débito")) col = { doc: h("Docto.").x, cred: h("Crédito").x, deb: h("Débito").x, sal: h("Saldo").x, hist: h("Histórico").x };
      if (!col) return;
      const topo = (h("Docto.") || { y: 9999 }).y;
      const ultimos = itens.some(i => /[ÚU]ltimos Lan[çc]amentos/i.test(i.s));   // seção do app: repete lançamentos com a data do dia
      const corpo = itens.filter(i => i.y < topo - 2);
      const hist = corpo.filter(i => i.x >= col.hist - 6 && i.x < col.doc - 8 && !RE_DATA.test(i.s));
      const datas = corpo.filter(i => i.x < col.hist - 6 && RE_DATA.test(i.s));
      const linhas = {};
      corpo.filter(i => i.x >= col.doc - 8).forEach(i => { (linhas[i.y] = linhas[i.y] || []).push(i); });
      const vals = Object.keys(linhas).map(Number).sort((a, b) => b - a).map(y => {
        const its = linhas[y], doc = its.find(i => Math.abs(i.x - col.doc) < 15 && /^\d+$/.test(i.s));
        const din = its.filter(i => RE_DIN.test(i.s) && i.x < col.sal - 10);
        const deb = din.find(i => i.x >= col.deb - 5), cred = din.find(i => i.x < col.deb - 5);
        return { y, doc: doc ? doc.s : null, deb: deb ? R.num(deb.s.replace(/^-\s*/, "")) : null, cred: cred ? R.num(cred.s) : null };
      }).filter(v => v.doc || v.deb != null || v.cred != null);
      const usados = new Set(), daPagina = [];
      for (const v of vals) {
        const principal = hist.filter(i => i.y >= v.y && i.y <= v.y + 8 && !usados.has(i)).sort((a, b) => a.y - b.y)[0];
        if (principal) usados.add(principal);
        const topoL = principal ? principal.y : v.y;
        const l = { pag: ip + 1, y: v.y, data: null, hist: principal ? principal.s : "", compl: "", doc: v.doc, deb: v.deb, cred: v.cred, ultimos };
        const dt = datas.find(d => d.y >= v.y - 1 && d.y <= topoL + 1);   // data impressa na própria linha?
        if (dt) dataAtual = ano4(dt.s);
        l.data = dataAtual;   // senão, a do lançamento de cima (ou da página anterior)
        daPagina.push(l); lanc.push(l);
      }
      // complemento: linha de histórico sem valores, logo abaixo da linha de valores do lançamento
      for (const i of hist) {
        if (usados.has(i)) continue;
        const l = daPagina.filter(x => i.y < x.y && i.y >= x.y - 8).sort((a, b) => a.y - b.y)[0];
        if (l) l.compl = (l.compl ? l.compl + " " : "") + i.s;
      }
    });
    return lanc;
  };
  R.contratoDe = s => { const m = String(s || "").match(/CONTR(?:ATO)?\.?\s*\d{5,}(?:\s+PARC\s*\d+\/\d+)?/i); return m ? m[0].replace(/\s+/g, " ").toUpperCase() : null; };
  // Operação para a peça: nº do documento + contrato/parcela; descarta o resto do lançamento seguinte que a planilha às vezes cola.
  R.limparOperacao = op => {
    const s = String(op || ""), doc = (s.match(/\b\d{6,8}\b/) || [])[0] || "", ct = R.contratoDe(s);
    return [doc, ct].filter(Boolean).join(" · ");
  };
  // Cruza cada linha da tabela com o extrato. Também completa o contrato que está no extrato e faltou na planilha.
  R.tirarRemovidas = grupos => {
    for (let i = grupos.length - 1; i >= 0; i--) {
      const g = grupos[i]; g.descontos = g.descontos.filter(d => !d.remover);
      if (!g.descontos.length) grupos.splice(i, 1);
      else g.total = Math.round(g.descontos.reduce((s, d) => s + d.val, 0) * 100) / 100;
    }
  };
  // Regras de cada operação sobre a tabela. RJ: decenal, rubricas reunidas (lançamento com mais de 10 anos sai da tabela).
  // LA AM e NG: decenal; parc. cred., bx. ant. fin., título e seguro com mais de 5 anos → conferir (exceção do prazo);
  // IRDR: mora/encargos e cesta nunca na mesma peça que gastos com crédito, parc. cred. pess. e bx. ant. fin.
  R.regrasOperacao = function (op, grupos, hoje) {
    const ref = hoje || new Date(), lim = anos => { const d = new Date(ref); d.setFullYear(d.getFullYear() - anos); return d; };
    const dt = s => { const p = String(s).split("/"); return new Date(+p[2], +p[1] - 1, +p[0]); };
    const L10 = lim(10), L5 = lim(5), fmtD = d => d.toLocaleDateString("pt-BR");
    const avisos = [], prescritas = [], exc5 = [];
    const irdr = s => /\bMORA\b|ENCARGO|CESTA|PACOTE/.test(s) ? "A" : /PARC(ELA)?\.?\s*CRED|BX\.?\s*ANT|ANTECIPACAO FINANC|GASTOS?\b.*(CRED|CARTAO)/.test(s) ? "B" : "";
    const exc = s => /PARC(ELA)?\.?\s*CRED|BX\.?\s*ANT|ANTECIPACAO FINANC|TITULO|CAPITALIZ|SEGURO/.test(s);
    const tipos = { A: new Set(), B: new Set() };
    grupos.forEach(g => g.descontos.forEach(d => {
      const t = dt(d.dataPeca || d.data), rub = up(g.aba + " " + d.desc);
      if (t < L10) prescritas.push({ aba: g.aba, d });
      else if (op !== "RJ" && t < L5 && exc(rub)) exc5.push({ aba: g.aba, d });
      const k = irdr(up(d.desc)) || irdr(up(g.aba)); if (k) tipos[k].add(g.aba);
    }));
    if (prescritas.length) {
      const soma = Math.round(prescritas.reduce((s, x) => s + x.d.val, 0) * 100) / 100;
      if (op === "RJ") { prescritas.forEach(x => { x.d.remover = true; }); R.tirarRemovidas(grupos); }
      avisos.push({ grave: op !== "RJ", txt: prescritas.length + " desconto(s) anteriores a " + fmtD(L10) + " (prescrição decenal), R$ " + R.fmt(soma) +
        (op === "RJ" ? ": retirados da tabela e da peça." : ": devem sair da tabela.") });
    }
    if (exc5.length) avisos.push({ grave: false, txt: exc5.length + " desconto(s) de parc. cred./bx. ant. fin./título/seguro anteriores a " + fmtD(L5) +
      " (mais de 5 anos): rubrica exceção ao prazo, fica no JEC — conferir a prescrição quinquenal." });
    if (op !== "RJ" && tipos.A.size && tipos.B.size) avisos.push({ grave: true, txt: "IRDR: " + [...tipos.A].join(", ") + " (mora/encargos/cesta) não pode ir na mesma peça que " +
      [...tipos.B].join(", ") + " (gastos com crédito, parc. cred. pess., bx. ant. fin.). Separar na Organização de Documentos." });
    return { avisos, prescritas: prescritas.length, exc5: exc5.length };
  };
  R.refazerTotais = pl => { pl.total = Math.round(pl.grupos.reduce((s, g) => s + g.total, 0) * 100) / 100; pl.dobro = Math.round(pl.total * 200) / 100; return pl; };
  // Compra no cartão/débito nunca é desconto: não entra na tabela nem serve de par na auditoria.
  R.ehCompra = s => /^\W*COMPRA\b/.test(up(s));
  R.auditarTabela = function (grupos, lancTodos) {
    const nz = s => up(s).replace(/[^A-Z0-9]/g, "");
    const lanc = lancTodos.filter(l => !R.ehCompra(l.hist));
    const usados = new Set(), linhas = [];
    for (const g of grupos) for (const d of g.descontos) {
      const docOp = (String(d.op || "").match(/\b\d{6,8}\b/) || String(d.desc || "").match(/\b\d{7}\b/) || [])[0];   // às vezes vem na descrição
      const mesmos = lanc.filter(l => !usados.has(l) && l.data === d.data && l.deb != null);
      const pref = l => (docOp && l.doc === docOp ? 2 : 0) + (nz(l.hist + l.compl).indexOf(nz(d.desc).slice(0, 12)) >= 0 ? 1 : 0);
      const prob = [];
      if (R.ehCompra(d.desc)) {
        d.remover = true;
        linhas.push({ aba: g.aba, data: d.data, desc: d.desc, op: d.op, val: d.val, prob: ["compra no cartão/débito não é desconto: retirada da tabela"], extrato: "" });
        continue;
      }
      // a planilha às vezes pega o valor da compra do mesmo dia no lugar do desconto da rubrica
      const dia = s => { const p = String(s).split("/"); return Date.UTC(+p[2], +p[1] - 1, +p[0]) / 864e5; };
      const comp = docOp ? lancTodos.filter(x => R.ehCompra(x.hist) && x.doc === docOp && x.data && x.deb != null && Math.abs(x.deb - d.val) < 0.006 && Math.abs(dia(x.data) - dia(d.data)) <= 62)
        .sort((a, b) => Math.abs(dia(a.data) - dia(d.data)) - Math.abs(dia(b.data) - dia(d.data)))[0] : null;
      let real = null;
      if (comp) {   // desconto verdadeiro: lançamento da rubrica no mesmo dia da compra (data do extrato)
        const alvo = nz(d.desc).slice(0, 12), nota = "a tabela pegou uma compra (" + comp.hist + " " + comp.compl + ", doc " + comp.doc + ", R$ " + R.fmt(comp.deb) + ")";
        real = alvo.length >= 6 ? lanc.find(x => !usados.has(x) && x.data === comp.data && x.deb != null && nz(x.hist + x.compl).indexOf(alvo) >= 0) : null;
        if (!real) {
          d.remover = true;
          linhas.push({ aba: g.aba, data: d.data, desc: d.desc, op: d.op, val: d.val, prob: [nota + ": não é desconto, retirada da tabela"], extrato: comp.hist + " " + comp.compl });
          continue;
        }
        prob.push(nota + ": corrigido para o desconto da rubrica no extrato, R$ " + R.fmt(real.deb) + ", doc " + real.doc);
        d.valTabela = d.val; d.val = real.deb;
        if (real.data !== d.data) prob.push("data divergente: extrato " + real.data + " × tabela " + d.data);
      }
      // ordem: documento+data+valor → documento+valor (outra data) → data+valor → data+documento (valor diferente)
      let l = real || (docOp ? mesmos.find(x => x.doc === docOp && Math.abs(x.deb - d.val) < 0.006) : null);
      if (!l && docOp) {   // mesma operação e valor, outra data (a planilha às vezes erra a data em dias com vários lançamentos)
        l = lanc.filter(x => !usados.has(x) && x.deb != null && x.doc === docOp && Math.abs(x.deb - d.val) < 0.006 && x.data && Math.abs(dia(x.data) - dia(d.data)) <= 62)
          .sort((a, b) => Math.abs(dia(a.data) - dia(d.data)) - Math.abs(dia(b.data) - dia(d.data)))[0];
        if (l) prob.push("data divergente: extrato " + l.data + " × tabela " + d.data);
      }
      if (!l) l = mesmos.filter(x => Math.abs(x.deb - d.val) < 0.006).sort((a, b) => pref(b) - pref(a))[0];
      if (!l) {   // sem documento na planilha: mesmo valor e mesma descrição (no histórico ou no complemento), até 62 dias
        const alvo = nz(d.desc);
        l = lanc.filter(x => !usados.has(x) && !x.ultimos && x.deb != null && Math.abs(x.deb - d.val) < 0.006 && x.data &&
            alvo.length >= 6 && nz(x.hist + x.compl).indexOf(alvo.slice(0, 12)) >= 0 && Math.abs(dia(x.data) - dia(d.data)) <= 62)
          .sort((a, b) => Math.abs(dia(a.data) - dia(d.data)) - Math.abs(dia(b.data) - dia(d.data)))[0];
        if (l && l.data !== d.data) prob.push("data divergente: extrato " + l.data + " × tabela " + d.data);
      }
      if (!l) {
        const quase = mesmos.filter(x => pref(x) >= 2 || (pref(x) >= 1 && !docOp))[0];
        if (quase) { l = quase; prob.push("valor divergente: extrato R$ " + R.fmt(quase.deb) + " × tabela R$ " + R.fmt(d.val)); }
        else {   // último recurso: mesmo valor até 5 dias, um único candidato (ex.: "Liquid. Contrato" no lugar de "PARC CRED PESS")
          const c5 = lanc.filter(x => !usados.has(x) && !x.ultimos && x.deb != null && Math.abs(x.deb - d.val) < 0.006 && x.data && Math.abs(dia(x.data) - dia(d.data)) <= 5);
          if (c5.length === 1) { l = c5[0]; prob.push("data divergente: extrato " + l.data + " × tabela " + d.data + " (localizado só pelo valor, descrição diferente: conferir)"); }
          else prob.push("não encontrado no extrato (data + valor)");
        }
      }
      if (l) {
        usados.add(l);
        if (docOp && l.doc && docOp !== l.doc && !real) prob.push("documento: tabela " + docOp + " × extrato " + l.doc);
        if (!docOp && l.doc) prob.push("documento " + l.doc + " do extrato ausente na tabela");
        const ct = R.contratoDe(l.compl);
        if (ct && nz(d.op).indexOf(nz(ct.match(/\d{5,}/)[0])) < 0) prob.push("contrato do extrato ausente na tabela: " + ct);
        d.opPeca = [l.doc || docOp, ct || R.contratoDe(d.op)].filter(Boolean).join(" · ");
        if (l.data) d.dataPeca = l.data;   // a peça usa a data do extrato (o valor só muda quando a tabela tinha pegado uma compra)
      } else d.opPeca = R.limparOperacao(d.op);
      d.grave = prob.some(p => /^(valor|não encontrado)/.test(p));   // valor diferente ou não localizado: exige conferência humana
      linhas.push({ aba: g.aba, data: d.data, desc: d.desc, op: d.op, val: d.val, prob, extrato: l ? (l.hist + (l.compl ? " " + l.compl : "")) : "" });
    }
    R.tirarRemovidas(grupos);   // linhas que eram compra saem da tabela; totais refeitos
    // lançamentos do extrato com o mesmo histórico de alguma rubrica da tabela, mas fora dela
    const descs = new Set(); grupos.forEach(g => g.descontos.forEach(d => descs.add(nz(d.desc))));
    const vistos = new Set(lanc.filter(l => usados.has(l)).map(l => l.doc + "|" + l.deb + "|" + l.data));
    // mesma assinatura (histórico + complemento sem números) de um lançamento já casado: pega "PAGTO ELETRON COBRANCA · BRADESCO VIDA…"
    const sig = l => nz(l.hist + " " + String(l.compl || "").replace(/\d+/g, "")), sigs = new Set(lanc.filter(l => usados.has(l)).map(sig));
    const fora = lanc.filter(l => !usados.has(l) && !l.ultimos && l.deb != null && (descs.has(nz(l.hist)) || sigs.has(sig(l))) && !vistos.has(l.doc + "|" + l.deb + "|" + l.data))
      .map(l => ({ data: l.data, hist: l.hist, compl: l.compl, doc: l.doc, val: l.deb, contrato: R.contratoDe(l.compl) }));
    const comProb = linhas.filter(x => x.prob.length);
    return { linhas, fora, ok: linhas.length - comProb.length, comProb: comProb.length, lancExtrato: lancTodos.length,
      compras: linhas.filter(x => x.prob.some(p => /compra/.test(p))).length };
  };

  /* ------------------------------ contracheque (03.1 KIT DOC HIPO) ------------------------------ */
  // Formato do comprovante do Governo do RJ (PMERJ, Rioprevidência…). Outros formatos: retorna null e o colaborador redige.
  R.lerContracheque = function (texto) {
    const t = String(texto || "").replace(/\s+/g, " ");
    const blocos = t.split(/(?=Comprovante de Pagamento\s*-\s*\d{1,2}\/\d{4})/).slice(1);
    const meses = [];
    for (const b of blocos) {
      const comp = (b.match(/^Comprovante de Pagamento\s*-\s*(\d{1,2}\/\d{4})/) || [])[1];
      const tot = b.match(/TOTAL DE GANHOS TOTAL DE DESCONTOS TOTAL L[ÍI]QUIDO ([\d.]+,\d{2}) ([\d.]+,\d{2}) ([\d.]+,\d{2})/);
      if (comp && tot) meses.push({ comp, bruto: R.num(tot[1]), desc: R.num(tot[2]), liq: R.num(tot[3]) });
    }
    if (!meses.length) return null;
    const org = (t.match(/Governan[çc]a (.+?) CNPJ/) || [])[1];
    const nasc = (t.match(/NASCIMENTO (\d{2}\/\d{2}\/\d{4})/) || [])[1];
    const vinc = (t.match(/TIPO DE V[ÍI]NCULO ([A-ZÀ-Ú]+)/) || [])[1] || "";
    const apos = /DATA APOSENTADORIA \d{2}\/\d{2}\/\d{4}/.test(t);
    const ult = meses.slice(-3), media = k => Math.round(ult.reduce((s, m) => s + m[k], 0) / ult.length * 100) / 100;
    return { orgao: org ? org.trim() : null, nascimento: nasc || null, pensao: /PENS/.test(up(vinc)), aposentado: apos,
      meses: ult, bruto: media("bruto"), desc: media("desc"), liq: media("liq") };
  };
  // HIPO em forma de extrato bancário: créditos de salário, benefício, pensão ou aposentadoria (só o que o extrato mostra).
  const RE_RENDA = /(CRED(?:ITO)?\.? (?:DE )?SALARIO|PAG(?:TO|AMENTO)?\.? (?:DE )?SALARIO|SALARIO|INSS|BENEFICIO|PROVENTOS?|PENSAO|APOSENTADORIA)/;
  R.lerRendaExtrato = function (texto) {
    const t = up(texto).replace(/\s+/g, " "), porMes = {};
    for (const p of t.split(/(?=\b\d{2}\/\d{2}\/\d{4}\b)/)) {
      const d = p.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (!d || /ESTORNO|DEVOL/.test(p)) continue;
      const m = p.match(new RegExp(RE_RENDA.source + "[^]{0,80}?(\\d{1,3}(?:\\.\\d{3})*,\\d{2})"));
      if (!m) continue;
      const val = R.num(m[2]); if (!(val > 0)) continue;
      const k = d[3] + "-" + d[2]; porMes[k] = porMes[k] || { mes: d[2] + "/" + d[3], val: 0, tipos: {} };
      porMes[k].val = Math.round((porMes[k].val + val) * 100) / 100; porMes[k].tipos[m[1]] = 1;
    }
    const datas = (t.match(/\b\d{2}\/\d{2}\/\d{4}\b/g) || []).map(mesDe).sort(), ini = datas.length ? mesesAtras(datas.pop(), 11) : "";
    const meses = Object.keys(porMes).filter(k => k >= ini).sort().map(k => porMes[k]).slice(-3);
    if (!meses.length) return null;
    const tp = Object.keys(Object.assign({}, ...meses.map(m => m.tipos))).join(" ");
    const tipo = /PENSAO/.test(tp) ? "pensão" : /APOSENT|PROVENTO/.test(tp) ? "proventos" : /INSS|BENEFICIO/.test(tp) ? "benefício previdenciário" : "salário";
    return { meses, tipo, media: Math.round(meses.reduce((s, m) => s + m.val, 0) / meses.length * 100) / 100 };
  };
  // Sem comprovante legível: usa a declaração de hipossuficiência (JUS) e a profissão declarada nela. Nunca fica vazio.
  R.profissaoDeclarada = function (qualif) {
    const p = String(qualif || "").split(",").map(s => s.trim())[3];   // NOME, NACIONALIDADE, ESTADO CIVIL, PROFISSÃO, RG…
    return p && !/\bRG\b|CPF|RESIDENTE|PORTADOR/i.test(p) ? p : null;
  };
  // Profissão da qualificação → como a pessoa vive ("está desempregada", "trabalha como operadora de caixa"). Concorda com "a parte autora".
  R.ocupacao = function (prof) {
    const u = up(prof || "").trim();
    if (!u) return null;
    if (/DESEMPREGAD/.test(u)) return { frase: "está desempregada", status: true };
    if (/DO LAR|DONA DE CASA/.test(u)) return { frase: "cuida do lar", status: true };
    if (/APOSENTAD/.test(u)) return { frase: "é aposentada", status: true };
    if (/PENSIONISTA/.test(u)) return { frase: "é pensionista", status: true };
    if (/ESTUDANTE/.test(u)) return { frase: "é estudante", status: true };
    if (/AUTONOM/.test(u)) return { frase: "trabalha como autônoma", status: false, prof: "autônomo(a)" };
    const p = String(prof).trim().toLowerCase();
    return { frase: "trabalha como " + p, status: false, prof: p };
  };
  const CIVIL = [[/SOLTEIR/, "solteira"], [/CASAD/, "casada"], [/VIUV/, "viúva"], [/DIVORCIAD/, "divorciada"], [/SEPARAD/, "separada"], [/UNIAO ESTAVEL|CONVIVENTE/, "em união estável"]];
  /* Sem ficha e sem comprovante de renda: conta a vida do cliente com o que a qualificação e o extrato mostram (estado civil,
     ocupação, cidade e gastos). Sem ponto final: o modelo continua com ", de modo que…". */
  R.textoSocioPerfil = function (qualif, g) {
    const ps = String(qualif || "").split(",").map(s => s.trim());
    const civ = CIVIL.find(c => c[0].test(up(ps[2] || ""))), oc = R.ocupacao(R.profissaoDeclarada(qualif));
    const cid = String(qualif || "").match(/CEP:?\s*[\d.\-]+,\s*([^,]+?)\s*[-\/]\s*([A-Z]{2})\s*\.?\s*$/i);
    let s = "A parte autora" + (civ ? ", " + civ[1] + "," : "") + (oc ? " " + oc.frase : "") + (cid ? (oc ? " e" : "") + " reside em " + R.titulo(cid[1]) + "/" + cid[2].toUpperCase() : "");
    if (!oc && !cid) s = "A parte autora" + (civ ? ", " + civ[1] + "," : "") + " mantém o próprio sustento com recursos limitados";
    const base = (oc && oc.frase === "está desempregada" ? "Mesmo sem emprego, precisa arcar" : "Com o que recebe, arca") +
      " com as despesas de moradia, alimentação, transporte e contas de água e luz";
    if (!g) return s + ". " + base;
    const lst = g.itens.map(i => "R$ " + R.fmt(i.media) + " com " + i.cat);
    return s + ". " + base + ", e os extratos bancários anexos registram, " + (g.nMeses > 1 ? "em média por mês, " : "") + R.listaRubricas(lst) +
      " (" + (g.de === g.ate ? g.de : g.de + " a " + g.ate) + ")";
  };
  // Renda pelos créditos do extrato principal (lançamentos do R.extratoBradesco), mesma regra do HIPO.
  R.rendaDosLancamentos = lanc => R.lerRendaExtrato((lanc || []).filter(l => l.cred > 0 && !l.ultimos && l.data)
    .map(l => l.data + " " + l.hist + " " + (l.compl || "") + " " + R.fmt(l.cred)).join(" "));

  // Gastos do dia a dia nos débitos do extrato, por tipo. Rubricas do banco (as impugnadas) e crédito ficam fora.
  R.CAT_GASTOS = [
    ["educação", /ESCOLA|COLEGIO|EDUCACIONAL|EDUCACAO|FACULDADE|UNIVERSIDADE|ENSINO|CRECHE|\bCURSO/],
    ["saúde e farmácia", /FARMA|DROG|RAIA\b|VENANCIO|PACHECO|UNIMED|AMIL\b|SAUDE|HOSPITAL|CLINICA|LABORAT|ODONT/],
    ["supermercado e alimentação", /SUPERMERC|SUPERM\b|MERCADO|ATACAD|ASSAI|PREZUNIC|GUANABARA|HORTIFRUTI|PADARIA|ACOUGUE/],
    ["contas de água, luz e gás", /LIGHT|ENEL\b|AMPLA|CEDAE|AGUAS DO|NATURGY|\bCEG\b|ENERGIA/],
    ["telefone e internet", /CLARO|VIVO\b|\bOI\b|\bTIM\b|\bSKY\b|\bNET\b|TELEFON/],
  ];
  const RE_NAO_GASTO = /MORA|ENCARGO|TARIFA|CESTA|SEGURO|CAPITALIZ|PARCELA CRED|EMPREST|FINANC|IOF|JUROS|MERCADO ?PAGO|POSTO|ESTORNO|TRANSF|SALDO/;
  const mesDe = d => d.slice(6) + "-" + d.slice(3, 5);   // dd/mm/aaaa → aaaa-mm
  const mesesAtras = (m, n) => { const [a, b] = m.split("-").map(Number), k = a * 12 + b - 1 - n; return Math.floor(k / 12) + "-" + String(k % 12 + 1).padStart(2, "0"); };
  // Janela: 12 meses até o fim do extrato; média sobre os meses com débito. Movimento mais antigo não é a realidade de hoje.
  R.gastosExtrato = function (lanc) {
    const todos = (lanc || []).filter(l => !l.ultimos && /^\d{2}\/\d{2}\/\d{4}$/.test(l.data || ""));
    if (!todos.length) return null;
    const fim = todos.map(l => mesDe(l.data)).sort().pop(), ini = mesesAtras(fim, 11);
    const ls = todos.filter(l => l.deb > 0 && mesDe(l.data) >= ini);
    let meses = [...new Set(ls.map(l => mesDe(l.data)))].sort();
    if (!meses.length) return null;
    const ult = meses[meses.length - 1];
    if (meses.length > 1 && Math.max(...ls.filter(l => mesDe(l.data) === ult).map(l => +l.data.slice(0, 2))) < 20) meses.pop();   // mês incompleto
    const cats = {};
    ls.filter(l => meses.indexOf(mesDe(l.data)) >= 0).forEach(l => {
      const t = up(l.hist + " " + (l.compl || ""));
      if (RE_NAO_GASTO.test(t)) return;
      const c = R.CAT_GASTOS.find(c => c[1].test(t)); if (c) cats[c[0]] = (cats[c[0]] || 0) + l.deb;
    });
    const itens = R.CAT_GASTOS.map(c => c[0]).filter(k => cats[k]).map(k => ({ cat: k, media: Math.round(cats[k] / meses.length * 100) / 100 }));
    if (!itens.length) return null;
    const fm = m => m.slice(5) + "/" + m.slice(0, 4);
    return { itens, de: fm(meses[0]), ate: fm(meses[meses.length - 1]), nMeses: meses.length,
      total: Math.round(itens.reduce((s, i) => s + i.media, 0) * 100) / 100 };
  };
  // Extrato em texto com débito negativo ("dd/mm/aaaa HISTÓRICO -950,00", internet banking). Sem sinal não dá para separar débito de crédito: ignora.
  R.lancDoTexto = function (texto) {
    const t = String(texto || "").replace(/\s+/g, " ");
    if (!/\d{2}\/\d{2}\/\d{4} [^\d]{3,60}-\s?\d{1,3}(?:\.\d{3})*,\d{2}/.test(t)) return [];
    const out = [];
    for (const p of t.split(/(?=\b\d{2}\/\d{2}\/\d{4}\b)/)) {
      const m = p.match(/^(\d{2}\/\d{2}\/\d{4}) (.+?) (-\s?)?(\d{1,3}(?:\.\d{3})*,\d{2})(?:\s|$)/);
      if (!m || /SALDO/i.test(m[2])) continue;
      const v = R.num(m[4]); out.push({ data: m[1], hist: m[2].trim(), compl: "", deb: m[3] ? v : null, cred: m[3] ? null : v });
    }
    return out;
  };
  // Ficha socioeconômica do comercial, ex.: "O autor mora em casa alugada, é único(a) provedor(a) de uma renda até 2500 reais
  // para 1 pessoa e tem como principais gastos Aluguel, Água, Luz…". Texto livre (sem esses sinais) não é ficha: volta null.
  const valorFicha = s => R.num(/,\d{2}$/.test(s) ? s : s.replace(/\./g, ""));
  R.lerFicha = function (txt) {
    const t = String(txt || "").replace(/\s+/g, " ").trim(), u = up(t);
    const mor = u.match(/(?:CASA|IMOVEL|APARTAMENTO|RESIDENCIA)\s+(ALUGAD|PROPRI|CEDID|EMPRESTAD|FINANCIAD)|(ALUGUEL)/);
    const gas = t.match(/principais (?:gastos|despesas)\s*(?:s[ãa]o|com|:)?\s*(.+?)\s*\.?\s*$/i);
    const pes = u.match(/(\d+)\s*PESSOAS?/);
    const ren = u.match(/RENDA\D{0,25}?(ATE|ENTRE|DE)?\s*(?:R\$\s*)?(\d[\d.]*(?:,\d{2})?)(?:\s*REAIS)?(?:\s*(?:A|E)\s*(?:R\$\s*)?(\d[\d.]*(?:,\d{2})?))?/);
    const prov = /PROVEDOR/.test(u);
    if ([mor, gas, ren, prov].filter(Boolean).length < 2) return null;
    const k = mor ? (mor[1] || "ALUGAD") : null;
    return {
      moradia: k ? "em imóvel " + { ALUGAD: "alugado", PROPRI: "próprio", CEDID: "cedido", EMPRESTAD: "cedido", FINANCIAD: "financiado" }[k] : null,
      provedor: prov, pessoas: pes ? +pes[1] : null,
      renda: ren ? { tipo: ren[1] === "ATE" ? "ate" : ren[3] ? "entre" : "de", v1: valorFicha(ren[2]), v2: ren[3] ? valorFicha(ren[3]) : null } : null,
      gastos: gas ? gas[1].split(/\s*,\s*|\s+e\s+/i).map(s => s.trim().toLowerCase()).filter(Boolean) : [],
      sexo: /\bA AUTORA\b/.test(u) ? "F" : /\bO AUTOR\b/.test(u) ? "M" : null,
    };
  };

  /* Texto socioeconômico em linguagem corrida: moradia e família (ficha), renda (comprovante, extrato ou ficha) e gastos
     (ficha e extrato). Só usa o que está na ficha ou nos documentos; sem adjetivos. Sem ponto final: o modelo segue com
     ", de modo que a imposição das despesas processuais comprometeria…". Gênero em "(a)"; o app ajusta pelo sexo. */
  R.montarSocio = function (o) {
    const f = o.ficha, cc = o.cc, re = o.renda, g = o.gastos, fr = [];
    const suj = "O(A) autor(a)", per = (a, b) => a === b ? a : a + " a " + b;
    if (f && (f.moradia || f.provedor || f.pessoas)) {
      const oc = !cc && R.ocupacao(R.profissaoDeclarada(o.qualificacao));   // ficha + qualificação: "O autor, que trabalha como …,"
      let s = suj + (oc && !oc.status ? ", que " + oc.frase.replace("autônoma", "autônomo(a)") + "," : "") + (f.moradia ? " reside " + f.moradia : "");
      const sep = f.moradia ? " e " : " ";
      if (f.pessoas === 1) s += sep + "vive sozinho(a)" + (f.provedor ? ", sendo o(a) único(a) responsável pelo próprio sustento" : "");
      else if (f.provedor) s += sep + "é o(a) único(a) provedor(a) " + (f.pessoas ? "de um lar com " + f.pessoas + " pessoas" : "do seu lar");
      else if (f.pessoas) s += sep + "divide a casa com mais " + (f.pessoas - 1) + (f.pessoas === 2 ? " pessoa" : " pessoas");
      fr.push(s);
    }
    const ini = fr.length ? "" : suj + " ";
    if (cc) {
      const m = cc.meses, org = cc.orgao || "indicada no comprovante";
      fr.push((ini ? ini + "é " : "É ") + (cc.pensao ? "pensionista, com pensão paga" : cc.aposentado ? "aposentado(a), com proventos pagos" : "servidor(a), com remuneração paga") +
        " pela fonte pagadora " + org);
      fr.push("Segundo " + (m.length === 1 ? "o comprovante de pagamento de " + m[0].comp + ", anexo, recebe" : "os comprovantes de pagamento de " + m[0].comp + " a " +
        m[m.length - 1].comp + ", anexos, recebe em média") + " R$ " + R.fmt(cc.bruto) + " brutos, dos quais R$ " + R.fmt(cc.desc) +
        " são descontados em folha, restando R$ " + R.fmt(cc.liq) + " líquidos por mês");
    } else if (re) {
      fr.push((ini ? "A renda do(a) autor(a)" : "Sua renda") + " vem de créditos de " + re.tipo + " que, segundo os extratos bancários anexos, somam " +
        (re.meses.length > 1 ? "em média " : "") + "R$ " + R.fmt(re.media) + " por mês (" + per(re.meses[0].mes, re.meses[re.meses.length - 1].mes) + ")" +
        (f && f.renda && f.renda.tipo === "ate" && re.media <= f.renda.v1 ? ", valor compatível com a renda informada, de até R$ " + R.fmt(f.renda.v1) : ""));
    }
    const desp = f && f.gastos.length ? "às despesas do dia a dia, como " + R.listaRubricas(f.gastos) : "";
    if (!cc && !re && f && f.renda) {   // só a ficha: renda e gastos na mesma frase
      const r = f.renda, v = r.tipo === "ate" ? "de até R$ " + R.fmt(r.v1) : r.tipo === "entre" ? "de R$ " + R.fmt(r.v1) + " a R$ " + R.fmt(r.v2) : "de R$ " + R.fmt(r.v1);
      fr.push((ini ? "A renda mensal do(a) autor(a)" : "Sua renda mensal") + (desp ? ", " + v + ", é destinada " + desp : " é " + v));
    } else if (desp) fr.push(cc || re ? "Essa renda é destinada " + desp : "Seus principais gastos são com " + R.listaRubricas(f.gastos));
    if (g) {   // percentual da renda fica fora: gasto pequeno no extrato enfraqueceria o pedido
      const lst = g.itens.map(i => "R$ " + R.fmt(i.media) + " com " + i.cat);
      fr.push("Os extratos bancários anexos registram, " + (g.nMeses > 1 ? "em média por mês, " : "") + R.listaRubricas(lst) + " (" + per(g.de, g.ate) + ")");
    }
    return fr.join(". ").replace(/^./, c => c.toUpperCase());
  };

  // Ordem da renda: comprovante > créditos do extrato > ficha. Socioeconômico da pasta que não é ficha entra como está.
  R.socioDoCliente = function (o) {
    const s = String(o.ficha || o.socioDocx || "").trim().replace(/\s+/g, " "), ficha = R.lerFicha(s);
    if (s && !ficha) return { texto: s, fonte: "socioeconômico da pasta" };
    const vistos = new Set(), lanc = (o.lanc || []).concat(R.lancDoTexto(o.hipoTxt)).filter(l => {   // HIPO e extrato podem repetir o mesmo débito
      const k = l.data + "|" + (l.deb || "") + "|" + (l.cred || ""); if (vistos.has(k)) return false; vistos.add(k); return true; });
    const g = R.gastosExtrato(lanc), renda = o.cc ? null : (o.renda || R.rendaDosLancamentos(lanc));
    const fonte = [ficha && "ficha socioeconômica", o.cc && "comprovante de pagamento", renda && "créditos de " + renda.tipo + " no extrato", g && "gastos do extrato"]
      .filter(Boolean).join(" + ");
    const bruto = o.cc ? o.cc.bruto : renda ? renda.media : ficha && ficha.renda ? (ficha.renda.v2 || ficha.renda.v1) : null;
    if (!ficha && !o.cc && !renda) {
      return { texto: R.textoSocioPerfil(o.qualificacao, g), gastos: g, generico: true,
        fonte: "qualificação do cliente, sem comprovante de renda legível" + (g ? " + gastos do extrato" : "") };
    }
    let texto = R.montarSocio({ ficha, cc: o.cc, renda, gastos: g, qualificacao: o.qualificacao });
    if (ficha && ficha.sexo) texto = R.generoTexto(texto, ficha.sexo);
    const docV = o.cc ? o.cc.bruto : renda ? renda.media : null, fr = ficha && ficha.renda;   // documento vale mais que a ficha
    const conflito = fr && docV != null && docV > (fr.v2 || fr.v1) ? "A ficha informa renda " + (fr.tipo === "ate" ? "de até" : "de") + " R$ " + R.fmt(fr.v2 || fr.v1) +
      ", mas " + (o.cc ? "o comprovante de pagamento mostra R$ " : "o extrato mostra R$ ") + R.fmt(docV) + " — o texto usa o documento; confira com o comercial." : null;
    return { texto, fonte, bruto, gastos: g, ficha, conflito };
  };

  // Códigos do LexPRE → nome completo do desconto (como no extrato). Código fora da lista: sublinhado vira espaço e o app avisa.
  R.RUBRICAS = {
    BX_ANT_FIN: "BAIXA ANTECIPADA DE FINANCIAMENTO/EMPRÉSTIMO", CESTA: "CESTA DE SERVIÇOS", ANUIDADE: "ANUIDADE",
    ENCARGOS_LIMITE_CRED: "ENCARGOS LIMITE DE CRÉDITO", ENCARGO_LIM_CRED: "ENCARGOS LIMITE DE CRÉDITO",
    ENCARGOS_DESCOBERTOS: "ENCARGOS DE SALDO DESCOBERTO", ENCARGOS_EXCESSO: "ENCARGOS DE EXCESSO DE LIMITE",
    MORA_CRED_PESS: "MORA CRÉDITO PESSOAL", PARC_CRED_PESS: "PARCELA CRÉDITO PESSOAL", MORA_CEL: "MORA CONTA DE TELEFONE",
    MORA_OPERACOES: "MORA DE OPERAÇÕES", MORA_C_CREDITO: "MORA CARTÃO DE CRÉDITO",
    TIT_CAP: "TÍTULO DE CAPITALIZAÇÃO", GASTO_C_CRED: "GASTOS CARTÃO DE CRÉDITO", OP_VENCIDAS: "OPERAÇÕES VENCIDAS",
    DIV_ATRASO: "DÍVIDA EM ATRASO", AD_DEPOSITANTE: "ADIANTAMENTO A DEPOSITANTE", "PARC AUTOMATICO": "PARCELAMENTO AUTOMÁTICO",
    REFINANCIAMENTO_IND: "REFINANCIAMENTO INDEVIDO", REORG_FINAN: "REORGANIZAÇÃO FINANCEIRA", JUROS_ABUSIVOS: "JUROS ABUSIVOS",
    EMISSAO_EXTRATO: "TARIFA EMISSÃO DE EXTRATO", EXTRATO_MOVIMENTO: "EXTRATO DE MOVIMENTO", SAQUE_TERMINAL: "SAQUE EM TERMINAL",
    SAQUE_CORRESPONDENTE: "SAQUE EM CORRESPONDENTE", VIDA_PREV: "VIDA E PREVIDÊNCIA", SEGURO_CARTAO: "SEGURO CARTÃO",
    COBRANCA_IND: "COBRANÇA INDEVIDA", INV_FACIL: "INVEST FÁCIL", RMC: "RESERVA DE MARGEM CONSIGNÁVEL (RMC)",
    RCC: "RESERVA DE CARTÃO CONSIGNADO (RCC)",
  };
  R.nomeRubrica = c => { const k = up(c).trim().replace(/\s+/g, " "); return R.RUBRICAS[k] || R.RUBRICAS[k.replace(/ /g, "_")] || null; };

  /* ------------------------------ montagem do .docx ------------------------------ */
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const txt = p => (p.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, "")).join("")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const ppr = p => (p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [""])[0];
  const rpr1 = p => { const r = p.match(/<w:r>[\s\S]*?<\/w:r>|<w:r\s[^>]*>[\s\S]*?<\/w:r>/); const m = r && r[0].match(/<w:rPr>[\s\S]*?<\/w:rPr>/); return m ? m[0] : ""; };
  const semNegrito = r => r.replace(/<w:b w:val="1"\/>|<w:b\/>|<w:bCs w:val="1"\/>|<w:bCs\/>/g, "");
  const run = (r, t) => "<w:r>" + r + '<w:t xml:space="preserve">' + esc(t) + "</w:t></w:r>";
  const para = (pp, r, t) => "<w:p>" + pp + run(r, t) + "</w:p>";

  // Tabelas no padrão das peças do LexPRE: título da aba + Data | Descrição | Valor + VALOR TOTAL / VALOR EM DOBRO.
  const BD = '<w:tcBorders><w:top w:val="single" w:sz="4" w:color="808080"/><w:left w:val="single" w:sz="4" w:color="808080"/><w:bottom w:val="single" w:sz="4" w:color="808080"/><w:right w:val="single" w:sz="4" w:color="808080"/></w:tcBorders>';
  const rpT = (b, sz) => '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>' + (b ? "<w:b/>" : "") + '<w:sz w:val="' + (sz || 20) + '"/><w:szCs w:val="' + (sz || 20) + '"/></w:rPr>';
  function tbl(W, linhas, sz) {   // linhas: [{ cels:[texto | {t, span}], b, sh, cab }]; última coluna à direita; sz = fonte (meio-pontos)
    const cel = (c, k0, b, sh) => {
      const t = typeof c === "object" ? c.t : c, span = typeof c === "object" ? c.span : 1;
      const w = W.slice(k0, k0 + span).reduce((a, x) => a + x, 0), ult = k0 + span === W.length;
      return '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' + (span > 1 ? '<w:gridSpan w:val="' + span + '"/>' : "") + BD +
        (sh ? '<w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/>' : "") + '<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20" w:line="240" w:lineRule="auto"/>' +
        (ult ? '<w:jc w:val="right"/>' : "") + "</w:pPr>" + run(rpT(b, sz), t) + "</w:p></w:tc>";
    };
    const linha = l => { let k = 0; return l.cels.map(c => { const x = cel(c, k, l.b, l.sh); k += typeof c === "object" ? c.span : 1; return x; }).join(""); };
    return '<w:tbl><w:tblPr><w:tblW w:w="' + W.reduce((a, b) => a + b) + '" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>' +
      W.map(w => '<w:gridCol w:w="' + w + '"/>').join("") + "</w:tblGrid>" +
      linhas.map(l => '<w:tr><w:trPr><w:cantSplit/>' + (l.cab ? "<w:tblHeader/>" : "") + "</w:trPr>" + linha(l) + "</w:tr>").join("") + "</w:tbl>";
  }
  const tituloTabela = t => '<w:p><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/><w:jc w:val="center"/></w:pPr>' + run(rpT(true), t) + "</w:p>";
  const respiro = '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>';
  // Linhas da peça: data e documento/contrato conferidos no extrato (dataPeca/opPeca, da auditoria), em ordem de data.
  const diaN = s => { const p = String(s).split("/"); return +p[2] * 1e4 + +p[1] * 100 + +p[0]; };
  R.linhasPeca = g => g.descontos.map(d => ({ data: d.dataPeca || d.data, desc: d.desc, op: d.opPeca != null ? d.opPeca : R.limparOperacao(d.op), val: d.val }))
    .sort((a, b) => diaN(a.data) - diaN(b.data));
  function tabelasDetalhadas(grupos) {
    return grupos.map(g => tituloTabela(g.aba) + tbl([1150, 3200, 2850, 1400],
      [{ cels: ["Data", "Descrição", "Documento / Contrato", "Valor"], b: true, sh: true, cab: true }]
        .concat(R.linhasPeca(g).map(d => ({ cels: [d.data, d.desc, d.op, "R$ " + R.fmt(d.val)] })))
        .concat([{ cels: [{ t: "VALOR TOTAL", span: 3 }, "R$ " + R.fmt(g.total)], b: true, sh: true },
                 { cels: [{ t: "VALOR EM DOBRO", span: 3 }, "R$ " + R.fmt(g.total * 2)], b: true, sh: true }]), 18) + respiro).join("");
  }
  function quadroResumo(grupos, total, dobro) {
    return tbl([3000, 2500, 1400, 1700],
      [{ cels: ["Rubrica", "Período", "Lançamentos", "Valor"], b: true, sh: true, cab: true }]
        .concat(grupos.map(g => { const L = R.linhasPeca(g); return { cels: [g.aba, L[0].data + " a " + L[L.length - 1].data, String(L.length), "R$ " + R.fmt(g.total)] }; }))
        .concat([{ cels: [{ t: "VALOR TOTAL", span: 3 }, "R$ " + R.fmt(total)], b: true, sh: true },
                 { cels: [{ t: "VALOR EM DOBRO", span: 3 }, "R$ " + R.fmt(dobro)], b: true, sh: true }])) + respiro;
  }

  /* d = { qualificacao, sexo, banco:{nome,infos}, conta, agencia, rubricas[], grupos[] (planilhaRJ), total, dobro, danoMoral,
          socio, relato, cidade, data(Date), nasc, idade, cond:{TARIFAS,CREDITO,SEGURO,NAO_IDENTIFICADA}, extenso(fn) } */
  R.preencher = function (docXml, d) {
    const head = docXml.slice(0, docXml.indexOf("<w:body>") + 8), fimBody = docXml.lastIndexOf("</w:body>");
    const corpo = docXml.slice(head.length, fimBody), tail = docXml.slice(fimBody);
    const partes = corpo.split(/(<w:p[ >][\s\S]*?<\/w:p>)/);   // parágrafos nas posições ímpares; sectPr e afins nas pares
    const idoso = d.idade != null && d.idade >= 60;
    const titulo14 = partes.find((p, i) => i % 2 && /^1\.4\. /.test(txt(p))) || "";
    const log = [], out = [];
    let pulando = null, nTab = 0;
    for (let i = 0; i < partes.length; i++) {
      const p = partes[i];
      if (i % 2 === 0) { out.push(p); continue; }
      const t = txt(p).trim();
      const ab = t.match(/^\[#SE_([A-Z_]+)\]$/), fe = t.match(/^\[\/SE_([A-Z_]+)\]$/);
      if (ab) { if (!d.cond[ab[1]]) pulando = ab[1]; continue; }
      if (fe) { if (pulando === fe[1]) pulando = null; continue; }
      if (pulando) continue;
      const pp = ppr(p), rp = semNegrito(rpr1(p));
      if (t === "[IDOSO]") { if (idoso) out.push(para(pp, rpr1(p), R.IDOSO_CAB)); continue; }
      if (t === "[IDOSO_1]") {
        if (idoso) R.idosoTopico(d.nasc, d.idade).forEach((s, k) => out.push(k === 0 ? para(ppr(titulo14), rpr1(titulo14), s) : para(pp, rp, s)));
        continue;
      }
      if (t === "[IDOSO_2]") { if (idoso) out.push(para(pp, rp, R.idosoPedido(d.idade))); continue; }
      if (t === "[RELATO_DANO_MORAL]") { if (d.relato && d.relato.trim()) out.push(para(pp, rp, d.relato.trim())); continue; }
      if (t === "[RESUMO_DETALHES]") {   // 1ª ocorrência (Fatos): tabelas detalhadas; 2ª (item 3.3): quadro-resumo
        out.push(nTab++ === 0 ? tabelasDetalhadas(d.grupos) : quadroResumo(d.grupos, d.total, d.dobro));
        continue;
      }
      if (t.indexOf("[TEXTO_SOCIO]") === 0) {
        const s = String(d.socio || "").trim().replace(/\s+/g, " ");
        // texto do formulário já fecha a frase → usa só ele; senão completa com o fecho do modelo
        out.push(para(pp, rp, /[.!?]$/.test(s) ? s : t.replace("[TEXTO_SOCIO]", s.replace(/[;,]$/, ""))));
        continue;
      }
      out.push(p);
    }
    let x = head + out.join("") + tail;
    const v = n => R.valorExtenso(n, d.extenso);
    const mapa = {
      "[DADOS_CLIENTE]": d.qualificacao, "[PARTE_ADVERSA]": d.banco.nome, "[INFOS_EMPRESAS]": d.banco.infos,
      "[CONTA]": d.conta, "[AGENCIA]": d.agencia, "[RUBRICAS]": R.listaRubricas(d.rubricas),
      "[VALOR DOS DESCONTOS NA FORMA SIMPLES]": v(d.total), "[VALOR_INDEBITO]": v(d.dobro), "[DANO_MORAL]": v(d.danoMoral),
      "[VALOR_DA_ACAO]": "R$ " + v(d.dobro + d.danoMoral), "[DATA]": R.dataExtenso(d.data),
    };
    // comarca em maiúsculas no endereçamento; cidade em formato de nome no fecho
    // endereçamento: capital = "COMARCA DA CAPITAL"; demais = "COMARCA DE <CIDADE>"
    if (d.cidade) x = x.replace("COMARCA DE [CIDADE]", /^RIO DE JANEIRO$/.test(up(d.cidade).trim()) ? "COMARCA DA CAPITAL" : "COMARCA DE " + esc(String(d.cidade).toUpperCase()));
    mapa["[CIDADE]"] = R.titulo(d.cidade);
    for (const k in mapa) {
      if (mapa[k] == null || mapa[k] === "") { log.push("vazio: " + k); continue; }
      x = x.split(esc(k)).join(esc(mapa[k]));
    }
    if (d.grupos && d.grupos.length > 1) x = x.replace("individualizados na tabela abaixo", "individualizados nas tabelas abaixo");
    const sobra = (x.replace(/<[^>]+>/g, "").match(/\[(?:#|\/)?[A-Z_ ]{3,}\]/g) || []);
    return { xml: x, sobra, log };
  };

  /* ------------------------------ peça automática do LexPRE (RJ): correção ------------------------------ */
  const unesc = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  // Troca trechos do texto do parágrafo mesmo com a palavra partida em vários <w:t>; mantém <w:br/>, negrito e demais runs.
  function trocarNoPara(p, re, fn) {
    const segs = []; let full = "";
    // <w:br/>/<w:tab/> viram "\n" no texto corrido: o código antes da quebra não gruda no seguinte
    p.replace(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:(?:br|tab|cr)\b[^>]*\/>/g, (m, t, off) => {
      if (t == null) { full += "\n"; return m; }
      segs.push({ off, len: m.length, t: unesc(t), ini: full.length }); full += unesc(t); return m; });
    const ms = [];
    full.replace(re, function () { const a = Array.from(arguments), m = a[0], off = a[a.length - 2]; if (m) ms.push({ s: off, e: off + m.length, r: fn.apply(null, a) }); return m; });
    if (!ms.length) return p;
    const mud = new Set();
    for (const m of ms.reverse()) {
      const cob = segs.filter(s => s.ini < m.e && s.ini + s.t.length > m.s);
      cob.forEach((s, i) => {
        const a = Math.max(0, m.s - s.ini), b = m.e - s.ini;
        s.t = (i === 0 ? s.t.slice(0, a) + m.r : "") + (b < s.t.length ? s.t.slice(b) : "");
        mud.add(s);
      });
    }
    let out = p;
    segs.slice().reverse().forEach(s => { if (mud.has(s)) out = out.slice(0, s.off) + '<w:t xml:space="preserve">' + esc(s.t) + "</w:t>" + out.slice(s.off + s.len); });
    return out;
  }
  R._trocarNoPara = trocarNoPara;
  const L = "A-Za-zÀ-ÿ0-9_\\[";   // letra, dígito, sublinhado ou "[" (marcas [TEXTO_SOCIO] etc. não são rubricas)
  const RE_COD = new RegExp("(?<![" + L + "])([A-ZÀ-Ú][A-ZÀ-Ú0-9]*(?:_[A-ZÀ-Ú0-9]+)+|PARC AUTOMATICO)(?![" + L + "\\]])", "g");
  const RE_COD_SIMPLES = new RegExp("(?<![" + L + "])(CESTA|RMC|RCC)(?![" + L + "\\]])", "g");   // só em parágrafo de texto que fala de rubricas

  /* d = { socio: texto (do R.socioDoCliente) }. Devolve o xml corrigido e o que mudou. */
  R.corrigirAutomatica = function (docXml, d) {
    const head = docXml.slice(0, docXml.indexOf("<w:body>") + 8), fimBody = docXml.lastIndexOf("</w:body>");
    const partes = docXml.slice(head.length, fimBody).split(/(<w:p[ >][\s\S]*?<\/w:p>)/), tail = docXml.slice(fimBody);
    const socio = String(d.socio || "").trim().replace(/\s+/g, " ");
    const trocas = {}, desconhecidas = {}, out = [];
    let socioOk = false, naGrat = false;
    const nome = c => { const n = R.nomeRubrica(c); if (!n) desconhecidas[c] = 1; const r = n || c.replace(/_/g, " "); trocas[c] = r; return r; };
    // texto que já fecha a frase substitui o parágrafo; senão completa com o fecho do modelo (", de modo que…")
    const paraSocio = (pp, rp, resto) => { const s = socio.replace(/[;,]$/, "");
      return para(pp, rp, /[.!?]$/.test(s) ? s : resto ? s + resto : s + "."); };
    for (let i = 0; i < partes.length; i++) {
      let p = partes[i];
      if (i % 2 === 0) { out.push(p); continue; }
      const t = txt(p).replace(/ /g, " ").trim(), pp = ppr(p), rp = semNegrito(rpr1(p));
      if (/^\d+(\.\d+)*\.?\s/.test(t)) naGrat = /GRATUI/.test(up(t));   // título numerado abre/fecha o item da gratuidade
      // [TEXTO_SOCIO] literal ou vazio (LexPRE deixa ", de modo que…" sem o começo)
      const m = t.match(/^\[TEXTO_SOCIO\]\s*(.*)$/) || (naGrat && t.match(/^(,?\s*de modo que a imposi[çc][ãa]o[\s\S]*)$/i));
      if (m && socio) {
        const resto = m[1] ? (/^,/.test(m[1]) ? m[1] : ", " + m[1]) : "";
        out.push(paraSocio(pp, rp, resto)); socioOk = true; continue;
      }
      if (socio && t.indexOf("[TEXTO_SOCIO]") >= 0) { p = trocarNoPara(p, /\[TEXTO_SOCIO\]/g, () => socio.replace(/[.;,]$/, "")); socioOk = true; }
      // item da gratuidade sem texto do cliente: entra antes do parágrafo fixo dos arts. 98 e 99
      if (naGrat && !socioOk && socio && /^Nos termos dos arts\. 98 e 99/.test(t)) { out.push(paraSocio(pp, rp, "")); socioOk = true; }
      if (/[a-zà-ÿ]/.test(t)) {   // título todo em maiúsculas fica como está
        p = trocarNoPara(p, RE_COD, nome);
        if (/rubrica|REFERENTE A/i.test(t)) p = trocarNoPara(p, RE_COD_SIMPLES, nome);
      }
      out.push(p);
    }
    const x = head + out.join("") + tail;
    const sobra = [...new Set(x.replace(/<[^>]+>/g, "").match(/\[(?:#|\/)?[A-Z_ ]{3,}\]/g) || [])];
    return { xml: x, trocas, desconhecidas: Object.keys(desconhecidas), socioIncluido: socioOk, sobra };
  };

  if (typeof window !== "undefined") window.LEXRJ = R;
  if (typeof module !== "undefined") module.exports = R;
})();
