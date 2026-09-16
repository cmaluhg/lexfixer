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
from . import estrutura, docxio, revisao, extract


def _ler_socio_texto(pasta):
    """Lê e limpa o texto do 'socio economico.docx' da pasta (ou '')."""
    if not pasta:
        return ""
    import glob as _g
    cand = _g.glob(os.path.join(pasta, "*ocio*conomico*.docx")) + _g.glob(os.path.join(pasta, "*ocio*.docx"))
    if not cand:
        return ""
    try:
        paras = docxio.docx_para_texto(cand[0])
    except Exception:
        return ""
    return _limpar_socio(" ".join(p for p in paras if p.strip()))


def _deburr(s):
    return "".join(c for c in unicodedata.normalize("NFD", s or "")
                   if unicodedata.category(c) != "Mn").upper()


# título da seção de gratuidade: começa com numeração ("2.2.") + DO/DA + termo.
_HDR_NUM = re.compile(r"^\d+(\.\d+)*\.?\s+D[OA]\b")

# ---- Novo tópico de gratuidade (ADC 80) — SÓ Luis Albert. (texto, ind): ind=parte
#      individual (preenchida pelo socioeconômico; sem socio → "(preencher)" em amarelo). ----
_GRAT_COMUM = [
    ("A gratuidade da justiça garante o acesso à Justiça àqueles que não possuem recursos suficientes para arcar com as despesas processuais sem prejuízo de sua subsistência. No caso, a situação econômica da parte Autora evidencia o preenchimento dos requisitos para a concessão do benefício, conforme se demonstra.", False),
    ("Atualmente, o(a) Autor(a) é (preencher), sendo (único provedor da residência/adequar ao caso concreto), na qual residem (preencher) pessoas, que (dependem integral ou parcialmente/adequar ao caso concreto) de sua renda mensal bruta no valor de R$ (preencher).", True),
    ("Além disso, a parte Autora arca mensalmente com despesas essenciais, tais como (preencher: água, energia elétrica, alimentação, medicamentos, transporte, internet, despesas com dependentes, empréstimos etc.), de modo que a imposição das despesas processuais comprometeria parcela relevante dos recursos destinados à sua subsistência e à manutenção de seu núcleo familiar.", True),
    ("Cumpre destacar, ainda, que, em 03 de setembro de 2026, o Supremo Tribunal Federal concluiu o julgamento da Ação Declaratória de Constitucionalidade nº 80 (ADC 80), estabelecendo parâmetros para a concessão da gratuidade da justiça, com extensão aos diversos ramos do Poder Judiciário.", False),
    ("No referido julgamento, o STF reconheceu que a pessoa natural com renda mensal de até R$ 5.000,00 (cinco mil reais) faz jus à gratuidade da justiça sem necessidade de comprovação adicional da insuficiência de recursos, estabelecendo, assim, parâmetro objetivo para a análise do benefício.", False),
    ("Tal presunção, contudo, não possui caráter absoluto, podendo ser afastada quando existirem elementos concretos que demonstrem patrimônio ou renda familiar incompatíveis com a concessão do benefício. Na hipótese dos autos, além de a renda da parte Autora encontrar-se dentro do parâmetro fixado pelo STF, não há elementos que evidenciem situação patrimonial ou financeira incompatível com a hipossuficiência alegada, sendo sua realidade econômica corroborada pelas circunstâncias individualizadas acima e pelos documentos anexados à inicial.", False),
    ("Ressalta-se, ainda, que o Supremo Tribunal Federal conferiu à decisão efeitos ex nunc, estabelecendo que os novos critérios incidem somente sobre os processos ajuizados a partir da publicação da ata do julgamento. Considerando que a presente demanda foi proposta posteriormente ao referido marco temporal, os parâmetros estabelecidos na ADC 80 mostram-se plenamente aplicáveis ao caso.", False),
    ("Dessa forma, considerando a situação econômica concretamente demonstrada, a renda mensal da parte Autora e seu enquadramento nos parâmetros estabelecidos pelo Supremo Tribunal Federal na ADC 80, pugna-se pela concessão dos benefícios da gratuidade da justiça, nos termos do art. 9º, inciso I, da Constituição do Estado do Amazonas e dos arts. 98 e seguintes do Código de Processo Civil.", False),
]
_GRAT_JEC = [
    ("Ainda que o acesso à Justiça Especial em primeiro grau independa do pagamento de custas, taxas ou despesas por força do art. 54 da lei específica n. 9.099/95, que abrange os Juizados Especiais, cumpre informar que a parte Autora não possui condições de arcar com as custas judiciais (preparo ou qualquer outro ato) sem comprometer severamente seu sustento.", False),
    ("Atualmente, o(a) autor(a) é (preencher), sendo o único provedor da sua casa (adequar ao caso concreto), na qual reside um total de (preencher) pessoas, que dependem integralmente da sua renda mensal bruta no valor de R$ (preencher).", True),
    ("Além disso, a parte autora arca com despesas essenciais, tais como (preencher, ex.: água, luz, alimentação, medicamentos, transporte, internet, cuidado de dependentes, empréstimos, etc), de modo que não dispõe de recursos para suportar despesas extras, ainda que processuais, sem prejuízo de sua própria subsistência e de seu núcleo familiar.", True),
    ("Por fim, cabe destacar que, em 03 de setembro de 2026, o Supremo Tribunal Federal concluiu o julgamento da ADC 80, estabelecendo novos parâmetros para a concessão da gratuidade da justiça, com aplicação aos diversos ramos do Poder Judiciário.", False),
    ("A decisão reconheceu a presunção relativa de insuficiência de recursos da pessoa natural que aufere renda mensal de até R$ 5.000,00 (cinco mil reais), ressalvada a possibilidade de afastamento da presunção quando o magistrado verificar, no caso concreto, patrimônio ou renda familiar incompatíveis com a alegada hipossuficiência, mediante análise das circunstâncias concretamente demonstradas.", False),
    ("O STF conferiu à decisão efeitos ex nunc, a contar da publicação da ata do julgamento de mérito, aplicando-se os novos critérios somente às ações ajuizadas a partir desse marco temporal. Considerando que a presente demanda foi proposta posteriormente à publicação da referida ata, mostra-se aplicável ao caso o parâmetro estabelecido na ADC 80.", False),
    ("Por todo o exposto, pugna-se pela concessão dos benefícios da gratuidade da justiça, à luz dos parâmetros fixados pelo Supremo Tribunal Federal no julgamento da ADC 80, bem como do art. 9º, inciso I, da Constituição do Estado do Amazonas, dos arts. 98 e seguintes do Código de Processo Civil e do art. 54 da Lei nº 9.099/95.", False),
]
_HL_RPR = ('<w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Arial" w:hAnsi="Arial" w:cs="Arial"/>'
           '<w:sz w:val="24"/><w:szCs w:val="24"/><w:highlight w:val="yellow"/></w:rPr>')
