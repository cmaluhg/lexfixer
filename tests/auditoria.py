# -*- coding: utf-8 -*-
"""AUDITORIA DE QUALIDADE do LexFixer (determinístico, sem dado de cliente).

Roda TODAS as correções contra fixtures sintéticas e reporta PASS/FAIL por
recurso. Deve ser executada a cada mudança no app.

    python tests/auditoria.py     (sai 0 se tudo passar, 1 se algo falhar)

Cobre: gênero, número de endereço, dano moral por extenso, [PRIORIDADE],
linguagem neutra, socioeconômico (início da gratuidade/reposição/idempotência/
aviso), endereçamento, ANP→Vara Comum, revisão (ortografia/tratamento/tipografia/
underscores/latim), formatação (1,15/tabelas/títulos/colapso de vazios) e a
boa-formação do XML no pipeline completo.
"""
import os
import re
import sys
import xml.dom.minidom as minidom

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from corretor import corrections, estrutura, formatting, revisao, extract, checks  # noqa: E402

FALHAS = []
_GRUPO = [None]


def grupo(nome):
    _GRUPO[0] = nome
    print("\n== " + nome + " ==")


def check(cond, nome):
    print(("  [OK]   " if cond else "  [FALHOU] ") + nome)
    if not cond:
        FALHAS.append("%s :: %s" % (_GRUPO[0], nome))


# ---------- helpers de fixture ----------
RPR = ('<w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="24"/></w:rPr>')
RPR_B = ('<w:rPr><w:rFonts w:ascii="Arial"/><w:b/><w:sz w:val="24"/></w:rPr>')


def _p(texto, bold=False):
    return ('<w:p w14:paraId="00000001" w14:textId="77777777"><w:pPr>'
            '<w:spacing w:after="0" w:line="276" w:lineRule="auto"/></w:pPr>'
            '<w:r>%s<w:t xml:space="preserve">%s</w:t></w:r></w:p>'
            % (RPR_B if bold else RPR, texto))


def _doc(*paras):
    return ('<?xml version="1.0"?><w:document '
            'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
            'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">'
            '<w:body>' + "".join(paras) + '</w:body></w:document>')


def _txt(xml):
    return " ".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", xml))


# =========================== AUDITORIA ===========================

def a_genero():
    grupo("Gênero / qualificação")
    xml = _doc(_p("JOÃO, BRASILEIRO(A), SOLTEIRO(A), portador"))
    outF = corrections.corrigir_genero_qualificacao(xml, "F", [])
    outM = corrections.corrigir_genero_qualificacao(xml, "M", [])
    check("BRASILEIRA" in _txt(outF) and "SOLTEIRA" in _txt(outF), "F → BRASILEIRA/SOLTEIRA")
    check("BRASILEIRO" in _txt(outM) and "(A)" not in _txt(outM), "M → BRASILEIRO/SOLTEIRO (sem (A))")


def a_numero():
    grupo("Número do endereço")
    xml = _doc(_p("residente no RUA TAMARINDO, Bairro: JORGE TEIXEIRA"))
    out = corrections.inserir_numero_endereco(xml, "52", [])
    check("Nº 52" in _txt(out) and _txt(out).index("Nº 52") < _txt(out).index("Bairro"),
          "insere 'Nº 52' antes de 'Bairro:'")
    # idempotente: não duplica se já houver
    out2 = corrections.inserir_numero_endereco(out, "52", [])
    check(_txt(out2).count("Nº 52") == 1, "não duplica número já existente")


def a_dano_moral():
    grupo("Dano moral por extenso")
    xml = _doc(_p("fixado em R$ 15.000,00 () a título de danos morais"))
    out = corrections.corrigir_dano_moral_extenso(xml, [])
    check("quinze mil reais" in _txt(out).lower(), "preenche '(quinze mil reais)'")


def a_prioridade():
    grupo("Marcador [PRIORIDADE]")
    xml = _doc(_p("AÇÃO REVISIONAL [PRIORIDADE] em desfavor"))
    out = corrections.remover_marcador_prioridade(xml, [])
    check("[PRIORIDADE]" not in _txt(out), "remove [PRIORIDADE]")


