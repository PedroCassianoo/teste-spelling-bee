# Documentação do Sistema: Regras do Spelling Bee e Normalização de STT

Este documento estabelece o fluxo de interação do usuário no aplicativo de *Spelling Bee* e funciona como um guia de normalização (*parser*) para o backend ou inteligência artificial interpretar e corrigir falhas de transcrição das APIs de *Speech-to-Text* (STT).

---

## 1. Regras Oficiais de Interação (Fluxo do Usuário)

Para que a entrada de voz seja capturada e validada corretamente, o aluno deve seguir o padrão estrutural de *Spelling Bee*:

1. **Palavra/Frase Inicial:** O aluno pronuncia a palavra ou frase alvo inteira antes de começar a soletrar.
2. **Soletração (Letra por Letra):** O aluno pronuncia cada letra de forma isolada e sequencial.
   - **Espaços entre palavras:** Quando o alvo for uma frase, o aluno deve dizer a palavra **"SPACE"** para indicar a separação entre palavras.
   - **Letras Repetidas:** Para letras em sequência, o aluno deve usar a palavra **"DOUBLE"** seguida da letra correspondente (ex: *double T*, *double O*). O sistema também deve aceitar a soletração repetida literalmente (ex: *T - T*).
3. **Palavra/Frase Final:** O aluno repete a palavra ou frase alvo inteira para finalizar a tentativa.

**Exemplo de Fluxo Esperado (Gabarito da API para *"as tasty as"*):**
> *"As tasty as [pausa] A - S - SPACE - T - A - S - T - Y - SPACE - A - S [pausa] As tasty as."*

---

## 2. Dicionário de Normalização Fonética (De-Para)

As APIs de STT (como Deepgram) utilizam modelos de linguagem que tendem a forçar a junção de fonemas soltos em palavras conhecidas. O sistema deve aplicar o mapeamento abaixo para converter essas "alucinações da API" de volta para o caractere correto **somente durante o bloco de soletração**.

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

## 3. Lógica de Validação Definitiva: Busca por Substring & Janela Deslizante (Sliding Window)

Para um briefing de centenas ou milhares de palavras, tentar recortar e limpar perfeitamente as bordas com Regex falha quando a API de STT sofre pequenas distorções no início ou no fim da fala (ex: *"s a a s ... s a s"*).

A arquitetura oficial adota o princípio do **Scanner Inteligente**:
O sistema atua como um scanner procurando a sequência correta escondida dentro de todo o áudio capturado.

```
Texto Bruto ➔ Tokenização Fonética Completa ➔ Fast Track (includes) ➔ Sliding Window Fuzzy Scanner ➔ Veredito & Feedback
```

---

## 4. Pipeline de Execução em 5 Etapas

### Passo 1: Tokenização Fonética Completa
Toda a string capturada pelo STT é convertida em uma sequência contínua de tokens fonéticos utilizando o Dicionário De-Para, tratamento de compostos (`W`, `DOUBLE <LETRA>`) e fallback com Soundex / Metaphone.

### Passo 2: O Caminho Feliz (Fast Track / Substring Exata)
O sistema verifica se a sequência exata de tokens do gabarito está contida de forma contígua em qualquer lugar da cadeia detectada:
- `if (" " + detectedTokens.join(" ") + " ").includes(" " + gabaritoTokens.join(" ") + " ")`
- Se positivo, aprova instantaneamente com **100% de similaridade**, eliminando custo computacional e ruídos nas bordas.

### Passo 3: O Caminho Flexível (Sliding Window Fuzzy Search)
Caso a API tenha tido 1 erro acústico de letra ou o aluno tenha feito uma leve hesitação:
- Desliza janelas de tamanho elástico ($L-2$ até $L+2$) pela cadeia de tokens detectados.
- Calcula a Distância de Levenshtein Ponderada Foneticamente (com Matriz de Confusão Acústica: B/V, M/N, T/D, S/C, etc.) para cada janela.
- Seleciona o trecho com a maior pontuação acústica.

### Passo 4: Verificação Pedagógica de `SPACE`
Em termos compostos ou expressões (ex: *"as tasty as"*, *"more slowly"*):
- Se o miolo identificado corresponde a todas as letras da expressão mas o comando `SPACE` não foi pronunciado, o sistema emite feedback pedagógico específico:
  `⚠️ Você esqueceu de falar "SPACE" para separar as palavras da expressão!`

### Passo 5: Auditoria dos 3 Passos (Palavra ➔ Soletração ➔ Palavra)
O sistema analisa se a palavra alvo foi dita no início e no final para conceder a certificação de cumprimento rigoroso dos 3 passos, incentivando a prática pedagógica ideal sem penalizar a nota da soletração quando esta estiver correta.

