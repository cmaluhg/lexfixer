# -*- coding: utf-8 -*-
"""Uso por linha de comando (para lotes/teste):

  python run_cli.py "CAMINHO/DA/PASTA/DO/CLIENTE" --sexo F --nasc 16/05/1961 --numero 52

Gera na própria pasta:  <peticao> - CORRIGIDA.docx  e  RELATORIO.md
"""
import argparse
import os
import sys

from corretor import pipeline


def main():
    ap = argparse.ArgumentParser(description="Corretor de petições — linha de comando")
    ap.add_argument("pasta", help="pasta do cliente")
    ap.add_argument("--sexo", required=True, choices=["M", "F", "m", "f"])
    ap.add_argument("--nasc", required=True, help="data de nascimento dd/mm/aaaa")
    ap.add_argument("--numero", default=None, help="número da residência (se faltar)")
    args = ap.parse_args()

    arqs = pipeline.descobrir_arquivos(args.pasta)
    if not arqs.get("peticao"):
        print("ERRO: não encontrei a petição .docx na pasta."); sys.exit(1)
    base = os.path.splitext(arqs["peticao"])[0]
    destino = base + " - CORRIGIDA.docx"
    op = {"sexo": args.sexo.upper(), "nascimento": args.nasc,
          "numero_endereco": args.numero, "forcar_vara_comum": False}
    chk, acoes, rel, snip = pipeline.processar(arqs, op, destino)
    with open(os.path.join(args.pasta, "RELATORIO.md"), "w", encoding="utf-8") as f:
        f.write(rel)
    print("OK ->", destino)
    print("Resumo:", chk["resumo"], "| idade", chk["idade"], "idoso", chk["idoso"])
    print("Relatório: RELATORIO.md")


if __name__ == "__main__":
    main()
