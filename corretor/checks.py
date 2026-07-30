# -*- coding: utf-8 -*-
"""Conferência dos 12 pontos do POP a partir dos dados extraídos + inputs do operador."""
from datetime import date

TETO_JUIZADO = 64840.00
RUBRICAS_EXCECAO = ["MORA", "ENCARGOS", "REFINANCIAMENTO", "ANP", "RMC", "RCC"]

OK, ATENCAO, CORRIGIR = "OK", "ATENCAO", "CORRIGIR"


def idade_em(nascimento_ddmmaaaa, hoje=None):
    if not nascimento_ddmmaaaa:
        return None
    try:
        d, m, a = [int(x) for x in nascimento_ddmmaaaa.replace("-", "/").split("/")]
        b = date(a, m, d)
    except Exception:
        return None
    hoje = hoje or date.today()
    return hoje.year - b.year - ((hoje.month, hoje.day) < (b.month, b.day))


def _f(n, ponto, status, msg):
    return {"n": n, "ponto": ponto, "status": status, "msg": msg}


def conferir(pet, plan, extrato, op):
    """pet/plan/extrato: dicts de extract.*  |  op: inputs do operador.

    op = {sexo:'M'/'F', nascimento:'dd/mm/aaaa', numero_endereco:str|None,
          forcar_vara_comum: bool|None}
    """
    ach = []
    idade = idade_em(op.get("nascimento"))
    idoso = idade is not None and idade >= 60
    rub_txt = (pet.get("rubrica_texto") or "").upper()
    rub_plan = " ".join(plan.get("rubricas", [])).upper()
    tem_excecao = any(k in rub_txt or k in rub_plan for k in RUBRICAS_EXCECAO)

    # PONTO 1 - endereçamento
    vc = pet.get("valor_causa")
    if tem_excecao:
        alvo = "Vara Cível Comum (exceção de rubrica)"
        ok = pet.get("endereco_vara_comum")
    elif vc is not None:
        alvo = "Juizado Especial Cível" if vc <= TETO_JUIZADO else "Vara Cível Comum"
        ok = pet.get("endereco_juizado") if vc <= TETO_JUIZADO else pet.get("endereco_vara_comum")
    else:
        alvo, ok = "?", None
    if tem_excecao:
        ach.append(_f(1, "Endereçamento", ATENCAO if not ok else OK,
                      f"Rubrica pode cair na EXCEÇÃO ({', '.join([k for k in RUBRICAS_EXCECAO if k in rub_txt or k in rub_plan])}) → recomendado {alvo}. Confirme com o advogado."))
    elif ok:
        ach.append(_f(1, "Endereçamento", OK, f"Correto: {alvo} (valor da causa R$ {vc:.2f})."))
    else:
        ach.append(_f(1, "Endereçamento", CORRIGIR, f"Deveria ser {alvo} (valor da causa R$ {vc:.2f})."))

    # PONTO 2 - preliminares
    faltas = []
    if not pet.get("header_gratuidade"): faltas.append("Gratuidade")
    if not pet.get("header_inversao"): faltas.append("Inversão do Ônus")
    if idoso and not pet.get("header_prioridade_idoso"): faltas.append("Prioridade: Idoso")
    ach.append(_f(2, "Pedidos preliminares", OK if not faltas else CORRIGIR,
                  "Todos presentes." if not faltas else "Faltando no cabeçalho: " + ", ".join(faltas)))

    # PONTO 3 - qualificação
    q = []
    if pet.get("gen_brasileiro_marcado") or pet.get("gen_estadocivil_marcado"):
        q.append("gênero genérico BRASILEIRO(A)/estado civil (A) → ajustar conforme sexo")
    if not pet.get("endereco_tem_numero"):
        q.append("número da residência ausente")
    ach.append(_f(3, "Qualificação", OK if not q else CORRIGIR,
                  "OK (conferir nome/RG/CPF na imagem)." if not q else "; ".join(q)))

    # PONTO 4 - dados bancários
    if extrato and extrato.get("agencia"):
        okb = (pet.get("agencia") == extrato.get("agencia") and
               (pet.get("conta") or "").replace(".", "") == (extrato.get("conta") or "").replace(".", ""))
        ach.append(_f(4, "Dados bancários", OK if okb else ATENCAO,
                      f"Peça: ag {pet.get('agencia')} / cc {pet.get('conta')} | Extrato: ag {extrato.get('agencia')} / cc {extrato.get('conta')}"))
    else:
        ach.append(_f(4, "Dados bancários", ATENCAO, "Não foi possível ler agência/conta do extrato — conferir manualmente."))

    # PONTO 5 - rubrica
    if plan.get("rubricas"):
        ach.append(_f(5, "Nome da rubrica", ATENCAO,
                      "Conferir se a rubrica da peça bate com o extrato. Planilha: " + "; ".join(plan["rubricas"])))
    else:
        ach.append(_f(5, "Nome da rubrica", ATENCAO, "Conferir a rubrica contra o extrato."))

    # PONTO 6 - tabela
    total, dobro, soma = plan.get("total"), plan.get("dobro"), plan.get("soma_conferida")
    p6 = OK
    m6 = f"Total R$ {total} | Soma conferida R$ {soma} | Dobro R$ {dobro}"
    if soma is not None and total is not None and abs(soma - total) > 0.01:
        p6 = CORRIGIR; m6 += " — SOMA ≠ TOTAL!"
    if total is not None and dobro is not None and abs(dobro - total * 2) > 0.01:
        p6 = CORRIGIR; m6 += " — DOBRO ≠ TOTAL×2!"
    ach.append(_f(6, "Tabela de valores", p6, m6))

    # PONTO 7 - período/datas
    ini, fim = pet.get("periodo")
    ach.append(_f(7, "Dano material/datas", OK if (ini and fim) else ATENCAO,
                  f"Período no texto: {ini} a {fim} (conferir com a tabela)."))

    # PONTO 8 - socioeconômico (verificado na correção)
    ach.append(_f(8, "Socioeconômico", ATENCAO, "Individualizar e neutralizar (aplicado na etapa de correção)."))

    # PONTO 9/12 - idoso
    if idoso:
        ach.append(_f(9, "Prioridade (texto)", CORRIGIR if not pet.get("header_prioridade_idoso") else OK,
                      f"Cliente idoso ({idade} anos) → incluir tópico e pedido de prioridade."))
        ach.append(_f(12, "Prioridade (pedido)", CORRIGIR, f"Incluir pedido de prioridade (idade {idade})."))
    else:
        st = ATENCAO if pet.get("marcador_prioridade") else OK
        msg = f"Não idoso ({idade} anos)." if idade is not None else "Idade não informada."
        if pet.get("marcador_prioridade"):
            msg += " Remover marcador [PRIORIDADE] da peça."
        ach.append(_f(9, "Prioridade (texto/idoso)", st, msg))

    # PONTO 10 - dano moral extenso
    if pet.get("dano_moral_vazio"):
        ach.append(_f(10, "Dano moral por extenso", CORRIGIR, "Dano moral sem valor por extenso: 'R$ 15.000,00 ()'."))
    else:
        ach.append(_f(10, "Dano moral por extenso", OK, "Valor por extenso presente."))

    # PONTO 11 - pedidos: sequência de letras + coerência do valor pedido
    letras = pet.get("pedidos_letras") or []
    esperado = [chr(ord('a') + i) for i in range(len(letras))]
    seq_ok = letras == esperado
    m11 = "Letras dos pedidos em sequência." if seq_ok else f"Sequência de letras irregular: {letras}"
    st11 = OK if seq_ok else CORRIGIR
    vrep = pet.get("valor_repeticao_pedido")
    if vrep is not None and dobro is not None and abs(vrep - dobro) > 0.01 and abs(vrep - (total or -1)) < 0.01:
        st11 = ATENCAO
        m11 += f" | Pedido de repetição pede R$ {vrep} (simples); o dobro é R$ {dobro} — confirmar."
    ach.append(_f(11, "Valores nos pedidos", st11, m11))

    return {"achados": ach, "idade": idade, "idoso": idoso,
            "tem_excecao": tem_excecao,
            "resumo": {"OK": sum(a["status"] == OK for a in ach),
                       "ATENCAO": sum(a["status"] == ATENCAO for a in ach),
                       "CORRIGIR": sum(a["status"] == CORRIGIR for a in ach)}}
