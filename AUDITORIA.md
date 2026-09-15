# Auditoria de qualidade — LexFixer

**Regra:** *toda* alteração no app (motor Python em `corretor/`, motor web em
`js/engine.js`, ou a interface `js/app.js`) deve passar por esta auditoria
**antes de publicar**. Se algo reprovar, corrige-se antes do deploy.

## 1. Auditoria automática (obrigatória)

Rode os dois, na raiz do projeto:

```bash
python tests/auditoria.py      # audita TODAS as correções (fixtures sintéticas)
python tests/test_socio.py     # regressão da individualização socioeconômica
```

Ambos saem com código **0** se tudo passar e **1** se algo falhar (lista o que
reprovou). `auditoria.py` cobre, por recurso:

- **Gênero/qualificação** (BRASILEIRO(A) conforme sexo)
- **Número do endereço** (insere e não duplica)
- **Dano moral por extenso** (quinze mil reais)
- **Marcador [PRIORIDADE]** (remoção)
- **Linguagem neutra** (parte autora / parte requerente)
- **Socioeconômico** (abre a seção de gratuidade, reposiciona template do meio,
  não duplica, avisa quando não há âncora)
- **Endereçamento** (Juizado ↔ Vara Comum)
- **ANP** → sempre Vara Comum (detecção)
- **Revisão** (ortografia curada, pronomes de tratamento, tipografia, remoção de
  traços/underscores, latim em itálico)
- **Formatação** (espaçamento 1,15 em qualquer valor; colapso de vazios;
  preserva quebra de página; keepNext em títulos; tabelas centralizadas/inteiras)
- **Pipeline completo** (XML bem-formado no fim)

## 2. Casos reais (recomendado no PC do escritório)

`scratchpad/harness.py` roda o pipeline nos 7 backups reais
(Lucia, André, Leonardo, Manoel, Deyvid, Rocimildo, Irlane) e confere os
marcadores. Espera-se **7/7 PASS** com `XML=OK`. (Usa arquivos locais; não vai
para o repositório por conter dados de cliente.)

## 3. Paridade do motor web (obrigatória quando mexer em `js/engine.js`)

O motor web precisa produzir o **mesmo resultado** do Python. Suba um servidor
local (`python -m http.server`) e, no navegador, confira via `LEX.*`
(`LEX.corrigir`, `LEX.formatarTudo`, `LEX.extrairPeticao`) os mesmos itens da
auditoria — no mínimo: espaçamento 360→276, colapso de vazios, revisão
(ortografia/underscores/latim), endereçamento comum e detecção de ANP.
**Regra de ouro:** toda mudança em `corretor/` deve ter espelho em
`js/engine.js` e vice-versa.

## 4. Checklist manual (itens que dependem de navegador/rede — não automatizáveis)

- [ ] **Rodapé mostra a versão nova** (`#versao`) e o `?v=` dos scripts foi
      bumpado no `index.html` (cache-busting).
- [ ] **Sem erros no console** ao carregar e ao gerar uma peça.
- [ ] **Leitura de arquivos** funciona pelas três vias: seleção de arquivos
      (Ctrl+A, principal para servidor de rede), "Abrir a pasta" (Chrome/Edge) e
      seleção de pasta; arquivo grande é lido em pedaços (256 KB).
- [ ] **Nome curto 8.3** (ex.: `1PETIO~1.DOC`) é reconhecido como petição.
- [ ] **OCR** da CNH/RG lê a data de nascimento (Tesseract via jsdelivr).
- [ ] **Peça gerada abre no Word** sem corromper.

## 5. Ao final

Só publicar (git push) com **auditoria automática APROVADA** + **checklist manual
ok**. Registrar no commit o que foi auditado.
