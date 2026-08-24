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

## 3. Lógica de Validação e Isolamento (Regra de Negócio)

Para resolver o conflito entre a palavra alvo (ex: *"as"*) e a letra isolada (ex: letra *"S"* transcrita como *"as"*), a validação não deve ser feita de forma linear em toda a string. O backend deve processar a transcrição em 3 etapas de isolamento:

**Passo 1: Recorte das Extremidades (Trim Target)**
O sistema identifica a frase transcrita e remove a primeira e a última menção da frase alvo, que representam a pronúncia inicial e final da regra do Spelling Bee.
- *Transcrição Bruta:* `"as tasty as a as space tea a as tea why space a as as tasty as"`
- *Isolamento:* Remove o primeiro e último `"as tasty as"`.

**Passo 2: Aplicação do Dicionário no Miolo (Parsing)**
O que sobra é estritamente o bloco de soletração. O sistema aplica o "De-Para" da Tabela 2 termo a termo neste miolo:
- `"a"` -> `A`
- `"as"` -> `S`
- `"space"` -> `SPACE`
- `"tea"` -> `T`
- `"a"` -> `A`
- `"as"` -> `S`
- `"tea"` -> `T`
- `"why"` -> `Y`
- `"space"` -> `SPACE`
- `"a"` -> `A`
- `"as"` -> `S`

**Passo 3: Comparação de Gabarito**
Com o bloco de soletração higienizado (`A S SPACE T A S T Y SPACE A S`), o sistema compara diretamente com a *string* correta salva no banco de dados. Qualquer divergência percentual mínima (ou falha completa) aciona o erro, conforme as configurações de tolerância do aplicativo.

---

## 4. Ordem de Processamento Obrigatória (Pipeline de Higienização)

**O Problema (Vazamento do Alvo):** Se as regras de separação de letras e o dicionário fonético forem aplicados à string inteira, o sistema destruirá a pronúncia inicial e final da palavra alvo. Por exemplo, na frase "as tasty as", o termo "as" será transformado na letra "S" e "tasty" será soletrado indevidamente pelo sistema (gerando falsos erros como `S - T - A - S - T - Y - S`).

**A Regra (Strict Execution Pipeline):** O backend/frontend deve **obrigatoriamente** processar a string de retorno da API seguindo esta ordem cronológica exata:

### Passo 1: Captura e Padronização Inicial
- Receber a string bruta do STT.
- Converter tudo para letras minúsculas (lowercase) e remover pontuações extras para facilitar a busca.
- *Exemplo de entrada:* `"as tasty as a as space tea a as tea why space a as as tasty as"`

### Passo 2: Extração das Bordas (Trim Target) ANTES de qualquer modificação
- O sistema deve buscar a palavra/frase alvo (gabarito) no **início (prefixo)** e no **final (sufixo)** da string e removê-las.
- *Lógica recomendada (Regex):* Substituir `^as tasty as` (início) e `as tasty as$` (fim) por um espaço vazio.
- *Resultado após Passo 2:* `" a as space tea a as tea why space a as "`

### Passo 3: Isolamento da Área de Soletração (Miolo)
- O que sobra da string após o Passo 2 é classificado como o "Miolo de Soletração".
- É estritamente proibido aplicar o dicionário fora desta área.

### Passo 4: Aplicação do Dicionário e Split
- **Somente agora** o sistema aplica a tabela "De-Para" (Ex: converte `"as"` para `S`, `"space"` para `SPACE`, `"double" + "tea"` para `TT`).
- Compara a string final gerada com o gabarito de soletração do banco de dados.
