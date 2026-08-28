# Minimalist Word Trainer - Spelling Bee 🐝

Aplicativo web de alta performance para treinamento e prática de **Spelling Bee** com interface minimalista de alto contraste (DARK mode), validação fonética inteligente em tempo real e integração com a API da **Deepgram** para síntese de voz (TTS) e reconhecimento de fala (STT).

---

## 🎯 Funcionalidades Principais

- ⚡ **Dicionário Embarcado Ultrarrápido (`spelling_dict.json`)**: 468 palavras/expressões e 1.929 variações fonéticas para validação local instantânea em milissegundos (`array.includes`) sem custo de requisição.
- 🎙️ **STT (Speech-to-Text) Deepgram**: Captura de áudio pelo microfone e transcrição de altíssima precisão via modelo `nova-2` com injeção dinâmica de *keywords* (cabresto acústico).
- 🔊 **TTS (Text-to-Speech) Deepgram**: Reprodução ultrarrealista da pronúncia das palavras em inglês no botão **OUVIR** (Aura).
- 📏 **Regra dos 3 Passos (Estrita)**: Validação pedagógica rigorosa: **Palavra Inicial ➔ Soletração (com SPACE e DOUBLE) ➔ Palavra Final**.
- 🔍 **Alinhamento Letra a Letra & Feedback Visual**: Interface com telemetria detalhada de cada caractere soletrado, destacando acertos, erros específicos e comandos (`SPACE` / `DOUBLE`).
- 🔄 **Feedback Loop & Auto-Aprendizado (Fase 4)**: Logs de telemetria no Supabase (`logs_validacao_fonetica`) e fila de novas variações (`sugestoes_foneticas`) com consolidação automatizada via Vercel Cron.
- 🎨 **Design System Radical Minimalist**: Interface minimalista com tema escuro, alto contraste, micro-animações fluidas e sem distrações visuais.
- ⚙️ **Gerenciador de API Key**: Modal integrado para configuração de chave Deepgram com persistência via `localStorage`.

---

## 📁 Estrutura do Projeto

```text
├── index.html                                          # Interface principal da aplicação
├── spelling_dict.json                                  # Dicionário embarcado de 468 palavras e 1.929 variações
├── gabarito_fonetico_completo.json                     # Gabarito fonético de referência expandido
├── css/
│   └── styles.css                                      # Animações, tema escuro e efeitos visuais
├── js/
│   ├── config.js                                       # Configurações de API e chaves
│   ├── words.js                                        # Lista de palavras e níveis do treino
│   ├── deepgram.js                                     # Integração STT/TTS com Deepgram Nova-2
│   ├── spellingValidator.js                            # Validador fonético dos 3 passos e alinhamento
│   └── app.js                                          # Orquestração do jogo, microfone e telemetria
├── api/
│   └── cron/
│       └── analisar-logs.js                            # Serverless Function do Cron Job de consolidação
├── supabase/
│   └── migrations/
│       └── 20260827_create_feedback_loop_tables.sql   # Tabelas e RLS do Feedback Loop Fonético
├── docs/
│   └── spelling_bee_rules_normalization.md             # Especificação técnica e regras de normalização
├── test_feedback_loop.js                               # Testes automatizados do feedback loop e alinhamento
├── test_dicionario.js                                  # Testes automatizados de normalização e homófonos
├── FASE4_FEEDBACK_LOOP.md                              # Documento de arquitetura da Fase 4
├── vercel.json                                         # Configuração de deploy e agendamento de cron
└── README.md
```

---

## 🚀 Como Executar Localmente

1. Clone o repositório:
   ```bash
   git clone https://github.com/PedroCassianoo/teste-spelling-bee.git
   cd teste-spelling-bee
   ```

2. Abra o arquivo `index.html` em qualquer navegador web moderno ou utilize uma extensão como Live Server no VS Code:
   ```bash
   # Exemplo com npx serve ou vite
   npx serve .
   ```

3. Clique no ícone de **engrenagem (Settings)** no topo superior direito e insira sua chave da API **Deepgram**.

4. Clique em **OUVIR** para escutar a pronúncia ou no **Microfone** para iniciar o treino de soletração nos 3 passos.

---

## 🧪 Testes Automatizados

Para rodar a suíte completa de testes de validação fonética e feedback loop:

```bash
# Testes do Validador Fonético e Homófonos (71 testes)
node test_dicionario.js

# Testes do Alinhamento Letra a Letra e Feedback Loop (25 testes)
node test_feedback_loop.js
```

---

## 🛠️ Tecnologias Utilizadas

- **Frontend Core**: HTML5 & Vanilla JavaScript (ES6 Modules)
- **Estilização**: Tailwind CSS (CDN) & Custom CSS Tokens
- **Reconhecimento e Síntese de Voz**: Deepgram API (`nova-2` STT & Aura TTS)
- **Banco de Dados e Telemetria**: Supabase (PostgreSQL, RLS)
- **Deploy & Cron Jobs**: Vercel Serverless Functions