def a_neutralizar():
    grupo("Linguagem neutra")
    xml = _doc(_p("Requer a parte Autora e o Requerente pede"))
    out = corrections.neutralizar_linguagem(xml, [])
    t = _txt(out)
    check("parte autora" in t and "parte Autora" not in t, "'parte Autora' → 'parte autora'")
    check("a parte requerente" in t.lower(), "'o Requerente' → 'a parte requerente'")


def a_socio():
    grupo("Socioeconômico (início da gratuidade)")
    HDR = "2.2. DO PEDIDO DE JUSTIÇA GRATUITA"
    RET = "Atualmente, no Brasil, instalou-se uma cultura de descumprir direitos."
    GRAT = ("Requer a parte Autora o pedido de concessão, com a juntada da "
            "declaração de hipossuficiência e extrato de renda dos últimos 3 (três) meses.")
    TMPL = ("Atualmente, o(a) autor(a) é pedreiro, é o único provedor da casa, "
            "reside um total de 3 pessoas, renda mensal de 1.500, encontra-se impossibilitado.")
    SOCIO = ("Atualmente, a parte autora é analista, é a única provedora da casa, "
             "reside um total de 2 pessoas, renda mensal de 2.500 a 5.000 reais.")
    # 1) sem template: abre a seção
    out = corrections.inserir_socio_texto(_doc(_p(RET), _p(HDR, True), _p(GRAT)), SOCIO, [], {})
    t = _txt(out)
    check(RET in t, "parágrafo retórico do mérito intacto")
    check(t.index("JUSTIÇA GRATUITA") < t.index("analista") < t.index("Requer"),
          "socio abre a seção (após o título, antes do corpo)")
    # 2) template no meio: reposiciona no início e não duplica
    out2 = corrections.inserir_socio_texto(_doc(_p(RET), _p(HDR, True), _p(GRAT), _p(TMPL)), SOCIO, [], {})
    t2 = _txt(out2)
    check("pedreiro" not in t2, "template antigo (no meio) removido")
    check(t2.count("analista") == 1, "socio aparece 1x (sem duplicar)")
    check(t2.index("JUSTIÇA GRATUITA") < t2.index("analista"), "reposicionado para o início")
    # 3) sem âncora: não altera e avisa
    info = {}
    log = []
    out3 = corrections.inserir_socio_texto(_doc(_p(RET), _p("Dos fatos.")), SOCIO, log, info)
    check(info.get("ok") is False and "analista" not in _txt(out3), "sem âncora: não insere em lugar errado")
    check(any("NÃO individualizado" in l for l in log), "sem âncora: emite aviso")


def a_enderecamento():
    grupo("Endereçamento (Juizado / Vara Comum)")
    end = "AO JUÍZO DE DIREITO DA 2ª VARA DO JUIZADO ESPECIAL CÍVEL DA COMARCA DE MANAUS/AM"
    xml = _doc(_p(end, True), _p("corpo"))
    comum = estrutura.ajustar_enderecamento(xml, True, [])
    check("VARA CÍVEL" in _txt(comum) and "JUIZADO" not in _txt(comum).split("corpo")[0],
          "alvo comum: JUIZADO ESPECIAL → VARA CÍVEL")
    end2 = "AO JUÍZO DE DIREITO DA 2ª VARA CÍVEL DA COMARCA DE MANAUS/AM"
    xml2 = _doc(_p(end2, True), _p("corpo"))
    juiz = estrutura.ajustar_enderecamento(xml2, False, [])
    check("JUIZADO ESPECIAL" in _txt(juiz), "alvo juizado: VARA CÍVEL → JUIZADO ESPECIAL")


def a_anp():
    grupo("ANP → sempre Vara Comum")
    check(extract.eh_anp("houve inscrição sem a devida notificação prévia") is True, "detecta 'notificação prévia'")
    check(extract.eh_anp("ausência de notificação prévia (Súmula 359 STJ)") is True, "detecta 'ausência de notificação'")
    check(extract.eh_anp("AÇÃO DECLARATÓRIA de inexigibilidade de débito") is False, "não marca peça comum como ANP")


