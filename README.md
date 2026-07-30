# ⚖️ LexFixer — Corretor de Petições Automáticas

Plataforma para a equipe revisar e corrigir, de forma **rápida e assistida**, as petições iniciais
geradas automaticamente — aplicando o checklist dos **12 pontos**, as correções de conteúdo e o
padrão de formatação do escritório.

## 🌐 Versão web (GitHub Pages) — recomendada

O `index.html` é uma **plataforma 100% no navegador**: nada é instalado, não há servidor nem chave
de API, e **nenhum arquivo sai do computador** (todo o processamento é local, no browser).

**Publicar no GitHub Pages:** no repositório, vá em **Settings → Pages → Source: “Deploy from a
branch” → Branch: `main` / `/root` → Save**. Em ~1 minuto o site fica disponível em
`https://cmaluhg.github.io/lexfixer/`.

**Usar:** abrir o site → **selecionar a pasta do cliente** → conferir os dados e o RG → informar
**sexo** e **data de nascimento** → **gerar peça corrigida** e baixar o `.docx` + o relatório.
Bibliotecas (JSZip, SheetJS, pdf.js) são carregadas por CDN.

> Requer navegador baseado em Chromium (Chrome/Edge) para selecionar a pasta.

---

## 💻 Versão local (Python/Streamlit) — alternativa

Mesma lógica, rodando localmente. Útil para lotes (CLI) ou uso offline sem depender de CDN.

> Fluxo **assistido**: a ferramenta confere tudo, sinaliza e já aplica as correções seguras;
> a equipe confirma os pontos de julgamento (idade/idoso, endereçamento em rubrica dúbia) e
> baixa a peça corrigida + o relatório. **Nada é protocolado sem revisão humana.**

---

## O que a plataforma faz

1. **Lê** a pasta do cliente (petição `.docx`, tabela `.xlsx`, extrato `.pdf`, kit de documentos `.pdf`).
2. **Extrai** e mostra: qualificação, agência/conta, rubrica, valores, período, valor da causa, etc.
3. **Mostra a imagem do RG/CIN** para a equipe informar **data de nascimento** e **sexo**.
4. **Confere os 12 pontos** e gera um relatório (✅ OK / ⚠️ atenção / 🔧 corrigir).
5. **Aplica as correções automaticamente** (reproduzindo a correção manual):
   - **endereçamento** (Juizado × Vara Comum) pela regra do valor + exceção de rubrica;
   - **cabeçalho**: inclui Gratuidade/Inversão que faltarem;
   - **gênero** na qualificação (BRASILEIRO/A, SOLTEIRO/A, CASADO/A…) + **número da residência**;
   - **socioeconômico**: usa o `socio economico.docx`, individualiza, neutraliza e insere/substitui;
   - **valores por extenso** (dano moral, total, dobro, valor da causa) — verifica e corrige;
   - **neutralização** da linguagem (*a parte autora / a parte requerente*);
   - **renumeração** dos pedidos quando há letra faltando;
   - **formatação**: espaçamento 1,15, tabelas centralizadas e inteiras numa página, títulos nunca separados.
6. **Idoso (60+):** insere **automaticamente** o pedido no cabeçalho, o tópico da prioridade
   (após a Inversão do Ônus) e o pedido de prioridade (após juros/correção). Não idoso: remove o marcador `[PRIORIDADE]`.
7. **Baixa** a peça corrigida (`.docx`) e o relatório (`.md`).

> Validado contra os 7 casos reais já corrigidos manualmente (Lucia, André, Leonardo, Manoel, Deyvid, Rocimildo, Irlane) — a saída reproduz as correções.

---

## Instalação

Pré-requisito: **Python 3.10+**.

```bash
# 1) clonar
git clone https://github.com/SEU-USUARIO/corretor-peticoes.git
cd corretor-peticoes

# 2) (opcional) ambiente virtual
python -m venv .venv
# Windows:
.venv\Scripts\activate

# 3) dependências
pip install -r requirements.txt
```

## Como usar

```bash
streamlit run app.py
```

Abre no navegador (`http://localhost:8501`). Cole o caminho da pasta do cliente, confira os dados,
informe **nascimento** e **sexo** olhando o RG, e clique em **gerar peça corrigida**.

### Uso por linha de comando (lotes/teste)

```bash
python run_cli.py "C:\...\FULANO X BANCO ..." --sexo F --nasc 16/05/1961 --numero 52
```

---

## Estrutura

```
corretor-peticoes/
├─ app.py                 # interface Streamlit
├─ run_cli.py             # uso por linha de comando
├─ requirements.txt
└─ corretor/              # núcleo (regras)
   ├─ extract.py          # extrai dados da petição/planilha/extrato
   ├─ checks.py           # confere os 12 pontos
   ├─ corrections.py      # correções de conteúdo
   ├─ formatting.py       # espaçamento, tabelas, títulos juntos
   ├─ extenso.py          # valores por extenso (R$)
   ├─ report.py           # relatório em Markdown
   ├─ docxio.py           # leitura/gravação de .docx/.xlsx/.pdf
   └─ pipeline.py         # orquestra tudo
```

## Observações importantes

- As **regras** seguem o *Manual de Correção de Petições Automáticas* do escritório.
- A **conferência da identidade é humana** (a equipe lê o RG na imagem) — mais preciso e sem custo.
- O **endereçamento em rubricas dúbias** (ex.: financiamento/antecipação) é sempre sinalizado
  para decisão do advogado.
- O arquivo **original nunca é apagado**: a peça corrigida é salva com o sufixo `- CORRIGIDA`.
