// node tests/test_rj.js — operação LA RJ (js/rj.js). Só dados fictícios; o modelo real não fica no repositório.
const fs = require("fs"), path = require("path"), assert = require("assert");
global.window = {}; eval(fs.readFileSync(path.join(__dirname, "..", "js", "engine.js"), "utf8"));
const LEX = window.LEX, R = require(path.join(__dirname, "..", "js", "rj.js"));

// qualificação: procuração AM ("OUTORGANTE:") e RJ ("CONTRATANTE :", números partidos pelo pdf.js)
let o = R.extrairOutorgante("PROCURAÇÃO OUTORGANTE: FULANO DE TAL , Brasileiro(a), Solteiro(a), AJUDANTE, portador do RG nº 1, CPF sob o nº 000.000.000-00 residente em RUA A, 10, CENTRO, CEP: 69000-000, MANAUS-AM. Número para contato: (92) 0000-0000. OUTORGADO PRINCIPAL: X");
assert.strictEqual(o.cidade, "MANAUS"); assert.match(o.qualificacao, /^FULANO DE TAL, Brasileiro\(a\).*-00, residente em RUA A/);
o = R.extrairOutorgante("PROCURAÇÃO CONTRATANTE : BELTRANA , BRASILEIRO(A), VIUVO(A), DO LAR , RG nº 2, CPF nº 111.111.111 - 11, residente em Rua B, 2, Bairro, CEP: 24900 - 000, MARICÁ - RJ. OUTORGADO PRINCIPAL : Y");
assert.strictEqual(o.cidade, "MARICÁ"); assert.match(o.qualificacao, /111\.111\.111-11/);
assert.strictEqual(R.generoTexto(o.qualificacao, "F").slice(0, 31), "BELTRANA, BRASILEIRA, VIUVA, DO");
assert.strictEqual(R.generoTexto("portador do RG, inscrito no CPF, o(a) autor(a)", "M"), "portador do RG, inscrito no CPF, o autor");
assert.strictEqual(R.generoTexto("portador do RG, inscrito no CPF", "F"), "portadora do RG, inscrita no CPF");

// planilha LEXFINDER: uma aba por rubrica; total de todas as abas (não só a 1ª); data serial e valor texto US/BR
const pl = R.planilhaRJ([
  { nome: "Tarifa Indevida", linhas: [["Data", "Descrição", "Operação", "Valor"], ["02/09/2016", "TARIFA EMISSAO EXTRATO", "1", 2.45], [42736, "TARIFA EMISSAO EXTRATO", "2", "R$ 2.50"], ["", "", "", ""], ["VALOR TOTAL", "", "", 4.95], ["VALOR EM DOBRO", "", "", 9.9]] },
  { nome: "Seguro", linhas: [["Data", "Descrição", "Operação", "Valor"], ["01/01/2020", "SEGURO X", "3", "R$ 1,000.10"], ["VALOR TOTAL", "", "", 999]] },
]);
assert.strictEqual(pl.total, 1005.05); assert.strictEqual(pl.dobro, 2010.1);
assert.strictEqual(pl.grupos[0].descontos[1].data, "01/01/2017");
assert.deepStrictEqual(pl.divergencias.length, 1, "VALOR TOTAL errado na aba deve ser apontado");
assert.deepStrictEqual(R.classificar(pl.grupos.map(g => g.aba)), { TARIFAS: true, CREDITO: false, SEGURO: true, NAO_IDENTIFICADA: false });
assert.deepStrictEqual(R.classificar(["Gastos com Cartão", "Título de Capitalização", "Operações Vencidas", "XPTO"]),
  { TARIFAS: false, CREDITO: true, SEGURO: false, NAO_IDENTIFICADA: true });

// contracheque do Governo do RJ (texto como o pdf.js entrega): média dos 3 últimos, nascimento, pensão
const mes = (m, b, d, l) => "Secretaria de Estado da Casa Civil e Governança ÓRGÃO TESTE - OT CNPJ Nº: 1 Comprovante de Pagamento - " + m +
  " CPF 0 NOME X NASCIMENTO 15/01/1960 TIPO DE VÍNCULO PENSÃO DATA APOSENTADORIA FUNDAMENTAÇÃO LEGAL *** TOTAL DE GANHOS TOTAL DE DESCONTOS TOTAL LÍQUIDO " + b + " " + d + " " + l + " ";
const cc = R.lerContracheque(mes("5/2026", "1.000,00", "100,00", "900,00") + mes("6/2026", "2.000,00", "200,00", "1.800,00") + mes("7/2026", "3.000,00", "300,00", "2.700,00") + mes("8/2026", "4.000,00", "400,00", "3.600,00"));
assert.strictEqual(cc.nascimento, "15/01/1960"); assert.strictEqual(cc.pensao, true); assert.strictEqual(cc.orgao, "ÓRGÃO TESTE - OT");
assert.strictEqual(cc.bruto, 3000); assert.strictEqual(cc.meses[0].comp, "6/2026");
assert.match(R.textoSocio(cc), /^A parte autora recebe pensão paga pela fonte pagadora ÓRGÃO TESTE - OT\. Nos comprovantes de pagamento de 6\/2026 a 8\/2026/);
assert.strictEqual(R.lerContracheque("extrato bancário qualquer"), null);

