// Teste do motor web (js/engine.js) — perfil Luis Albert (LA). Sem dado de cliente.
//   node tests/test_la.js     (sai 1 se algo falhar)
const fs = require("fs"), path = require("path"), assert = require("assert");
global.window = {};
eval(fs.readFileSync(path.join(__dirname, "..", "js", "engine.js"), "utf8"));
const L = window.LEX;

const R = '<w:rPr><w:sz w:val="24"/></w:rPr>', R2 = '<w:rPr><w:b/></w:rPr>';
const p = (t, ppr) => "<w:p>" + (ppr || "") + "<w:r>" + R + '<w:t xml:space="preserve">' + t + "</w:t></w:r></w:p>";
const doc = [
  p("AO JUÍZO DE DIREITO DA ____ª VARA DO JUIZADO ESPECIAL CÍVEL DA COMARCA DE MANAUS/AM."),
  p("COM PEDIDO DE GRATUIDADE DE JUSTIÇA"), p("COM PEDIDO DE INVERSÃO DO ÔNUS DA PROVA"),
  // gênero partido em runs com formatação diferente + proofErr
  "<w:p><w:r>" + R + "<w:t>FULANA DE TAL, BRASILEIRO(</w:t></w:r><w:proofErr w:type=\"gramEnd\"/><w:r>" + R2 +
    "<w:t>A), CASADO(A), portador(a) do RG sob nº 1 inscrito(a) no CPF sob o nº 1, vem, respeitosamente, perante</w:t></w:r></w:p>",
  p("Texto que cita o julgamento DO MÉRITO no meio da frase."),
  p("2.1. DO PEDIDO DE JUSTIÇA GRATUITA"), p("Atualmente, o(a) autor(a) é diarista."),
  p("2.2. DA INVERSÃO DO ÔNUS DA PROVA"), p("Corpo."),
  p("3. DO MÉRITO"), p("Danos de R$ 1.200,00 e lucro de R$14,25 bilhões. Total R$305,20 (trezentos reais)."),
  p("Citação: condenou em R$ 5.000,00 por danos.", '<w:pPr><w:ind w:left="1700"/></w:pPr>'),
  p("4. DOS PEDIDOS"), p("a) a citação;"),
  p("b) juros e correção, conforme Súmulas 362 e 54 do STJ; [PRIORIDADE]"),
  p("c) honorários;"), p("Dá-se à presente causa o valor de R$ 15.305,82 (quinze mil e trezentos e cinco reais e oitenta e dois centavos)."),
].join("");

const ctx = { sexo: "F", nascimento: "01/01/1950", idade: 76, idoso: true, alvo_vara_comum: false,
  grat_comum: true, socio_texto: "Atualmente, o(a) autor(a) é diarista, com renda de 2500 a 5000 reais.", valores: [] };
const r = L.corrigir(doc, "", ctx);
const ts = L.paraTextos(r.doc), t = ts.join("\n");
const idx = re => ts.findIndex(x => re.test(x));

// gênero
assert.match(t, /FULANA DE TAL, BRASILEIRA, CASADA, portadora do RG sob nº 1 inscrita/);
// prioridade: tópico logo antes de "3. DO MÉRITO" (não no parágrafo que só cita o mérito) e pedido em DOS PEDIDOS
const iTop = idx(/^2\.3\. DA PRIORIDADE NA TRAMITA/), iMer = idx(/^3\. DO MÉRITO/);
assert.ok(iTop > idx(/^2\.2\./) && iTop < iMer, "tópico fora do lugar");
const iPed = idx(/\) a prioridade na tramita/);
assert.ok(iPed > idx(/^b\) juros/) && iPed < idx(/honorários/), "pedido fora do lugar");
assert.match(ts[iPed], /^c\) a prioridade/);
assert.match(t, /^d\) honorários;/m);
assert.strictEqual((t.match(/PRIORIDADE PROCESSUAL: IDOSO/g) || []).length, 1);
// gratuidade: versão comum (ctx.grat_comum) + extenso no socioeconômico
assert.match(t, /Ação Declaratória de Constitucionalidade nº 80/);
assert.match(t, /R\$ 2\.500,00 \(dois mil e quinhentos reais\) a R\$ 5\.000,00 \(cinco mil reais\)/);
// extensos
assert.match(t, /R\$ 1\.200,00 \(mil e duzentos reais\)/);
assert.match(t, /R\$14,25 bilhões/);
assert.match(t, /R\$305,20 \(trezentos e cinco reais e vinte centavos\)/);
assert.match(t, /Citação: condenou em R\$ 5\.000,00 por danos\./);
assert.match(t, /R\$ 15\.305,82 \(quinze mil trezentos e cinco reais e oitenta e dois centavos\)/);
// segunda passada não duplica
const t2 = L.paraTextos(L.corrigir(r.doc, "", ctx).doc).join("\n");
assert.strictEqual((t2.match(/DA PRIORIDADE NA TRAMITA/g) || []).length, 1);
assert.strictEqual((t2.match(/\) a prioridade na tramita/g) || []).length, 1);

