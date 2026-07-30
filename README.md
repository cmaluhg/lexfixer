# ⚖️ Corretor de Petições Automáticas

Plataforma **local** (roda no navegador, sem chave de API) para a equipe revisar e corrigir,
de forma **rápida e assistida**, as petições iniciais geradas automaticamente — aplicando o
checklist dos **12 pontos**, as correções de conteúdo e o padrão de formatação do escritório.

> Fluxo **assistido**: a ferramenta confere tudo, sinaliza e já aplica as correções seguras;
> a equipe confirma os pontos de julgamento (idade/idoso, endereçamento em rubrica dúbia) e
> baixa a peça corrigida + o relatório. **Nada é protocolado sem revisão humana.**

---

## O que a plataforma faz

1. **Lê** a pasta do cliente (petição `.docx`, tabela `.xlsx`, extrato `.pdf`, kit de documentos `.pdf`).
2. **Extrai** e mostra: qualificação, agência/conta, rubrica, valores, período, valor da causa, etc.
3. **Mostra a imagem do RG/CIN** para a equipe informar **data de nascimento** e **sexo**.
4. **Confere os 12 pontos** e gera um relatório (✅ OK / ⚠️ atenção / 🔧 corrigir).
5. **Aplica correções automáticas seguras:**
   - gênero na qualificação (BRASILEIRO/A, SOLTEIRO/A, CASADO/A…);
   - número da residência;
   - dano moral por extenso (`R$ 15.000,00 (quinze mil reais)`);
   - remoção do marcador `[PRIORIDADE]` quando **não** idoso;
   - neutralização da linguagem (*a parte autora / a parte requerente*);
   - formatação: **espaçamento 1,15**, **tabelas centralizadas e inteiras numa página**,
     **títulos nunca separados** do texto.
6. **Idoso (60+):** entrega os **itens de prioridade prontos** (cabeçalho, tópico e pedido) para revisão/inserção.
7. **Baixa** a peça corrigida (`.docx`) e o relatório (`.md`).

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
