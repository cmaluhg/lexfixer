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
console.log("OK — test_la.js");