_HDR_SEC = re.compile(r'^\d+(\.\d+)*\.?\s+[A-ZÀ-Ú"“]')


def _esc_xml(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _para_grat(texto, hl):
    rpr = _HL_RPR if hl else estrutura.RPR
    return ('<w:p w14:paraId="%s" w14:textId="77777777">%s<w:r>%s<w:t xml:space="preserve">%s</w:t></w:r></w:p>'
            % (estrutura._npid(), estrutura.PPR_BODY, rpr, _esc_xml(texto)))


def _texto_para(tag):
    return "".join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', tag))


def atualizar_gratuidade(xml, comum, socio_texto, log):
    """Substitui o corpo da seção de gratuidade pelo texto ADC 80 (Comum/JEC). A parte
    individual é preenchida com o socioeconômico; sem socio, fica '(preencher)' em amarelo."""
    blocks = [(m.start(), m.end(), m.group(0)) for m in re.finditer(r'<w:p\b[^>]*>.*?</w:p>', xml, flags=re.S)]
    hi = next((i for i, b in enumerate(blocks) if _eh_hdr_gratuidade(_texto_para(b[2]))), None)
    if hi is None:
        log.append("⚠️ Gratuidade (ADC 80) NÃO inserida — seção não encontrada. Inserir manualmente.")
        return xml
    nj = next((j for j in range(hi + 1, len(blocks))
               if _HDR_SEC.match(_texto_para(blocks[j][2]).strip()) and len(_texto_para(blocks[j][2]).strip()) < 140), None)
    ini = blocks[hi][1]
    fim = blocks[nj][0] if nj is not None else blocks[hi][1]
    socio = _limpar_socio(socio_texto) if socio_texto else ""
    partes = []
    socio_emitido = False
    for texto, ind in (_GRAT_COMUM if comum else _GRAT_JEC):
        if ind:
            if socio:
                if not socio_emitido:
                    partes.append(_para_grat(socio, False))
                    socio_emitido = True
            else:
                partes.append(_para_grat(texto, True))
        else:
            partes.append(_para_grat(texto, False))
    log.append("Tópico de gratuidade (ADC 80) — versão %s%s."
               % ("JUSTIÇA COMUM" if comum else "JUIZADO/JEC",
                  " (individualizado pelo socioeconômico)" if socio else " — parte individual em amarelo '(preencher)'"))
    return xml[:ini] + "".join(partes) + xml[fim:]


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
    # typos comuns digitados à mão
    t = re.sub(r'\brebda\b', 'renda', t, flags=re.I)
    t = re.sub(r'\brenta\b', 'renda', t, flags=re.I)
    t = re.sub(r'\brensa\b', 'renda', t, flags=re.I)
    t = re.sub(r'\brendda\b', 'renda', t, flags=re.I)
    t = re.sub(r'\bsalario\b', 'salário', t, flags=re.I)
    t = re.sub(r'aproximadamente de\s*(\d)', r'de aproximadamente \1', t)
    # remove frase duplicada "A residência do(a) autor(a) abriga mais de N pessoas"
    t = re.sub(r'\s*A residência (?:do\(a\) autor\(a\)|da parte autora) abriga mais de \d+ pessoas[,\.]', '', t)
    # valores em contexto monetário ganham separador de milhar (5000 -> 5.000)
    t = re.sub(r'R\$\s*(\d{1,3})(\d{3})\b', r'R$ \1.\2', t)
    t = re.sub(r'\b(\d{1,3})(\d{3})(\s*reais)', r'\1.\2\3', t)
    t = re.sub(r'\b(de|at[ée])\s+(\d{1,3})(\d{3})\b(?![\/\d])', r'\1 \2.\3', t, flags=re.I)
    t = re.sub(r'\s{2,}', ' ', t)
    t = re.sub(r' +([,;:.!?])', r'\1', t).strip()
    if t:
        t = t[0].upper() + t[1:]
        if t[-1] not in ".!?":
            t += "."
    return t


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
    socio_info = {"pedido": False, "ok": True}
    xml = corrigir_genero_qualificacao(xml, ctx.get("sexo"), log)
    xml = inserir_numero_endereco(xml, ctx.get("numero_endereco"), log)
    # Gratuidade: Luis Albert usa o tópico ADC 80 (versão pelo foro, individualizado pelo
    # socioeconômico); NG mantém o comportamento anterior (parâmetros do NG são outros).
    _prim = "".join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>',
                               re.search(r'<w:p\b[^>]*>.*?</w:p>', xml, re.S).group(0)))
    _comum = bool(ctx.get("alvo_vara_comum")) if ctx.get("alvo_vara_comum") is not None \
        else ("JUIZADO ESPECIAL" not in _prim.upper())
    _texto_peca = " ".join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', xml))
    if extract.detectar_escritorio(_texto_peca) == "LA":
        xml = atualizar_gratuidade(xml, _comum, _ler_socio_texto(ctx.get("pasta")), log)
    else:
        xml = socioeconomico(xml, ctx.get("pasta"), log, socio_info)
    xml = corrigir_dano_moral_extenso(xml, log)
    xml = estrutura.corrigir_extensos(xml, ctx.get("valores") or [], log)
    if ctx.get("alvo_vara_comum") is not None:
        xml = estrutura.ajustar_enderecamento(xml, ctx["alvo_vara_comum"], log)
    # Idoso: só inserir tópico/pedido de prioridade se a peça AINDA não os tiver
    # (o NG já traz o tópico 2.7 e o pedido — não duplicar).
    _pri_txt = "\n".join("".join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', p))
                         for p in re.findall(r'<w:p\b[^>]*>.*?</w:p>', xml, re.S))
    _pri_ja = extract.prioridade_presente(_pri_txt)
    xml = estrutura.completar_cabecalho(xml, ctx.get("idoso") and not _pri_ja, log)
    if ctx.get("idoso") and not _pri_ja:
        xml = estrutura.inserir_itens_idoso(xml, ctx.get("nascimento"), ctx.get("idade"), log)
    elif ctx.get("idoso"):
        log.append("Prioridade de idoso já constava na peça — mantida (não reinserida)")
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
