# -*- coding: utf-8 -*-
"""Plataforma do Corretor de Petições — interface local (Streamlit).

Executar:  streamlit run app.py
Roda 100% local, sem chave de API.
"""
import io
import os
import tempfile

import streamlit as st

from corretor import pipeline, docxio

st.set_page_config(page_title="LexFixer", page_icon="⚖️", layout="wide")

st.title("⚖️ LexFixer")
st.caption("Corretor de petições automáticas — revisão assistida dos 12 pontos, correções e formatação. Roda local, sem chave de API.")

if "arqs" not in st.session_state:
    st.session_state.arqs = None
    st.session_state.analise = None

# ---------------- Passo 1: pasta do cliente ----------------
st.header("1. Pasta do cliente")
pasta = st.text_input("Cole o caminho da pasta do cliente",
                      placeholder=r"C:\Users\...\Desktop\pasta teste\FULANO X BANCO ...")
col1, col2 = st.columns([1, 3])
if col1.button("🔍 Analisar", type="primary", disabled=not pasta):
    if not os.path.isdir(pasta):
        st.error("Pasta não encontrada.")
    else:
        arqs = pipeline.descobrir_arquivos(pasta)
        if not arqs.get("peticao"):
            st.error("Não encontrei a petição (.docx) na pasta.")
        else:
            st.session_state.arqs = arqs
            st.session_state.pasta = pasta
            st.session_state.analise = pipeline.analisar(arqs)

if st.session_state.arqs:
    arqs = st.session_state.arqs
    pet, plan, ext = st.session_state.analise

    with st.expander("Arquivos encontrados", expanded=True):
        for k, v in arqs.items():
            st.write(f"**{k}:** {os.path.basename(v) if v else '— não encontrado —'}")

    # ---------------- Passo 2: dados extraídos + RG ----------------
    st.header("2. Dados extraídos e identidade")
    ce, cd = st.columns(2)
    with ce:
        st.subheader("Petição")
        st.write({
            "Endereçamento": "Juizado" if pet.get("endereco_juizado") else ("Vara Comum" if pet.get("endereco_vara_comum") else "?"),
            "Comarca": pet.get("comarca"),
            "RG": pet.get("rg"), "CPF": pet.get("cpf"),
            "Agência/Conta": f"{pet.get('agencia')} / {pet.get('conta')}",
            "Endereço": pet.get("endereco_logradouro"),
            "Tem nº?": pet.get("endereco_tem_numero"),
            "Período": " a ".join([x for x in pet.get("periodo", []) if x]),
            "Valor da causa": pet.get("valor_causa"),
            "Marcador [PRIORIDADE]": pet.get("marcador_prioridade"),
        })
        st.subheader("Tabela / Extrato")
        st.write({
            "Total": plan.get("total"), "Soma conferida": plan.get("soma_conferida"),
            "Dobro": plan.get("dobro"), "Rubricas": plan.get("rubricas"),
            "Extrato ag/cc": f"{ext.get('agencia')} / {ext.get('conta')}",
        })
    with cd:
        st.subheader("Documento de identidade (confira e informe abaixo)")
        if arqs.get("docs"):
            try:
                imgs = docxio.pdf_paginas_png(arqs["docs"], dpi=150, max_paginas=4)
                for im in imgs[:2]:
                    st.image(im, use_container_width=True)
                if len(imgs) > 2:
                    with st.expander("ver mais páginas do kit"):
                        for im in imgs[2:]:
                            st.image(im, use_container_width=True)
            except Exception as e:
                st.warning(f"Não consegui renderizar as imagens: {e}")
        else:
            st.info("Kit de documentos pessoais não encontrado.")

    # ---------------- Passo 3: inputs do operador ----------------
    st.header("3. Confirmação (olhando o RG)")
    with st.form("dados_op"):
        c1, c2, c3 = st.columns(3)
        sexo = c1.radio("Sexo", ["F", "M"], horizontal=True)
        nasc = c2.text_input("Data de nascimento (dd/mm/aaaa)", placeholder="16/05/1961")
        numero = c3.text_input("Nº da residência (se faltar)",
                               value="" if pet.get("endereco_tem_numero") else "")
        gerar = st.form_submit_button("✅ Conferir e gerar peça corrigida", type="primary")

    # ---------------- Passo 4: processa ----------------
    if gerar:
        if not nasc.strip():
            st.error("Informe a data de nascimento (necessária para checar prioridade/idoso).")
        else:
            op = {"sexo": sexo, "nascimento": nasc.strip(),
                  "numero_endereco": numero.strip() or None, "forcar_vara_comum": False}
            base = os.path.splitext(arqs["peticao"])[0]
            destino = base + " - CORRIGIDA.docx"
            chk, acoes, rel, snip = pipeline.processar(arqs, op, destino)

            r = chk["resumo"]
            m1, m2, m3, m4 = st.columns(4)
            m1.metric("OK", r["OK"]); m2.metric("Atenção", r["ATENCAO"])
            m3.metric("A corrigir", r["CORRIGIR"]); m4.metric("Idade", f"{chk['idade']}" + (" (idoso)" if chk["idoso"] else ""))

            st.header("4. Relatório de conferência")
            st.markdown(rel)

            st.success(f"Peça corrigida salva em: {destino}")
            with open(destino, "rb") as f:
                st.download_button("⬇️ Baixar peça corrigida (.docx)", f.read(),
                                   file_name=os.path.basename(destino),
                                   mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
            st.download_button("⬇️ Baixar relatório (.md)", rel.encode("utf-8"),
                               file_name="RELATORIO.md", mime="text/markdown")
            if snip:
                st.warning("Cliente idoso: revise e insira os itens de prioridade (estão no relatório).")

st.divider()
st.caption("Nenhuma peça deve ser protocolada sem revisão humana dos pontos em ⚠️/🔧. Consulte o MANUAL para as regras.")
