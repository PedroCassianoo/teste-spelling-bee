# Documentação do Sistema: Regras do Spelling Bee e Normalização de STT

Este documento estabelece o fluxo de interação do usuário no aplicativo de *Spelling Bee* e funciona como um guia de normalização (*parser*) para o backend ou inteligência artificial interpretar e corrigir falhas de transcrição das APIs de *Speech-to-Text* (STT).

---

## 1. Regras Oficiais de Interação (Fluxo do Usuário)

Para que a entrada de voz seja capturada e validada corretamente, o aluno deve seguir o padrão estrutural de *Spelling Bee*:

1. **Palavra/Frase Inicial:** O aluno pronuncia a palavra ou frase alvo inteira antes de começar a soletrar.
2. **Soletração (Letra por Letra):** O aluno pronuncia cada letra de forma isolada e sequencial.
   - **Espaços entre palavras:** Quando o alvo for uma frase, o aluno deve dizer a palavra **"SPACE"** para indicar a separação entre palavras.
   - **Letras Repetidas:** Para letras em sequência, o aluno deve usar a palavra **"DOUBLE"** seguida da letra correspondente (ex: *double T*, *double O*). O sistema também aceita a soletração repetida literalmente (ex: *T - T*).
3. **Palavra/Frase Final:** O aluno repete a palavra ou frase alvo inteira para finalizar a tentativa.

**Exemplo de Fluxo Esperado (Gabarito da API para *"as tasty as"*):**
> *"As tasty as [pausa] A - S - SPACE - T - A - S - T - Y - SPACE - A - S [pausa] As tasty as."*

---

## 2. Dicionário Embarcado Local (`spelling_dict.json`)

Para eliminar latência de rede e reduzir custos de consultas por palavra no Supabase, a aplicação conta com o `spelling_dict.json` embarcado localmente no frontend:

- **468 palavras e expressões mapeadas.**
- **1.929 variantes fonéticas pré-computadas.**
- **Validação O(1) Instantânea:** Verificação inicial ultrarrápida via `array.includes(userInput)` local antes do fallback para o algoritmo de alinhamento com tolerância acústica ponderada.

---

## 3. Dicionário de Normalização Fonética (De-Para)

As APIs de STT (como Deepgram) utilizam modelos de linguagem que tendem a forçar a junção de fonemas soltos em palavras conhecidas. O sistema aplica o mapeamento abaixo para converter essas "alucinações da API" de volta para o caractere correto **somente durante o bloco de soletração**.

### Alfabeto e Confusões Comuns do STT
| Letra / Comando | Confusões da API (Palavras que o STT transcreve) |
| :--- | :--- |
| **A** | a, ah, aye, eight |
| **B** | be, bee |
| **C** | see, sea, si |
| **D** | de, di, thee |
| **E** | i, he |
| **F** | ef, half, if |
| **G** | jee, gee |
| **H** | aitch, age, eight |
| **I** | eye, aye, ah, I |
| **J** | jay, hey |
| **K** | kay, ok |
| **L** | el, hell |
| **M** | em, am |
| **N** | en, an, and, in |
| **O** | oh, owe, zero |
| **P** | pe, pee, pea |
| **Q** | queue, cue |
| **R** | are, our, ar |
| **S** | **as**, is, yes, ass, es |
| **T** | tea, tee, ti |
| **U** | you, yu |
| **V** | ve, vee |
| **W** | double you, double u |
| **X** | ex, axe |
| **Y** | why, wai |
| **Z** | zee, zed, c |

### Comandos Especiais
| Comando | Confusões da API | Ação do Sistema |
| :--- | :--- | :--- |
| **SPACE** | pace, spice, base, spay | Inserir caractere de espaço ` ` |
| **DOUBLE** | buble, dabble, bobble | Multiplicar a próxima letra identificada (ex: "double" + "tea" = "TT") |

---

## 4. Lógica de Validação Estrita: Fatiamento por Âncora (Palavra + Soletração + Palavra)

Para garantir o cumprimento rigoroso das regras oficiais do *Spelling Bee*, a soletração correta é apenas o passo central de uma estrutura obrigatória de três etapas:

```
[Prefixo: Palavra Alvo] ➔ [Âncora: Soletração com SPACE/DOUBLE] ➔ [Sufixo: Palavra Alvo]
```

O sistema localiza a **âncora de soletração** no meio da frase e avalia separadamente o que foi dito antes (Prefixo) e depois (Sufixo), utilizando tolerância de **70%** nas extremidades para absorver pequenas imperfeições de microfone/STT.

---

## 5. Pipeline de Execução em 5 Etapas

### Passo 1: Tokenização com Rastreamento de Palavras
A transcrição é convertida em tokens rastreando a correspondência exata com as palavras originais da fala (`rawWords`), separando palavras completas de letras isoladas e comandos de soletração (`SPACE`, `DOUBLE`).

### Passo 2: Localização da Âncora de Soletração (Miolo)
O sistema busca a sequência de soletração ideal através de Fast Track e Sliding Window Fuzzy Matching (com tolerância de 85% e matriz acústica).
- Se a soletração for inferior a 85%, o aluno é reprovado de imediato: `❌ Erro na soletração`.

### Passo 3: Verificação Pedagógica de `SPACE`
Em expressões compostas (ex: *"as tasty as"*, *"more slowly"*):
- Se o miolo corresponde a todas as letras mas o comando `SPACE` foi omitido, emite feedback orientador:
  `⚠️ Você esqueceu de falar "SPACE" para separar as palavras da expressão!`

### Passo 4: Fatiamento por Âncora e Avaliação das Extremidades
Com a âncora isolada, o sistema extrai o Prefixo e o Sufixo e calcula a similaridade contra a palavra alvo com threshold de 70%:
- `temInicio = prefixSim >= 0.70`
- `temFim = suffixSim >= 0.70`

### Passo 5: Bloqueios Obrigatórios e Aprovação
- **Faltou ambos:** `❌ Reprovado: Você esqueceu de falar a palavra no início e no final.`
- **Faltou início:** `❌ Reprovado: Faltou falar a palavra antes de soletrar.`
- **Faltou fim:** `❌ Reprovado: Faltou falar a palavra para finalizar.`
- **Completo:** `🎉 Perfeito! Executou os 3 passos rigorosamente: Palavra ➔ Soletração ➔ Palavra!`

---

## 6. Telemetria e Alinhamento Letra a Letra (Feedback Loop - Fase 4)

Cada execução produz um objeto de telemetria `alinhamento`:

```json
[
  { "posicao": 0, "esperado": "T", "ouvido": "tea", "bateu": true, "tipo": "letra" },
  { "posicao": 1, "esperado": "A", "ouvido": "ay", "bateu": true, "tipo": "letra" },
  { "posicao": 2, "esperado": "SPACE", "ouvido": "space", "bateu": true, "tipo": "comando" }
]
```

Os logs são enviados ao Supabase (`logs_validacao_fonetica`) e alimentam a fila `sugestoes_foneticas`, que promove automaticamente novas variantes fonéticas validadas ao atingir o limiar configurado via cron job.
