# -*- coding: utf-8 -*-
"""Revisão ortográfica/tipográfica e de formatação (determinística).

Baseada nas referências indicadas (VOLP/gramática normativa, latim forense em
itálico, pronomes de tratamento do Manual da Presidência). Corrige apenas erros
inequívocos, SEM alterar o sentido/redação do texto. O que exige julgamento
(rebuscamento, parágrafo muito longo) é devolvido como AVISO, não é alterado.
"""
import re

# Erros ortográficos inequívocos (forma errada -> forma VOLP). Curado e conservador.
CURADO = {
    "excessão": "exceção", "excessões": "exceções", "excessao": "exceção",
    "atravéz": "através", "atravez": "através",
    "concerteza": "com certeza",
    "previlégio": "privilégio", "previlegio": "privilégio",
    "beneficiente": "beneficente",
    "haja visto": "haja vista",
    "seje": "seja",
    "propor a presente ação": "propor a presente ação",  # placeholder inócuo
}
# (remove o placeholder para não poluir)
CURADO.pop("propor a presente ação", None)

# Pronomes de tratamento (sempre capitalizados)
def _tratamento(t):
    t = re.sub(r"\bvossa excel[êe]ncia\b", "Vossa Excelência", t, flags=re.I)
    t = re.sub(r"\bexcelent[íi]ssimo\b", "Excelentíssimo", t, flags=re.I)
    t = re.sub(r"\bmerit[íi]ssimo\b", "Meritíssimo", t, flags=re.I)
    t = re.sub(r"\bvossa senhoria\b", "Vossa Senhoria", t, flags=re.I)
    return t

_TXT = re.compile(r"(<w:t[^>]*>)([^<]*)(</w:t>)")
_RUN = re.compile(r"<w:r>(<w:rPr>.*?</w:rPr>)?(<w:t[^>]*>)([^<]*)(</w:t>)</w:r>", re.S)
_LATIM = re.compile(
    r"\b(fumus\s+bon[io]s?\s+[ij]uris|periculum\s+in\s+mora|inaudita\s+altera\s+parte|"
    r"in\s+re\s+ipsa|ex\s+positis|ex\s+tunc|ex\s+nunc|data\s+(?:m[áa]xima\s+)?venia|"
    r"mutatis\s+mutandis|ad\s+causam|erga\s+omnes)\b", re.I)
_ITAL_RPR = ('<w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Arial" w:hAnsi="Arial" '
             'w:cs="Arial"/><w:i/><w:iCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>')


def _corrigir_texto(t, stats):
    orig = t
    t = _tratamento(t)
    for w, r in CURADO.items():
        def rep(m):
            s = m.group(0)
            return (r[:1].upper() + r[1:]) if s[:1].isupper() else r
        t = re.sub(r"\b" + re.escape(w) + r"\b", rep, t, flags=re.I)
    # traços/underscores de preenchimento (linha "____" — indício de IA)
    t = re.sub(r"_{2,}", " ", t)
    # tipografia
    t = re.sub(r" {2,}", " ", t)                 # espaços múltiplos
    t = re.sub(r" +([,;:.!?])", r"\1", t)         # espaço antes de pontuação
    t = re.sub(r"([!?])\1{1,}", r"\1", t)          # pontuação repetida
    if t != orig:
        stats[0] += 1
    return t


def _italico_latim(xml, log):
    achados = set()

    def sub(m):
        rpr, topen, text, tclose = m.group(1) or "", m.group(2), m.group(3), m.group(4)
        if "<w:i/>" in rpr:
            return m.group(0)
        ms = list(_LATIM.finditer(text))
        if not ms:
            return m.group(0)
        out, last = [], 0
        for mt in ms:
            s, e = mt.start(), mt.end()
            achados.add(mt.group(0).strip())
            if s > last:
                out.append('<w:r>%s<w:t xml:space="preserve">%s</w:t></w:r>' % (rpr, text[last:s]))
            out.append('<w:r>%s<w:t xml:space="preserve">%s</w:t></w:r>' % (_ITAL_RPR, text[s:e]))
            last = e
        if last < len(text):
            out.append('<w:r>%s<w:t xml:space="preserve">%s</w:t></w:r>' % (rpr, text[last:]))
        return "".join(out)

    novo = _RUN.sub(sub, xml)
    if achados:
        log.append("Itálico em latinismos: " + ", ".join(sorted(achados)))
    return novo


def _avisos(xml):
    avisos = []
    # parágrafos muito longos (leitura em tela / PJe)
    longos = 0
    for pm in re.finditer(r"<w:p\b[^>]*>.*?</w:p>", xml, re.S):
        txt = "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", pm.group(0)))
        if len(txt) > 1200:
            longos += 1
    if longos:
        avisos.append("⚠️ %d parágrafo(s) muito longo(s) — considerar quebrar para leitura em tela (PJe)." % longos)
    # expressões rebuscadas (não alterado — apenas sugestão)
    texto = " ".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", xml)).lower()
    rebusc = [e for e in ["peça exordial", "esposar o entendimento", "compulsar os autos",
                          "de per si", "data maxima venia"] if e in texto]
    if rebusc:
        avisos.append("⚠️ Expressão(ões) rebuscada(s) (sugestão, não alterado): " + ", ".join(rebusc))
    return avisos


def revisar(xml, log):
    """Aplica revisão ortográfica/tipográfica + itálico em latim; adiciona avisos ao log."""
    stats = [0]
    tracos = len(re.findall(r"_{2,}", "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", xml))))
    xml = _TXT.sub(lambda m: m.group(1) + _corrigir_texto(m.group(2), stats) + m.group(3), xml)
    if tracos:
        log.append("Removido(s) %d traço(s) de preenchimento (underscores — indício de IA)" % tracos)
    if stats[0]:
        log.append("Revisão ortográfica/tipográfica: %d trecho(s) ajustado(s)" % stats[0])
    xml = _italico_latim(xml, log)
    for a in _avisos(xml):
        log.append(a)
    return xml
