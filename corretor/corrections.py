# -*- coding: utf-8 -*-
"""Correções de conteúdo aplicadas ao XML da peça (etapa assistida).

Aplica apenas correções seguras e de alta confiança e devolve um log das ações.
Itens que exigem julgamento (itens de idoso, individualização do socioeconômico)
são devolvidos como 'snippets' prontos para a equipe revisar/colar.
"""
import re
from .extenso import valor_por_extenso


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


def aplicar(xml, sexo, numero_endereco, idoso, log):
    """Aplica as correções seguras e devolve o xml corrigido."""
    xml = corrigir_genero_qualificacao(xml, sexo, log)
    xml = inserir_numero_endereco(xml, numero_endereco, log)
    xml = corrigir_dano_moral_extenso(xml, log)
    xml = neutralizar_socioeconomico(xml, log)
    xml = neutralizar_linguagem(xml, log)
    if not idoso:
        xml = remover_marcador_prioridade(xml, log)
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
