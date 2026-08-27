// build-deepgram-keywords.js
// Fase 2: Cabresto - monta o array de keywords do Deepgram (nova-2) focado
// exclusivamente nas letras da palavra da rodada, usando o dicionário
// fonético estático da Fase 1 (dicionario_fonetico_base.json).

const DEFAULT_DICTIONARY = {
  "letters": {
    "A": ["a", "ay", "ah", "aye", "eight"],
    "B": ["b", "be", "bee"],
    "C": ["c", "see", "sea", "si"],
    "D": ["d", "dee", "de", "di", "thee"],
    "E": ["e", "ee", "i", "he"],
    "F": ["f", "ef", "eff", "if", "half"],
    "G": ["g", "gee", "jee", "ji"],
    "H": ["h", "aitch", "age", "eight", "each", "edge", "eitch"],
    "I": ["i", "eye", "aye", "ai"],
    "J": ["j", "jay", "hey", "joy"],
    "K": ["k", "kay", "ok"],
    "L": ["l", "el", "ell", "hell"],
    "M": ["m", "em", "am"],
    "N": ["n", "en", "an", "and", "in"],
    "O": ["o", "oh", "owe", "zero"],
    "P": ["p", "pee", "pea", "pe"],
    "Q": ["q", "cue", "queue", "cute"],
    "R": ["r", "are", "our", "ar", "er"],
    "S": ["s", "as", "is", "yes", "ass", "es", "us"],
    "T": ["t", "tea", "tee", "ti", "to"],
    "U": ["u", "you", "yu", "ew"],
    "V": ["v", "vee", "ve"],
    "W": ["w", "double you", "double u", "double-u", "dabliu"],
    "X": ["x", "ex", "axe", "ax"],
    "Y": ["y", "why", "wai", "uai"],
    "Z": ["z", "zee", "zed", "set"]
  },
  "digits": {
    "0": ["0", "zero", "oh"],
    "1": ["1", "one", "won"],
    "2": ["2", "two", "too", "to"],
    "3": ["3", "three"],
    "4": ["4", "four", "for"],
    "5": ["5", "five"],
    "6": ["6", "six"],
    "7": ["7", "seven"],
    "8": ["8", "eight", "ate"],
    "9": ["9", "nine"]
  },
  "commands": {
    "SPACE": ["space", "spice", "pace", "base", "spay", "place", "blank"],
    "DOUBLE": ["double", "buble", "bubble", "dabble", "bobble", "2", "two"]
  }
};

// Ajuste estes 3 números depois de testar com os logs reais.
// Peso baixo primeiro: intensificadores do Deepgram são exponenciais,
// valor alto demais aumenta falso positivo em vez de reduzir.
const MAX_VARIANTES_POR_LETRA = 3;
const PESO_LETRA = 2;
const PESO_PALAVRA_ALVO = 3;
const PESO_COMANDO = 2;

function getDicionario() {
  if (typeof window !== 'undefined' && window.spellingValidator && window.spellingValidator.dicionarioData) {
    return window.spellingValidator.dicionarioData;
  }
  if (typeof require !== 'undefined') {
    try {
      return require('./dicionario_fonetico_base.json');
    } catch (e) {
      // fallback
    }
  }
  return DEFAULT_DICTIONARY;
}

function normalizar(palavraAlvo) {
  return String(palavraAlvo || '').toUpperCase();
}

function letrasUnicas(palavraAlvo) {
  const letras = normalizar(palavraAlvo).match(/[A-Z]/g) || [];
  return [...new Set(letras)];
}

function digitosUnicos(palavraAlvo) {
  const digitos = String(palavraAlvo || '').match(/[0-9]/g) || [];
  return [...new Set(digitos)];
}

function temMultiplosTokens(palavraAlvo) {
  return /\s/.test(String(palavraAlvo || '').trim());
}

function temLetraDobrada(palavraAlvo) {
  return /([a-z0-9])\1/i.test(String(palavraAlvo || ''));
}

/**
 * Monta o array de keywords ponderado para uma rodada específica.
 * @param {string} palavraAlvo - a palavra ou frase da rodada (ex: "apple", "as tasty as")
 * @param {Object} [customDict] - dicionário fonético customizado opcional
 * @returns {string[]} pronto para params.append('keywords', termo) em cada item
 */
function buildKeywordsParaRodada(palavraAlvo, customDict = null) {
  const cleanTarget = String(palavraAlvo || '').trim();
  if (!cleanTarget) return [];

  const dict = customDict || getDicionario();
  const termos = [];

  // 1. a própria palavra alvo, âncora do "sanduíche" (palavra, soletração, palavra)
  termos.push(`${cleanTarget}:${PESO_PALAVRA_ALVO}`);

  // 2. variantes das letras que aparecem na palavra, e só essas
  for (const letra of letrasUnicas(cleanTarget)) {
    const variantes = (dict.letters?.[letra] || []).slice(0, MAX_VARIANTES_POR_LETRA);
    for (const variante of variantes) {
      if (variante.includes(' ')) continue; // keywords não boosta frase com espaço como unidade única
      termos.push(`${variante}:${PESO_LETRA}`);
    }
  }

  // 2.1 variantes dos dígitos que aparecem na palavra (se houver)
  for (const digito of digitosUnicos(cleanTarget)) {
    const variantes = (dict.digits?.[digito] || []).slice(0, MAX_VARIANTES_POR_LETRA);
    for (const variante of variantes) {
      if (variante.includes(' ')) continue;
      termos.push(`${variante}:${PESO_LETRA}`);
    }
  }

  // 3. comando SPACE, só entra se a rodada realmente tiver mais de um token
  if (temMultiplosTokens(cleanTarget)) {
    const spaceVariants = (dict.commands?.SPACE || ["space", "spice", "pace"]).slice(0, 3);
    for (const variante of spaceVariants) {
      termos.push(`${variante}:${PESO_COMANDO}`);
    }
  }

  // 4. comando DOUBLE, só entra se a palavra tiver letra repetida em sequência
  if (temLetraDobrada(cleanTarget)) {
    const doubleVariants = (dict.commands?.DOUBLE || ["double", "buble", "bubble"]).slice(0, 3);
    for (const variante of doubleVariants) {
      termos.push(`${variante}:${PESO_COMANDO}`);
    }
  }

  return termos;
}

// Exportação universal (Browser e Node.js)
if (typeof window !== 'undefined') {
  window.buildKeywordsParaRodada = buildKeywordsParaRodada;
  window.KEYWORD_CONFIG = {
    MAX_VARIANTES_POR_LETRA,
    PESO_LETRA,
    PESO_PALAVRA_ALVO,
    PESO_COMANDO
  };
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildKeywordsParaRodada,
    normalizar,
    letrasUnicas,
    digitosUnicos,
    temMultiplosTokens,
    temLetraDobrada,
    MAX_VARIANTES_POR_LETRA,
    PESO_LETRA,
    PESO_PALAVRA_ALVO,
    PESO_COMANDO
  };
}
