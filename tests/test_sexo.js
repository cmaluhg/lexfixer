// node tests/test_sexo.js — detecção de sexo/nascimento do documento (parseIdentidade, js/app.js).
// Casos sintéticos (nenhum dado real de cliente): reproduzem o OCR do CIN, cujo fundo de
// segurança gera letras soltas ("F") logo após o rótulo "Sexo/Sex".
const fs = require("fs"), path = require("path"), assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");
const a = src.indexOf("function parseIdentidade"), r0 = src.indexOf("return { dob, sexo, sexoConflito };", a);
const b = src.indexOf("}", r0 + "return { dob, sexo, sexoConflito };".length) + 1;
const d = src.indexOf("function deburr");
eval(src.slice(d, src.indexOf("\n", d)));
eval(src.slice(a, b));

const MRZ_M = "IDBRA9999999999999999999<<<1\n8201205M3601014BRA<<<<<<<<<<<4\nSILVA<<JOAO<<<";   // 20/01/1982, dígito 5
const MRZ_F = "IDBRA9999999999999999999<<<1\n6105169F8412014BRA<<<<<<<<<<<4\nSOUZA<<MARIA<<<"; // 16/05/1961, dígito 9

// 1) caso do print (1768): lixo "F" depois do rótulo, mas homem pelo CPF e pela MRZ → não pode sair F
let r = parseIdentidade("Registro Geral - CPF / Personal Number — Sexo/Sex F a pr EL\n111.222.333-44 M\n" +
  "Data de Nascimento / Date of Birth\n20/01/1982 BRA\n" + MRZ_M);
assert.notStrictEqual(r.sexo, "F", "lixo do OCR virou Feminino");
assert.strictEqual(r.sexoConflito, true, "divergência deve ser sinalizada");
assert.strictEqual(r.dob, "20/01/1982");

// 2) CIN masculino limpo: CPF + MRZ concordam
r = parseIdentidade("Sexo/Sex ACESS A pr EL\n111.222.333-44 M\nData de Nascimento\n20/01/1982\n" + MRZ_M);
assert.strictEqual(r.sexo, "M"); assert.strictEqual(r.sexoConflito, false);

// 3) CIN feminino (formato real observado no OCR): CPF + MRZ → F
r = parseIdentidade("Sexo/Sex ACESS A pr EL\n136.000.000-20 F mta\nData de Nascimento\n16/05/1961 BRA\n" + MRZ_F);
assert.strictEqual(r.sexo, "F"); assert.strictEqual(r.dob, "16/05/1961");

// 4) só MRZ (sem CPF legível) → usa a MRZ validada
r = parseIdentidade("CARTEIRA DE IDENTIDADE\n" + MRZ_M);
assert.strictEqual(r.sexo, "M"); assert.strictEqual(r.dob, "20/01/1982");

// 5) MRZ com dígito verificador errado não vale (sequência numérica + F no lixo)
r = parseIdentidade("DOC 8201209F12ABC lixo");
assert.strictEqual(r.sexo, null, "MRZ inválida não pode definir o sexo");

// 5b) linha 1 da MRZ (número colado em letras) não pode ser confundida com a linha 2
r = parseIdentidade("IDBRA1I36278212413627821220<<<8\n8201205M3601014BRA<<<<<<<<<<<4\nSILVA<<JOAO<<<");
assert.strictEqual(r.sexo, "M"); assert.strictEqual(r.dob, "20/01/1982");

// 6) CNH (sem campo sexo) → null, colaborador escolhe
r = parseIdentidade("CARTEIRA NACIONAL DE HABILITACAO DATA NASCIMENTO 03/06/1992 FILIACAO ...");
assert.strictEqual(r.sexo, null); assert.strictEqual(r.dob, "03/06/1992");

// 7) camada de texto com rótulo simples continua funcionando
assert.strictEqual(parseIdentidade("SEXO: M NASCIMENTO 01/02/1970").sexo, "M");
assert.strictEqual(parseIdentidade("SEXO F NASCIMENTO 01/02/1970").sexo, "F");
assert.strictEqual(parseIdentidade("SEXO/SEX M").sexo, "M");

// 8) interface: nenhum sexo marcado por padrão e geração bloqueada sem escolha
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert.ok(!/name="sexo"[^>]*checked/.test(html), "rádio de sexo não pode vir marcado por padrão");
assert.ok(/if \(!selSexo\)/.test(src), "gerar sem sexo selecionado deve ser bloqueado");
assert.ok(/input\[name=sexo\]"\)\.forEach\(el => \{ el\.checked = false; \}\)/.test(src), "sexo deve ser limpo ao carregar novo cliente");

console.log("test_sexo: OK");
