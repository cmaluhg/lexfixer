# -*- coding: utf-8 -*-
"""Correções de conteúdo aplicadas ao XML da peça (etapa assistida).

Aplica apenas correções seguras e de alta confiança e devolve um log das ações.
Itens que exigem julgamento (itens de idoso, individualização do socioeconômico)
são devolvidos como 'snippets' prontos para a equipe revisar/colar.
"""
import glob
import os
import re
import unicodedata
from .extenso import valor_por_extenso
from . import estrutura, docxio, revisao


def _deburr(s):
    return "".join(c for c in unicodedata.normalize("NFD", s or "")
                   if unicodedata.category(c) != "Mn").upper()


# título da seção de gratuidade: começa com numeração ("2.2.") + DO/DA + termo.
_HDR_NUM = re.compile(r"^\d+(\.\d+)*\.?\s+D[OA]\b")


def _eh_hdr_gratuidade(t):
    d = _deburr(t).strip()
    if len(d) > 70 or not _HDR_NUM.match(d):
        return False
    return ("JUSTICA GRATUITA" in d or "GRATUIDADE" in d
            or "ASSISTENCIA JUDICIARIA" in d)


def _inserir_inicio_gratuidade(xml, novo_xml):
    """Insere `novo_xml` logo APÓS o parágrafo-título da seção de gratuidade."""
    for m in re.finditer(r"<w:p\b[^>]*>.*?</w:p>", xml, flags=re.S):
        t = "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", m.group(0))).strip()
        if _eh_hdr_gratuidade(t):
            return xml[:m.end()] + novo_xml + xml[m.end():], True
    return xml, False


def _t(xml, alvo, novo, log, label):
    if alvo in xml:
        n = xml.count(alvo)
        xml = xml.replace(alvo, novo)
        log.append(f"{label} ({n}x)")
    return xml


def corrigir_genero_qualificacao(xml, sexo, log):
    """BRASILEIRO(A)/SOLTEIRO(A)/CASADO(A)... conforme sexo (M/F)."""
    fem = (sexo or "").upper().startswith("F")
    mapa_f = {"BRASILEIRO(A)": "BRASILEIRA", "SOLTEIRO(A)": "SOLTEIRA",
              "CASADO(A)": "CASADA", "DIVORCIADO(A)": "DIVORCIADA",
              "VIÚVO(A)": "VIÚVA", "VIUVO(A)": "VIUVA"}
    mapa_m = {"BRASILEIRO(A)": "BRASILEIRO", "SOLTEIRO(A)": "SOLTEIRO",
              "CASADO(A)": "CASADO", "DIVORCIADO(A)": "DIVORCIADO",
              "VIÚVO(A)": "VIÚVO", "VIUVO(A)": "VIUVO"}
    mapa = mapa_f if fem else mapa_m
    for k, v in mapa.items():
        xml = _t(xml, k, v, log, f"Qualificação: {k}→{v}")
    return xml


def inserir_numero_endereco(xml, numero, log):
    if not numero:
        return xml
    # o run ", Bairro:" costuma ser separado do logradouro
    if f", Nº {numero}" in xml:
        return xml
    for alvo in [", Bairro:", ",Bairro:"]:
        if alvo in xml:
            xml = xml.replace(alvo, f", Nº {numero}{alvo}", 1)
            log.append(f"Endereço: incluído Nº {numero}")
            break
    return xml


def corrigir_dano_moral_extenso(xml, log):
    """Preenche o extenso do dano moral quando estiver vazio: 'R$ 15.000,00 ()'."""
    ext = valor_por_extenso(15000)  # quinze mil reais
    alvo_novo = "R$ 15.000,00 (%s)" % ext
    # caso contíguo
    padrao = re.compile(r'R\$\s*15\.?000(?:,00)?\s*\(\s*\)')
    if padrao.search(xml):
        xml = padrao.sub(alvo_novo, xml)
        log.append("Dano moral: valor por extenso preenchido (contíguo)")
        return xml
    # caso com runs separados: <w:t>R$ 15000</w:t> ... <w:t> ()</w:t>
    padrao2 = re.compile(r'(R\$\s*15\.?000(?:,00)?)(</w:t>.*?<w:t[^>]*>)\s*\(\s*\)', re.S)
    if padrao2.search(xml):
        xml = padrao2.sub(lambda m: "R$ 15.000,00" + m.group(2) + " (%s)" % ext, xml, count=1)
        log.append("Dano moral: valor por extenso preenchido (runs separados)")
    return xml


def remover_marcador_prioridade(xml, log):
    for alvo in [" [PRIORIDADE]", "[PRIORIDADE]"]:
        if alvo in xml:
            xml = xml.replace(alvo, "")
            log.append("Removido marcador [PRIORIDADE] (cliente não idoso)")
            break
    return xml