def a_ng_kit():
    grupo("Kit NG (peça com estrutura diferente)")
    # gratuidade pedida numa SEÇÃO (não no cabeçalho) — kit NG
    ng = extract.pedidos_preliminares(
        "DOS FATOS ... 3.2. DO PEDIDO DE JUSTIÇA GRATUITA. Cumpre informar que a parte "
        "Autora não possui condições de arcar com as custas judiciais ...")
    check(ng["gratuidade"] is True, "gratuidade detectada em seção (NG) — não só no cabeçalho")
    # gratuidade no cabeçalho — kit LEX
    lex = extract.pedidos_preliminares("COM PEDIDO DE GRATUIDADE DE JUSTIÇA E INVERSÃO DO ÔNUS")
    check(lex["gratuidade"] is True and lex["inversao"] is True, "gratuidade+inversão no cabeçalho (LEX)")
    check(extract.pedidos_preliminares("ação de cobrança simples")["gratuidade"] is False,
          "peça sem gratuidade → não marca 'faltando' errado")
    # agência/conta com "nº" (NG)
    ag, cc = extract.dados_bancarios(
        "correntista mantendo conta ativa na agência nº 5042, conta corrente nº 402615-2, sempre")
    check(ag == "5042" and cc == "402615-2", "agência/conta com 'nº' (NG)")
    # agência/conta sem "nº" (LEX)
    ag2, cc2 = extract.dados_bancarios("junto à agência 1234, conta corrente 56789-0 do banco")
    check(ag2 == "1234" and cc2 == "56789-0", "agência/conta sem 'nº' (LEX)")
    # período do dano material — NG usa "período de X a Y"; LEX "desde X até Y"
    check(extract.periodo_dano("referente às cobranças feitas no período de 20/01/2017 a 07/10/2022.") == ("20/01/2017", "07/10/2022"), "período NG ('...de X a Y')")
    check(extract.periodo_dano("cobranças desde 01/02/2018 até 05/06/2021") == ("01/02/2018", "05/06/2021"), "período LEX ('desde X até Y')")
    check(extract.periodo_dano("sem datas de período aqui") == (None, None), "sem período → (None, None)")
    # número da residência — NG usa "RUA X , 2122. Bairro:" (número após vírgula, ponto antes de Bairro)
    check(extract.endereco_numero("RUA GAIVOTA , 2122") is True, "número após vírgula (NG, 'RUA X, 2122')")
    check(extract.endereco_numero("RUA TAMARINDO, Nº 52") is True, "número com 'Nº' (LEX)")
    check(extract.endereco_numero("RUA TAMARINDO") is False, "sem número → não marca presente")
    # pedidos SEM alínea antes de 'a)' (NG: prioridade/cessação sem letra, depois a) b))
    ng_ped = ["5. DOS PEDIDOS", "Por derradeiro, ante o exposto, requer:",
              "A prioridade na tramitação processual, visto que o Requerente possui 71 anos, nos termos do artigo 1.048;",
              "Que este Juízo digne-se em determinar a imediata cessação dos lançamentos ilícitos, sob pena de multa;",
              "a) a citação da Requerida, na forma do art. 18 da lei 9.099/95, para contestar;",
              "b) o deferimento da gratuidade de justiça, nos termos do art. 98 do CPC;",
              "Nestes termos, pede deferimento."]
    check(extract.pedidos_sem_letra(ng_ped) == 2, "NG: detecta 2 pedidos sem alínea antes de 'a)'")
    lex_ped = ["3. DOS PEDIDOS", "Ante o exposto, requer:",
               "a) a citação da parte Requerida;", "b) a inversão do ônus da prova;",
               "c) a condenação em danos morais;", "Nestes termos, pede deferimento."]
    check(extract.pedidos_sem_letra(lex_ped) == 0, "LEX: todos com alínea → 0 (não marca)")
    todos_sem = ["DOS PEDIDOS", "requer:", "a cessação dos descontos;", "a devolução dos valores;", "pede deferimento."]
    check(extract.pedidos_sem_letra(todos_sem) == 0, "todos sem alínea (estilo próprio) → 0 (não falso-positivo)")
    # conferência ponto 11: pedidos sem alínea → CORRIGIR
    op = {"sexo": "F", "nascimento": "01/01/1990", "numero_endereco": None}
    pet = {"pedidos_letras": ["a", "b"], "pedidos_sem_letra": 2, "valor_causa": 30000.0,
           "endereco_juizado": True, "endereco_vara_comum": False, "anp": False,
           "periodo": (None, None), "escritorio": "NG"}
    r = checks.conferir(pet, {"rubricas": []}, None, op)
    p11 = next(a for a in r["achados"] if a["n"] == 11)
    check(p11["status"] == "CORRIGIR" and "alínea" in p11["msg"], "ponto 11 = CORRIGIR quando há pedido sem alínea")
    pet_ok = dict(pet, pedidos_sem_letra=0)
    r2 = checks.conferir(pet_ok, {"rubricas": []}, None, op)
    p11b = next(a for a in r2["achados"] if a["n"] == 11)
    check(p11b["status"] == "OK", "ponto 11 = OK quando letras a,b em sequência e sem faltantes")


