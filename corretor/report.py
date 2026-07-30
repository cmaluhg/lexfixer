# -*- coding: utf-8 -*-
"""Monta o relatório de conferência/correção em Markdown."""

ICON = {"OK": "✅", "ATENCAO": "⚠️", "CORRIGIR": "🔧"}


def montar(cliente, pet, plan, chk, acoes, snippets=None):
    L = []
    L.append(f"# Relatório de Correção — {cliente}\n")
    r = chk["resumo"]
    L.append(f"**Resumo:** {r['OK']} OK · {r['ATENCAO']} atenção · {r['CORRIGIR']} a corrigir  ")
    if chk.get("idade") is not None:
        L.append(f"**Idade:** {chk['idade']} anos {'(IDOSO)' if chk['idoso'] else ''}  ")
    L.append("")
    L.append("## Conferência dos 12 pontos\n")
    L.append("| # | Ponto | Status | Observação |")
    L.append("|---|-------|--------|------------|")
    for a in chk["achados"]:
        msg = a["msg"].replace("|", "/")
        L.append(f"| {a['n']} | {a['ponto']} | {ICON.get(a['status'],'')} {a['status']} | {msg} |")
    L.append("")
    L.append("## Correções aplicadas automaticamente\n")
    if acoes:
        for x in acoes:
            L.append(f"- {x}")
    else:
        L.append("- (nenhuma)")
    L.append("")
    if snippets:
        L.append("## ⚠️ Itens de idoso — revisar e inserir\n")
        L.append("**Cabeçalho:** " + snippets["cabecalho"] + "\n")
        L.append("**Tópico (após a Inversão do Ônus):** " + snippets["topico"] + "\n")
        L.append("**Pedido (após juros/correção):** " + snippets["pedido"] + "\n")
    L.append("---")
    L.append("_Conferir sempre a identidade pela imagem. Nada deve ser protocolado sem revisão humana dos pontos em ⚠️/🔧._")
    return "\n".join(L)
