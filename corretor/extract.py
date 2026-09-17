# -*- coding: utf-8 -*-
"""Extração dos dados-chave da petição, da planilha e do extrato."""
import re
import unicodedata
from . import docxio


def _deb(s):
    return "".join(c for c in unicodedata.normalize("NFD", s or "")
                   if unicodedata.category(c) != "Mn").upper()


def detectar_escritorio(texto):
    """'NG' (Nicolas Gomes) ou 'LA' (Luis Albert, padrão)."""
    return "NG" if re.search(r"NICOLAS\s+GOMES", _deb(texto)) else "LA"


def prioridade_presente(texto):
    """A peça JÁ traz tópico/pedido de prioridade de idoso? (NG usa o tópico 2.7
    'DA PRIORIDADE NA TRAMITAÇÃO PROCESSUAL' e o pedido). Evita duplicar/reinserir
    quando já existe — vale para os dois escritórios (idempotente)."""
    u = _deb(texto)
    return bool(re.search(r"PRIORIDADE NA TRAMITA", u)
                or re.search(r"TRAMITAC\w* PRIORITARI", u)
                or (re.search(r"PRIORIDADE", u) and re.search(r"ESTATUTO DO IDOSO", u)))


def eh_anp(texto):
    """Ausência de Notificação Prévia (ANP): sempre Justiça Comum, independente do valor."""
    return bool(re.search(r"NOTIFICACAO PREVIA|PREVIA NOTIFICACAO|"
                          r"AUSENCIA DE (PREVIA )?NOTIFICACAO|SEM (PREVIA )?NOTIFICACAO", _deb(texto)))


def pedidos_preliminares(texto):
    """Detecta pedidos preliminares na PEÇA INTEIRA (LEX pede no cabeçalho; NG em seções)."""
    tu = _deb(texto)
    return {
        "gratuidade": "GRATUIDADE" in tu or "JUSTICA GRATUITA" in tu,
        "inversao": "INVERS" in tu and "ONUS" in tu,
        "tutela": "TUTELA DE URG" in tu or "TUTELA ANTECIPADA" in tu,
        "prioridade": "PRIORIDADE" in tu,
    }


def periodo_dano(texto):
    """Período do dano material (início, fim) — aceita 'de/desde/entre X a/até/e Y' (LEX e NG)."""
    m = re.search(r'(?:per[íi]odo(?:\s+de)?|desde|entre|de)\s*(\d{2}/\d{2}/\d{4})\s*(?:at[ée]|a|e|\-|até o dia)\s*(\d{2}/\d{2}/\d{4})', texto, re.I)
    if not m:
        m = re.search(r'(\d{2}/\d{2}/\d{4})\s*(?:at[ée]|\s+a\s+)\s*(\d{2}/\d{2}/\d{4})', texto, re.I)
    return (m.group(1), m.group(2)) if m else (None, None)


def endereco_numero(logradouro):
    """Há número da residência no trecho do logradouro? 'Nº 52' (LEX) ou ', 2122' (NG)."""
    return bool(logradouro and re.search(r'\bn[ºo°]\.?\s*\d+|,\s*\d+', logradouro, re.I))


def pedidos_sem_letra(paras):
    """Conta pedidos SEM alínea que aparecem ANTES do primeiro item 'a)' na seção
    DOS PEDIDOS, quando existe pelo menos um item com letra. Detecta o caso NG:
    os pedidos de prioridade/cessação vêm sem 'a)', seguidos de 'a)', 'b)'..."""
    ini = None
    for i, p in enumerate(paras):  # âncora = título da seção de pedidos
        u = _deb(p)
        if "DOS PEDIDOS" in u or "DOS REQUERIMENTOS" in u:
            ini = i + 1
            break
    if ini is None:  # sem título → introdução curta "..., requer:" (não a argumentação)
        for i, p in enumerate(paras):
            s = p.strip()
            if len(s) <= 80 and s.endswith(":") and re.search(r'\brequer\b', s, re.I):
                ini = i + 1
                break
    if ini is None:
        return 0
    fim = len(paras)
    _fins = ("NESTES TERMOS", "TERMOS EM QUE", "PEDE DEFERIMENTO", "DA-SE A CAUSA",
             "VALOR DA CAUSA", "PROTESTA PROVAR", "DO VALOR DA CAUSA")
    for j in range(ini, len(paras)):
        if any(k in _deb(paras[j]) for k in _fins):
            fim = j
            break
    com = sem_antes = 0
    for p in paras[ini:fim]:
        s = p.strip()
        if not s.endswith(";"):
            continue
        if re.match(r'^[a-z]\)', s):
            com += 1
        elif len(s) > 15 and com == 0:
            sem_antes += 1  # pedido substantivo sem alínea, antes do primeiro 'a)'
    return sem_antes if com > 0 else 0


def dados_bancarios(texto):
    """Agência/conta — aceita 'agência 5042' e 'agência nº 5042' (kit NG)."""
    mag = re.search(r'ag[êe]ncia[^\d]{0,8}(\d[\d.\-]*)', texto, re.I)
    mcc = re.search(r'conta\s+corrente[^\d]{0,8}(\d[\d.\-]*)', texto, re.I)
    return (mag.group(1).strip() if mag else None, mcc.group(1).strip() if mcc else None)


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

    # pedidos preliminares (peça inteira — LEX no cabeçalho, NG em seções)
    _prel = pedidos_preliminares(texto)
    d["header_gratuidade"] = _prel["gratuidade"]
    d["header_inversao"] = _prel["inversao"]
    d["header_tutela"] = _prel["tutela"]
    d["header_prioridade_idoso"] = _prel["prioridade"]
    d["prioridade_presente"] = prioridade_presente(texto)  # já tem tópico/pedido de idoso? (não reinserir)

    # endereçamento
    l1 = paras[0].upper() if paras else ""
    d["endereco_juizado"] = "JUIZADO ESPECIAL" in l1
    d["endereco_vara_comum"] = ("VARA C" in l1 and "JUIZADO" not in l1)
    d["anp"] = eh_anp(texto)  # Ausência de Notificação Prévia → sempre Justiça Comum
    d["escritorio"] = detectar_escritorio(texto)  # "LA" (Luis Albert) ou "NG" (Nicolas Gomes)
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
    # endereço: procura "residente n. RUA X, Bairro:" e se tem número.
    # Aceita separador antes de "Bairro" com vírgula OU ponto (NG: "RUA GAIVOTA , 2122. Bairro:").
    mend = re.search(r'residente\s+n[ao]\s+(.+?)\s*[,.]?\s*Bairro', texto)
    d["endereco_logradouro"] = mend.group(1).strip() if mend else None
    # número: "Nº 52" (LEX) ou número após vírgula "RUA X, 2122" (NG)
    d["endereco_tem_numero"] = endereco_numero(mend.group(1)) if mend else False

    # dados bancários — aceita "agência 5042" e "agência nº 5042" (kit NG)
    d["agencia"], d["conta"] = dados_bancarios(texto)

    d["periodo"] = periodo_dano(texto)  # dano material — aceita "X a Y" (NG) e "X até Y" (LEX)

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
    d["pedidos_sem_letra"] = pedidos_sem_letra(paras)  # pedidos sem alínea antes de 'a)' (NG)

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