def a_prioridade_idoso():
    grupo("Prioridade de idoso — não reinserir se já existe (NG)")
    # NG traz o tópico 2.7 na peça → deve ser detectado como presente
    check(extract.prioridade_presente(
        "2.7. DA PRIORIDADE NA TRAMITAÇÃO PROCESSUAL — REQUERENTE IDOSA 63 ANOS. "
        "Nos termos do artigo 71 da Lei nº 10.741/2003 (Estatuto do Idoso)...") is True,
        "detecta tópico de prioridade existente (NG, 'DA PRIORIDADE NA TRAMITAÇÃO')")
    check(extract.prioridade_presente("requer a tramitação prioritária do feito") is True,
          "detecta 'tramitação prioritária'")
    check(extract.prioridade_presente("prioridade legal do Estatuto do Idoso à parte") is True,
          "detecta 'prioridade' + 'Estatuto do Idoso'")
    # marcador de cabeçalho sozinho NÃO conta como tópico presente → LA ainda insere
    check(extract.prioridade_presente("COM PEDIDO DE PRIORIDADE PROCESSUAL: IDOSO") is False,
          "marcador de cabeçalho isolado não conta (LA ainda insere o tópico)")
    check(extract.prioridade_presente("ação revisional de contrato bancário") is False,
          "peça sem prioridade → não marca presente")
    # idempotência: após inserir numa peça LA, uma reexecução detecta e não duplica
    lax = _doc(_p("2. DOS PEDIDOS", True), _p("conforme Súmulas 362 e 54 do STJ;"),
               _p("3. DO MÉRITO", True))
    check(extract.prioridade_presente(_txt(lax)) is False, "LA antes: sem tópico de prioridade")
    ins = estrutura.inserir_itens_idoso(lax, "10/05/1958", 68, [])
    tins = _txt(ins)
    check(tins.count("DA PRIORIDADE NA TRAMITAÇÃO PROCESSUAL") == 1, "insere o tópico 1x")
    check(extract.prioridade_presente(tins) is True, "após inserir: detectado (reexecução não duplica)")
    # conferência: idoso + já presente → pontos 9/12 = OK (não CORRIGIR)
    op = {"sexo": "F", "nascimento": "10/05/1958", "numero_endereco": None}
    pet_ng = {"prioridade_presente": True, "header_prioridade_idoso": True, "valor_causa": 30000.0,
              "endereco_juizado": True, "endereco_vara_comum": False, "anp": False,
              "periodo": (None, None), "pedidos_letras": [], "escritorio": "NG"}
    res = checks.conferir(pet_ng, {"rubricas": []}, None, op)
    p9 = next(a for a in res["achados"] if a["n"] == 9)
    p12 = next(a for a in res["achados"] if a["n"] == 12)
    check(p9["status"] == "OK" and p12["status"] == "OK", "idoso + já presente → pontos 9/12 = OK")
    # conferência: idoso + ausente → CORRIGIR (peça LA a completar)
    pet_la = dict(pet_ng, prioridade_presente=False, escritorio="LA")
    res2 = checks.conferir(pet_la, {"rubricas": []}, None, op)
    p9b = next(a for a in res2["achados"] if a["n"] == 9)
    check(p9b["status"] == "CORRIGIR", "idoso + ausente → ponto 9 = CORRIGIR (inserir)")


