/* LexFixer — motor de correção (roda 100% no navegador).
 * Porte fiel do núcleo Python (corretor/*), validado nos 7 casos reais. */
(function (global) {
  "use strict";
  const LEX = {};

  /* ------------------------- Extenso (R$ -> palavras) ------------------------- */
  const UNI = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
    "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const DEZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const CEM = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  function ate999(n) {
    if (n === 0) return "";
    if (n === 100) return "cem";
    const partes = [];
    const c = Math.floor(n / 100), resto = n % 100;
    if (c) partes.push(CEM[c]);
    if (resto) {
      if (resto < 20) partes.push(UNI[resto]);
      else { const d = Math.floor(resto / 10), u = resto % 10; partes.push(DEZ[d] + (u ? " e " + UNI[u] : "")); }
    }
    return partes.join(" e ");
  }
  function inteiroExtenso(n) {
    if (n === 0) return "zero";
    const escala = [["", ""], ["mil", "mil"], ["milhão", "milhões"], ["bilhão", "bilhões"]];
    let i = 0; const partes = [];
    while (n > 0) {
      const g = n % 1000; n = Math.floor(n / 1000);
      if (g) {
        const texto = ate999(g);
        if (i === 1) partes.unshift(g === 1 ? "mil" : texto + " mil");
        else if (i >= 2) partes.unshift(texto + " " + (g === 1 ? escala[i][0] : escala[i][1]));
        else partes.unshift(texto);
      }
      i++;
    }
    const p = partes.filter(Boolean);
    if (p.length <= 1) return p.join(" e ");
    return p.slice(0, -1).join(", ") + " e " + p[p.length - 1];
  }
  LEX.extenso = function (valor) {
    if (typeof valor === "string") {
      valor = parseFloat(valor.replace("R$", "").trim().replace(/\./g, "").replace(/\s/g, "").replace(",", "."));
    }
    if (!isFinite(valor)) return "";
    let reais = Math.floor(valor);
    let cent = Math.round((valor - reais) * 100);
    if (cent === 100) { reais += 1; cent = 0; }
    const partes = [];
    if (reais) partes.push(inteiroExtenso(reais) + (reais === 1 ? " real" : " reais"));
    if (cent) partes.push(inteiroExtenso(cent) + (cent === 1 ? " centavo" : " centavos"));
    return partes.length ? partes.join(" e ") : "zero real";
  };
  function fmtBRL(v) {
    const s = v.toFixed(2).split(".");
    s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return s[0] + "," + s[1];
  }

  /* ------------------------- utilitários XML ------------------------- */
  LEX.mergeRuns = function (xml) {
    const pat = /<w:r>(<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(?: xml:space="preserve")?>([^<]*)<\/w:t><\/w:r><w:r>(<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(?: xml:space="preserve")?>([^<]*)<\/w:t><\/w:r>/;
    return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, function (p) {
      let prev = null;
      while (prev !== p) {
        prev = p;
        p = p.replace(pat, function (m, r1, t1, r2, t2) {
          r1 = r1 || ""; r2 = r2 || "";
          if (r1 === r2) {
            const j = t1 + t2; const sp = j !== j.trim() ? ' xml:space="preserve"' : "";
            return "<w:r>" + r1 + "<w:t" + sp + ">" + j + "</w:t></w:r>";
          }
          return m;
        });
      }
      return p;
    });
  };
  function paraTextos(xml) {
    const out = [];
    (xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || []).forEach(function (p) {
      const t = (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(function (r) {
        return r.replace(/<w:t[^>]*>/, "").replace("</w:t>", "");
      }).join("");
      out.push(t);
    });
    return out;
  }
  LEX.paraTextos = paraTextos;

  function num(br) {
    if (typeof br === "number") return br;
    const s = String(br).replace("R$", "").trim().replace(/\./g, "").replace(/\s/g, "").replace(",", ".");
    const v = parseFloat(s); return isFinite(v) ? v : null;
  }

  /* ------------------------- extração ------------------------- */
  LEX.extrairPeticao = function (xml) {
    const paras = paraTextos(xml);
    const texto = paras.join("\n");
    const d = { paragrafos: paras };
    const cab = paras.slice(0, 8).join("\n").toUpperCase();
    d.header_gratuidade = cab.indexOf("GRATUIDADE") >= 0 || cab.indexOf("JUSTIÇA GRATUITA") >= 0;
    d.header_inversao = cab.indexOf("INVERS") >= 0 && cab.indexOf("ÔNUS") >= 0;
    d.header_tutela = cab.indexOf("TUTELA DE URG") >= 0;
    d.header_prioridade_idoso = cab.indexOf("PRIORIDADE PROCESSUAL") >= 0;
    const l1 = (paras[0] || "").toUpperCase();
    d.endereco_juizado = l1.indexOf("JUIZADO ESPECIAL") >= 0;
    d.endereco_vara_comum = l1.indexOf("VARA C") >= 0 && l1.indexOf("JUIZADO") < 0;
    let m = l1.match(/COMARCA DE ([A-ZÀ-Ú/ ]+)/); d.comarca = m ? m[1].trim().replace(/\.+$/, "") : "";
    m = texto.match(/RG sob n[ºo]?\s*([\d.\-]+)/); d.rg = m ? m[1].replace(/\D/g, "") : null;
    m = texto.match(/CPF sob o n[ºo]?\s*([\d.\-]+)/); d.cpf = m ? m[1].trim() : null;
    d.gen_brasileiro_marcado = texto.indexOf("BRASILEIRO(A)") >= 0;
    d.gen_estadocivil_marcado = /(SOLTEIRO\(A\)|CASADO\(A\)|DIVORCIADO\(A\)|VI[ÚU]VO\(A\))/.test(texto);
    m = texto.match(/residente\s+n[ao]\s+([\s\S]+?),\s*Bairro:/);
    d.endereco_logradouro = m ? m[1].trim() : null;
    d.endereco_tem_numero = !!(m && /\bN[ºo]\.?\s*\d+|,\s*\d+/.test(m[1]));
    m = texto.match(/ag[êe]ncia\s*([\d\-]+)/i); d.agencia = m ? m[1].trim() : null;
    m = texto.match(/conta\s+corrente\s*([\d\-]+)/i); d.conta = m ? m[1].trim() : null;
    m = texto.match(/desde\s*(\d{2}\/\d{2}\/\d{4})\s*at[ée]\s*(\d{2}\/\d{2}\/\d{4})/) ||
        texto.match(/per[íi]odo de\s*(\d{2}\/\d{2}\/\d{4})\s*at[ée]\s*(\d{2}\/\d{2}\/\d{4})/);
    d.periodo = m ? [m[1], m[2]] : [null, null];
    d.dano_moral_vazio = /R\$\s*15\.?000(?:,00)?\s*\(\s*\)/.test(texto);
    d.dano_moral_ok_extenso = texto.toLowerCase().indexOf("quinze mil reais") >= 0;
    m = texto.match(/presente causa[\s\S]{0,60}?valor de\s*R\$\s*([\d.,]+)/) ||
        texto.match(/[Dd][áa]-se[\s\S]{0,80}?R\$\s*([\d.,]+)/);
    d.valor_causa = m ? num(m[1]) : null;
    m = texto.match(/pagamento\s*R\$\s*([\d.,]+)[\s\S]{0,120}?repeti[çc][ãa]o do ind[ée]bito/);
    d.valor_repeticao_pedido = m ? num(m[1]) : null;
    d.marcador_prioridade = texto.indexOf("[PRIORIDADE]") >= 0;
    d.pedidos_letras = (texto.match(/(?:^|\n)\s*([a-z])\)\s/g) || []).map(function (x) { return x.trim()[0]; });
    m = texto.match(/denominada de\s*[”"“]?\s*([A-Z0-9ÁÉÍÓÚÂÊÔ /.\-_]+?)[”"“]/);
    d.rubrica_texto = m ? m[1].trim() : null;
    return d;
  };

  LEX.extrairPlanilha = function (linhas) {
    // linhas: array de arrays (SheetJS sheet_to_json header:1), concatenadas de todas as abas
    let total = null, dobro = null; const descontos = []; const rubricas = {};
    for (const linha of linhas) {
      const c0 = String(linha[0] || "").trim().toUpperCase();
      if (c0.indexOf("VALOR TOTAL") === 0) { if (total === null) total = num(linha[linha.length - 1]); }
      else if (c0.indexOf("VALOR EM DOBRO") === 0) { if (dobro === null) dobro = num(linha[linha.length - 1]); }
      else {
        const data = String(linha[0] || "").trim();
        if (/^\d{2}\/\d{2}\/\d{4}/.test(data) || /^\d{4}-\d{2}-\d{2}/.test(data)) {
          const val = num(linha[linha.length - 1]);
          const desc = String(linha[1] || "").trim();
          if (val !== null) { descontos.push({ data, desc, val }); if (desc) rubricas[desc.toUpperCase()] = 1; }
        }
      }
    }
    const soma = descontos.length ? Math.round(descontos.reduce((a, b) => a + b.val, 0) * 100) / 100 : null;
    return { total, dobro, soma_conferida: soma, descontos, rubricas: Object.keys(rubricas).sort() };
  };

  LEX.extrairExtrato = function (texto) {
    let m = texto.match(/Ag[êe]ncia:\s*([\d\-]+)/); const ag = m ? m[1].trim() : null;
    m = texto.match(/Conta:\s*([\d\-]+)/); const cc = m ? m[1].trim() : null;
    return { agencia: ag, conta: cc };
  };

  /* ------------------------- checks (12 pontos) ------------------------- */
  const TETO = 64840.0;
  const EXC = ["MORA", "ENCARGOS", "REFINANCIAMENTO", "ANP", "RMC", "RCC"];
  LEX.idadeEm = function (nasc, hoje) {
    if (!nasc) return null;
    const p = nasc.replace(/-/g, "/").split("/"); if (p.length !== 3) return null;
    const b = new Date(+p[2], +p[1] - 1, +p[0]); hoje = hoje || new Date();
    let a = hoje.getFullYear() - b.getFullYear();
    const mm = hoje.getMonth() - b.getMonth();
    if (mm < 0 || (mm === 0 && hoje.getDate() < b.getDate())) a--;
    return a;
  };
  function F(n, ponto, status, msg) { return { n, ponto, status, msg }; }
  LEX.conferir = function (pet, plan, ext, op) {
    const ach = []; const idade = LEX.idadeEm(op.nascimento); const idoso = idade !== null && idade >= 60;
    const rub = ((pet.rubrica_texto || "") + " " + (plan.rubricas || []).join(" ")).toUpperCase();
    const excs = EXC.filter(k => rub.indexOf(k) >= 0); const temExc = excs.length > 0;
    const vc = pet.valor_causa;
    if (temExc) ach.push(F(1, "Endereçamento", pet.endereco_vara_comum ? "OK" : "ATENCAO",
      "Rubrica na EXCEÇÃO (" + excs.join(", ") + ") → Vara Cível Comum. Confirmar com o advogado."));
    else if (vc != null) { const alvoJ = vc <= TETO; const ok = alvoJ ? pet.endereco_juizado : pet.endereco_vara_comum;
      ach.push(F(1, "Endereçamento", ok ? "OK" : "CORRIGIR",
        (ok ? "Correto: " : "Deveria ser ") + (alvoJ ? "Juizado Especial Cível" : "Vara Cível Comum") + " (valor da causa R$ " + (vc || 0).toFixed(2) + ")."));
    } else ach.push(F(1, "Endereçamento", "ATENCAO", "Valor da causa não identificado."));
    const faltas = [];
    if (!pet.header_gratuidade) faltas.push("Gratuidade");
    if (!pet.header_inversao) faltas.push("Inversão do Ônus");
    if (idoso && !pet.header_prioridade_idoso) faltas.push("Prioridade: Idoso");
    ach.push(F(2, "Pedidos preliminares", faltas.length ? "CORRIGIR" : "OK", faltas.length ? "Faltando: " + faltas.join(", ") : "Todos presentes."));
    const q = [];
    if (pet.gen_brasileiro_marcado || pet.gen_estadocivil_marcado) q.push("gênero genérico → ajustar");
    if (!pet.endereco_tem_numero) q.push("número da residência ausente");
    ach.push(F(3, "Qualificação", q.length ? "CORRIGIR" : "OK", q.length ? q.join("; ") : "OK (conferir nome/RG/CPF na imagem)."));
    if (ext && ext.agencia) { const okb = pet.agencia === ext.agencia && String(pet.conta || "").replace(/\./g, "") === String(ext.conta || "").replace(/\./g, "");
      ach.push(F(4, "Dados bancários", okb ? "OK" : "ATENCAO", "Peça: ag " + pet.agencia + "/cc " + pet.conta + " | Extrato: ag " + ext.agencia + "/cc " + ext.conta));
    } else ach.push(F(4, "Dados bancários", "ATENCAO", "Conferir agência/conta manualmente."));
    ach.push(F(5, "Nome da rubrica", "ATENCAO", "Conferir rubrica contra o extrato. Planilha: " + (plan.rubricas || []).join("; ")));
    let p6 = "OK", m6 = "Total R$ " + plan.total + " | Soma R$ " + plan.soma_conferida + " | Dobro R$ " + plan.dobro;
    if (plan.soma_conferida != null && plan.total != null && Math.abs(plan.soma_conferida - plan.total) > 0.01) { p6 = "CORRIGIR"; m6 += " — SOMA ≠ TOTAL!"; }
    if (plan.total != null && plan.dobro != null && Math.abs(plan.dobro - plan.total * 2) > 0.01) { p6 = "CORRIGIR"; m6 += " — DOBRO ≠ TOTAL×2!"; }
    ach.push(F(6, "Tabela de valores", p6, m6));
    ach.push(F(7, "Dano material/datas", (pet.periodo[0] && pet.periodo[1]) ? "OK" : "ATENCAO", "Período: " + pet.periodo[0] + " a " + pet.periodo[1]));
    ach.push(F(8, "Socioeconômico", "ATENCAO", "Individualizado e neutralizado na correção."));
    if (idoso) { ach.push(F(9, "Prioridade (texto)", "CORRIGIR", "Idoso (" + idade + ") → tópico e pedido de prioridade inseridos."));
      ach.push(F(12, "Prioridade (pedido)", "CORRIGIR", "Pedido de prioridade inserido."));
    } else { const st = pet.marcador_prioridade ? "ATENCAO" : "OK";
      ach.push(F(9, "Prioridade (idoso)", st, (idade != null ? "Não idoso (" + idade + ")." : "Idade não informada.") + (pet.marcador_prioridade ? " Marcador [PRIORIDADE] removido." : ""))); }
    ach.push(F(10, "Dano moral por extenso", pet.dano_moral_vazio ? "CORRIGIR" : "OK", pet.dano_moral_vazio ? "Estava vazio 'R$ 15.000,00 ()' — corrigido." : "OK."));
    const letras = pet.pedidos_letras || []; const esp = letras.map((_, i) => String.fromCharCode(97 + i));
    let st11 = JSON.stringify(letras) === JSON.stringify(esp) ? "OK" : "CORRIGIR";
    let m11 = st11 === "OK" ? "Letras em sequência." : "Sequência irregular: " + letras.join(",");
    if (pet.valor_repeticao_pedido != null && plan.dobro != null && Math.abs(pet.valor_repeticao_pedido - plan.dobro) > 0.01 && Math.abs(pet.valor_repeticao_pedido - (plan.total || -1)) < 0.01) {
      st11 = "ATENCAO"; m11 += " | Pedido pede R$ " + pet.valor_repeticao_pedido + " (simples); dobro é R$ " + plan.dobro + " — confirmar."; }
    ach.push(F(11, "Valores nos pedidos", st11, m11));
    const resumo = { OK: 0, ATENCAO: 0, CORRIGIR: 0 };
    ach.forEach(a => resumo[a.status]++);
    return { achados: ach, idade, idoso, temExc, resumo };
  };

  /* ------------------------- correções + estrutura ------------------------- */
  const RPR = '<w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>';
  const RPR_B = '<w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>';
  const PPR_B = '<w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/><w:ind w:firstLine="0"/>' + RPR_B + '</w:pPr>';
  const PPR_BODY = '<w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/>' + RPR + '</w:pPr>';
  const PPR_ITEM = '<w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/><w:ind w:firstLine="0"/>' + RPR + '</w:pPr>';
  let PID = 0x50000;
  function npid() { PID++; return ("00000000" + PID.toString(16).toUpperCase()).slice(-8); }
  function para(ppr, rpr, texto) {
    return '<w:p w14:paraId="' + npid() + '" w14:textId="77777777">' + ppr + '<w:r>' + rpr + '<w:t xml:space="preserve">' + texto + '</w:t></w:r></w:p>';
  }
  function vazio() { return '<w:p w14:paraId="' + npid() + '" w14:textId="77777777"><w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/></w:pPr></w:p>'; }

  function paraContendo(xml, texto) {
    const re = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g; let m;
    while ((m = re.exec(xml))) {
      const t = (m[0].match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(r => r.replace(/<w:t[^>]*>/, "").replace("</w:t>", "")).join("");
      if (t.indexOf(texto) >= 0) return { ini: m.index, fim: m.index + m[0].length, tag: m[0] };
    }
    return null;
  }
  function inserirApos(xml, ancora, novo) { const r = paraContendo(xml, ancora); if (!r) return [xml, false]; return [xml.slice(0, r.fim) + novo + xml.slice(r.fim), true]; }
  function inserirAntes(xml, ancora, novo) { const r = paraContendo(xml, ancora); if (!r) return [xml, false]; return [xml.slice(0, r.ini) + novo + xml.slice(r.ini), true]; }

  function injPpr(ptag, extra) {
    const i = ptag.indexOf("<w:pPr>");
    if (i < 0) { const mo = ptag.match(/^<w:p\b[^>]*>/); return ptag.slice(0, mo[0].length) + "<w:pPr>" + extra + "</w:pPr>" + ptag.slice(mo[0].length); }
    let ins = i + 7; const ps = ptag.slice(ins).match(/^<w:pStyle\b[^>]*\/>/); if (ps) ins += ps[0].length;
    return ptag.slice(0, ins) + extra + ptag.slice(ins);
  }

  function corrigirGenero(xml, sexo, log) {
    const fem = String(sexo || "").toUpperCase().charAt(0) === "F";
    const map = fem
      ? { "BRASILEIRO(A)": "BRASILEIRA", "SOLTEIRO(A)": "SOLTEIRA", "CASADO(A)": "CASADA", "DIVORCIADO(A)": "DIVORCIADA", "VIÚVO(A)": "VIÚVA", "VIUVO(A)": "VIUVA" }
      : { "BRASILEIRO(A)": "BRASILEIRO", "SOLTEIRO(A)": "SOLTEIRO", "CASADO(A)": "CASADO", "DIVORCIADO(A)": "DIVORCIADO", "VIÚVO(A)": "VIÚVO", "VIUVO(A)": "VIUVO" };
    for (const k in map) { if (xml.indexOf(k) >= 0) { xml = xml.split(k).join(map[k]); log.push("Qualificação: " + k + "→" + map[k]); } }
    return xml;
  }
  function inserirNumero(xml, numero, log) {
    if (!numero) return xml;
    const sn = /^s\/?n$/i.test(numero);
    const label = sn ? "S/N" : "Nº " + numero;
    if (xml.indexOf(", " + label) >= 0) return xml;
    for (const a of [", Bairro:", ",Bairro:"]) {
      if (xml.indexOf(a) >= 0) { xml = xml.replace(a, ", " + label + a); log.push("Endereço: incluído " + label); break; }
    }
    return xml;
  }
  function danoMoralExtenso(xml, log) {
    const ext = LEX.extenso(15000), novo = "R$ 15.000,00 (" + ext + ")";
    const p1 = /R\$\s*15\.?000(?:,00)?\s*\(\s*\)/;
    if (p1.test(xml)) { xml = xml.replace(new RegExp(p1.source, "g"), novo); log.push("Dano moral por extenso preenchido"); return xml; }
    const p2 = /(R\$\s*15\.?000(?:,00)?)(<\/w:t>[\s\S]*?<w:t[^>]*>)\s*\(\s*\)/;
    if (p2.test(xml)) { xml = xml.replace(p2, function (m, a, b) { return "R$ 15.000,00" + b + " (" + ext + ")"; }); log.push("Dano moral por extenso (runs separados)"); }
    return xml;
  }
  function removerMarcador(xml, log) { for (const a of [" [PRIORIDADE]", "[PRIORIDADE]"]) { if (xml.indexOf(a) >= 0) { xml = xml.split(a).join(""); log.push("Removido marcador [PRIORIDADE]"); break; } } return xml; }
  function neutralizarLinguagem(xml, log) {
    const subs = [["parte Autora", "parte autora"], ["parte Requerente", "parte requerente"],
      ["O Requerente ", "A parte requerente "], ["o Requerente ", "a parte requerente "],
      ["A Requerente ", "A parte requerente "], ["a Requerente ", "a parte requerente "],
      ["do Requerente", "da parte requerente"], ["pelo Requerente", "pela parte requerente"],
      ["ao Requerente", "à parte requerente"], ["pela Requerente", "pela parte requerente"]];
    let n = 0;
    for (const [a, b] of subs) { const c = xml.split(a).length - 1; if (c) { n += c; xml = xml.split(a).join(b); } }
    if (n) log.push("Linguagem neutralizada (" + n + ") — revisar");
    return xml;
  }
  function limparSocio(t) {
    t = t.trim().replace(/^"+|"+$/g, "").trim();
    t = t.replace(/residênciaa/g, "residência")
      .replace(/o\(a\) autor\(a\) é/g, "a parte autora é").replace(/o\(a\) autor\(a\)/g, "a parte autora")
      .replace(/compartilhada é o único provedor/g, "compartilhada e é a única provedora")
      .replace(/é o único provedor/g, "é a única provedora")
      .replace(/encontra-se impossibilitado/g, "encontra-se impossibilitada")
      .replace(/está impossibilitado/g, "está impossibilitada")
      .replace(/de at[ée]\s*2500\b/g, "de até 2.500")
      .replace(/aproximadamente de\s*(\d)/g, "de aproximadamente $1")
      .replace(/\s*A residência (?:do\(a\) autor\(a\)|da parte autora) abriga mais de \d+ pessoas[,.]/g, "")
      .replace(/\s{2,}/g, " ");
    return t.trim();
  }
  function socioeconomico(xml, socioTexto, log) {
    if (!socioTexto) return neutralizarSocioExistente(xml, log);
    const texto = limparSocio(socioTexto);
    if (!texto) return neutralizarSocioExistente(xml, log);
    const r = paraContendo(xml, "Atualmente,");
    if (r) {
      const novoP = r.tag.replace(/<w:r\b[\s\S]*<\/w:r>/, '<w:r>' + RPR + '<w:t xml:space="preserve">' + texto + '</w:t></w:r>');
      log.push("Socioeconômico individualizado/neutralizado");
      return xml.slice(0, r.ini) + novoP + xml.slice(r.fim);
    }
    for (const anc of ["rendimento da parte autora", "rendimento da parte Autora",
      "extrato de renda dos últimos 3", "todos em anexo aos autos",
      "hipossuficiência econômica da parte", "declaração de hipossuficiência e extratos bancários"]) {
      const [x2, ok] = inserirApos(xml, anc, para(PPR_BODY, RPR, texto)); if (ok) { log.push("Socioeconômico inserido"); return x2; }
    }
    return xml;
  }
  function neutralizarSocioExistente(xml, log) {
    const subs = [["o(a) autor(a) é", "a parte autora é"], ["compartilhada é o único provedor", "compartilhada e é a única provedora"], ["encontra-se impossibilitado", "encontra-se impossibilitada"]];
    for (const [a, b] of subs) if (xml.indexOf(a) >= 0) { xml = xml.split(a).join(b); log.push("Socioeconômico: '" + a + "'→'" + b + "'"); }
    return xml;
  }
  function ajustarEnderecamento(xml, alvoVara, log) {
    const fim1 = xml.indexOf("</w:p>") + 6; let prim = xml.slice(0, fim1); const resto = xml.slice(fim1); let novo = prim;
    if (alvoVara) { if (prim.indexOf("JUIZADO ESPECIAL") >= 0) { novo = prim.split("VARA DO JUIZADO ESPECIAL CÍVEL").join("VARA CÍVEL").split("JUIZADO ESPECIAL CÍVEL").join("VARA CÍVEL"); log.push("Endereçamento → Vara Cível Comum"); } }
    else { if (prim.indexOf("JUIZADO ESPECIAL") < 0 && prim.indexOf("VARA CÍVEL") >= 0) { novo = prim.split("VARA CÍVEL").join("VARA DO JUIZADO ESPECIAL CÍVEL"); log.push("Endereçamento → Juizado Especial Cível"); } }
    return novo + resto;
  }
  function completarCabecalho(xml, idoso, log) {
    const corte = xml.indexOf("respeitosamente"); const cab = corte > 0 ? xml.slice(0, corte) : xml.slice(0, 4000);
    const tem = t => cab.indexOf(t) >= 0;
    if (!tem("INVERSÃO DO ÔNUS DA PROVA") && (tem("GRATUIDADE DE JUSTIÇA") || tem("JUSTIÇA GRATUITA"))) {
      const anc = tem("GRATUIDADE DE JUSTIÇA") ? "GRATUIDADE DE JUSTIÇA" : "JUSTIÇA GRATUITA";
      const [x2, ok] = inserirApos(xml, anc, para(PPR_B, RPR_B, "COM PEDIDO DE INVERSÃO DO ÔNUS DA PROVA")); if (ok) { xml = x2; log.push("Cabeçalho: incluída Inversão do Ônus"); }
    }
    if (idoso && (corte > 0 ? xml.slice(0, corte) : xml.slice(0, 4000)).indexOf("PRIORIDADE PROCESSUAL") < 0) {
      for (const anc of ["INVERSÃO DO ÔNUS DA PROVA", "TUTELA DE URGÊNCIA", "GRATUIDADE DE JUSTIÇA", "JUSTIÇA GRATUITA"]) {
        if ((corte > 0 ? xml.slice(0, corte) : xml.slice(0, 4000)).indexOf(anc) >= 0) {
          const [x2, ok] = inserirApos(xml, anc, para(PPR_B, RPR_B, "COM PEDIDO DE PRIORIDADE PROCESSUAL: IDOSO")); if (ok) { xml = x2; log.push("Cabeçalho: incluída Prioridade: Idoso"); break; }
        }
      }
    }
    return xml;
  }
  function proxNumPrelim(xml) { const ns = (xml.match(/>2\.(\d+)\.\s/g) || []).map(x => parseInt(x.match(/2\.(\d+)/)[1], 10)); return ns.length ? "2." + (Math.max.apply(null, ns) + 1) + "." : "2."; }
  function proxLetra(xml) { const ls = (xml.match(/<w:t[^>]*>\s*([a-z])\)\s/g) || []).map(x => x.match(/([a-z])\)/)[1]); if (!ls.length) return "j"; return String.fromCharCode(ls.sort()[ls.length - 1].charCodeAt(0) + 1); }
  function inserirItensIdoso(xml, nasc, idade, log) {
    const ext = LEX.extenso(idade).replace(" reais", "").replace(" real", "");
    const num0 = proxNumPrelim(xml);
    const heading = num0 + " DA PRIORIDADE NA TRAMITAÇÃO PROCESSUAL — REQUERENTE MAIOR DE 60 ANOS";
    const corpo = "Nos termos do artigo 71 da Lei nº 10.741/2003 (Estatuto do Idoso) e artigo 1.048, inciso I, do Código de Processo Civil, toda pessoa com idade igual ou superior a 60 (sessenta) anos tem direito à prioridade na tramitação dos processos judiciais. A parte requerente, nascida em " + nasc + ", possui " + idade + " (" + ext + ") anos, conforme comprovado por cópia do documento de identidade anexado aos autos. Dessa forma, requer a tramitação prioritária do presente feito, assegurando à parte requerente o direito legalmente garantido.";
    const bloco = vazio() + para(PPR_B, RPR_B, heading) + vazio() + para(PPR_BODY, RPR, corpo);
    for (const anc of ["DO MÉRITO", "3. DO MÉRITO", "DO MERITO"]) { const [x2, ok] = inserirAntes(xml, anc, bloco); if (ok) { xml = x2; log.push("Inserido tópico DA PRIORIDADE"); break; } }
    const letra = proxLetra(xml);
    const ped = letra + ") a prioridade na tramitação processual, visto que a parte requerente possui " + idade + " (" + ext + ") anos, nos termos do artigo 1.048, inciso I, do Código de Processo Civil, bem como do artigo 71, caput, da Lei nº 10.741/2003 (Estatuto do Idoso);";
    for (const anc of ["conforme Súmulas 362 e 54 do STJ;", "Súmulas 362 e 54 do STJ;"]) { const [x2, ok] = inserirApos(xml, anc, para(PPR_ITEM, RPR, ped)); if (ok) { xml = x2; log.push("Inserido pedido de prioridade (" + letra + ")"); break; } }
    return xml;
  }
  function corrigirExtensos(xml, valores, log) {
    for (const v of valores) {
      if (!v) continue;
      const alvo = fmtBRL(v); const correto = LEX.extenso(v);
      const re = new RegExp("(R\\$\\s*" + alvo.replace(/[.]/g, "\\.").replace(/,/g, ",") + "\\s*\\()([^)]*)(\\))", "g");
      let changed = false;
      xml = xml.replace(re, function (m, a, b, c) { if (b.trim().toLowerCase() === correto.toLowerCase()) return m; changed = true; return a + correto + c; });
      if (changed) log.push("Extenso corrigido para R$ " + alvo + " (" + correto + ")");
    }
    return xml;
  }
  function renumerarPedidos(xml, log) {
    let i = xml.indexOf("DOS PEDIDOS"); if (i < 0) i = xml.indexOf("Ex positis"); if (i < 0) return xml;
    const cab = xml.slice(0, i); let corpo = xml.slice(i);
    const re = /(<w:t[^>]*>\s*)([a-z])(\)\s)/g; const rots = []; let m;
    while ((m = re.exec(corpo))) rots.push({ i: m.index, full: m[0], pre: m[1], suf: m[3] });
    if (rots.length < 2) return xml;
    const esp = rots.map((_, k) => String.fromCharCode(97 + k));
    const atual = rots.map(r => r.full.replace(/<w:t[^>]*>\s*/, "")[0]);
    if (JSON.stringify(atual) === JSON.stringify(esp)) return xml;
    let out = ""; let last = 0;
    rots.forEach((r, k) => { out += corpo.slice(last, r.i) + r.pre + esp[k] + r.suf; last = r.i + r.full.length; });
    out += corpo.slice(last);
    log.push("Pedidos renumerados");
    return cab + out;
  }

  /* ------------------------- formatação ------------------------- */
  function espac115(doc, styles) {
    doc = doc.split('w:line="240" w:lineRule="auto"').join('w:line="276" w:lineRule="auto"')
      .split('<w:spacing w:after="0"/>').join('<w:spacing w:after="0" w:line="276" w:lineRule="auto"/>');
    if (styles) for (const v of ["360", "259", "240"]) styles = styles.split('w:line="' + v + '" w:lineRule="auto"').join('w:line="276" w:lineRule="auto"');
    return [doc, styles];
  }
  function centralizarTabelas(xml) {
    return xml.replace(/<w:tblPr>[\s\S]*?<\/w:tblPr>/g, function (tp) {
      if (tp.indexOf("<w:jc ") >= 0) return tp;
      tp = tp.replace(/(<w:tblW\b[^>]*\/>)/, '$1<w:jc w:val="center"/>');
      tp = tp.replace(/<w:tblInd w:w="\d+"/, '<w:tblInd w:w="0"');
      return tp;
    });
  }
  function tabelasInteiras(xml) {
    return xml.replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g, function (tr) {
      if (tr.indexOf("<w:cantSplit/>") < 0) {
        if (tr.indexOf("<w:trPr>") >= 0) tr = tr.replace("<w:trPr>", "<w:trPr><w:cantSplit/>");
        else { const mo = tr.match(/^<w:tr\b[^>]*>/); tr = tr.slice(0, mo[0].length) + "<w:trPr><w:cantSplit/></w:trPr>" + tr.slice(mo[0].length); }
      }
      tr = tr.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, p => p.indexOf("<w:keepNext/>") < 0 ? injPpr(p, "<w:keepNext/>") : p);
      return tr;
    });
  }
  function isHeading(t) { t = t.trim(); return t.length > 0 && t.length < 140 && /^\d+(\.\d+)*\.?\s+[A-ZÀ-Ú"“]/.test(t); }
  function titulosJuntos(xml) {
    const re = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g; let m; let out = ""; let last = 0; let chain = false;
    while ((m = re.exec(xml))) {
      const gap = xml.slice(last, m.index); if (gap.indexOf("<w:tbl") >= 0) chain = false; out += gap; last = m.index + m[0].length;
      let pt = m[0]; const txt = (pt.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(r => r.replace(/<w:t[^>]*>/, "").replace("</w:t>", "")).join("");
      const empty = txt.trim() === ""; const bold = pt.indexOf("<w:b/>") >= 0;
      if (isHeading(txt) && bold) { chain = true; if (pt.indexOf("<w:keepNext/>") < 0) pt = injPpr(pt, "<w:keepNext/><w:keepLines/>"); else if (pt.indexOf("<w:keepLines/>") < 0) pt = injPpr(pt, "<w:keepLines/>"); }
      else if (chain && empty) { if (pt.indexOf("<w:keepNext/>") < 0) pt = injPpr(pt, "<w:keepNext/>"); }
      else chain = false;
      out += pt;
    }
    out += xml.slice(last);
    return out;
  }
  function formatarTudo(doc, styles) { [doc, styles] = espac115(doc, styles); doc = centralizarTabelas(doc); doc = tabelasInteiras(doc); doc = titulosJuntos(doc); return [doc, styles]; }
  LEX.formatarTudo = formatarTudo;

  /* ------------------------- revisão ortográfica/formatação ------------------------- */
  const CURADO = { "excessão": "exceção", "excessões": "exceções", "excessao": "exceção",
    "atravéz": "através", "atravez": "através", "concerteza": "com certeza",
    "previlégio": "privilégio", "previlegio": "privilégio", "beneficiente": "beneficente",
    "haja visto": "haja vista" };
  const RE_TXT = /(<w:t[^>]*>)([^<]*)(<\/w:t>)/g;
  const RE_RUN = /<w:r>(<w:rPr>[\s\S]*?<\/w:rPr>)?(<w:t[^>]*>)([^<]*)(<\/w:t>)<\/w:r>/g;
  const RE_LATIM = /\b(fumus\s+bon[io]s?\s+[ij]uris|periculum\s+in\s+mora|inaudita\s+altera\s+parte|in\s+re\s+ipsa|ex\s+positis|ex\s+tunc|ex\s+nunc|data\s+(?:m[áa]xima\s+)?venia|mutatis\s+mutandis|ad\s+causam|erga\s+omnes)\b/gi;
  const ITAL_RPR = '<w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:i/><w:iCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>';
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function tratamento(t) {
    return t.replace(/\bvossa excel[êe]ncia\b/gi, "Vossa Excelência")
      .replace(/\bexcelent[íi]ssimo\b/gi, "Excelentíssimo")
      .replace(/\bmerit[íi]ssimo\b/gi, "Meritíssimo")
      .replace(/\bvossa senhoria\b/gi, "Vossa Senhoria");
  }
  function corrigirTexto(t, st) {
    const o = t;
    t = tratamento(t);
    for (const w in CURADO) { const r = CURADO[w];
      t = t.replace(new RegExp("\\b" + esc(w) + "\\b", "gi"), m => /^[A-ZÀ-Ý]/.test(m) ? r.charAt(0).toUpperCase() + r.slice(1) : r); }
    t = t.replace(/ {2,}/g, " ").replace(/ +([,;:.!?])/g, "$1").replace(/([!?])\1{1,}/g, "$1");
    if (t !== o) st.n++;
    return t;
  }
  function italicoLatim(xml, log) {
    const achados = new Set();
    const novo = xml.replace(RE_RUN, function (m, rpr, topen, text, tclose) {
      rpr = rpr || "";
      if (rpr.indexOf("<w:i/>") >= 0) return m;
      RE_LATIM.lastIndex = 0;
      const ms = []; let mm; while ((mm = RE_LATIM.exec(text))) { ms.push([mm.index, mm.index + mm[0].length]); achados.add(mm[0].trim()); }
      if (!ms.length) return m;
      let out = "", last = 0;
      for (const [s, e] of ms) {
        if (s > last) out += '<w:r>' + rpr + '<w:t xml:space="preserve">' + text.slice(last, s) + '</w:t></w:r>';
        out += '<w:r>' + ITAL_RPR + '<w:t xml:space="preserve">' + text.slice(s, e) + '</w:t></w:r>';
        last = e;
      }
      if (last < text.length) out += '<w:r>' + rpr + '<w:t xml:space="preserve">' + text.slice(last) + '</w:t></w:r>';
      return out;
    });
    if (achados.size) log.push("Itálico em latinismos: " + [...achados].sort().join(", "));
    return novo;
  }
  function avisosRevisao(xml, log) {
    let longos = 0;
    (xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || []).forEach(p => {
      const t = (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(r => r.replace(/<w:t[^>]*>/, "").replace("</w:t>", "")).join("");
      if (t.length > 1200) longos++;
    });
    if (longos) log.push("⚠️ " + longos + " parágrafo(s) muito longo(s) — considerar quebrar para leitura em tela (PJe).");
    const texto = (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).join(" ").toLowerCase();
    const reb = ["peça exordial", "esposar o entendimento", "compulsar os autos", "de per si"].filter(e => texto.indexOf(e) >= 0);
    if (reb.length) log.push("⚠️ Expressão(ões) rebuscada(s) (sugestão, não alterado): " + reb.join(", "));
  }
  function revisar(xml, log) {
    const st = { n: 0 };
    xml = xml.replace(RE_TXT, (m, a, t, c) => a + corrigirTexto(t, st) + c);
    if (st.n) log.push("Revisão ortográfica/tipográfica: " + st.n + " trecho(s) ajustado(s)");
    xml = italicoLatim(xml, log);
    avisosRevisao(xml, log);
    return xml;
  }

  /* ------------------------- orquestração ------------------------- */
  LEX.corrigir = function (docXml, stylesXml, ctx) {
    const log = [];
    let xml = LEX.mergeRuns(docXml);
    xml = corrigirGenero(xml, ctx.sexo, log);
    xml = inserirNumero(xml, ctx.numero_endereco, log);
    xml = socioeconomico(xml, ctx.socio_texto, log);
    xml = danoMoralExtenso(xml, log);
    xml = corrigirExtensos(xml, ctx.valores || [], log);
    if (ctx.alvo_vara_comum != null) xml = ajustarEnderecamento(xml, ctx.alvo_vara_comum, log);
    xml = completarCabecalho(xml, ctx.idoso, log);
    if (ctx.idoso) xml = inserirItensIdoso(xml, ctx.nascimento, ctx.idade, log);
    xml = removerMarcador(xml, log);
    xml = neutralizarLinguagem(xml, log);
    xml = renumerarPedidos(xml, log);
    xml = revisar(xml, log);   // ortografia/tipografia + latim em itálico + avisos
    let styles = stylesXml;
    [xml, styles] = formatarTudo(xml, styles);
    log.push("Formatação: 1,15; tabelas centralizadas e inteiras; títulos não separados");
    return { doc: xml, styles: styles, log: log };
  };
  LEX.snippetsIdoso = function (nasc, idade) {
    const ext = LEX.extenso(idade).replace(" reais", "").replace(" real", "");
    return {
      cabecalho: "COM PEDIDO DE PRIORIDADE PROCESSUAL: IDOSO",
      topico: "DA PRIORIDADE NA TRAMITAÇÃO PROCESSUAL — REQUERENTE MAIOR DE 60 ANOS. Nos termos do artigo 71 da Lei nº 10.741/2003... A parte requerente, nascida em " + nasc + ", possui " + idade + " (" + ext + ") anos...",
      pedido: "a prioridade na tramitação processual, visto que a parte requerente possui " + idade + " (" + ext + ") anos..."
    };
  };

  global.LEX = LEX;
})(window);
