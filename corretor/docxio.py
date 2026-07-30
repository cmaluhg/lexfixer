# -*- coding: utf-8 -*-
"""Entrada/saída de arquivos: .docx (ZIP/XML), .xlsx, .pdf e renderização de imagens.

Tudo em Python puro (sem Word/COM, sem chave de API), para rodar em qualquer máquina.
"""
import io
import re
import zipfile


# ----------------------------- DOCX -----------------------------

def ler_document_xml(caminho_docx):
    """Devolve o texto de word/document.xml (str utf-8)."""
    with zipfile.ZipFile(caminho_docx, "r") as z:
        return z.read("word/document.xml").decode("utf-8")


def gravar_document_xml(caminho_origem, novo_document_xml, caminho_destino, extras=None):
    """Reescreve o .docx trocando word/document.xml (e opcionalmente outros)."""
    extras = extras or {}
    with zipfile.ZipFile(caminho_origem, "r") as zin:
        with zipfile.ZipFile(caminho_destino, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                if item.filename == "word/document.xml":
                    data = novo_document_xml.encode("utf-8")
                elif item.filename in extras:
                    data = extras[item.filename].encode("utf-8")
                else:
                    data = zin.read(item.filename)
                zi = zipfile.ZipInfo(item.filename, date_time=item.date_time)
                zi.compress_type = item.compress_type
                zi.external_attr = item.external_attr
                zout.writestr(zi, data)


def merge_runs(xml):
    """Une <w:r> adjacentes com o mesmo rPr (facilita busca de frases).

    Versão leve: junta apenas runs vizinhos idênticos em rPr, sem alterar o texto.
    """
    def merge_in_paragraph(pm):
        p = pm.group(0)
        # une runs consecutivos: <w:r><rPr A><w:t>x</w:t></w:r><w:r><rPr A><w:t>y</w:t></w:r>
        pattern = re.compile(
            r'<w:r>(<w:rPr>.*?</w:rPr>)?<w:t(?: xml:space="preserve")?>([^<]*)</w:t></w:r>'
            r'<w:r>(<w:rPr>.*?</w:rPr>)?<w:t(?: xml:space="preserve")?>([^<]*)</w:t></w:r>', re.S)
        def _f(m):
            r1, tx1, r2, tx2 = m.group(1) or "", m.group(2), m.group(3) or "", m.group(4)
            if r1 == r2:
                juntos = tx1 + tx2
                sp = ' xml:space="preserve"' if juntos != juntos.strip() else ''
                return '<w:r>%s<w:t%s>%s</w:t></w:r>' % (r1, sp, juntos)
            return m.group(0)
        prev = None
        while prev != p:
            prev = p
            p = pattern.sub(_f, p)
        return p
    return re.sub(r'<w:p\b[^>]*>.*?</w:p>', merge_in_paragraph, xml, flags=re.S)


def docx_para_texto(caminho_docx):
    """Extrai o texto corrido do .docx (concatena <w:t>), parágrafo por parágrafo."""
    xml = ler_document_xml(caminho_docx)
    paras = []
    for pm in re.finditer(r'<w:p\b[^>]*>.*?</w:p>', xml, flags=re.S):
        txt = "".join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', pm.group(0)))
        paras.append(txt)
    return paras


# ----------------------------- XLSX -----------------------------

def ler_xlsx(caminho):
    """Devolve lista de sheets: [{'nome':..., 'linhas':[[...],...]}]."""
    import openpyxl
    wb = openpyxl.load_workbook(caminho, data_only=True)
    out = []
    for ws in wb.worksheets:
        linhas = []
        for row in ws.iter_rows(values_only=True):
            if any(c is not None for c in row):
                linhas.append(["" if c is None else c for c in row])
        out.append({"nome": ws.title, "linhas": linhas})
    return out


# ----------------------------- PDF -----------------------------

def pdf_texto(caminho):
    from pypdf import PdfReader
    r = PdfReader(caminho)
    return "\n".join((p.extract_text() or "") for p in r.pages)


def pdf_paginas_png(caminho, dpi=165, max_paginas=12):
    """Renderiza páginas do PDF em PNG (bytes). Usa PyMuPDF. Devolve lista de bytes."""
    import fitz
    doc = fitz.open(caminho)
    imgs = []
    for i in range(min(max_paginas, doc.page_count)):
        pix = doc[i].get_pixmap(dpi=dpi)
        imgs.append(pix.tobytes("png"))
    doc.close()
    return imgs