def a_socio_correcao():
    grupo("Correção do texto socioeconômico (grafia/valores)")
    c = corrections._limpar_socio("a cliente tem uma rebda de até 5000 para 4 pessoas")
    check("renda" in c and "rebda" not in c, "typo 'rebda' → 'renda'")
    check("5.000" in c and " 5000" not in c, "valor '5000' → '5.000'")
    check(c[0].isupper() and c.endswith("."), "capitaliza a 1ª letra e fecha com ponto")
    check("3.000 reais" in corrections._limpar_socio("renda de 3000 reais"), "'3000 reais' → '3.000 reais'")
    check("R$ 2.500" in corrections._limpar_socio("R$ 2500 por mês"), "'R$ 2500' → 'R$ 2.500'")


def a_gratuidade_adc80():
    grupo("Gratuidade ADC 80 + escritório (Luis Albert × NG)")
    check(extract.detectar_escritorio("... Luis Albert Advogado ...") == "LA", "padrão = Luis Albert (LA)")
    check(extract.detectar_escritorio("NICOLAS GOMES ADVOGADO") == "NG", "detecta Nicolas Gomes (NG)")
    HDR = "2.2. DO PEDIDO DE JUSTIÇA GRATUITA"
    base = _doc(_p("AO JUÍZO DE DIREITO DA VARA CÍVEL"), _p(HDR, True),
                _p("TEXTO ANTIGO da gratuidade que deve ser substituído."),
                _p("2.3. DA CONCLUSÃO", True))
    socio = "Atualmente, a parte autora é professora, é a única provedora, reside um total de 3 pessoas, renda mensal de 2.000 reais."
    # LA + socio: ADC 80 individualizado (sem (preencher)), versão comum
    out = corrections.atualizar_gratuidade(base, True, socio, [])
    t = _txt(out)
    check("ADC 80" in t, "insere o texto da ADC 80")
    check("professora" in t and "(preencher)" not in t, "individualiza pelo socioeconômico (sem '(preencher)')")
    check("TEXTO ANTIGO" not in t, "substitui o texto antigo da seção")
    check("DA CONCLUSÃO" in t, "preserva a próxima seção")
    check("9.099/95" not in t, "versão COMUM (sem art. 54 da Lei 9.099/95)")
    # LA sem socio: mantém '(preencher)' em amarelo; versão JEC tem art. 54
    outp = corrections.atualizar_gratuidade(base, False, "", [])
    check("(preencher)" in _txt(outp) and 'w:highlight w:val="yellow"' in outp, "sem socio → '(preencher)' em amarelo")
    check("9.099/95" in _txt(outp), "versão JEC (art. 54 da Lei 9.099/95)")
    # XML bem-formado
    import xml.dom.minidom as _m
    try:
        _m.parseString(out); ok_xml = True
    except Exception:
        ok_xml = False
    check(ok_xml, "XML da seção substituída é bem-formado")


def a_revisao():
    grupo("Revisão (ortografia / tratamento / tipografia / underscores / latim)")
    frag = ("Data venia, cometeu-se uma excessão grave. Vossa excelência sabe. "
            "Recurso provido ________ Tese de julgamento.")
    log = []
    out = revisao.revisar(_doc(_p(frag)), log)
    t = _txt(out)
    check("exceção" in t and "excessão" not in t, "ortografia: excessão → exceção")
    check("Vossa Excelência" in t, "tratamento: Vossa Excelência")
    check("_" not in t, "remove traços/underscores de preenchimento")
    check(any("traço" in l.lower() for l in log), "log reporta traços removidos")
    # tipografia: espaço antes de pontuação removido (fixture SEM latim para não dividir runs)
    tip = revisao.revisar(_doc(_p("erro de espaço , antes ; da pontuação .")), [])
    ttip = "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", tip))  # sem juntar runs com espaço
    check(" ," not in ttip and " ;" not in ttip and " ." not in ttip, "tipografia: sem espaço antes de pontuação")
    # latim em itálico (run isolado italizado)
    lat = revisao.revisar(_doc(_p("aplica-se o periculum in mora ao caso")), [])
    ital = re.findall(r"<w:i/><w:iCs/>.*?<w:t[^>]*>([^<]*)</w:t>", lat, re.S)
    check(any("periculum" in x for x in ital), "latim 'periculum in mora' em itálico")


