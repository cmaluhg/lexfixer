# -*- coding: utf-8 -*-
"""Edições estruturais no XML da peça (inserções/reescritas que reproduzem a
correção manual): endereçamento, cabeçalho, itens de idoso, pedidos e extenso."""
import re
from .extenso import valor_por_extenso

RPR = ('<w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Arial" w:hAnsi="Arial" '
       'w:cs="Arial"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>')
RPR_B = ('<w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Arial" w:hAnsi="Arial" '
         'w:cs="Arial"/><w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>')
PPR_B = ('<w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/>'
         '<w:ind w:firstLine="0"/>' + RPR_B + '</w:pPr>')
PPR_BODY = ('<w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/>'
            '<w:jc w:val="both"/>' + RPR + '</w:pPr>')
PPR_ITEM = ('<w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/>'
            '<w:ind w:firstLine="0"/>' + RPR + '</w:pPr>')

_pid = [50000]


def _npid():
    _pid[0] += 1
    return "%08X" % _pid[0]


def _para(ppr, rpr, texto):
    return ('<w:p w14:paraId="%s" w14:textId="77777777">%s<w:r>%s'
            '<w:t xml:space="preserve">%s</w:t></w:r></w:p>' % (_npid(), ppr, rpr, texto))


def _vazio():
    return '<w:p w14:paraId="%s" w14:textId="77777777"><w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/></w:pPr></w:p>' % _npid()


def _para_de(texto):
    """Devolve (inicio, fim) do <w:p> cujo texto concatenado contém `texto`."""
    for m in re.finditer(r'<w:p\b[^>]*>.*?</w:p>', _para_de.xml, flags=re.S):
        t = "".join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', m.group(0)))
        if texto in t:
            return m.start(), m.end(), m.group(0)
    return None


def _inserir_apos(xml, ancora_texto, novo_xml):
    _para_de.xml = xml
    r = _para_de(ancora_texto)
    if not r:
        return xml, False
    ini, fim, _ = r
    return xml[:fim] + novo_xml + xml[fim:], True


def _inserir_antes(xml, ancora_texto, novo_xml):
    _para_de.xml = xml
    r = _para_de(ancora_texto)
    if not r:
        return xml, False
    ini, fim, _ = r
    return xml[:ini] + novo_xml + xml[ini:], True


# --------------------------- Endereçamento ---------------------------

def ajustar_enderecamento(xml, alvo_vara_comum, log):
    """alvo_vara_comum=True → Vara Cível Comum; False → Juizado Especial Cível."""
    # trabalha só no 1º parágrafo (endereçamento)
    fim1 = re.search(r'</w:p>', xml).end()
    prim = xml[:fim1]
    resto = xml[fim1:]
    novo = prim
    if alvo_vara_comum:
        if "JUIZADO ESPECIAL" in prim:
            novo = prim.replace("VARA DO JUIZADO ESPECIAL CÍVEL", "VARA CÍVEL")
            novo = novo.replace("JUIZADO ESPECIAL CÍVEL", "VARA CÍVEL")
            log.append("Endereçamento ajustado para Vara Cível Comum")
    else:
        if "JUIZADO ESPECIAL" not in prim and "VARA CÍVEL" in prim:
            novo = prim.replace("VARA CÍVEL", "VARA DO JUIZADO ESPECIAL CÍVEL")
            log.append("Endereçamento ajustado para Juizado Especial Cível")
    return novo + resto


# --------------------------- Cabeçalho ---------------------------

def completar_cabecalho(xml, idoso, log):
    """Garante Gratuidade + Inversão no cabeçalho e, se idoso, Prioridade: Idoso."""
    # região do cabeçalho = até a 1ª ocorrência de "vem, respeitosamente" (qualificação)
    corte = xml.find("respeitosamente")
    cab = xml[:corte] if corte > 0 else xml[:4000]

    def tem(t):
        return t in cab

    # Inversão ausente no cabeçalho? adiciona após Gratuidade
    if not tem("INVERSÃO DO ÔNUS DA PROVA") and (tem("GRATUIDADE DE JUSTIÇA") or tem("JUSTIÇA GRATUITA")):
        ancora = "GRATUIDADE DE JUSTIÇA" if tem("GRATUIDADE DE JUSTIÇA") else "JUSTIÇA GRATUITA"
        # acha o </w:p> do parágrafo do cabeçalho que contém a âncora
        xml2, ok = _inserir_apos(xml, ancora,
                                 _para(PPR_B, RPR_B, "COM PEDIDO DE INVERSÃO DO ÔNUS DA PROVA"))
        if ok:
            xml = xml2
            log.append("Cabeçalho: incluído 'COM PEDIDO DE INVERSÃO DO ÔNUS DA PROVA'")

    if idoso and "PRIORIDADE PROCESSUAL" not in cab:
        for anc in ["INVERSÃO DO ÔNUS DA PROVA", "TUTELA DE URGÊNCIA",
                    "GRATUIDADE DE JUSTIÇA", "JUSTIÇA GRATUITA"]:
            if anc in xml[:corte if corte > 0 else 4000]:
                xml2, ok = _inserir_apos(xml, anc,
                                         _para(PPR_B, RPR_B, "COM PEDIDO DE PRIORIDADE PROCESSUAL: IDOSO"))
                if ok:
                    xml = xml2
                    log.append("Cabeçalho: incluído 'COM PEDIDO DE PRIORIDADE PROCESSUAL: IDOSO'")
                    break
    return xml