def neutralizar_linguagem(xml, log):
    """Neutraliza referências à parte (curadas e de alta precisão)."""
    subs = [
        ("parte Autora", "parte autora"),
        ("parte Requerente", "parte requerente"),
        ("O Requerente ", "A parte requerente "),
        ("o Requerente ", "a parte requerente "),
        ("A Requerente ", "A parte requerente "),
        ("a Requerente ", "a parte requerente "),
        ("do Requerente", "da parte requerente"),
        ("pelo Requerente", "pela parte requerente"),
        ("ao Requerente", "à parte requerente"),
        ("pela Requerente", "pela parte requerente"),
    ]
    n = 0
    for a, b in subs:
        if a in xml:
            n += xml.count(a)
            xml = xml.replace(a, b)
    if n:
        log.append(f"Linguagem neutralizada ({n} ocorrências) — revisar")
    return xml


def neutralizar_socioeconomico(xml, log):
    subs = [
        ("o(a) autor(a) é", "a parte autora é"),
        ("compartilhada é o único provedor", "compartilhada e é a única provedora"),
        ("encontra-se impossibilitado", "encontra-se impossibilitada"),
        ("está impossibilitado", "está impossibilitada"),
    ]
    for a, b in subs:
        xml = _t(xml, a, b, log, f"Socioeconômico: '{a}'→'{b}'")
    return xml


def _limpar_socio(t):
    """Limpa e neutraliza o texto do questionário socioeconômico."""
    t = t.strip().strip('"').strip()
    t = t.replace("residênciaa", "residência")
    t = t.replace("o(a) autor(a) é", "a parte autora é")
    t = t.replace("o(a) autor(a)", "a parte autora")
    t = t.replace("compartilhada é o único provedor", "compartilhada e é a única provedora")
    t = t.replace("é o único provedor", "é a única provedora")
    t = t.replace("encontra-se impossibilitado", "encontra-se impossibilitada")
    t = t.replace("está impossibilitado", "está impossibilitada")
    t = re.sub(r'de at[ée]\s*2500\b', 'de até 2.500', t)
    t = re.sub(r'aproximadamente de\s*(\d)', r'de aproximadamente \1', t)
    # remove frase duplicada "A residência do(a) autor(a) abriga mais de N pessoas"
    t = re.sub(r'\s*A residência (?:do\(a\) autor\(a\)|da parte autora) abriga mais de \d+ pessoas[,\.]', '', t)
    t = re.sub(r'\s{2,}', ' ', t)
    return t.strip()


_MARC_SOCIO = re.compile(
    r"autor\(a\)|provedor|impossibilitad|renda mensal|reside um total|"
    r"sua resid[êe]ncia|é o único|hipossufici", re.I)


def _para_socio(xml):
    """Parágrafo socioeconômico (começa com 'Atualmente,' E tem marcadores de
    renda/provedor). Evita casar o 'Atualmente, no Brasil...' retórico."""
    for m in re.finditer(r'<w:p\b[^>]*>.*?</w:p>', xml, flags=re.S):
        t = "".join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', m.group(0)))
        if "Atualmente," in t and _MARC_SOCIO.search(t):
            return m.start(), m.end(), m.group(0)
    return None


def inserir_socio_texto(xml, texto, log, info=None):
    """Insere/substitui o texto socioeconômico já limpo. Núcleo testável.

    Registra o resultado em `info` (dict): {pedido, ok, via}.
    """
    if info is None:
        info = {}
    info["pedido"] = True
    info["ok"] = False
    if not texto:
        info["via"] = "texto vazio"
        return xml
    novo = estrutura._para(estrutura.PPR_BODY, estrutura.RPR, texto)
    # REMOVE um parágrafo socioeconômico já existente (a peça costuma vir com ele no
    # meio da seção) — será REPOSICIONADO no início da gratuidade. Sem casar o
    # "Atualmente," retórico ("Atualmente, no Brasil, instalou-se uma cultura...").
    pos_orig = None
    achou = _para_socio(xml)
    if achou:
        ini, fim, _ptag = achou
        pos_orig = ini
        xml = xml[:ini] + xml[fim:]
    # 1) INÍCIO da seção de gratuidade (logo após o título) — regra do cliente
    xml2, ok = _inserir_inicio_gratuidade(xml, novo)
    if ok:
        log.append("Socioeconômico no início da seção de Gratuidade"
                   + (" (reposicionado)" if pos_orig is not None else ""))
        info["ok"] = True
        info["via"] = "início da seção de Gratuidade (após o título)"
        return xml2
    # 2) fallback: insere após uma âncora de conteúdo conhecida
    for anc in ["rendimento da parte autora", "rendimento da parte Autora",
                "extrato de renda dos últimos 3", "todos em anexo aos autos",
                "hipossuficiência econômica da parte",
                "declaração de hipossuficiência e extratos bancários",
                "GRATUIDADE DE JUSTIÇA", "gratuidade de justiça"]:
        xml2, ok = estrutura._inserir_apos(xml, anc, novo)
        if ok:
            log.append("Socioeconômico inserido na seção de Gratuidade")
            info["ok"] = True
            info["via"] = "inserção na Gratuidade (âncora: %s)" % anc
            return xml2
    # 3) nada casou: se havia parágrafo, recoloca no lugar original (não perde texto)
    if pos_orig is not None:
        xml = xml[:pos_orig] + novo + xml[pos_orig:]
        log.append("Socioeconômico individualizado/neutralizado (parágrafo existente)")
        info["ok"] = True
        info["via"] = "substituição no lugar original (título não encontrado)"
        return xml
    # 4) sem template e sem âncora: NÃO altera e avisa
    log.append("⚠️ Socioeconômico NÃO individualizado automaticamente — âncora da "
               "Gratuidade não encontrada. Inserir manualmente e retornar ao ORG DOC.")
    info["via"] = "nenhuma âncora encontrada"
    return xml


