# -*- coding: utf-8 -*-
"""Conversão de valores monetários (R$) para extenso, em português do Brasil."""

_UNI = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
        "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis",
        "dezessete", "dezoito", "dezenove"]
_DEZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta",
        "setenta", "oitenta", "noventa"]
_CEM = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos",
        "seiscentos", "setecentos", "oitocentos", "novecentos"]


def _ate_999(n):
    if n == 0:
        return ""
    if n == 100:
        return "cem"
    partes = []
    c, resto = divmod(n, 100)
    if c:
        partes.append(_CEM[c])
    if resto:
        if resto < 20:
            partes.append(_UNI[resto])
        else:
            d, u = divmod(resto, 10)
            partes.append(_DEZ[d] + (" e " + _UNI[u] if u else ""))
    return " e ".join(partes)


def _inteiro_extenso(n):
    if n == 0:
        return "zero"
    grupos = []
    escala = [("", ""), ("mil", "mil"),
              ("milhão", "milhões"), ("bilhão", "bilhões")]
    i = 0
    partes = []
    while n > 0:
        n, g = divmod(n, 1000)
        if g:
            texto = _ate_999(g)
            sing, plur = escala[i]
            if i == 1:  # mil
                partes.insert(0, ("mil" if g == 1 else texto + " mil"))
            elif i >= 2:
                nome = sing if g == 1 else plur
                partes.insert(0, texto + " " + nome)
            else:
                partes.insert(0, texto)
        i += 1
    # junta com vírgulas/e conforme praxe simples
    return " e ".join([p for p in partes if p]) if len(partes) <= 1 else ", ".join(partes[:-1]) + " e " + partes[-1]


def valor_por_extenso(valor):
    """Recebe float/str (ex.: 15000, '305,20', 796.4) e devolve o extenso em reais.

    Ex.: 15000 -> 'quinze mil reais'; 305.20 -> 'trezentos e cinco reais e vinte centavos'.
    """
    if isinstance(valor, str):
        v = valor.strip().replace("R$", "").replace(".", "").replace(" ", "").replace(",", ".")
        valor = float(v)
    reais = int(valor)
    centavos = int(round((valor - reais) * 100))
    if centavos == 100:
        reais += 1
        centavos = 0
    partes = []
    if reais:
        partes.append(_inteiro_extenso(reais) + (" real" if reais == 1 else " reais"))
    if centavos:
        partes.append(_inteiro_extenso(centavos) + (" centavo" if centavos == 1 else " centavos"))
    if not partes:
        return "zero real"
    return " e ".join(partes)


if __name__ == "__main__":
    for x in [15000, 305.20, 796.4, 1170.92, 240, 111.95, 610.40, 469.24, 1, 100, 2341.84]:
        print(x, "->", valor_por_extenso(x))
