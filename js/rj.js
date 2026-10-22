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
        if (val != null && desc) g.descontos.push({ data, desc, val });
      }
      if (g.descontos.length) { g.total = Math.round(g.descontos.reduce((s, d) => s + d.val, 0) * 100) / 100; grupos.push(g); }
    }
    const total = Math.round(grupos.reduce((s, g) => s + g.total, 0) * 100) / 100;
    const divergencias = grupos.filter(g => g.totalDecl != null && Math.abs(g.totalDecl - g.total) > 0.01)
      .map(g => g.aba + ": soma R$ " + R.fmt(g.total) + " × VALOR TOTAL da aba R$ " + R.fmt(g.totalDecl));
    const rub = {}; grupos.forEach(g => g.descontos.forEach(d => { rub[d.desc.toUpperCase()] = 1; }));
    return { grupos, total, dobro: Math.round(total * 200) / 100, rubricas: Object.keys(rub).sort(), divergencias };
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
  // Texto da gratuidade só com dados do comprovante (regras do PROMPTS_GRATUIDADE da Dra. Marcela: sem adjetivos, sem presumir).
  R.textoSocio = function (cc) {
    if (!cc) return "";
    const tipo = cc.pensao ? "pensão paga" : cc.aposentado ? "proventos de inatividade pagos" : "remuneração paga";
    const per = cc.meses.length === 1 ? "No comprovante de pagamento de " + cc.meses[0].comp + ", anexo, a renda bruta é de R$ " + R.fmt(cc.bruto) +
        ", os descontos somam R$ " + R.fmt(cc.desc) + " e o valor líquido creditado é de R$ " + R.fmt(cc.liq) + "."
      : "Nos comprovantes de pagamento de " + cc.meses[0].comp + " a " + cc.meses[cc.meses.length - 1].comp + ", anexos, a renda bruta média é de R$ " +
        R.fmt(cc.bruto) + ", os descontos somam, em média, R$ " + R.fmt(cc.desc) + " e o valor líquido médio creditado é de R$ " + R.fmt(cc.liq) + ".";
    return "A parte autora recebe " + tipo + " pela fonte pagadora " + (cc.orgao || "indicada no comprovante") + ". " + per +
      " Com essa renda, a parte autora não tem condições de arcar com as custas processuais e os honorários advocatícios sem prejuízo do próprio sustento.";
  };

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
  const rpT = b => '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>' + (b ? "<w:b/>" : "") + '<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>';
  function tbl(W, linhas) {   // linhas: [{ cels:[...], b, sh }]; última coluna alinhada à direita
    const cel = (t, k, b, sh) => '<w:tc><w:tcPr><w:tcW w:w="' + W[k] + '" w:type="dxa"/>' + BD + (sh ? '<w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/>' : "") +
      '</w:tcPr><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>' + (k === W.length - 1 ? '<w:jc w:val="right"/>' : "") + "</w:pPr>" + run(rpT(b), t) + "</w:p></w:tc>";
    return '<w:tbl><w:tblPr><w:tblW w:w="' + W.reduce((a, b) => a + b) + '" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>' +
      W.map(w => '<w:gridCol w:w="' + w + '"/>').join("") + "</w:tblGrid>" +
      linhas.map(l => (l.cab ? '<w:tr><w:trPr><w:tblHeader/></w:trPr>' : "<w:tr>") + l.cels.map((c, k) => cel(c, k, l.b, l.sh)).join("") + "</w:tr>").join("") + "</w:tbl>";
  }
  const tituloTabela = t => '<w:p><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/><w:jc w:val="center"/></w:pPr>' + run(rpT(true), t) + "</w:p>";
  const respiro = '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>';
  function tabelasDetalhadas(grupos) {
    return grupos.map(g => tituloTabela(g.aba) + tbl([1900, 5000, 1700],
      [{ cels: ["Data", "Descrição", "Valor"], b: true, sh: true, cab: true }]
        .concat(g.descontos.map(d => ({ cels: [d.data, d.desc, "R$ " + R.fmt(d.val)] })))
        .concat([{ cels: ["VALOR TOTAL", "", "R$ " + R.fmt(g.total)], b: true, sh: true },
                 { cels: ["VALOR EM DOBRO", "", "R$ " + R.fmt(g.total * 2)], b: true, sh: true }])) + respiro).join("");
  }
  function quadroResumo(grupos, total, dobro) {
    return tbl([3000, 2500, 1400, 1700],
      [{ cels: ["Rubrica", "Período", "Lançamentos", "Valor"], b: true, sh: true, cab: true }]
        .concat(grupos.map(g => ({ cels: [g.aba, g.descontos[0].data + " a " + g.descontos[g.descontos.length - 1].data, String(g.descontos.length), "R$ " + R.fmt(g.total)] })))
        .concat([{ cels: ["VALOR TOTAL", "", "", "R$ " + R.fmt(total)], b: true, sh: true },
                 { cels: ["VALOR EM DOBRO", "", "", "R$ " + R.fmt(dobro)], b: true, sh: true }])) + respiro;
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

  if (typeof window !== "undefined") window.LEXRJ = R;
  if (typeof module !== "undefined") module.exports = R;
})();