def socioeconomico(xml, pasta, log, info=None):
    """Usa o socio economico.docx da pasta: neutraliza e insere/substitui na peça."""
    if info is None:
        info = {}
    if not pasta:
        info["pedido"] = False
        info["ok"] = True
        return xml
    cand = glob.glob(os.path.join(pasta, "*ocio*conomico*.docx")) + \
        glob.glob(os.path.join(pasta, "*ocio*.docx"))
    if not cand:
        # sem arquivo: apenas neutraliza o parágrafo existente
        info["pedido"] = False
        info["ok"] = True
        return neutralizar_socioeconomico(xml, log)
    try:
        paras = docxio.docx_para_texto(cand[0])
    except Exception:
        info["pedido"] = True
        info["ok"] = False
        info["via"] = "falha ao ler o socio.docx"
        log.append("⚠️ Socioeconômico NÃO individualizado — não consegui ler o arquivo. Inserir manualmente (ORG DOC).")
        return neutralizar_socioeconomico(xml, log)
    texto = _limpar_socio(" ".join(p for p in paras if p.strip()))
    return inserir_socio_texto(xml, texto, log, info)


def aplicar(xml, ctx, log):
    """Aplica TODAS as correções (reproduz a correção manual).

    ctx = {sexo, numero_endereco, idoso, nascimento, idade, pasta,
           alvo_vara_comum, valores}
    """
    socio_info = {}
    xml = corrigir_genero_qualificacao(xml, ctx.get("sexo"), log)
    xml = inserir_numero_endereco(xml, ctx.get("numero_endereco"), log)
    xml = socioeconomico(xml, ctx.get("pasta"), log, socio_info)
    xml = corrigir_dano_moral_extenso(xml, log)
    xml = estrutura.corrigir_extensos(xml, ctx.get("valores") or [], log)
    if ctx.get("alvo_vara_comum") is not None:
        xml = estrutura.ajustar_enderecamento(xml, ctx["alvo_vara_comum"], log)
    xml = estrutura.completar_cabecalho(xml, ctx.get("idoso"), log)
    if ctx.get("idoso"):
        xml = estrutura.inserir_itens_idoso(xml, ctx.get("nascimento"), ctx.get("idade"), log)
    xml = remover_marcador_prioridade(xml, log)
    xml = neutralizar_linguagem(xml, log)
    xml = estrutura.renumerar_pedidos(xml, log)
    xml = revisao.revisar(xml, log)  # ortografia/tipografia + latim em itálico + avisos
    # trava de segurança: pediu socio e não entrou -> alerta
    if socio_info.get("pedido") and not socio_info.get("ok") and \
            not any("Socioeconômico NÃO individualizado" in l for l in log):
        log.append("⚠️ Socioeconômico NÃO individualizado — revisar manualmente (ORG DOC).")
    return xml


# ---- Snippets prontos para itens de idoso (colar manualmente / revisar) ----

def snippets_idoso(nascimento, idade):
    ext_idade = valor_por_extenso(idade).replace(" reais", "").replace(" real", "")
    return {
        "cabecalho": "COM PEDIDO DE PRIORIDADE PROCESSUAL: IDOSO",
        "topico": ("DA PRIORIDADE NA TRAMITAÇÃO PROCESSUAL — REQUERENTE MAIOR DE 60 ANOS. "
                   "Nos termos do artigo 71 da Lei nº 10.741/2003 (Estatuto do Idoso) e artigo 1.048, inciso I, "
                   "do Código de Processo Civil, toda pessoa com idade igual ou superior a 60 (sessenta) anos tem "
                   "direito à prioridade na tramitação dos processos judiciais. A parte requerente, nascida em "
                   f"{nascimento}, possui {idade} ({ext_idade}) anos, conforme comprovado por cópia do documento de "
                   "identidade anexado aos autos. Dessa forma, requer a tramitação prioritária do presente feito, "
                   "assegurando à parte requerente o direito legalmente garantido."),
        "pedido": (f"a prioridade na tramitação processual, visto que a parte requerente possui {idade} ({ext_idade}) anos, "
                   "nos termos do artigo 1.048, inciso I, do Código de Processo Civil, bem como do artigo 71, caput, "
                   "da Lei nº 10.741/2003 (Estatuto do Idoso);"),
    }
