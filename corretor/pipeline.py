# -*- coding: utf-8 -*-
"""Orquestra o processo: descobre arquivos, extrai, confere, corrige e formata."""
import glob
import os
import zipfile

from . import docxio, extract, checks, corrections, formatting, report


def descobrir_arquivos(pasta):
    """Encontra os arquivos do kit dentro de uma pasta de cliente."""
    def achar(padroes, excluir=()):
        for pad in padroes:
            for f in glob.glob(os.path.join(pasta, pad)):
                nome = os.path.basename(f).lower()
                if any(x in nome for x in excluir):
                    continue
                return f
        return None
    peticao = achar(["1. PETI*.docx", "*PETI*.docx", "*RUBRICA*.docx", "*.docx"],
                    excluir=["backup", "original", "ajustada", "manual", "corrigida", "ocio"])
    xlsx = achar(["TABELA*.xlsx", "*.xlsx"])
    extrato = achar(["*EXTRATO*.pdf", "06*.pdf", "6.*EXTRATO*.pdf"])
    # kit LEX: "DOC PESSOAIS"; kit NG: "DOCUMENTO DE IDENTIDADE"
    docs = achar(["*DOC*PESSOA*.pdf", "*PESSOA*.pdf", "*IDENTIDADE*.pdf", "04*.pdf", "4.*IDENTIDADE*.pdf"])
    return {"peticao": peticao, "xlsx": xlsx, "extrato": extrato, "docs": docs}


def analisar(arqs):
    """Só a leitura/extração (para a tela mostrar antes das correções)."""
    pet = extract.extrair_peticao(arqs["peticao"]) if arqs.get("peticao") else {}
    plan = extract.extrair_planilha(arqs["xlsx"]) if arqs.get("xlsx") else {}
    ext = extract.extrair_extrato(arqs["extrato"]) if arqs.get("extrato") else {}
    return pet, plan, ext


def processar(arqs, op, destino_docx):
    """Executa conferência + correções + formatação; grava o .docx corrigido.

    op = {sexo, nascimento, numero_endereco, forcar_vara_comum}
    Devolve: (chk, acoes, relatorio_md, snippets)
    """
    pet, plan, ext = analisar(arqs)
    chk = checks.conferir(pet, plan, ext, op)
    idoso = chk["idoso"]

    # aplica correções + formatação no XML da peça
    src = arqs["peticao"]
    xml = docxio.ler_document_xml(src)
    xml = docxio.merge_runs(xml)
    try:
        with zipfile.ZipFile(src) as z:
            styles = z.read("word/styles.xml").decode("utf-8")
    except KeyError:
        styles = None

    # endereçamento alvo: ANP e exceção→Vara Comum; senão pelo valor da causa
    if pet.get("anp") or chk["tem_excecao"] or op.get("forcar_vara_comum"):
        alvo_vara = True
    elif pet.get("valor_causa") is not None:
        _corte = checks.TETO_JUIZADO if pet.get("escritorio") == "NG" else checks.HIGH_TICKET
        alvo_vara = pet["valor_causa"] > _corte  # LA: high ticket R$50k; NG: teto
    else:
        alvo_vara = None

    ctx = {
        "sexo": op.get("sexo"),
        "numero_endereco": op.get("numero_endereco"),
        "idoso": idoso,
        "nascimento": op.get("nascimento"),
        "idade": chk["idade"],
        "pasta": op.get("pasta") or os.path.dirname(arqs["peticao"]),
        "alvo_vara_comum": alvo_vara,
        "valores": [plan.get("total"), plan.get("dobro"), pet.get("valor_causa"), 15000.0],
    }
    acoes = []
    xml = corrections.aplicar(xml, ctx, acoes)
    xml, styles = formatting.aplicar_tudo(xml, styles)
    acoes.append("Formatação: espaçamento 1,15; tabelas centralizadas e inteiras; títulos não separados")
    aud = formatting.auditar_tabelas(xml)
    if not aud["ok"]:
        acoes.append("⚠️ TABELA INCORRETA — voltar para Organização de documentos (ORG DOC): "
                     + " | ".join(aud["problemas"]))

    extras = {"word/styles.xml": styles} if styles is not None else {}
    docxio.gravar_document_xml(src, xml, destino_docx, extras)

    snippets = corrections.snippets_idoso(op.get("nascimento"), chk["idade"]) if idoso else None
    cliente = os.path.splitext(os.path.basename(src))[0]
    rel = report.montar(cliente, pet, plan, chk, acoes, snippets)
    return chk, acoes, rel, snippets
