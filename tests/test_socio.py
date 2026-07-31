# -*- coding: utf-8 -*-
"""Testes de regressão da individualização socioeconômica.

Trava o bug do caso Jefferson: a âncora "Atualmente," NÃO pode casar no
parágrafo retórico do mérito ("Atualmente, no Brasil, instalou-se uma
cultura...") e sobrescrevê-lo. Fixtures sintéticas — sem dado de cliente.

Rodar:  python tests/test_socio.py     (sai 0 se tudo passar)
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from corretor import corrections  # noqa: E402


def _p(texto):
    return ('<w:p w14:paraId="00000001" w14:textId="77777777"><w:pPr>'
            '<w:spacing w:after="0" w:line="276" w:lineRule="auto"/></w:pPr>'
            '<w:r><w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="24"/></w:rPr>'
            '<w:t xml:space="preserve">%s</w:t></w:r></w:p>' % texto)


def _doc(*paras):
    return ('<?xml version="1.0"?><w:document xmlns:w="x" xmlns:w14="y"><w:body>'
            + "".join(paras) + "</w:body></w:document>")


def _texto(xml):
    return " ".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", xml))


SOCIO = ("Atualmente, a parte autora é analista, sua residência é alugada e é a "
         "única provedora da sua casa, na qual reside um total de 2 pessoas, que "
         "dependem de uma renda mensal de 2.500 a 5.000 reais. Logo, encontra-se "
         "impossibilitada de arcar com custas.")

RETORICO = ("Atualmente, no Brasil, instalou-se uma cultura por parte dos "
            "fornecedores onde descumprir direitos é mais rentável do que cumprir.")

HDR = "2.2. DO PEDIDO DE JUSTIÇA GRATUITA"

CUMPRE = ("Cumpre informar que a parte autora não possui condições de arcar "
          "com as custas judiciais em razão de sua atual situação econômica.")

GRATUIDADE = ("Requer a gratuidade, pela juntada de documentos que comprovam a "
              "hipossuficiência econômica da parte Autora (declaração de "
              "hipossuficiência e extratos bancários), todos em anexo aos autos.")

TEMPLATE = ("Atualmente, o(a) autor(a) é pedreiro, sua residência é própria, é o "
            "único provedor da casa, na qual reside um total de 3 pessoas, com "
            "renda mensal de 1.500 reais, encontra-se impossibilitado de custear.")

FALHAS = []


def check(cond, nome):
    print(("  [OK] " if cond else "  [FALHOU] ") + nome)
    if not cond:
        FALHAS.append(nome)


def caso_sem_template_com_retorico():
    """Jefferson: título da seção + 'Atualmente,' retórico no mérito."""
    print("caso 1: sem template, abre a seção com o socio (Jefferson)")
    # ordem no documento: retórico (no mérito) ... título gratuidade, Cumpre, Requer
    xml = _doc(_p(RETORICO), _p(HDR), _p(CUMPRE), _p(GRATUIDADE))
    log, info = [], {}
    out = corrections.inserir_socio_texto(xml, SOCIO, log, info)
    t = _texto(out)
    check(info.get("ok") is True, "info.ok == True")
    check("início da seção" in info.get("via", ""), "via = início da seção de Gratuidade")
    check(RETORICO in t, "parágrafo retórico do mérito permanece intacto")
    check("analista" in t, "texto socioeconômico foi inserido")
    # socio deve ficar ENTRE o título e o "Cumpre informar" (primeiro parágrafo da seção)
    check(t.index("JUSTIÇA GRATUITA") < t.index("analista") < t.index("Cumpre informar"),
          "socio abre a seção (após o título, antes do 'Cumpre informar')")


def caso_com_template():
    """Lucia Maria: a peça já vem com o socio no MEIO da seção -> reposicionar no início."""
    print("caso 2: template no meio da seção -> reposiciona no início (Lucia Maria)")
    # ordem: retórico, TÍTULO, parágrafo de gratuidade, e o socio embutido no fim
    xml = _doc(_p(RETORICO), _p(HDR), _p(GRATUIDADE), _p(TEMPLATE))
    log, info = [], {}
    out = corrections.inserir_socio_texto(xml, SOCIO, log, info)
    t = _texto(out)
    check(info.get("ok") is True, "info.ok == True")
    check("início da seção" in info.get("via", ""), "via = início da seção (reposicionado)")
    check(RETORICO in t, "parágrafo retórico permanece intacto")
    check("pedreiro" not in t, "template antigo (no meio) foi removido")
    check(t.count("analista") == 1, "socio aparece exatamente uma vez (sem duplicar)")
    check(t.index("JUSTIÇA GRATUITA") < t.index("analista") < t.index("Requer"),
          "socio abre a seção (após o título, antes do corpo)")


def caso_sem_ancora():
    """Sem template e sem âncora: NÃO altera nada e avisa."""
    print("caso 3: sem template e sem âncora")
    xml = _doc(_p(RETORICO), _p("Dos fatos: a parte autora contratou o serviço."))
    log, info = [], {}
    out = corrections.inserir_socio_texto(xml, SOCIO, log, info)
    t = _texto(out)
    check(info.get("ok") is False, "info.ok == False")
    check(RETORICO in t, "retórico intacto (não sobrescrito)")
    check("analista" not in t, "socio NÃO foi inserido em lugar errado")
    check(any("NÃO individualizado" in l for l in log), "emitiu aviso de falha")


def caso_idempotente():
    """Rodar de novo sobre a peça já individualizada não duplica o socio."""
    print("caso 4: idempotência (reprocessar)")
    xml = _doc(_p(RETORICO), _p(HDR), _p(CUMPRE), _p(GRATUIDADE))
    out1 = corrections.inserir_socio_texto(xml, SOCIO, [], {})
    out2 = corrections.inserir_socio_texto(out1, SOCIO, [], {})
    check(_texto(out2).count("analista") == 1, "socio continua único após reprocessar")


if __name__ == "__main__":
    caso_sem_template_com_retorico()
    caso_com_template()
    caso_sem_ancora()
    caso_idempotente()
    print()
    if FALHAS:
        print("FALHAS: %d -> %s" % (len(FALHAS), ", ".join(FALHAS)))
        sys.exit(1)
    print("TODOS OS TESTES PASSARAM")
    sys.exit(0)
