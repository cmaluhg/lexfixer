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
    // pedidos preliminares: procurar na PEÇA INTEIRA — o LEX pede no cabeçalho,
    // o NG pede em seções (ex.: "3.2. DO PEDIDO DE JUSTIÇA GRATUITA").
    const txtU = deburrUp(texto);
    d.header_gratuidade = txtU.indexOf("GRATUIDADE") >= 0 || txtU.indexOf("JUSTICA GRATUITA") >= 0;
    d.header_inversao = txtU.indexOf("INVERS") >= 0 && txtU.indexOf("ONUS") >= 0;
    d.header_tutela = txtU.indexOf("TUTELA DE URG") >= 0 || txtU.indexOf("TUTELA ANTECIPADA") >= 0;
    d.header_prioridade_idoso = txtU.indexOf("PRIORIDADE") >= 0;
    d.prioridade_presente = prioridadePresente(texto);  // já tem tópico/pedido de idoso? (não reinserir)
    const l1 = (paras[0] || "").toUpperCase();
    d.endereco_juizado = l1.indexOf("JUIZADO ESPECIAL") >= 0;
    d.endereco_vara_comum = l1.indexOf("VARA C") >= 0 && l1.indexOf("JUIZADO") < 0;
    // Ausência de Notificação Prévia (ANP): sempre Justiça Comum, independente do valor.
    d.anp = /NOTIFICACAO PREVIA|PREVIA NOTIFICACAO|AUSENCIA DE (PREVIA )?NOTIFICACAO|SEM (PREVIA )?NOTIFICACAO/.test(deburrUp(texto));
    d.escritorio = detectarEscritorio(texto);  // "LA" (Luis Albert) ou "NG" (Nicolas Gomes)
    let m = l1.match(/COMARCA DE ([A-ZÀ-Ú/ ]+)/); d.comarca = m ? m[1].trim().replace(/\.+$/, "") : "";
    m = texto.match(/RG sob n[ºo]?\s*([\d.\-]+)/); d.rg = m ? m[1].replace(/\D/g, "") : null;
    m = texto.match(/CPF sob o n[ºo]?\s*([\d.\-]+)/); d.cpf = m ? m[1].trim() : null;
    d.gen_brasileiro_marcado = texto.indexOf("BRASILEIRO(A)") >= 0;
    d.gen_estadocivil_marcado = /(SOLTEIRO\(A\)|CASADO\(A\)|DIVORCIADO\(A\)|VI[ÚU]VO\(A\))/.test(texto);
    // aceita separador antes de "Bairro" com vírgula OU ponto (NG: "RUA GAIVOTA , 2122. Bairro:")
    m = texto.match(/residente\s+n[ao]\s+([\s\S]+?)\s*[,.]?\s*Bairro/);
    d.endereco_logradouro = m ? m[1].trim() : null;
    // número: "Nº 52" (LEX) ou número após vírgula "RUA X, 2122" (NG)
    d.endereco_tem_numero = !!(m && /\bn[ºo°]\.?\s*\d+|,\s*\d+/i.test(m[1]));
    // aceita "agência 5042" e "agência nº 5042" / "conta corrente nº 402615-2" (kit NG)
    m = texto.match(/ag[êe]ncia[^\d]{0,8}(\d[\d.\-]*)/i); d.agencia = m ? m[1].trim() : null;
    m = texto.match(/conta\s+corrente[^\d]{0,8}(\d[\d.\-]*)/i); d.conta = m ? m[1].trim() : null;
    // período do dano material — aceita "de/desde/entre X a/até/e Y" (LEX e NG)
    m = texto.match(/(?:per[íi]odo(?:\s+de)?|desde|entre|de)\s*(\d{2}\/\d{2}\/\d{4})\s*(?:at[ée]|a|e|\-|até o dia)\s*(\d{2}\/\d{2}\/\d{4})/i)
      || texto.match(/(\d{2}\/\d{2}\/\d{4})\s*(?:at[ée]|\s+a\s+)\s*(\d{2}\/\d{2}\/\d{4})/i);
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
    d.pedidos_sem_letra = pedidosSemLetra(paras);  // pedidos sem alínea antes de 'a)' (NG)
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
  const TETO = 64840.0;          // teto do JEC (06/2026) — referência, NÃO é a premissa de separação
  const HIGH_TICKET = 50000.0;   // separação JEC × Vara Comum: > R$50.000 (valor da causa) = high ticket → comum
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
    if (pet.anp) ach.push(F(1, "Endereçamento", pet.endereco_vara_comum ? "OK" : "CORRIGIR",
      "Ausência de notificação prévia → SEMPRE Vara Cível Comum, independente do valor."));
    else if (temExc) ach.push(F(1, "Endereçamento", pet.endereco_vara_comum ? "OK" : "ATENCAO",
      "Rubrica na EXCEÇÃO (" + excs.join(", ") + ") → Vara Cível Comum. Confirmar com o advogado."));
    else if (vc != null) {
      const corte = pet.escritorio === "NG" ? TETO : HIGH_TICKET;  // LA: high ticket R$50k; NG: teto JEC
      const alvoJ = vc <= corte; const ok = alvoJ ? pet.endereco_juizado : pet.endereco_vara_comum;
      ach.push(F(1, "Endereçamento", ok ? "OK" : "CORRIGIR",
        (ok ? "Correto: " : "Deveria ser ") + (alvoJ ? "Juizado Especial Cível" : "Vara Cível Comum") +
        " — valor da causa R$ " + (vc || 0).toFixed(2) + " (corte R$ " + corte.toLocaleString("pt-BR") + (pet.escritorio === "NG" ? ", NG" : ", high ticket") + ")."));
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
    if (idoso && pet.prioridade_presente) {
      ach.push(F(9, "Prioridade (texto)", "OK", "Idoso (" + idade + ") — tópico de prioridade JÁ consta na peça; mantido (não duplicado)."));
      ach.push(F(12, "Prioridade (pedido)", "OK", "Pedido de prioridade já consta na peça; mantido."));
    } else if (idoso) { ach.push(F(9, "Prioridade (texto)", "CORRIGIR", "Idoso (" + idade + ") → tópico e pedido de prioridade inseridos."));
      ach.push(F(12, "Prioridade (pedido)", "CORRIGIR", "Pedido de prioridade inserido."));
    } else { const st = pet.marcador_prioridade ? "ATENCAO" : "OK";
      ach.push(F(9, "Prioridade (idoso)", st, (idade != null ? "Não idoso (" + idade + ")." : "Idade não informada.") + (pet.marcador_prioridade ? " Marcador [PRIORIDADE] removido." : ""))); }
    ach.push(F(10, "Dano moral por extenso", pet.dano_moral_vazio ? "CORRIGIR" : "OK", pet.dano_moral_vazio ? "Estava vazio 'R$ 15.000,00 ()' — corrigido." : "OK."));
    const letras = pet.pedidos_letras || []; const esp = letras.map((_, i) => String.fromCharCode(97 + i));
    const semLetra = pet.pedidos_sem_letra || 0;
    let st11, m11;
    if (semLetra > 0) { st11 = "CORRIGIR"; m11 = semLetra + " pedido(s) SEM alínea antes de 'a)' (ex.: prioridade/cessação) — renumerar TODOS os pedidos em sequência (a, b, c, ...)."; }
    else if (JSON.stringify(letras) !== JSON.stringify(esp)) { st11 = "CORRIGIR"; m11 = "Sequência irregular: " + letras.join(","); }
    else { st11 = "OK"; m11 = "Letras em sequência."; }
    if (pet.valor_repeticao_pedido != null && plan.dobro != null && Math.abs(pet.valor_repeticao_pedido - plan.dobro) > 0.01 && Math.abs(pet.valor_repeticao_pedido - (plan.total || -1)) < 0.01) {
      st11 = "ATENCAO"; m11 += " | Pedido pede R$ " + pet.valor_repeticao_pedido + " (simples); dobro é R$ " + plan.dobro + " — confirmar."; }
    ach.push(F(11, "Valores nos pedidos", st11, m11));
    const resumo = { OK: 0, ATENCAO: 0, CORRIGIR: 0 };
    ach.forEach(a => resumo[a.status]++);
    return { achados: ach, idade, idoso, temExc, resumo };
  };

  // Auditoria das TABELAS de valores colocadas na peça: soma dos itens == VALOR TOTAL
  // e VALOR EM DOBRO == 2x total. Se não bater -> "tabela incorreta, voltar ao ORG DOC".
  LEX.auditarTabelas = function (xml) {
    const numRS = txt => {
      const vs = []; const re = /R\$\s*([\d.]+,\d{2})/g; let m;
      while ((m = re.exec(txt))) { const n = parseFloat(m[1].replace(/\./g, "").replace(",", ".")); if (!isNaN(n)) vs.push(n); }
      return vs;
    };
    const cellText = c => (c.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(x => x.replace(/<w:t[^>]*>/, "").replace("</w:t>", "")).join(" ");
    const out = { ok: true, tabelas: [], problemas: [] };
    const tbls = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || [];
    tbls.forEach((t, idx) => {
      const rows = (t.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || []).map(tr => {
        const txt = cellText(tr);
        return { txt, up: txt.toUpperCase(), vals: numRS(txt) };
      });
      const totalRow = rows.find(r => r.up.indexOf("TOTAL") >= 0 && r.up.indexOf("DOBRO") < 0 && r.vals.length);
      if (!totalRow) return;  // não é uma tabela de valores auditável
      const dobroRow = rows.find(r => r.up.indexOf("DOBRO") >= 0 && r.vals.length);
      const itens = rows.filter(r => r !== totalRow && r !== dobroRow && r.vals.length);
      const soma = itens.reduce((s, r) => s + r.vals[r.vals.length - 1], 0);
      const total = totalRow.vals[totalRow.vals.length - 1];
      const dobro = dobroRow ? dobroRow.vals[dobroRow.vals.length - 1] : null;
      const probs = [];
      if (itens.length && Math.abs(soma - total) > 0.01)
        probs.push("soma dos itens R$ " + soma.toFixed(2) + " ≠ VALOR TOTAL R$ " + total.toFixed(2));
      if (dobro != null && Math.abs(dobro - 2 * total) > 0.01)
        probs.push("VALOR EM DOBRO R$ " + dobro.toFixed(2) + " ≠ 2× total (R$ " + (2 * total).toFixed(2) + ")");
      const titulo = (rows[0] && rows[0].txt.trim()) || ("Tabela " + (idx + 1));
      out.tabelas.push({ titulo, soma, total, dobro, itens: itens.length, problemas: probs });
      if (probs.length) { out.ok = false; out.problemas.push('"' + titulo + '": ' + probs.join("; ")); }
    });
    return out;
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
      // typos comuns digitados à mão no socioeconômico
      .replace(/\brebda\b/gi, "renda").replace(/\brenta\b/gi, "renda").replace(/\brensa\b/gi, "renda")
      .replace(/\brendda\b/gi, "renda").replace(/\bsalario\b/gi, "salário")
      .replace(/\baproximadamente de\s*(\d)/g, "de aproximadamente $1")
      .replace(/\s*A residência (?:do\(a\) autor\(a\)|da parte autora) abriga mais de \d+ pessoas[,.]/g, "");
    // valores em contexto monetário ganham separador de milhar (5000 -> 5.000)
    t = t.replace(/R\$\s*(\d{1,3})(\d{3})\b/g, "R$ $1.$2")
      .replace(/\b(\d{1,3})(\d{3})(\s*reais)/g, "$1.$2$3")
      .replace(/\b(de|at[ée])\s+(\d{1,3})(\d{3})\b(?!\s*[\/\d])/gi, "$1 $2.$3");
    t = t.replace(/ {2,}/g, " ").replace(/ +([,;:.!?])/g, "$1").trim();
    if (t) { t = t.charAt(0).toUpperCase() + t.slice(1); if (!/[.!?]$/.test(t)) t += "."; }
    return t;
  }
  // um parágrafo é o socioeconômico (template) se começa com "Atualmente," E
  // traz marcadores de renda/provedor/hipossuficiência — evita casar o parágrafo
  // retórico "Atualmente, no Brasil, instalou-se uma cultura...".
  function ehParaSocio(t) {
    const s = t.toLowerCase();
    if (s.indexOf("atualmente,") < 0) return false;
    return /autor\(a\)|provedor|impossibilitad|renda mensal|reside um total|sua resid[êe]ncia|é o único|hipossufici/.test(s);
  }
  function paraContendoPred(xml, pred) {
    const re = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g; let m;
    while ((m = re.exec(xml))) {
      const t = (m[0].match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(r => r.replace(/<w:t[^>]*>/, "").replace("</w:t>", "")).join("");
      if (pred(t)) return { ini: m.index, fim: m.index + m[0].length, tag: m[0] };
    }
    return null;
  }
  function deburrUp(s) { return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase(); }
  // título da seção de gratuidade: numeração ("2.2.") + DO/DA + termo.
  function ehHdrGratuidade(t) {
    const d = deburrUp(t).trim();
    if (d.length > 70 || !/^\d+(\.\d+)*\.?\s+D[OA]\b/.test(d)) return false;
    return d.indexOf("JUSTICA GRATUITA") >= 0 || d.indexOf("GRATUIDADE") >= 0 || d.indexOf("ASSISTENCIA JUDICIARIA") >= 0;
  }
  function inserirInicioGratuidade(xml, novo) {
    const r = paraContendoPred(xml, ehHdrGratuidade);
    if (!r) return [xml, false];
    return [xml.slice(0, r.fim) + novo + xml.slice(r.fim), true];
  }
  /* ---- Novo tópico de gratuidade (ADC 80) — SÓ Luis Albert. Duas versões (Comum/JEC).
        Parágrafos {ind:true} = parte individual: preenchida a partir do socioeconômico do
        cliente; sem socio, ficam com "(preencher)" em amarelo. Texto verbatim aprovado. ---- */
  const GRAT_COMUM = [
    { t: "A gratuidade da justiça garante o acesso à Justiça àqueles que não possuem recursos suficientes para arcar com as despesas processuais sem prejuízo de sua subsistência. No caso, a situação econômica da parte Autora evidencia o preenchimento dos requisitos para a concessão do benefício, conforme se demonstra." },
    { ind: true, t: "Atualmente, o(a) Autor(a) é (preencher), sendo (único provedor da residência/adequar ao caso concreto), na qual residem (preencher) pessoas, que (dependem integral ou parcialmente/adequar ao caso concreto) de sua renda mensal bruta no valor de R$ (preencher)." },
    { ind: true, t: "Além disso, a parte Autora arca mensalmente com despesas essenciais, tais como (preencher: água, energia elétrica, alimentação, medicamentos, transporte, internet, despesas com dependentes, empréstimos etc.), de modo que a imposição das despesas processuais comprometeria parcela relevante dos recursos destinados à sua subsistência e à manutenção de seu núcleo familiar." },
    { t: "Cumpre destacar, ainda, que, em 03 de setembro de 2026, o Supremo Tribunal Federal concluiu o julgamento da Ação Declaratória de Constitucionalidade nº 80 (ADC 80), estabelecendo parâmetros para a concessão da gratuidade da justiça, com extensão aos diversos ramos do Poder Judiciário." },
    { t: "No referido julgamento, o STF reconheceu que a pessoa natural com renda mensal de até R$ 5.000,00 (cinco mil reais) faz jus à gratuidade da justiça sem necessidade de comprovação adicional da insuficiência de recursos, estabelecendo, assim, parâmetro objetivo para a análise do benefício." },
    { t: "Tal presunção, contudo, não possui caráter absoluto, podendo ser afastada quando existirem elementos concretos que demonstrem patrimônio ou renda familiar incompatíveis com a concessão do benefício. Na hipótese dos autos, além de a renda da parte Autora encontrar-se dentro do parâmetro fixado pelo STF, não há elementos que evidenciem situação patrimonial ou financeira incompatível com a hipossuficiência alegada, sendo sua realidade econômica corroborada pelas circunstâncias individualizadas acima e pelos documentos anexados à inicial." },
    { t: "Ressalta-se, ainda, que o Supremo Tribunal Federal conferiu à decisão efeitos ex nunc, estabelecendo que os novos critérios incidem somente sobre os processos ajuizados a partir da publicação da ata do julgamento. Considerando que a presente demanda foi proposta posteriormente ao referido marco temporal, os parâmetros estabelecidos na ADC 80 mostram-se plenamente aplicáveis ao caso." },
    { t: "Dessa forma, considerando a situação econômica concretamente demonstrada, a renda mensal da parte Autora e seu enquadramento nos parâmetros estabelecidos pelo Supremo Tribunal Federal na ADC 80, pugna-se pela concessão dos benefícios da gratuidade da justiça, nos termos do art. 9º, inciso I, da Constituição do Estado do Amazonas e dos arts. 98 e seguintes do Código de Processo Civil." },
  ];
  const GRAT_JEC = [
    { t: "Ainda que o acesso à Justiça Especial em primeiro grau independa do pagamento de custas, taxas ou despesas por força do art. 54 da lei específica n. 9.099/95, que abrange os Juizados Especiais, cumpre informar que a parte Autora não possui condições de arcar com as custas judiciais (preparo ou qualquer outro ato) sem comprometer severamente seu sustento." },
    { ind: true, t: "Atualmente, o(a) autor(a) é (preencher), sendo o único provedor da sua casa (adequar ao caso concreto), na qual reside um total de (preencher) pessoas, que dependem integralmente da sua renda mensal bruta no valor de R$ (preencher)." },
    { ind: true, t: "Além disso, a parte autora arca com despesas essenciais, tais como (preencher, ex.: água, luz, alimentação, medicamentos, transporte, internet, cuidado de dependentes, empréstimos, etc), de modo que não dispõe de recursos para suportar despesas extras, ainda que processuais, sem prejuízo de sua própria subsistência e de seu núcleo familiar." },
    { t: "Por fim, cabe destacar que, em 03 de setembro de 2026, o Supremo Tribunal Federal concluiu o julgamento da ADC 80, estabelecendo novos parâmetros para a concessão da gratuidade da justiça, com aplicação aos diversos ramos do Poder Judiciário." },
    { t: "A decisão reconheceu a presunção relativa de insuficiência de recursos da pessoa natural que aufere renda mensal de até R$ 5.000,00 (cinco mil reais), ressalvada a possibilidade de afastamento da presunção quando o magistrado verificar, no caso concreto, patrimônio ou renda familiar incompatíveis com a alegada hipossuficiência, mediante análise das circunstâncias concretamente demonstradas." },
    { t: "O STF conferiu à decisão efeitos ex nunc, a contar da publicação da ata do julgamento de mérito, aplicando-se os novos critérios somente às ações ajuizadas a partir desse marco temporal. Considerando que a presente demanda foi proposta posteriormente à publicação da referida ata, mostra-se aplicável ao caso o parâmetro estabelecido na ADC 80." },
    { t: "Por todo o exposto, pugna-se pela concessão dos benefícios da gratuidade da justiça, à luz dos parâmetros fixados pelo Supremo Tribunal Federal no julgamento da ADC 80, bem como do art. 9º, inciso I, da Constituição do Estado do Amazonas, dos arts. 98 e seguintes do Código de Processo Civil e do art. 54 da Lei nº 9.099/95." },
  ];
  const HL_RPR = '<w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:highlight w:val="yellow"/></w:rPr>';
  function escXml(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function paraGrat(texto, hl) {
    return '<w:p w14:paraId="' + npid() + '" w14:textId="77777777">' + PPR_BODY + '<w:r>' + (hl ? HL_RPR : RPR) + '<w:t xml:space="preserve">' + escXml(texto) + '</w:t></w:r></w:p>';
  }
  function textoDoPara(tag) { return (tag.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(r => r.replace(/<w:t[^>]*>/, "").replace("</w:t>", "")).join(""); }
  function detectarEscritorio(texto) {
    return /NICOLAS\s+GOMES/.test(deburrUp(texto || "")) ? "NG" : "LA";
  }
  // A peça JÁ traz um tópico/pedido de prioridade de idoso? (NG usa o tópico 2.7 "DA
  // PRIORIDADE NA TRAMITAÇÃO PROCESSUAL" e o pedido correspondente). Serve para não
  // duplicar/reinserir quando já existe — vale para os dois escritórios (idempotente).
  function prioridadePresente(texto) {
    const u = deburrUp(texto || "");
    return /PRIORIDADE NA TRAMITA/.test(u) ||
           /TRAMITAC\w* PRIORITARI/.test(u) ||
           (/PRIORIDADE/.test(u) && /ESTATUTO DO IDOSO/.test(u));
  }
  // Conta pedidos SEM alínea que aparecem ANTES do primeiro item 'a)' na seção
  // DOS PEDIDOS, quando existe pelo menos um item com letra (caso NG: prioridade/
  // cessação sem 'a)', seguidos de 'a)', 'b)'...).
  function pedidosSemLetra(paras) {
    let ini = -1;
    for (let i = 0; i < paras.length; i++) {  // âncora = título da seção de pedidos
      const u = deburrUp(paras[i]);
      if (u.indexOf("DOS PEDIDOS") >= 0 || u.indexOf("DOS REQUERIMENTOS") >= 0) { ini = i + 1; break; }
    }
    if (ini < 0) {  // sem título → introdução curta "..., requer:" (não a argumentação)
      for (let i = 0; i < paras.length; i++) {
        const s = (paras[i] || "").trim();
        if (s.length <= 80 && s.endsWith(":") && /\brequer\b/i.test(s)) { ini = i + 1; break; }
      }
    }
    if (ini < 0) return 0;
    const fins = ["NESTES TERMOS", "TERMOS EM QUE", "PEDE DEFERIMENTO", "DA-SE A CAUSA", "VALOR DA CAUSA", "PROTESTA PROVAR", "DO VALOR DA CAUSA"];
    let fim = paras.length;
    for (let j = ini; j < paras.length; j++) { const u = deburrUp(paras[j]); if (fins.some(k => u.indexOf(k) >= 0)) { fim = j; break; } }
    let com = 0, semAntes = 0;
    for (let k = ini; k < fim; k++) {
      const s = (paras[k] || "").trim();
      if (!s.endsWith(";")) continue;
      if (/^[a-z]\)/.test(s)) com++;
      else if (s.length > 15 && com === 0) semAntes++;
    }
    return com > 0 ? semAntes : 0;
  }
  // Substitui o CORPO da seção de gratuidade (do título até a próxima seção) pelo texto
  // ADC 80 (Comum/JEC). A parte individual é preenchida com o socioeconômico do cliente;
  // sem socio, fica "(preencher)" em amarelo. Se não achar a seção, insere após o título.
  function atualizarGratuidade(xml, comum, socioTexto, log) {
    const re = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g; let m; const blocks = [];
    while ((m = re.exec(xml))) blocks.push({ ini: m.index, fim: m.index + m[0].length, tag: m[0] });
    const hi = blocks.findIndex(b => ehHdrGratuidade(textoDoPara(b.tag)));
    if (hi < 0) { log.push("⚠️ Gratuidade (ADC 80) NÃO inserida — seção 'DO PEDIDO DE JUSTIÇA GRATUITA' não encontrada. Inserir manualmente."); return xml; }
    let nj = -1;
    for (let j = hi + 1; j < blocks.length; j++) { if (isHeading(textoDoPara(blocks[j].tag))) { nj = j; break; } }
    const ini = blocks[hi].fim;
    const fim = nj >= 0 ? blocks[nj].ini : blocks[hi].fim;
    const socio = socioTexto ? limparSocio(socioTexto) : "";
    const partes = []; let socioEmitido = false;
    for (const p of (comum ? GRAT_COMUM : GRAT_JEC)) {
      if (p.ind) {
        if (socio) { if (!socioEmitido) { partes.push(paraGrat(socio, false)); socioEmitido = true; } }
        else partes.push(paraGrat(p.t, true));  // sem socio → "(preencher)" em amarelo
      } else partes.push(paraGrat(p.t, false));
    }
    log.push("Tópico de gratuidade (ADC 80) — versão " + (comum ? "JUSTIÇA COMUM" : "JUIZADO/JEC")
      + (socio ? " (individualizado pelo socioeconômico)" : " — parte individual em amarelo '(preencher)' para a equipe") + ".");
    return xml.slice(0, ini) + partes.join("") + xml.slice(fim);
  }
  function socioeconomico(xml, socioTexto, log, info) {
    info = info || {};
    if (!socioTexto) { info.pedido = false; info.ok = true; info.via = "sem texto socioeconômico (opcional)"; return neutralizarSocioExistente(xml, log); }
    const texto = limparSocio(socioTexto);
    info.pedido = true; info.ok = false;
    if (!texto) { info.via = "texto socioeconômico vazio após limpeza"; return neutralizarSocioExistente(xml, log); }
    const novo = para(PPR_BODY, RPR, texto);
    // REMOVE um parágrafo socioeconômico já existente (a peça costuma vir com ele no
    // meio da seção) — será REPOSICIONADO no início da gratuidade.
    let posOrig = null;
    const r = paraContendoPred(xml, ehParaSocio);
    if (r) { posOrig = r.ini; xml = xml.slice(0, r.ini) + xml.slice(r.fim); }
    // 1) INÍCIO da seção de gratuidade (logo após o título) — regra do cliente.
    const [xi, oki] = inserirInicioGratuidade(xml, novo);
    if (oki) { log.push("Socioeconômico no início da seção de Gratuidade" + (posOrig != null ? " (reposicionado)" : "")); info.ok = true; info.via = "início da seção de Gratuidade (após o título)"; return xi; }
    // 2) fallback: insere após uma âncora de conteúdo conhecida.
    for (const anc of ["rendimento da parte autora", "rendimento da parte Autora",
      "extrato de renda dos últimos 3", "todos em anexo aos autos",
      "hipossuficiência econômica da parte", "declaração de hipossuficiência e extratos bancários",
      "GRATUIDADE DE JUSTIÇA", "gratuidade de justiça"]) {
      const [x2, ok] = inserirApos(xml, anc, novo); if (ok) { log.push("Socioeconômico inserido na seção de Gratuidade"); info.ok = true; info.via = "inserção na Gratuidade (âncora: " + anc + ")"; return x2; }
    }
    // 3) nada casou: se havia parágrafo, recoloca no lugar original (não perde texto).
    if (posOrig != null) {
      log.push("Socioeconômico individualizado/neutralizado (parágrafo existente)");
      info.ok = true; info.via = "substituição no lugar original (título não encontrado)";
      return xml.slice(0, posOrig) + novo + xml.slice(posOrig);
    }
    // 4) sem template e sem âncora: NÃO altera e avisa.
    log.push("⚠️ Socioeconômico NÃO individualizado automaticamente — âncora da Gratuidade não encontrada. Inserir manualmente e retornar ao ORG DOC.");
    info.via = "NENHUMA âncora encontrada";
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
    // normaliza QUALQUER espaçamento entre linhas para 276 (=1,15) — documento e estilos
    const rx = /w:line="\d+" w:lineRule="auto"/g;
    doc = doc.replace(rx, 'w:line="276" w:lineRule="auto"')
      .split('<w:spacing w:after="0"/>').join('<w:spacing w:after="0" w:line="276" w:lineRule="auto"/>');
    if (styles) styles = styles.replace(rx, 'w:line="276" w:lineRule="auto"');
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
  // colapsa sequências de parágrafos VAZIOS (2+ -> 1) para remover os "buracos"
  // entre seções (ex.: antes de "3. DO MÉRITO"). Preserva quebras de página/imagens.
  function colapsarVazios(xml, maximo) {
    maximo = maximo || 1;
    const re = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g; let m; let out = ""; let last = 0; let run = 0;
    while ((m = re.exec(xml))) {
      const gap = xml.slice(last, m.index); last = m.index + m[0].length;
      // qualquer conteúdo entre parágrafos (fim de célula </w:tc>, tabela, etc.) quebra
      // a sequência — senão apagaríamos o parágrafo obrigatório de uma célula (corrompe o docx)
      if (gap.trim()) run = 0;
      out += gap;
      const pt = m[0];
      const txt = (pt.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(r => r.replace(/<w:t[^>]*>/, "").replace("</w:t>", "")).join("");
      const protegido = /w:type="page"|pageBreakBefore|<w:drawing|<w:pict|<w:object|<w:sectPr/.test(pt);
      const vazio = txt.trim() === "" && !protegido;
      if (vazio) { run++; if (run > maximo) continue; }  // descarta o excedente
      else run = 0;
      out += pt;
    }
    out += xml.slice(last);
    return out;
  }
  function formatarTudo(doc, styles) { [doc, styles] = espac115(doc, styles); doc = centralizarTabelas(doc); doc = tabelasInteiras(doc); doc = colapsarVazios(doc, 1); doc = titulosJuntos(doc); return [doc, styles]; }
  LEX.formatarTudo = formatarTudo;

  /* ------------------------- revisão ortográfica/formatação ------------------------- */
  const CURADO = { "excessão": "exceção", "excessões": "exceções", "excessao": "exceção",
    "atravéz": "através", "atravez": "através", "concerteza": "com certeza",
    "previlégio": "privilégio", "previlegio": "privilégio", "beneficiente": "beneficente",
    "haja visto": "haja vista", "rebda": "renda", "renta": "renda", "rendda": "renda" };
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
    t = t.replace(/_{2,}/g, " ");   // traços/underscores de preenchimento (indício de IA)
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
    const tracos = ((xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).join("").match(/_{2,}/g) || []).length;
    xml = xml.replace(RE_TXT, (m, a, t, c) => a + corrigirTexto(t, st) + c);
    if (tracos) log.push("Removido(s) " + tracos + " traço(s) de preenchimento (underscores — indício de IA)");
    if (st.n) log.push("Revisão ortográfica/tipográfica: " + st.n + " trecho(s) ajustado(s)");
    xml = italicoLatim(xml, log);
    avisosRevisao(xml, log);
    return xml;
  }

  /* ------------------------- orquestração ------------------------- */
  LEX.corrigir = function (docXml, stylesXml, ctx) {
    const log = [];
    const socioInfo = { pedido: false, ok: true };
    let xml = LEX.mergeRuns(docXml);
    xml = corrigirGenero(xml, ctx.sexo, log);
    xml = inserirNumero(xml, ctx.numero_endereco, log);
    // Gratuidade: Luis Albert usa o tópico ADC 80 (versão conforme o foro); NG mantém o
    // comportamento anterior (socioeconômico no início da seção) — parâmetros do NG são outros.
    const _pJEC = /JUIZADO ESPECIAL/i.test(paraTextos(xml)[0] || "");
    const _comum = ctx.alvo_vara_comum != null ? !!ctx.alvo_vara_comum : !_pJEC;
    if (detectarEscritorio(paraTextos(xml).join("\n")) === "LA")
      xml = atualizarGratuidade(xml, _comum, ctx.socio_texto, log);
    else
      xml = socioeconomico(xml, ctx.socio_texto, log, socioInfo);
    xml = danoMoralExtenso(xml, log);
    xml = corrigirExtensos(xml, ctx.valores || [], log);
    if (ctx.alvo_vara_comum != null) xml = ajustarEnderecamento(xml, ctx.alvo_vara_comum, log);
    // Idoso: só inserir tópico/pedido de prioridade se a peça AINDA não os tiver
    // (o NG já traz o tópico 2.7 e o pedido — não duplicar).
    const _priJa = prioridadePresente(paraTextos(xml).join("\n"));
    xml = completarCabecalho(xml, ctx.idoso && !_priJa, log);
    if (ctx.idoso && !_priJa) xml = inserirItensIdoso(xml, ctx.nascimento, ctx.idade, log);
    else if (ctx.idoso) log.push("Prioridade de idoso já constava na peça — mantida (não reinserida)");
    xml = removerMarcador(xml, log);
    xml = neutralizarLinguagem(xml, log);
    xml = renumerarPedidos(xml, log);
    xml = revisar(xml, log);   // ortografia/tipografia + latim em itálico + avisos
    let styles = stylesXml;
    [xml, styles] = formatarTudo(xml, styles);
    log.push("Formatação: 1,15; tabelas centralizadas e inteiras; títulos não separados");
    // trava de segurança: se havia texto socioeconômico e ele NÃO entrou, alerta.
    if (socioInfo.pedido && !socioInfo.ok && !log.some(l => l.indexOf("Socioeconômico NÃO individualizado") >= 0))
      log.push("⚠️ Socioeconômico NÃO individualizado — revisar manualmente (ORG DOC).");
    return { doc: xml, styles: styles, log: log, socio: socioInfo };
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
