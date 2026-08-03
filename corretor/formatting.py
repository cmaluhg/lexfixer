# -*- coding: utf-8 -*-
"""Padrão de formatação do escritório aplicado ao XML da peça.

- Espaçamento entre linhas 1,15 (document.xml e styles.xml)
- Tabelas centralizadas
- Tabela inteira em uma página (cantSplit + keepNext nas linhas)
- Títulos de seção nunca separados do texto (keepNext/keepLines + encadeamento de espaçadores)
"""
import re


def _inject_ppr(ptag, extra):
    m = re.search(r'<w:pPr>', ptag)
    if not m:
        mo = re.match(r'(<w:p\b[^>]*>)', ptag)
        return ptag[:mo.end()] + '<w:pPr>' + extra + '</w:pPr>' + ptag[mo.end():]
    ins = m.end()
    ps = re.match(r'<w:pStyle\b[^>]*/>', ptag[ins:])
    if ps:
        ins += ps.end()
    return ptag[:ins] + extra + ptag[ins:]


def _is_heading(text):
    t = text.strip()
    return bool(t) and len(t) < 140 and re.match(r'^\d+(\.\d+)*\.?\s+[A-ZÀ-Ú"“]', t)


def espacamento_115(document_xml, styles_xml=None):
    document_xml = document_xml.replace('w:line="240" w:lineRule="auto"',
                                        'w:line="276" w:lineRule="auto"')
    # também parágrafos sem line explícito ganham 276 quando têm só after=0
    document_xml = document_xml.replace('<w:spacing w:after="0"/>',
                                        '<w:spacing w:after="0" w:line="276" w:lineRule="auto"/>')
    if styles_xml is not None:
        for v in ('360', '259', '240'):
            styles_xml = styles_xml.replace('w:line="%s" w:lineRule="auto"' % v,
                                            'w:line="276" w:lineRule="auto"')
    return document_xml, styles_xml


def centralizar_tabelas(xml):
    def sub(m):
        tp = m.group(0)
        if '<w:jc ' in tp:
            return tp
        # insere jc center logo após o primeiro <w:tblW .../>
        tp2 = re.sub(r'(<w:tblW\b[^>]*/>)', r'\1<w:jc w:val="center"/>', tp, count=1)
        # zera tblInd para centralizar de fato
        tp2 = re.sub(r'<w:tblInd w:w="\d+"', '<w:tblInd w:w="0"', tp2, count=1)
        return tp2
    return re.sub(r'<w:tblPr>.*?</w:tblPr>', sub, xml, flags=re.S)


def tabelas_inteiras(xml):
    def sub(m):
        tr = m.group(0)
        if '<w:cantSplit/>' not in tr:
            if '<w:trPr>' in tr:
                tr = tr.replace('<w:trPr>', '<w:trPr><w:cantSplit/>', 1)
            else:
                mo = re.match(r'(<w:tr\b[^>]*>)', tr)
                tr = tr[:mo.end()] + '<w:trPr><w:cantSplit/></w:trPr>' + tr[mo.end():]
        tr = re.sub(r'<w:p\b[^>]*>.*?</w:p>',
                    lambda pm: _inject_ppr(pm.group(0), '<w:keepNext/>') if '<w:keepNext/>' not in pm.group(0) else pm.group(0),
                    tr, flags=re.S)
        return tr
    return re.sub(r'<w:tr\b[^>]*>.*?</w:tr>', sub, xml, flags=re.S)


def titulos_juntos(xml):
    blocks = list(re.finditer(r'<w:p\b[^>]*>.*?</w:p>', xml, flags=re.S))
    out = []
    last = 0
    chain = False
    for m in blocks:
        gap = xml[last:m.start()]
        if '<w:tbl' in gap:
            chain = False
        out.append(gap)
        last = m.end()
        pt = m.group(0)
        txt = "".join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', pt))
        empty = txt.strip() == ""
        bold = '<w:b/>' in pt
        if _is_heading(txt) and bold:
            chain = True
            if '<w:keepNext/>' not in pt:
                pt = _inject_ppr(pt, '<w:keepNext/><w:keepLines/>')
            elif '<w:keepLines/>' not in pt:
                pt = _inject_ppr(pt, '<w:keepLines/>')
        elif chain and empty:
            if '<w:keepNext/>' not in pt:
                pt = _inject_ppr(pt, '<w:keepNext/>')
        else:
            chain = False
        out.append(pt)
    out.append(xml[last:])
    return "".join(out)


def colapsar_vazios(xml, maximo=1):
    """Colapsa sequências de parágrafos VAZIOS (2+ -> `maximo`) para remover os
    'buracos' entre seções (ex.: antes de '3. DO MÉRITO'). Preserva quebras de
    página, imagens e sectPr."""
    blocks = list(re.finditer(r'<w:p\b[^>]*>.*?</w:p>', xml, flags=re.S))
    out = []
    last = 0
    run = 0
    for m in blocks:
        gap = xml[last:m.start()]
        last = m.end()
        if '<w:tbl' in gap or re.search(r'<w:p\b', gap):
            run = 0
        out.append(gap)
        pt = m.group(0)
        txt = "".join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', pt))
        protegido = bool(re.search(r'w:type="page"|pageBreakBefore|<w:drawing|<w:pict|<w:object|<w:sectPr', pt))
        vazio = (txt.strip() == "") and not protegido
        if vazio:
            run += 1
            if run > maximo:
                continue  # descarta o excedente
        else:
            run = 0
        out.append(pt)
    out.append(xml[last:])
    return "".join(out)


def aplicar_tudo(document_xml, styles_xml=None):
    document_xml, styles_xml = espacamento_115(document_xml, styles_xml)
    document_xml = centralizar_tabelas(document_xml)
    document_xml = tabelas_inteiras(document_xml)
    document_xml = colapsar_vazios(document_xml, 1)
    document_xml = titulos_juntos(document_xml)
    return document_xml, styles_xml
