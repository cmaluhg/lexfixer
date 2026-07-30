# -*- coding: utf-8 -*-
"""Extração dos dados-chave da petição, da planilha e do extrato."""
import re
from . import docxio


def _num(br):
    """'1.170,92' -> 1170.92 ; aceita float/int direto."""
    if isinstance(br, (int, float)):
        return float(br)
    s = str(br).replace("R$", "").strip().replace(".", "").replace(" ", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def extrair_peticao(caminho_docx):
    """Extrai dados da petição inicial (.docx)."""
    paras = docxio.docx_para_texto(caminho_docx)
    texto = "\n".join(paras)
    d = {"paragrafos": paras}

    # cabeçalho / pedidos preliminares
    cab = "\n".join(paras[:8]).upper()
    d["header_gratuidade"] = "GRATUIDADE" in cab
    d["header_inversao"] = "INVERS" in cab and "ÔNUS" in cab.replace("ONUS", "ÔNUS")
    d["header_tutela"] = "TUTELA DE URG" in cab
    d["header_prioridade_idoso"] = "PRIORIDADE PROCESSUAL" in cab or "IDOSO" in cab

    # endereçamento
    l1 = paras[0].upper() if paras else ""
    d["endereco_juizado"] = "JUIZADO ESPECIAL" in l1
    d["endereco_vara_comum"] = ("VARA C" in l1 and "JUIZADO" not in l1)
    mcom = re.search(r'COMARCA DE ([A-ZÀ-Ú/ ]+)', l1)
    d["comarca"] = mcom.group(1).strip().rstrip(".") if mcom else ""

    # qualificação
    d["nome"] = paras[0] if False else None
    mrg = re.search(r'RG sob n[ºo]?\s*([\d\.\-]+)', texto)
    d["rg"] = re.sub(r'\D', '', mrg.group(1)) if mrg else None
    mcpf = re.search(r'CPF sob o n[ºo]?\s*([\d\.\-]+)', texto)
    d["cpf"] = mcpf.group(1).strip() if mcpf else None
    d["gen_brasileiro_marcado"] = "BRASILEIRO(A)" in texto
    d["gen_estadocivil_marcado"] = bool(re.search(r'(SOLTEIRO\(A\)|CASADO\(A\)|DIVORCIADO\(A\)|VI[ÚU]VO\(A\))', texto))
    # endereço: procura "residente n. RUA X, Bairro:" e se tem número
    mend = re.search(r'residente\s+n[ao]\s+(.+?),\s*Bairro:', texto)
    d["endereco_logradouro"] = mend.group(1).strip() if mend else None
    d["endereco_tem_numero"] = bool(mend and re.search(r'\bN[ºo]\.?\s*\d+|,\s*\d+', mend.group(1)))

    # dados bancários
    mag = re.search(r'ag[êe]ncia\s*([\d\-]+)', texto, re.I)
    d["agencia"] = mag.group(1).strip() if mag else None
    mcc = re.search(r'conta\s+corrente\s*([\d\-]+)', texto, re.I)
    d["conta"] = mcc.group(1).strip() if mcc else None

    # período
    mper = re.search(r'desde\s*(\d{2}/\d{2}/\d{4})\s*at[ée]\s*(\d{2}/\d{2}/\d{4})', texto)
    if not mper:
        mper = re.search(r'per[íi]odo de\s*(\d{2}/\d{2}/\d{4})\s*at[ée]\s*(\d{2}/\d{2}/\d{4})', texto)
    d["periodo"] = (mper.group(1), mper.group(2)) if mper else (None, None)

    # dano moral: procura "R$ 15.000,00 (...)" ou "R$15000 ()"
    d["dano_moral_vazio"] = bool(re.search(r'R\$\s*15\.?000(?:,00)?\s*\(\s*\)', texto))
    d["dano_moral_ok_extenso"] = "quinze mil reais" in texto.lower()

    # valor da causa (contexto "à presente causa ... o valor de R$ X")
    mvc = re.search(r'presente causa.{0,60}?valor de\s*R\$\s*([\d\.\,]+)', texto, re.S)
    if not mvc:
        mvc = re.search(r'[Dd][áa]-se .{0,80}?R\$\s*([\d\.\,]+)', texto, re.S)
    d["valor_causa"] = _num(mvc.group(1)) if mvc else None

    # valor pedido na repetição do indébito (pedido de condenação ao pagamento R$ X ... repetição)
    mrep = re.search(r'pagamento\s*R\$\s*([\d\.\,]+)[^\n]{0,120}?repeti[çc][ãa]o do ind[ée]bito', texto, re.S)
    d["valor_repeticao_pedido"] = _num(mrep.group(1)) if mrep else None

    # marcador [PRIORIDADE]
    d["marcador_prioridade"] = "[PRIORIDADE]" in texto

    # letras dos pedidos (sequência)
    letras = re.findall(r'(?m)^\s*([a-z])\)\s', texto)
    d["pedidos_letras"] = letras

    # rubrica citada (heurística: expressão entre aspas curvas após "denominada de")
    mrub = re.search(r'denominada de\s*[”"“]?\s*([A-Z0-9ÁÉÍÓÚÂÊÔ /\.\-_]+?)[”"“]', texto)
    d["rubrica_texto"] = mrub.group(1).strip() if mrub else None

    return d


def extrair_planilha(caminho_xlsx):
    """Extrai total, dobro e linhas de desconto da planilha."""
    sheets = docxio.ler_xlsx(caminho_xlsx)
    total = dobro = None
    descontos = []
    rubricas = set()
    for sh in sheets:
        for linha in sh["linhas"]:
            cel0 = str(linha[0]).strip().upper() if linha else ""
            if cel0.startswith("VALOR TOTAL"):
                total = _num(linha[-1])
            elif cel0.startswith("VALOR EM DOBRO"):
                dobro = _num(linha[-1])
            else:
                # linha de desconto: data | descrição | ... | valor
                data = str(linha[0]).strip()
                if re.match(r'\d{2}/\d{2}/\d{4}', data) or re.match(r'\d{4}-\d{2}-\d{2}', data):
                    val = _num(linha[-1])
                    desc = str(linha[1]).strip() if len(linha) > 1 else ""
                    if val is not None:
                        descontos.append({"data": data, "descricao": desc, "valor": val})
                        if desc:
                            rubricas.add(desc.upper())
        if total is not None:
            break
    soma = round(sum(x["valor"] for x in descontos), 2) if descontos else None
    return {"total": total, "dobro": dobro, "soma_conferida": soma,
            "descontos": descontos, "rubricas": sorted(rubricas)}


def extrair_extrato(caminho_pdf):
    """Extrai agência/conta e rubricas presentes no extrato."""
    t = docxio.pdf_texto(caminho_pdf)
    mag = re.search(r'Ag[êe]ncia:\s*([\d\-]+)', t)
    mcc = re.search(r'Conta:\s*([\d\-]+)', t)
    return {"texto": t, "agencia": mag.group(1).strip() if mag else None,
            "conta": mcc.group(1).strip() if mcc else None}
