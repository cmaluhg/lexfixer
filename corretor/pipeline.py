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
    peticao = achar(["1. PETI*.docx", "*PETI*.docx", "*.docx"],
                     excluir=["backup", "original", "ajustada", "manual"])
    xlsx = achar(["TABELA*.xlsx", "*.xlsx"])
    extrato = achar(["*EXTRATO*.pdf", "06*.pdf"])
    docs = achar(["*DOC*PESSOA*.pdf", "*PESSOA*.pdf", "04*.pdf"])
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
        alvo_vara = pet["valor_causa"] > checks.TETO_JUIZADO
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

    extras = {"word/styles.xml": styles} if styles is not None else {}
    docxio.gravar_document_xml(src, xml, destino_docx, extras)

    snippets = corrections.snippets_idoso(op.get("nascimento"), chk["idade"]) if idoso else None
    cliente = os.path.splitext(os.path.basename(src))[0]
    rel = report.montar(cliente, pet, plan, chk, acoes, snippets)
    return chk, acoes, rel, snippets
