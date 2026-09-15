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
from corretor import corrections, estrutura, formatting, revisao, extract  # noqa: E402

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
    a_revisao()
    a_formatacao()
    a_pipeline_xml()
    print("\n" + "=" * 50)
    if FALHAS:
        print("AUDITORIA REPROVADA — %d falha(s):" % len(FALHAS))
        for f in FALHAS:
            print("  - " + f)
        sys.exit(1)
    print("AUDITORIA APROVADA — todos os recursos verificados.")
    sys.exit(0)