def a_formatacao():
    grupo("Formatação (1,15 / tabelas / títulos / colapso de vazios)")
    # espaçamento 1,15
    doc = _doc(_p("x")).replace('w:line="276"', 'w:line="360"')
    out, _ = formatting.espacamento_115(doc, None)
    check('w:line="276"' in out and 'w:line="360"' not in out, "espaçamento normalizado para 1,15 (276)")
    # colapso de vazios
    vazios = _doc(_p("fim das preliminares"), _p(""), _p(""), _p(""), _p(""), _p(""), _p("3. DO MÉRITO", True))
    colap = formatting.colapsar_vazios(vazios, 1)
    n_vazios = len([p for p in re.findall(r"<w:p\b[^>]*>.*?</w:p>", colap, re.S)
                    if "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", p)).strip() == ""])
    check(n_vazios == 1, "colapsa 5 vazios em 1 (buraco antes do MÉRITO)")
    # preserva quebra de página
    comBreak = _doc(_p("a"), '<w:p><w:pPr></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>', _p("b"))
    check('w:type="page"' in formatting.colapsar_vazios(comBreak, 1), "preserva quebra de página")
    # títulos juntos (keepNext no título em negrito)
    tit = formatting.titulos_juntos(_doc(_p("3. DO MÉRITO", True), _p("corpo")))
    check("<w:keepNext/>" in tit, "keepNext no título de seção")
    # tabelas centralizadas + inteiras
    tbl = ('<w:tbl><w:tblPr><w:tblW w:w="5000"/><w:tblInd w:w="0"/></w:tblPr>'
           '<w:tr><w:trPr></w:trPr><w:tc><w:p><w:r><w:t>c</w:t></w:r></w:p></w:tc></w:tr></w:tbl>')
    doct = _doc(_p("a")) .replace("</w:body>", tbl + "</w:body>")
    check('<w:jc w:val="center"/>' in formatting.centralizar_tabelas(doct), "tabela centralizada (jc center)")
    check("<w:cantSplit/>" in formatting.tabelas_inteiras(doct), "linha de tabela com cantSplit")
    # REGRESSÃO (caso Maria Auxiliadora): colapsar_vazios NÃO pode apagar o parágrafo
    # vazio de uma célula — deixaria a célula sem <w:p> (obrigatório) e CORROMPE o .docx.
    cel = '<w:tc><w:tcPr><w:tcW w:w="800" w:type="dxa"/></w:tcPr><w:p><w:pPr/></w:p></w:tc>'
    tbl_vazia = '<w:tbl><w:tblPr/><w:tr>' + cel + cel + '</w:tr></w:tbl>'
    docx_tbl = _doc(_p("antes"), _p(""), _p("")).replace("</w:body>", tbl_vazia + "</w:body>")
    outc = formatting.colapsar_vazios(docx_tbl, 1)
    tblout = re.search(r"<w:tbl>.*?</w:tbl>", outc, re.S).group(0)
    check(tblout.count("<w:p>") + tblout.count("<w:p ") == 2, "célula de tabela mantém seu parágrafo (não corrompe)")
    check("<w:tc><w:tcPr><w:tcW w:w=\"800\" w:type=\"dxa\"/></w:tcPr></w:tc>" not in outc, "nenhuma célula fica vazia (sem <w:p>)")
    # e os vazios do CORPO seguem colapsando
    n_corpo = len([p for p in re.findall(r"<w:p\b[^>]*>.*?</w:p>", outc.split("<w:tbl>")[0], re.S)
                   if "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", p)).strip() == ""])
    check(n_corpo == 1, "vazios do corpo ainda colapsam (buraco antes do MÉRITO)")


