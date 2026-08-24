# Minimalist Word Trainer - Spelling Bee 🐝

Aplicativo web para treinamento e prática de **Spelling Bee** com interface minimalista de alto contraste (DARK mode) e integração com a API da **Deepgram** para síntese de voz (TTS) e reconhecimento de fala (STT).

---

## 🎯 Funcionalidades

- 🔊 **TTS (Text-to-Speech) Deepgram**: Reprodução ultrarrealista da pronúncia das palavras em inglês no botão **OUVIR**.
- 🎙️ **STT (Speech-to-Text) Deepgram**: Captura de áudio pelo microfone e transcrição precisa via modelo `nova-2`.
- ⚡ **Validação em Tempo Real**: Comparação ortográfica e fonética da palavra falada com a esperada.
- 🎨 **Design System Radical Minimalist**: Interface inspirada no Stitch com alto contraste, sem distrações visuais e transições suaves.
- ⚙️ **Gerenciador de API Key**: Modal integrado para configuração da chave da Deepgram com persistência via `localStorage`.

---

## 📁 Estrutura do Projeto

```text
├── index.html        # Página principal e componentes visuais
├── css/
│   └── styles.css    # Animações de pulso, shake e glow
├── js/
│   ├── config.js     # Configurações gerais e chave Deepgram
│   ├── words.js      # Banco de palavras para treino
│   ├── deepgram.js   # Integrações com a API Deepgram (TTS/STT)
│   └── app.js        # Lógica do jogo, microfone e validações
└── README.md
```

---

## 🚀 Como Executar Localmente

1. Clone o repositório:
   ```bash
   git clone https://github.com/PedroCassianoo/teste-spelling-bee.git
   cd teste-spelling-bee
   ```
2. Abra o arquivo `index.html` em qualquer navegador web moderno ou utilize uma extensão como Live Server no VS Code.
3. Clique no ícone de **engrenagem (Settings)** no topo superior direito e insira sua chave da API **Deepgram**.
4. Clique em **OUVIR** para ouvir a palavra ou no **Microfone** para treinar a sua pronúncia e soletração!

---

## 🛠️ Tecnologias Utilizadas

- **HTML5 & Vanilla JavaScript**
- **Tailwind CSS** (via CDN com plugins)
- **Google Material Symbols & Fonts (Inter)**
- **Deepgram API** (Aura TTS & Nova-2 STT)