# --------------------------- Idoso: tópico + pedido ---------------------------

def _proximo_numero_preliminar(xml):
    nums = [int(m.group(1)) for m in re.finditer(r'>2\.(\d+)\.\s', xml)]
    return "2.%d." % (max(nums) + 1) if nums else "2."


def inserir_itens_idoso(xml, nascimento, idade, log):
    """Insere o tópico de prioridade (antes de DO MÉRITO) e o pedido (após juros)."""
    ext = valor_por_extenso(idade).replace(" reais", "").replace(" real", "")
    num = _proximo_numero_preliminar(xml)
    heading = "%s DA PRIORIDADE NA TRAMITAÇÃO PROCESSUAL — REQUERENTE MAIOR DE 60 ANOS" % num
    corpo = ("Nos termos do artigo 71 da Lei nº 10.741/2003 (Estatuto do Idoso) e artigo 1.048, "
             "inciso I, do Código de Processo Civil, toda pessoa com idade igual ou superior a 60 "
             "(sessenta) anos tem direito à prioridade na tramitação dos processos judiciais. "
             "A parte requerente, nascida em %s, possui %s (%s) anos, conforme comprovado por cópia "
             "do documento de identidade anexado aos autos. Dessa forma, requer a tramitação "
             "prioritária do presente feito, assegurando à parte requerente o direito legalmente "
             "garantido." % (nascimento, idade, ext))
    bloco = _vazio() + _para(PPR_B, RPR_B, heading) + _vazio() + _para(PPR_BODY, RPR, corpo)
    for anc in ["DO MÉRITO", "3. DO MÉRITO", "DO MERITO"]:
        xml2, ok = _inserir_antes(xml, anc, bloco)
        if ok:
            xml = xml2
            log.append("Inserido tópico 'DA PRIORIDADE NA TRAMITAÇÃO PROCESSUAL'")
            break

    # pedido de prioridade após o pedido de juros/correção
    letra = _proxima_letra_pedido(xml)
    ped = ("%s) a prioridade na tramitação processual, visto que a parte requerente possui %s (%s) "
           "anos, nos termos do artigo 1.048, inciso I, do Código de Processo Civil, bem como do "
           "artigo 71, caput, da Lei nº 10.741/2003 (Estatuto do Idoso);" % (letra, idade, ext))
    for anc in ["conforme Súmulas 362 e 54 do STJ;", "Súmulas 362 e 54 do STJ;"]:
        xml2, ok = _inserir_apos(xml, anc, _para(PPR_ITEM, RPR, ped))
        if ok:
            xml = xml2
            log.append("Inserido pedido de prioridade (%s)" % letra)
            break
    return xml


def _proxima_letra_pedido(xml):
    letras = re.findall(r'<w:t[^>]*>\s*([a-z])\)\s', xml)
    if not letras:
        return "j"
    ultima = max(letras)
    return chr(ord(ultima) + 1)


# --------------------------- Extenso ---------------------------

def _fmt(v):
    s = "%0.2f" % v
    inteiro, cent = s.split(".")
    inteiro = re.sub(r'(?<=\d)(?=(\d{3})+$)', '.', inteiro)
    return inteiro + "," + cent


def corrigir_extensos(xml, valores, log):
    """Para cada valor, corrige/insere o (por extenso) em 'R$ X (...)'."""
    for v in valores:
        if not v:
            continue
        alvo = _fmt(v)
        correto = valor_por_extenso(v)
        # 'R$ 305,20 (qualquer coisa)' -> corrige o parêntese
        pat = re.compile(r'(R\$\s*' + re.escape(alvo) + r'\s*\()([^)]*)(\))')
        def _f(m):
            if m.group(2).strip().lower() == correto.lower():
                return m.group(0)
            return m.group(1) + correto + m.group(3)
        xml2, n = pat.subn(_f, xml)
        if n and xml2 != xml:
            xml = xml2
            log.append("Extenso corrigido para R$ %s (%s)" % (alvo, correto))
    return xml


# --------------------------- Renumerar pedidos ---------------------------

def renumerar_pedidos(xml, log):
    """Renumera itens a), b), c)... da seção DOS PEDIDOS quando houver salto/letra faltando.

    Atua apenas em rótulos de letra que iniciam run (texto), preservando a ordem.
    """
    i = xml.find("DOS PEDIDOS")
    if i < 0:
        i = xml.find("Ex positis")
    if i < 0:
        return xml
    cabeca, corpo = xml[:i], xml[i:]
    # encontra rótulos "x)" no início de <w:t>
    rotulos = list(re.finditer(r'(<w:t[^>]*>\s*)([a-z])(\)\s)', corpo))
    if len(rotulos) < 2:
        return xml
    esperado = [chr(ord('a') + k) for k in range(len(rotulos))]
    atual = [m.group(2) for m in rotulos]
    if atual == esperado:
        return xml
    # reescreve na ordem
    novo = []
    last = 0
    for k, m in enumerate(rotulos):
        novo.append(corpo[last:m.start()])
        novo.append(m.group(1) + esperado[k] + m.group(3))
        last = m.end()
    novo.append(corpo[last:])
    log.append("Pedidos renumerados (%s → a..%s)" % (",".join(atual), esperado[-1]))
    return cabeca + "".join(novo)