def _tbl(itens, total, dobro):
    """Monta uma <w:tbl> de valores: itens=[valor,...], + VALOR TOTAL + VALOR EM DOBRO."""
    def cel(t):
        return '<w:tc><w:tcPr/><w:p><w:r><w:t xml:space="preserve">%s</w:t></w:r></w:p></w:tc>' % t
    def rs(v):
        return "R$ %s,%02d" % (format(int(v), ",d").replace(",", "."), round((v - int(v)) * 100))
    rows = ['<w:tr>' + cel("Data") + cel("Descrição") + cel("Valor") + '</w:tr>']
    for v in itens:
        rows.append('<w:tr>' + cel("01/01/2025") + cel("RUBRICA") + cel(rs(v)) + '</w:tr>')
    rows.append('<w:tr>' + cel("VALOR TOTAL") + cel("") + cel(rs(total)) + '</w:tr>')
    rows.append('<w:tr>' + cel("VALOR EM DOBRO") + cel("") + cel(rs(dobro)) + '</w:tr>')
    return '<w:tbl><w:tblPr/>' + "".join(rows) + '</w:tbl>'


def a_auditoria_tabelas():
    grupo("Auditoria das tabelas de valores (aviso ORG DOC)")
    ok = formatting.auditar_tabelas(_doc(_p("x")).replace("</w:body>", _tbl([60, 60], 120, 240) + "</w:body>"))
    check(ok["ok"] is True, "tabela correta (60+60=120, dobro 240) → sem erro")
    somaerr = formatting.auditar_tabelas(_doc(_p("x")).replace("</w:body>", _tbl([60, 60], 150, 300) + "</w:body>"))
    check(somaerr["ok"] is False and any("soma" in p for p in somaerr["problemas"]), "soma dos itens ≠ total → erro")
    dobroerr = formatting.auditar_tabelas(_doc(_p("x")).replace("</w:body>", _tbl([60, 60], 120, 999) + "</w:body>"))
    check(dobroerr["ok"] is False and any("DOBRO" in p for p in dobroerr["problemas"]), "dobro ≠ 2× total → erro")
    # tabela sem 'TOTAL' não é auditada (não gera falso erro)
    semtotal = '<w:tbl><w:tblPr/><w:tr><w:tc><w:tcPr/><w:p><w:r><w:t>só texto</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
    check(formatting.auditar_tabelas(_doc(_p("x")).replace("</w:body>", semtotal + "</w:body>"))["ok"] is True,
          "tabela sem 'VALOR TOTAL' é ignorada (sem falso erro)")


def a_pipeline_xml():
    grupo("Pipeline completo — XML bem-formado")
    doc = _doc(
        _p("AO JUÍZO DE DIREITO DA 2ª VARA DO JUIZADO ESPECIAL CÍVEL DA COMARCA DE MANAUS/AM", True),
        _p("JOÃO, BRASILEIRO(A), SOLTEIRO(A), residente no RUA X, Bairro: Y, vem respeitosamente"),
        _p("2.2. DO PEDIDO DE JUSTIÇA GRATUITA", True),
        _p("Requer a parte Autora o pedido, declaração de hipossuficiência, todos em anexo aos autos."),
        _p(""), _p(""), _p(""),
        _p("3. DO MÉRITO", True),
        _p("fixado em R$ 15.000,00 () a título de dano in re ipsa."),
    )
    ctx = {"sexo": "M", "numero_endereco": "52", "idoso": False, "nascimento": "01/01/1990",
           "idade": 35, "pasta": None, "alvo_vara_comum": True, "valores": []}
    log = []
    out = corrections.aplicar(doc, ctx, log)
    out, _ = formatting.aplicar_tudo(out, None)
    try:
        minidom.parseString(out)
        ok_xml = True
    except Exception:
        ok_xml = False
    check(ok_xml, "XML final é bem-formado")
    check("VARA CÍVEL" in _txt(out), "endereçamento aplicado no pipeline")
    check("_" not in _txt(out), "sem underscores no resultado final")


if __name__ == "__main__":
    a_genero()
    a_numero()
    a_dano_moral()
    a_prioridade()
    a_neutralizar()
    a_socio()
    a_enderecamento()
    a_anp()
    a_ng_kit()
    a_prioridade_idoso()
    a_socio_correcao()
    a_gratuidade_adc80()
    a_revisao()
    a_formatacao()
    a_auditoria_tabelas()
    a_pipeline_xml()
    print("\n" + "=" * 50)
    if FALHAS:
        print("AUDITORIA REPROVADA — %d falha(s):" % len(FALHAS))
        for f in FALHAS:
            print("  - " + f)
        sys.exit(1)
    print("AUDITORIA APROVADA — todos os recursos verificados.")
    sys.exit(0)