// gerador põe "2.x.DA PRIORIDADE..." no CABEÇALHO (caso real, out/2026): sai dali e vai antes do MÉRITO
const doc2 = [
  p("AO JUÍZO DE DIREITO DA ª VARA CÍVEL DA COMARCA DE MANAUS/AM."), p(""),
  p("COM PEDIDO DE JUSTIÇA GRATUITA"), p("COM PEDIDO DE INVERSÃO DO ÔNUS DA PROVA"),
  p("DISPENSA DE AUDIÊNCIA DE CONCILIAÇÃO (ART. 319, VII, CPC)"),
  p("2.x.DA PRIORIDADE NA TRAMITAÇÃO PROCESSUAL — REQUERENTE IDOSO 63 ANOS."), p(""), p(""),
  p("Nos termos do artigo 71 da Lei nº 10.741/2003 (Estatuto do Idoso) e artigo 1.048, inciso I, do Código de Processo Civil, toda pessoa com idade igual ou superior a 60 (Sessenta) anos tem direito à prioridade na tramitação dos processos judiciais."), p(""),
  p("No presente caso o Requerente, possui 63 anos, conforme comprovado por cópia do documento de identidade anexado aos autos."), p(""),
  p("Dessa forma, requer, com fundamento no artigo supracitado, a tramitação prioritária do presente feito, assegurando à parte autora o direito legalmente garantido."), p(""),
  p("FULANO, BRASILEIRO(A), vem, respeitosamente, perante"),
  p("2.1. DO PEDIDO DE JUSTIÇA GRATUITA"), p("Corpo."), p("3. DO MÉRITO"), p("Corpo."),
  p("4. DOS PEDIDOS"), p("a) a citação;"), p("c)A repetição do indébito;"),  // sem espaço e letra pulada
  p("d) juros e correção do dano moral desde o arbitramento;"),
  // letra em run separada, com formatação diferente
  "<w:p><w:r>" + R2 + "<w:t>e</w:t></w:r><w:r>" + R + "<w:t xml:space=\"preserve\">) a condenação em custas e honorários advocatícios de 20%, acrescidos de juros;</w:t></w:r></w:p>",
  p("Nestes termos,"),
].join("");
const ctx2 = Object.assign({}, ctx, { sexo: "M", nascimento: "01/01/1963", idade: 63 });
const ts3 = L.paraTextos(L.corrigir(doc2, "", ctx2).doc), t3 = ts3.join("\n");
const q = re => ts3.findIndex(x => re.test(x));
if (process.env.DEBUG) console.log(ts3.map((x, i) => i + ": " + x.slice(0, 90)).join("\n"), L.corrigir(doc2, "", ctx2).log);
assert.strictEqual((t3.match(/PRIORIDADE NA TRAMITA/g) || []).length, 1, "tópico duplicado ou ausente");
assert.ok(!/2\.x\./.test(t3) && !/No presente caso o Requerente/.test(t3), "bloco do cabeçalho não removido");
assert.ok(q(/^2\.2\. DA PRIORIDADE/) > q(/^2\.1\./) && q(/^2\.2\. DA PRIORIDADE/) < q(/^3\. DO MÉRITO/));
assert.ok(q(/PRIORIDADE PROCESSUAL: IDOSO/) < q(/respeitosamente/), "cabeçalho sem o pedido de prioridade");
// pedido entra após o item de juros, não no de honorários
assert.match(t3, /^b\) A repetição do indébito;/m);
assert.match(t3, /^c\) juros e correção/m);
assert.match(t3, /^d\) a prioridade na tramitação/m);
assert.match(t3, /^e\) a condenação em custas e honorários/m);

// gratuidade (modelo PARC CRED PESS): seção omitida pelo gerador (2.1 → 2.3) é criada como 2.2
const doc3 = [
  p("AO JUÍZO DE DIREITO DA __ª VARA CÍVEL DA COMARCA DE MANAUS/AM."),
  p("2.PRELIMINARMENTE"), p("2.1. DOS ASPECTOS RELATIVOS À PRESENTE DEMANDA"), p("Corpo 2.1."),
  p("2.3. DA PRESCRIÇÃO DECENAL"), p("Corpo 2.3."), p("3. DO MÉRITO"), p("Corpo."),
].join("");
const ctx3 = { sexo: "M", nascimento: "01/01/1990", idade: 36, idoso: false, alvo_vara_comum: true, grat_comum: true,
  socio_texto: "Atualmente, o(a) autor(a) é operador de empilhadeira, com renda de 2500 reais.", valores: [] };
const ts4 = L.paraTextos(L.corrigir(doc3, "", ctx3).doc), t4 = ts4.join("\n");
const g = ts4.findIndex(x => /^2\.2\. DO PEDIDO DE JUSTIÇA GRATUITA \(COMUM\)$/.test(x));
assert.ok(g > ts4.findIndex(x => /^Corpo 2\.1/.test(x)) && g < ts4.findIndex(x => /^2\.3\./.test(x)), "2.2 fora do lugar");
assert.match(t4, /^A gratuidade da justiça garante/m);
assert.match(t4, /dois mil e quinhentos reais\), de modo que a imposição das despesas processuais comprometeria/);
// título existente com versão errada: "(ESPECIAL)" vira "(COMUM)" — e não duplica
const doc4 = doc3.replace(p("2.3. DA PRESCRIÇÃO DECENAL"), p("2.2. DO PEDIDO DE JUSTIÇA GRATUITA (ESPECIAL)") + p("Ainda que o acesso...") + p("2.3. DA PRESCRIÇÃO DECENAL"));
const t5 = L.paraTextos(L.corrigir(doc4, "", ctx3).doc).join("\n");
assert.strictEqual((t5.match(/DO PEDIDO DE JUSTIÇA GRATUITA/g) || []).length, 1);
assert.match(t5, /2\.2\. DO PEDIDO DE JUSTIÇA GRATUITA \(COMUM\)/);
assert.ok(!/Ainda que o acesso/.test(t5));
console.log("OK — test_la.js");