// montagem: modelo mínimo com as mesmas marcas do modelo RJ
const P = t => '<w:p><w:pPr><w:jc w:val="both"/></w:pPr><w:r><w:t xml:space="preserve">' + t + "</w:t></w:r></w:p>";
const modelo = '<w:document><w:body>' + [P("AO JUÍZO DA COMARCA DE [CIDADE] – RJ"), P("[IDOSO]"), P("[DADOS_CLIENTE], em face de [PARTE_ADVERSA], [INFOS_EMPRESAS]."),
  P("[TEXTO_SOCIO], de modo que fecho."), P("1.4. DA AUSÊNCIA DE PRESCRIÇÃO"), P("[IDOSO_1]"), P("conta [CONTA] agência [AGENCIA], rubricas [RUBRICAS]."),
  P("Os lançamentos impugnados estão individualizados na tabela abaixo, total R$ [VALOR DOS DESCONTOS NA FORMA SIMPLES]:"), P("[RESUMO_DETALHES]"),
  P("[#SE_TARIFAS]"), P("Tarifas. texto"), P("[/SE_TARIFAS]"), P("[#SE_CREDITO]"), P("Operações de crédito. texto"), P("[/SE_CREDITO]"),
  P("[RESUMO_DETALHES]"), P("dobro R$ [VALOR_INDEBITO], dano R$ [DANO_MORAL]"), P("[RELATO_DANO_MORAL]"), P("[IDOSO_2]"), P("causa [VALOR_DA_ACAO]."), P("[CIDADE], [DATA].")].join("") +
  "<w:sectPr/></w:body></w:document>";
const base = { qualificacao: "BELTRANA, BRASILEIRA", sexo: "F", banco: R.BANCOS[0], conta: "1-2", agencia: "3", rubricas: ["A", "B", "C"], grupos: pl.grupos,
  total: pl.total, dobro: pl.dobro, danoMoral: 10000, socio: "Texto do socioeconômico.", relato: "", cidade: "Rio de Janeiro", data: new Date(2026, 9, 22),
  nasc: "15/01/1940", idade: 86, cond: { TARIFAS: true, CREDITO: false }, extenso: LEX.extenso };
const txt = x => x.replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "");
let r = R.preencher(modelo, base), t = txt(r.xml);
assert.deepStrictEqual(r.sobra, [], "nenhuma marca pode sobrar");
assert.match(t, /COMARCA DA CAPITAL – RJ/); assert.match(t, /^PRIORIDADE DE TRAMITAÇÃO – PESSOA IDOSA$/m);
assert.match(t, /^1\.5\. DA PRIORIDADE DE TRAMITAÇÃO – PESSOA IDOSA$/m); assert.match(t, /maiores de 80 \(oitenta\) anos/);
assert.match(t, /com a prioridade especial prevista no art\. 71, § 5º/);
assert.match(t, /^Tarifas\. texto$/m); assert.doesNotMatch(t, /Operações de crédito/); assert.doesNotMatch(t, /\[#SE_|\[\/SE_/);
assert.match(t, /^Texto do socioeconômico\.$/m, "socio que já fecha a frase não ganha o fecho do modelo");
assert.match(t, /BANCO BRADESCO S\.A\., pessoa jurídica/); assert.match(t, /rubricas A, B e C\./);
assert.match(t, /individualizados nas tabelas abaixo, total R\$ 1\.005,05 \(mil e cinco reais e cinco centavos\)/);
assert.match(t, /causa R\$ 12\.010,10 \(/); assert.match(t, /^Rio de Janeiro, 22 de outubro de 2026\.$/m);
assert.strictEqual((r.xml.match(/<w:tbl>/g) || []).length, 3, "2 tabelas detalhadas (Fatos) + 1 quadro-resumo (3.3)");
assert.match(t, /Lançamentos/); assert.doesNotMatch(t, /\[RELATO_DANO_MORAL\]/);
// sem idoso, sem relato, cidade do interior
r = R.preencher(modelo, Object.assign({}, base, { idade: 40, nasc: "01/01/1986", cidade: "NILÓPOLIS", relato: "Em 10/04/2026, a conta de luz foi devolvida." })); t = txt(r.xml);
assert.doesNotMatch(t, /PRIORIDADE|1\.5\./); assert.match(t, /COMARCA DE NILÓPOLIS – RJ/); assert.match(t, /^Nilópolis, 22/m);
assert.match(t, /^Em 10\/04\/2026, a conta de luz foi devolvida\.$/m);

console.log("test_rj: OK");
