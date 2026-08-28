/**
 * Motor de Validação Fonética e Fuzzy Matching do Spelling Bee
 * 
 * Integra:
 * 1. Dicionário Fonético Base (Letras, Dígitos 0-9, Comandos, Fusões de Bigramas e Matriz Acústica).
 * 2. Pipeline estrito de 3 passos com fatiamento por âncora (Palavra ➔ Soletração ➔ Palavra).
 * 3. Algoritmo de Distância de Levenshtein Ponderado Foneticamente (Threshold de 85% no miolo, 70% nas bordas).
 * 4. Resolução inteligente de hipóteses de alinhamento para fusões acidentais do STT (AS, IN, OF).
 */

const DEFAULT_PHONETIC_DICTIONARY = {
  "_meta": {
    "versao": "1.0",
    "fase": "1 - Dicionário Base",
    "fonte_primaria": "logs_deepgram_stt_analise.md (28 amostras reais, 5 categorias de variação)",
    "sotaque": "não tratado nesta fase, conforme decisão do projeto",
    "granularidade": "letra por letra - a validação monta a combinação da palavra em tempo real a partir deste dicionário"
  },
  "letters": {
    "A": ["a", "ay", "ah", "aye", "eight", "ei", "eigh", "hey"],
    "B": ["b", "be", "bee"],
    "C": ["c", "see", "sea", "si", "ce"],
    "D": ["d", "dee", "de", "di", "thee"],
    "E": ["e", "ee", "i", "he", "ea"],
    "F": ["f", "ef", "eff", "if", "half", "off"],
    "G": ["g", "gee", "jee", "ji", "gi"],
    "H": ["h", "aitch", "age", "eight", "each", "edge", "eitch", "ach", "hache", "etch"],
    "I": ["i", "eye", "aye", "ai", "ah"],
    "J": ["j", "jay", "hey", "joy", "jei"],
    "K": ["k", "kay", "ok", "kei", "ca"],
    "L": ["l", "el", "ell", "hell", "al"],
    "M": ["m", "em", "am"],
    "N": ["n", "en", "an", "and", "in", "un"],
    "O": ["o", "oh", "owe", "zero", "ou", "or"],
    "P": ["p", "pee", "pea", "pe", "pi"],
    "Q": ["q", "cue", "queue", "cute", "kyu"],
    "R": ["r", "are", "our", "ar", "er"],
    "S": ["s", "as", "is", "yes", "ass", "es", "us", "ess"],
    "T": ["t", "tea", "tee", "ti", "to"],
    "U": ["u", "you", "yu", "ew"],
    "V": ["v", "vee", "ve", "vi"],
    "W": ["w", "double you", "double u", "double-u", "doubleyou", "dabliu"],
    "X": ["x", "ex", "axe", "ax"],
    "Y": ["y", "why", "wai", "uai", "wire"],
    "Z": ["z", "zee", "zed", "set", "zi"]
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
    "SPACE": ["space", "spice", "pace", "base", "spay", "place", "places", "blank"],
    "DOUBLE": ["double", "buble", "bubble", "dabble", "bobble", "2", "two"]
  },
  "bigram_fusions": {
    "_descricao": "Sequências de duas letras que o Deepgram funde em uma palavra real de uma vez só.",
    "AS": ["as"],
    "IN": ["in"],
    "OF": ["of"]
  },
  "acoustic_confusions": {
    "_descricao": "Trocas fonéticas próximas por qualidade de microfone ou sotaque.",
    "M": ["N"],
    "N": ["M"],
    "B": ["V", "P"],
    "D": ["T"]
  }
};

class SpellingValidator {
    constructor(customDictionary = null) {
        // Nomes canônicos falados de cada letra em inglês para análise fonética secundária (Soundex/Metaphone)
        this.LETTER_SPOKEN_NAMES = {
            'A': 'ay', 'B': 'bee', 'C': 'see', 'D': 'dee', 'E': 'ee',
            'F': 'eff', 'G': 'gee', 'H': 'aitch', 'I': 'eye', 'J': 'jay',
            'K': 'kay', 'L': 'ell', 'M': 'em', 'N': 'en', 'O': 'oh',
            'P': 'pee', 'Q': 'cue', 'R': 'ar', 'S': 'ess', 'T': 'tee',
            'U': 'you', 'V': 'vee', 'W': 'double you', 'X': 'ex', 'Y': 'why', 'Z': 'zee',
            'SPACE': 'space', 'DOUBLE': 'double',
            '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four',
            '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine'
        };

        this.DEFAULT_SIMILARITY_THRESHOLD = 0.85;       // 85% de similaridade mínima para aprovação no miolo (Análise de Miolo Prioritária)
        this.DEFAULT_EDGE_THRESHOLD = 0.70;             // 70% de similaridade mínima padrão para prefixo e sufixo
        this.DEFAULT_COMPOUND_EDGE_THRESHOLD = 0.40;    // 40% de similaridade nas pontas para expressões compostas (Fallback Híbrido com miolo >= 90%)

        this.loadDictionary(customDictionary || DEFAULT_PHONETIC_DICTIONARY);
    }

    /**
     * Compila e carrega os mapeamentos a partir de um objeto de dicionário estruturado
     * @param {Object} dictData - Objeto seguindo a estrutura do dicionario_fonetico_base.json
     */
    loadDictionary(dictData) {
        if (!dictData || typeof dictData !== 'object') {
            dictData = DEFAULT_PHONETIC_DICTIONARY;
        }

        this.dicionarioData = dictData;
        this.DICIONARIO = {};
        this.BIGRAM_FUSIONS = {};
        this.ACOUSTIC_CONFUSIONS = new Set([
            'H-A', 'A-H',
            'S-C', 'C-S', 'S-Z', 'Z-S', 'C-Z', 'Z-C',
            'K-Q', 'Q-K',
            'G-J', 'J-G',
            'F-S', 'S-F', 'F-V', 'V-F',
            'E-I', 'I-E',
            'U-O', 'O-U', 'U-W', 'W-U',
            // Homófonos compartilhados entre dígitos e letras
            '8-A', 'A-8', '8-H', 'H-8',
            '2-T', 'T-2',
            '0-O', 'O-0',
            '4-F', 'F-4'
        ]);

        // 1. Mapeamento das 26 Letras
        if (dictData.letters) {
            for (const [letter, variations] of Object.entries(dictData.letters)) {
                const upperLetter = letter.toUpperCase();
                // O próprio caractere é mapeado
                this.DICIONARIO[upperLetter.toLowerCase()] = upperLetter;
                if (Array.isArray(variations)) {
                    for (const v of variations) {
                        this.DICIONARIO[v.toLowerCase().trim()] = upperLetter;
                    }
                }
            }
        }

        // 2. Mapeamento dos Dígitos (0-9)
        if (dictData.digits) {
            for (const [digit, variations] of Object.entries(dictData.digits)) {
                const digitStr = String(digit).trim();
                this.DICIONARIO[digitStr] = digitStr;
                if (Array.isArray(variations)) {
                    for (const v of variations) {
                        this.DICIONARIO[v.toLowerCase().trim()] = digitStr;
                    }
                }
            }
        }

        // 3. Mapeamento dos Comandos (SPACE, DOUBLE)
        if (dictData.commands) {
            for (const [cmd, variations] of Object.entries(dictData.commands)) {
                const upperCmd = cmd.toUpperCase();
                this.DICIONARIO[upperCmd.toLowerCase()] = upperCmd;
                if (Array.isArray(variations)) {
                    for (const v of variations) {
                        this.DICIONARIO[v.toLowerCase().trim()] = upperCmd;
                    }
                }
            }
        }

        // 4. Mapeamento de Fusões de Bigramas (AS, IN, OF)
        if (dictData.bigram_fusions) {
            for (const [bigram, variations] of Object.entries(dictData.bigram_fusions)) {
                if (bigram.startsWith('_')) continue;
                const tokenArray = bigram.split('').map(c => c.toUpperCase());
                if (Array.isArray(variations)) {
                    for (const v of variations) {
                        this.BIGRAM_FUSIONS[v.toLowerCase().trim()] = tokenArray;
                    }
                }
            }
        }

        // 5. Matriz de Confusão Acústica
        if (dictData.acoustic_confusions) {
            for (const [char1, confusionList] of Object.entries(dictData.acoustic_confusions)) {
                if (char1.startsWith('_')) continue;
                const c1 = char1.toUpperCase();
                if (Array.isArray(confusionList)) {
                    for (const c2Item of confusionList) {
                        const c2 = c2Item.toUpperCase();
                        this.ACOUSTIC_CONFUSIONS.add(`${c1}-${c2}`);
                        this.ACOUSTIC_CONFUSIONS.add(`${c2}-${c1}`);
                    }
                }
            }
        }
    }

    /**
     * Carrega o arquivo JSON do dicionário fonético de forma assíncrona
     * @param {string} url - Caminho ou URL do JSON
     */
    async loadFromUrl(url = 'dicionario_fonetico_base.json') {
        if (typeof fetch === 'function') {
            try {
                const resp = await fetch(url);
                if (resp.ok) {
                    const data = await resp.json();
                    this.loadDictionary(data);
                    console.log("[SpellingValidator] Dicionário fonético carregado de:", url);
                    return true;
                }
            } catch (err) {
                console.warn("[SpellingValidator] Não foi possível carregar de", url, "- utilizando dicionário padrão.", err.message);
            }
        }
        return false;
    }

    /**
     * Carrega o dicionário fonético dinâmico direto da tabela Supabase (Fase 4: Feedback Loop)
     * Inclui cache em memória/localStorage de 5 minutos para evitar requisições de rede repetidas.
     * @param {string} supabaseUrl 
     * @param {string} supabaseKey 
     * @param {boolean} [forceRefresh=false]
     */
    async loadFromSupabase(supabaseUrl, supabaseKey, forceRefresh = false) {
        if (!supabaseUrl || !supabaseKey) {
            return this.loadFromUrl();
        }

        const CACHE_KEY = 'spelling_bee_phonetic_dict_cache';
        const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

        // 1. Tenta recuperar do cache se não for forceRefresh
        if (!forceRefresh && typeof localStorage !== 'undefined') {
            try {
                const cached = localStorage.getItem(CACHE_KEY);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (parsed.timestamp && (Date.now() - parsed.timestamp < CACHE_TTL_MS) && parsed.data) {
                        this.loadDictionary(parsed.data);
                        console.log("[SpellingValidator] Dicionário fonético carregado do cache local (válido por 5m).");
                        return true;
                    }
                }
            } catch (e) {
                // ignore cache read error
            }
        }

        // 2. Busca do Supabase REST API
        if (typeof fetch === 'function') {
            try {
                const endpoint = `${supabaseUrl}/rest/v1/dicionario_fonetico?select=*`;
                const resp = await fetch(endpoint, {
                    headers: {
                        'apikey': supabaseKey,
                        'Authorization': `Bearer ${supabaseKey}`
                    }
                });

                if (resp.ok) {
                    const rows = await resp.json();
                    if (Array.isArray(rows) && rows.length > 0) {
                        const dictData = {
                            letters: {},
                            digits: {},
                            commands: {},
                            bigram_fusions: {},
                            acoustic_confusions: {}
                        };

                        for (const row of rows) {
                            if (row.tipo === 'letra') {
                                dictData.letters[row.chave] = row.variantes;
                            } else if (row.tipo === 'digito') {
                                dictData.digits[row.chave] = row.variantes;
                            } else if (row.tipo === 'comando') {
                                dictData.commands[row.chave] = row.variantes;
                            } else if (row.tipo === 'fusao_bigrama') {
                                dictData.bigram_fusions[row.chave] = row.variantes;
                            } else if (row.tipo === 'confusao_acustica') {
                                dictData.acoustic_confusions[row.chave] = row.variantes;
                            }
                        }

                        this.loadDictionary(dictData);

                        if (typeof localStorage !== 'undefined') {
                            try {
                                localStorage.setItem(CACHE_KEY, JSON.stringify({
                                    timestamp: Date.now(),
                                    data: dictData
                                }));
                            } catch (e) {
                                // ignore storage errors
                            }
                        }

                        console.log(`[SpellingValidator] Dicionário fonético carregado do Supabase (${rows.length} entradas).`);
                        return true;
                    }
                }
            } catch (err) {
                console.warn("[SpellingValidator] Erro ao carregar do Supabase, recorrendo ao fallback:", err.message);
            }
        }

        return this.loadFromUrl();
    }

    /**
     * Identifica o tipo do elemento do gabarito ou token
     */
    _getElementType(element) {
        if (!element) return 'letra';
        const upper = String(element).toUpperCase().trim();
        if (['SPACE', 'DOUBLE'].includes(upper)) return 'comando';
        if (/^[0-9]$/.test(upper)) return 'digito';
        if (upper.length > 1 && !['SPACE', 'DOUBLE'].includes(upper)) return 'fusao_bigrama';
        return 'letra';
    }

    /**
     * Constrói o alinhamento posição a posição (letra por letra / comando por comando)
     * entre o gabarito oficial e os tokens ouvidos pelo STT (Fase 4: Feedback Loop)
     * @param {Array<string>} gabaritoArray - Tokens esperados (ex: ['A', 'P', 'P', 'L', 'E'])
     * @param {Array<string>} detectedTokens - Tokens identificados na janela de soletração (ex: ['A', 'K', 'P', 'L', 'E'])
     * @param {Array<string>} rawWords - Palavras brutas da transcrição
     * @param {Array<Object>} [wordIndices] - Mapeamento de índices das palavras brutas
     * @returns {Array<{ esperado: string, tipo: string, token_ouvido: string, bateu: boolean }>}
     */
    buildAlignment(gabaritoArray, detectedTokens = [], rawWords = [], wordIndices = []) {
        if (!Array.isArray(gabaritoArray) || gabaritoArray.length === 0) {
            return [];
        }

        const n = gabaritoArray.length;
        const m = Array.isArray(detectedTokens) ? detectedTokens.length : 0;

        // DP matrix para Alinhamento Global (Needleman-Wunsch)
        const dp = Array.from({ length: n + 1 }, () => new Float32Array(m + 1));
        const MATCH_SCORE = 2.0;
        const ACOUSTIC_SCORE = 1.0;
        const MISMATCH_PENALTY = -1.0;
        const GAP_PENALTY = -1.5;

        for (let i = 0; i <= n; i++) dp[i][0] = i * GAP_PENALTY;
        for (let j = 0; j <= m; j++) dp[0][j] = j * GAP_PENALTY;

        for (let i = 1; i <= n; i++) {
            const exp = gabaritoArray[i - 1];
            for (let j = 1; j <= m; j++) {
                const det = detectedTokens[j - 1];
                let score = MISMATCH_PENALTY;
                if (det === exp) {
                    score = MATCH_SCORE;
                } else if (this.ACOUSTIC_CONFUSIONS.has(`${det}-${exp}`)) {
                    score = ACOUSTIC_SCORE;
                }

                dp[i][j] = Math.max(
                    dp[i - 1][j - 1] + score,
                    dp[i - 1][j] + GAP_PENALTY,
                    dp[i][j - 1] + GAP_PENALTY
                );
            }
        }

        // Backtracking para recuperar o alinhamento
        let i = n;
        let j = m;
        const alignment = [];

        const getRawWordForToken = (tokenIdx) => {
            if (tokenIdx < 0 || tokenIdx >= m) return '';
            if (wordIndices && wordIndices[tokenIdx]) {
                const { startWord, endWord } = wordIndices[tokenIdx];
                if (rawWords && startWord !== undefined && endWord !== undefined) {
                    return rawWords.slice(startWord, endWord + 1).join(' ').trim();
                }
            }
            if (rawWords && rawWords[tokenIdx]) {
                return rawWords[tokenIdx];
            }
            return (detectedTokens[tokenIdx] || '').toLowerCase();
        };

        const matchesExpected = (exp, det, rawToken) => {
            if (det === exp) return true;
            const cleanRaw = (rawToken || '').toLowerCase().trim();
            if (!cleanRaw) return false;

            if (this.dicionarioData) {
                const variants = (this.dicionarioData.letters?.[exp] || [])
                    .concat(this.dicionarioData.digits?.[exp] || [])
                    .concat(this.dicionarioData.commands?.[exp] || []);
                if (variants.some(v => v.toLowerCase() === cleanRaw)) {
                    return true;
                }
            }
            return false;
        };

        while (i > 0 || j > 0) {
            if (i > 0 && j > 0) {
                const exp = gabaritoArray[i - 1];
                const det = detectedTokens[j - 1];
                let score = MISMATCH_PENALTY;
                if (det === exp) {
                    score = MATCH_SCORE;
                } else if (this.ACOUSTIC_CONFUSIONS.has(`${det}-${exp}`)) {
                    score = ACOUSTIC_SCORE;
                }

                if (Math.abs(dp[i][j] - (dp[i - 1][j - 1] + score)) < 0.001) {
                    const rawToken = getRawWordForToken(j - 1);
                    const bateu = matchesExpected(exp, det, rawToken);
                    alignment.unshift({
                        esperado: exp,
                        tipo: this._getElementType(exp),
                        token_ouvido: rawToken,
                        bateu: bateu
                    });
                    i--;
                    j--;
                    continue;
                }
            }

            if (i > 0 && (j === 0 || Math.abs(dp[i][j] - (dp[i - 1][j] + GAP_PENALTY)) < 0.001)) {
                const exp = gabaritoArray[i - 1];
                alignment.unshift({
                    esperado: exp,
                    tipo: this._getElementType(exp),
                    token_ouvido: '',
                    bateu: false
                });
                i--;
            } else if (j > 0) {
                j--;
            } else {
                break;
            }
        }

        return alignment;
    }

    // =========================================================================
    // ALGORITMOS DE ANÁLISE FONÉTICA (SOUNDEX & METAPHONE)
    // =========================================================================

    /**
     * Algoritmo Soundex para palavras em inglês
     */
    soundex(word) {
        if (!word || typeof word !== 'string') return '';
        const clean = word.toUpperCase().replace(/[^A-Z]/g, '');
        if (clean.length === 0) return '';

        const mapping = {
            'B': '1', 'F': '1', 'P': '1', 'V': '1',
            'C': '2', 'G': '2', 'J': '2', 'K': '2', 'Q': '2', 'S': '2', 'X': '2', 'Z': '2',
            'D': '3', 'T': '3',
            'L': '4',
            'M': '5', 'N': '5',
            'R': '6'
        };

        let result = clean[0];
        let lastCode = mapping[clean[0]] || '0';

        for (let i = 1; i < clean.length; i++) {
            const char = clean[i];
            const code = mapping[char] || '0';

            if (code !== '0' && code !== lastCode) {
                result += code;
                lastCode = code;
            } else if (code === '0') {
                lastCode = '0';
            }

            if (result.length === 4) break;
        }

        return result.padEnd(4, '0');
    }

    /**
     * Algoritmo Metaphone simplificado para fonética inglesa de nomes de letras
     */
    metaphone(word) {
        if (!word || typeof word !== 'string') return '';
        let str = word.toLowerCase().replace(/[^a-z]/g, '');
        if (!str) return '';

        if (str.startsWith('kn') || str.startsWith('gn') || str.startsWith('pn') || str.startsWith('ps') || str.startsWith('wr')) {
            str = str.slice(1);
        }

        let meta = '';
        for (let i = 0; i < str.length; i++) {
            const c = str[i];
            const next = str[i + 1] || '';
            const prev = str[i - 1] || '';

            if (c === 'b' && i === str.length - 1 && prev === 'm') continue;
            if (c === 'c') {
                if (next === 'h') { meta += 'X'; i++; continue; }
                if ('eiy'.includes(next)) { meta += 'S'; continue; }
                meta += 'K';
                continue;
            }
            if (c === 'd') {
                if (next === 'g' && 'eiy'.includes(str[i + 2] || '')) { meta += 'J'; i += 2; continue; }
                meta += 'T';
                continue;
            }
            if (c === 'g') {
                if (next === 'h' && i === str.length - 2) continue;
                if ('eiy'.includes(next)) { meta += 'J'; continue; }
                meta += 'K';
                continue;
            }
            if (c === 'h') {
                if ('aeiou'.includes(next) || i === 0) meta += 'H';
                continue;
            }
            if (c === 'p' && next === 'h') { meta += 'F'; i++; continue; }
            if (c === 's' && next === 'h') { meta += 'X'; i++; continue; }
            if (c === 't') {
                if (next === 'h') { meta += '0'; i++; continue; }
                if (next === 'c' && str[i + 2] === 'h') { meta += 'X'; i += 2; continue; }
                meta += 'T';
                continue;
            }
            if (c === 'v') { meta += 'F'; continue; }
            if (c === 'x') { meta += 'KS'; continue; }
            if (c === 'z') { meta += 'S'; continue; }
            if ('bfjklmnr'.includes(c)) { meta += c.toUpperCase(); continue; }
            if ('aeiou'.includes(c) && i === 0) { meta += c.toUpperCase(); continue; }
        }

        return meta;
    }

    // =========================================================================
    // ALGORITMO DE DISTÂNCIA DE LEVENSHTEIN & MATRIZ ACÚSTICA PONDERADA
    // =========================================================================

    /**
     * Calcula o custo de substituição acústica entre dois tokens
     */
    _getAcousticSubstitutionCost(t1, t2) {
        if (t1 === t2) return 0.0;
        
        // Se ambos formam par de confusão acústica na matriz
        const pair = `${t1}-${t2}`;
        if (this.ACOUSTIC_CONFUSIONS.has(pair)) {
            return 0.2; // Custo reduzido para gêmeos acústicos (H vs A, M vs N, B vs V, D vs T, etc.)
        }

        // Se os nomes fonéticos falados possuem mesmo Soundex ou Metaphone
        const name1 = this.LETTER_SPOKEN_NAMES[t1] || t1;
        const name2 = this.LETTER_SPOKEN_NAMES[t2] || t2;
        if (this.soundex(name1) === this.soundex(name2) || this.metaphone(name1) === this.metaphone(name2)) {
            return 0.25;
        }

        return 1.0;
    }

    /**
     * Calcula a Distância de Levenshtein Ponderada Foneticamente entre arrays de tokens
     */
    weightedLevenshteinDistance(detected, target) {
        const m = detected.length;
        const n = target.length;

        if (m === 0) return n;
        if (n === 0) return m;

        const dp = Array.from({ length: m + 1 }, () => new Float32Array(n + 1));

        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const cost = this._getAcousticSubstitutionCost(detected[i - 1], target[j - 1]);
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1.0,           // Deleção
                    dp[i][j - 1] + 1.0,           // Inserção
                    dp[i - 1][j - 1] + cost       // Substituição ponderada
                );
            }
        }

        return dp[m][n];
    }

    /**
     * Distância padrão de Levenshtein (strings ou arrays)
     */
    levenshteinDistance(s1, s2) {
        const arr1 = Array.isArray(s1) ? s1 : s1.split('');
        const arr2 = Array.isArray(s2) ? s2 : s2.split('');
        const m = arr1.length;
        const n = arr2.length;

        if (m === 0) return n;
        if (n === 0) return m;

        const prev = new Int32Array(n + 1);
        const curr = new Int32Array(n + 1);

        for (let j = 0; j <= n; j++) prev[j] = j;

        for (let i = 1; i <= m; i++) {
            curr[0] = i;
            for (let j = 1; j <= n; j++) {
                const cost = arr1[i - 1] === arr2[j - 1] ? 0 : 1;
                curr[j] = Math.min(
                    prev[j] + 1,
                    curr[j - 1] + 1,
                    prev[j - 1] + cost
                );
            }
            prev.set(curr);
        }

        return curr[n];
    }

    /**
     * Calcula similaridade de Levenshtein entre duas strings de palavras completas
     */
    calculateWordSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;
        const s1 = str1.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
        const s2 = str2.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
        
        if (s1 === s2) return 1.0;
        if (s1.includes(s2)) return 0.95; // O prefixo/sufixo contém a frase alvo completa

        const maxLen = Math.max(s1.length, s2.length);
        if (maxLen === 0) return 1.0;

        const dist = this.levenshteinDistance(s1, s2);
        return Math.max(0, 1 - (dist / maxLen));
    }

    /**
     * Tokeniza rastreando os índices de origem em rawWords e diferenciando palavras inteiras de letras
     * @param {string} rawText 
     * @param {Object} [options] - Opções de tokenização (ex: expandBigrams)
     * @returns {{ rawWords: Array<string>, tokens: Array<string>, wordIndices: Array<{ startWord: number, endWord: number, isWholeWord: boolean }> }}
     */
    tokenizeWithIndices(rawText, options = {}) {
        if (!rawText || typeof rawText !== 'string') return { rawWords: [], tokens: [], wordIndices: [] };
        const cleanStr = (str) => str.toLowerCase().replace(/[-–—.,!?:;"]/g, ' ').replace(/\s+/g, ' ').trim();
        const cleaned = cleanStr(rawText);
        const rawWords = cleaned.split(/\s+/).filter(t => t.length > 0);
        
        const tokens = [];
        const wordIndices = [];
        let i = 0;

        while (i < rawWords.length) {
            const token = rawWords[i];
            const nextToken = rawWords[i + 1] || '';
            const compoundToken = `${token} ${nextToken}`.trim();

            // 1. Tratar "double you" / "double u" / "double-u" -> 'W'
            if (this.DICIONARIO[compoundToken] === 'W') {
                tokens.push('W');
                wordIndices.push({ startWord: i, endWord: i + 1, isWholeWord: false });
                i += 2;
                continue;
            }

            // 2. Tratar comando DOUBLE + [Letra/Dígito] (ex: "double" + "tea" -> "T", "T")
            if (this.DICIONARIO[token] === 'DOUBLE' && nextToken) {
                const mappedLetter = this.DICIONARIO[nextToken] || nextToken.toUpperCase();
                tokens.push(mappedLetter);
                wordIndices.push({ startWord: i, endWord: i + 1, isWholeWord: false });
                tokens.push(mappedLetter);
                wordIndices.push({ startWord: i, endWord: i + 1, isWholeWord: false });
                i += 2;
                continue;
            }

            // 3. Tratar fusão de bigrama se solicitado na hipótese (ex: "as" -> "A", "S")
            if (options.expandBigrams && this.BIGRAM_FUSIONS[token]) {
                const letters = this.BIGRAM_FUSIONS[token];
                for (const l of letters) {
                    tokens.push(l);
                    wordIndices.push({ startWord: i, endWord: i, isWholeWord: false });
                }
                i++;
                continue;
            }

            // 4. Aplicação do Dicionário De-Para no Token
            if (this.DICIONARIO[token]) {
                tokens.push(this.DICIONARIO[token]);
                wordIndices.push({ startWord: i, endWord: i, isWholeWord: false });
            } else if (token.length === 1) {
                tokens.push(token.toUpperCase());
                wordIndices.push({ startWord: i, endWord: i, isWholeWord: false });
            } else {
                // Fallback fonético para possíveis nomes de letras / dígitos
                let matchedLetter = null;
                const tokenSound = this.soundex(token);
                const tokenMeta = this.metaphone(token);

                for (const [letra, spoken] of Object.entries(this.LETTER_SPOKEN_NAMES)) {
                    if (this.soundex(spoken) === tokenSound || this.metaphone(spoken) === tokenMeta) {
                        matchedLetter = letra;
                        break;
                    }
                }

                if (matchedLetter) {
                    tokens.push(matchedLetter);
                    wordIndices.push({ startWord: i, endWord: i, isWholeWord: false });
                } else {
                    // Palavra inteira pronunciada
                    for (const ch of token) {
                        const mappedCh = this.DICIONARIO[ch] || ch.toUpperCase();
                        tokens.push(mappedCh);
                        wordIndices.push({ startWord: i, endWord: i, isWholeWord: true });
                    }
                }
            }
            i++;
        }

        return { rawWords, tokens, wordIndices };
    }

    /**
     * Tokeniza e mapeia foneticamente todo o fluxo transcrito pelo STT (compatibilidade retroativa)
     */
    tokenize(rawText) {
        return this.tokenizeWithIndices(rawText).tokens;
    }

    /**
     * Calcula a similaridade fonética normalizada entre 0.0 (0%) e 1.0 (100%)
     */
    calculateSimilarity(detectedTokens, targetTokens) {
        const maxLen = Math.max(detectedTokens.length, targetTokens.length);
        if (maxLen === 0) return 1.0;

        const weightedDist = this.weightedLevenshteinDistance(detectedTokens, targetTokens);
        return Math.max(0, 1 - (weightedDist / maxLen));
    }

    // =========================================================================
    // VALIDAÇÃO ESTRITA DO SPELLING BEE (PALAVRA + SOLETRAÇÃO + PALAVRA)
    // =========================================================================

    /**
     * Validação Rigorosa do Spelling Bee via Fatiamento por Âncora com Multi-Hipótese de Bigramas
     * @param {string} transcricaoStt - Retorno bruto do STT (Deepgram)
     * @param {string} palavraAlvo - Palavra/Frase alvo do gabarito (ex: "as tasty as", "taught", "in 1983")
     * @param {Object} [options] - Opções de validação (threshold de soletração: 0.85, bordas: 0.70)
     */
    validate(transcricaoStt, palavraAlvo, options = {}) {
        const threshold = typeof options.threshold === 'number' ? options.threshold : this.DEFAULT_SIMILARITY_THRESHOLD;
        const edgeThreshold = typeof options.edgeThreshold === 'number' ? options.edgeThreshold : this.DEFAULT_EDGE_THRESHOLD;

        if (!transcricaoStt || !transcricaoStt.trim()) {
            const gabaritoArray = this._buildGabarito(palavraAlvo);
            const alinhamento = gabaritoArray.map(exp => ({
                esperado: exp,
                tipo: this._getElementType(exp),
                token_ouvido: '',
                bateu: false
            }));
            return {
                isValid: false,
                isFullyCompliant: false,
                reason: 'NO_SPEECH',
                message: 'Não conseguimos capturar sua voz. Fale próximo ao microfone.',
                alinhamento: alinhamento,
                details: {
                    alinhamento: alinhamento
                }
            };
        }

        const cleanStr = (str) => str.toLowerCase().replace(/[-–—.,!?:;"]/g, ' ').replace(/\s+/g, ' ').trim();
        const rawText = cleanStr(transcricaoStt);
        const target = cleanStr(palavraAlvo);

        const gabaritoArray = this._buildGabarito(palavraAlvo);
        const stringGabarito = gabaritoArray.join(' - ');

        const targetWords = palavraAlvo.trim().replace(/[-–—]/g, ' ').split(/\s+/).filter(w => w.length > 0);
        const hasSpaceRequirement = targetWords.length > 1;
        const noSpaceExpected = gabaritoArray.filter(x => x !== 'SPACE').join('');

        // 1. Gera as hipóteses de tokenização (Padrão e com Fusões de Bigramas Expandidas)
        const hypotheses = [
            this.tokenizeWithIndices(rawText, { expandBigrams: false }),
            this.tokenizeWithIndices(rawText, { expandBigrams: true })
        ];

        let allCandidates = [];
        let missingSpaceCandidate = null;

        for (const { rawWords, tokens, wordIndices } of hypotheses) {
            const targetLen = gabaritoArray.length;
            const minWindow = Math.max(1, targetLen - (hasSpaceRequirement ? 4 : 2));
            const maxWindow = Math.min(tokens.length, targetLen + 4);

            for (let w = minWindow; w <= maxWindow; w++) {
                for (let i = 0; i <= tokens.length - w; i++) {
                    const windowSlice = tokens.slice(i, i + w);
                    const windowIndices = wordIndices.slice(i, i + w);

                    // Uma janela de soletração NÃO pode conter palavras inteiras pronunciadas (isWholeWord)
                    const containsWholeWords = windowIndices.some(idx => idx.isWholeWord);
                    if (containsWholeWords && rawWords.length > 1) {
                        continue;
                    }

                    const sim = this.calculateSimilarity(windowSlice, gabaritoArray);
                    const startWord = wordIndices[i]?.startWord ?? 0;
                    const endWord = wordIndices[i + w - 1]?.endWord ?? rawWords.length - 1;

                    // Verifica se é uma soletração correta mas sem SPACE
                    const noSpaceMatched = windowSlice.filter(x => x !== 'SPACE').join('');
                    const matchNoSpace = (noSpaceMatched === noSpaceExpected);
                    if (hasSpaceRequirement && !windowSlice.includes('SPACE') && matchNoSpace) {
                        if (!missingSpaceCandidate || sim > missingSpaceCandidate.similarity) {
                            missingSpaceCandidate = {
                                startIndex: i,
                                endIndex: i + w,
                                matchedTokens: windowSlice,
                                similarity: sim,
                                rawWords,
                                tokens,
                                wordIndices
                            };
                        }
                    }

                    if (sim >= threshold) {
                        const prefixWords = rawWords.slice(0, startWord);
                        const suffixWords = rawWords.slice(endWord + 1);
                        const prefixText = prefixWords.join(' ').trim();
                        const suffixText = suffixWords.join(' ').trim();

                        const edgeResult = this._validateEdges({
                            similarity: sim,
                            matchedTokens: windowSlice,
                            startIndex: i,
                            endIndex: i + w,
                            startWord,
                            endWord,
                            prefixText,
                            suffixText,
                            tokens,
                            rawWords
                        }, target, targetWords, gabaritoArray, options);

                        let totalScore = sim * 100;
                        if (edgeResult.temInicio) totalScore += 30;
                        if (edgeResult.temFim) totalScore += 30;
                        if (edgeResult.edgeBleedingDetected) totalScore += 10;

                        allCandidates.push({
                            startIndex: i,
                            endIndex: i + w,
                            matchedTokens: windowSlice,
                            similarity: sim,
                            startWord,
                            endWord,
                            prefixText,
                            suffixText,
                            prefixSim: edgeResult.prefixSim,
                            suffixSim: edgeResult.suffixSim,
                            totalScore,
                            rawWords,
                            tokens,
                            wordIndices: windowIndices,
                            edgeResult
                        });
                    }
                }
            }
        }

        // Se encontrou candidato com falta de SPACE e nenhum candidato completo
        if (allCandidates.length === 0 && missingSpaceCandidate) {
            const alinhamento = this.buildAlignment(
                gabaritoArray,
                missingSpaceCandidate.matchedTokens,
                missingSpaceCandidate.rawWords,
                missingSpaceCandidate.wordIndices
            );
            return {
                isValid: false,
                isFullyCompliant: false,
                similarity: missingSpaceCandidate.similarity,
                type: 'error',
                reason: 'MISSING_SPACE',
                message: `⚠️ Você esqueceu de falar "SPACE" para separar as palavras da expressão!`,
                alinhamento: alinhamento,
                details: {
                    similarity: missingSpaceCandidate.similarity,
                    textoOriginal: rawText,
                    arrayLetrasDetectadas: missingSpaceCandidate.tokens,
                    arrayLetrasCasadas: missingSpaceCandidate.matchedTokens,
                    stringFinal: missingSpaceCandidate.matchedTokens.join(' - '),
                    stringGabarito: stringGabarito,
                    alinhamento: alinhamento
                }
            };
        }

        // Se nenhum candidato de soletração atingiu o threshold (85%)
        if (allCandidates.length === 0) {
            let bestSim = 0;
            let bestWindow = hypotheses[0].tokens;
            let bestRawWords = hypotheses[0].rawWords;
            let bestIndices = hypotheses[0].wordIndices;

            for (const hyp of hypotheses) {
                const targetLen = gabaritoArray.length;
                const minWindow = Math.max(1, targetLen - (hasSpaceRequirement ? 4 : 2));
                const maxWindow = Math.min(hyp.tokens.length, targetLen + 4);

                for (let w = minWindow; w <= maxWindow; w++) {
                    for (let i = 0; i <= hyp.tokens.length - w; i++) {
                        const slice = hyp.tokens.slice(i, i + w);
                        const windowIndices = hyp.wordIndices.slice(i, i + w);

                        // Uma janela de soletração NÃO deve conter palavras inteiras pronunciadas (isWholeWord)
                        const containsWholeWords = windowIndices.some(idx => idx.isWholeWord);
                        if (containsWholeWords && hyp.rawWords.length > 1) {
                            continue;
                        }

                        const s = this.calculateSimilarity(slice, gabaritoArray);
                        if (s > bestSim) {
                            bestSim = s;
                            bestWindow = slice;
                            bestRawWords = hyp.rawWords;
                            bestIndices = windowIndices;
                        }
                    }
                }
            }

            const alinhamento = this.buildAlignment(
                gabaritoArray,
                bestWindow,
                bestRawWords,
                bestIndices
            );

            const pct = Math.round(bestSim * 100);
            return {
                isValid: false,
                isFullyCompliant: false,
                similarity: bestSim,
                type: 'error',
                reason: 'SPELLING_ERROR',
                message: `❌ Erro na soletração (Similaridade: ${pct}%). Esperado: [${stringGabarito}]`,
                alinhamento: alinhamento,
                details: {
                    similarity: bestSim,
                    textoOriginal: rawText,
                    arrayLetrasDetectadas: hypotheses[0].tokens,
                    arrayLetrasCasadas: bestWindow,
                    stringFinal: bestWindow.join(' - '),
                    stringGabarito: stringGabarito,
                    alinhamento: alinhamento
                }
            };
        }

        // Ordena os candidatos pela maior pontuação total (melhor encaixe de soletração + bordas)
        allCandidates.sort((a, b) => b.totalScore - a.totalScore);
        const bestCandidate = allCandidates[0];

        const {
            matchedTokens,
            similarity,
            prefixText,
            suffixText,
            tokens,
            wordIndices: bestWordIndices,
            rawWords: candidateRawWords
        } = bestCandidate;

        const stringFinalExtraida = matchedTokens.join(' - ');

        // Constrói o alinhamento detalhado da soletração
        const alinhamento = this.buildAlignment(
            gabaritoArray,
            matchedTokens,
            candidateRawWords,
            bestWordIndices
        );

        // 3. VERIFICAÇÃO DE ESPAÇO EM EXPRESSÕES COMPOSTAS
        const noSpaceMatched = matchedTokens.filter(x => x !== 'SPACE').join('');
        const matchNoSpace = (noSpaceMatched === noSpaceExpected);
        const missingSpaceDetected = hasSpaceRequirement && !matchedTokens.includes('SPACE') && matchNoSpace;

        if (missingSpaceDetected) {
            return {
                isValid: false,
                isFullyCompliant: false,
                similarity: similarity,
                type: 'error',
                reason: 'MISSING_SPACE',
                message: `⚠️ Você esqueceu de falar "SPACE" para separar as palavras da expressão!`,
                alinhamento: alinhamento,
                details: {
                    similarity: similarity,
                    textoOriginal: rawText,
                    arrayLetrasDetectadas: tokens,
                    arrayLetrasCasadas: matchedTokens,
                    stringFinal: stringFinalExtraida,
                    stringGabarito: stringGabarito,
                    alinhamento: alinhamento
                }
            };
        }

        // 4. FATIAMENTO POR ÂNCORA & VERIFICAÇÃO DAS BORDAS (Borda Flexível com Tolerância Acústica)
        const edgeResult = bestCandidate.edgeResult || this._validateEdges(bestCandidate, target, targetWords, gabaritoArray, options);
        const { temInicio, temFim, prefixSim, suffixSim, edgeThresholdUsed, edgeBleedingDetected } = edgeResult;

        // 5. REGRAS DE NEGÓCIO ESTRITAS (Bloqueios Obrigatórios dos 3 Passos)
        if (!temInicio && !temFim) {
            return {
                isValid: false,
                isFullyCompliant: false,
                similarity: similarity,
                type: 'error',
                reason: 'MISSING_BOTH_WORDS',
                message: `❌ Reprovado: Você esqueceu de falar a palavra no início e no final.`,
                alinhamento: alinhamento,
                details: {
                    temInicio,
                    temFim,
                    prefixText,
                    suffixText,
                    prefixSim,
                    suffixSim,
                    edgeThresholdUsed,
                    edgeBleedingDetected,
                    similarity: similarity,
                    textoOriginal: rawText,
                    arrayLetrasDetectadas: tokens,
                    arrayLetrasCasadas: matchedTokens,
                    stringFinal: stringFinalExtraida,
                    stringGabarito: stringGabarito,
                    alinhamento: alinhamento
                }
            };
        }

        if (!temInicio) {
            return {
                isValid: false,
                isFullyCompliant: false,
                similarity: similarity,
                type: 'error',
                reason: 'MISSING_INITIAL_WORD',
                message: `❌ Reprovado: Faltou falar a palavra antes de soletrar.`,
                alinhamento: alinhamento,
                details: {
                    temInicio,
                    temFim,
                    prefixText,
                    suffixText,
                    prefixSim,
                    suffixSim,
                    edgeThresholdUsed,
                    edgeBleedingDetected,
                    similarity: similarity,
                    textoOriginal: rawText,
                    arrayLetrasDetectadas: tokens,
                    arrayLetrasCasadas: matchedTokens,
                    stringFinal: stringFinalExtraida,
                    stringGabarito: stringGabarito,
                    alinhamento: alinhamento
                }
            };
        }

        if (!temFim) {
            return {
                isValid: false,
                isFullyCompliant: false,
                similarity: similarity,
                type: 'error',
                reason: 'MISSING_FINAL_WORD',
                message: `❌ Reprovado: Faltou falar a palavra para finalizar.`,
                alinhamento: alinhamento,
                details: {
                    temInicio,
                    temFim,
                    prefixText,
                    suffixText,
                    prefixSim,
                    suffixSim,
                    edgeThresholdUsed,
                    edgeBleedingDetected,
                    similarity: similarity,
                    textoOriginal: rawText,
                    arrayLetrasDetectadas: tokens,
                    arrayLetrasCasadas: matchedTokens,
                    stringFinal: stringFinalExtraida,
                    stringGabarito: stringGabarito,
                    alinhamento: alinhamento
                }
            };
        }

        // 6. APROVAÇÃO (Palavra + Soletração + Palavra)
        return {
            isValid: true,
            isFullyCompliant: true,
            similarity: similarity,
            type: 'success',
            reason: 'APPROVED_3_STEPS',
            message: `🎉 Perfeito! Executou os 3 passos rigorosamente: Palavra ➔ Soletração ➔ Palavra!`,
            alinhamento: alinhamento,
            details: {
                temInicio,
                temFim,
                prefixText,
                suffixText,
                prefixSim,
                suffixSim,
                edgeThresholdUsed,
                edgeBleedingDetected,
                similarity: similarity,
                textoOriginal: rawText,
                arrayLetrasDetectadas: tokens,
                arrayLetrasCasadas: matchedTokens,
                stringFinal: stringFinalExtraida,
                stringGabarito: stringGabarito,
                alinhamento: alinhamento
            }
        };
    }

    /**
     * Valida as pontas do Sanduíche (Palavra Inicial e Final) aplicando Borda Flexível:
     * 1. Análise de Miolo Prioritária: Se a similaridade do miolo for >= 85%, o sistema reconhece a soletração.
     * 2. Absorção de Pontas (Edge Bleeding): Tolera resíduos e ecos fonéticos nas pontas (ex: A-S antes/depois da soletração).
     * 3. Fallback Híbrido: Para expressões compostas (com SPACE), se miolo >= 90%, o threshold das pontas cai para 40%.
     * 
     * @param {Object} candidate - Candidato selecionado da janela de soletração
     * @param {string} target - Palavra/frase alvo normalizada
     * @param {Array<string>} targetWords - Array de palavras da frase alvo
     * @param {Array<string>} gabaritoArray - Gabarito de tokens oficial
     * @param {Object} [options] - Opções adicionais (threshold, edgeThreshold, compoundEdgeThreshold)
     * @returns {{ temInicio: boolean, temFim: boolean, prefixSim: number, suffixSim: number, edgeThresholdUsed: number, edgeBleedingDetected: boolean }}
     */
    _validateEdges(candidate, target, targetWords, gabaritoArray, options = {}) {
        const hasSpaceRequirement = targetWords.length > 1;
        const defaultEdgeThreshold = typeof options.edgeThreshold === 'number' ? options.edgeThreshold : this.DEFAULT_EDGE_THRESHOLD; // 0.70
        const compoundFallbackThreshold = typeof options.compoundEdgeThreshold === 'number' ? options.compoundEdgeThreshold : this.DEFAULT_COMPOUND_EDGE_THRESHOLD; // 0.40

        const similarity = candidate.similarity || 0;
        
        // Fallback Híbrido: Para expressões compostas, com miolo >= 90%, o threshold exigido nas pontas cai para 40%
        const isHybridEligible = hasSpaceRequirement && similarity >= 0.90;
        const effectiveEdgeThreshold = isHybridEligible ? Math.min(defaultEdgeThreshold, compoundFallbackThreshold) : defaultEdgeThreshold;

        const firstWord = targetWords[0] || '';
        const lastWord = targetWords[targetWords.length - 1] || '';
        const firstWordGabarito = this._buildGabarito(firstWord);
        const lastWordGabarito = this._buildGabarito(lastWord);

        const prefixText = candidate.prefixText || '';
        const suffixText = candidate.suffixText || '';
        const startIndex = candidate.startIndex ?? 0;
        const endIndex = candidate.endIndex ?? (candidate.tokens ? candidate.tokens.length : 0);
        const tokens = candidate.tokens || [];
        const matchedTokens = candidate.matchedTokens || [];

        let temInicio = false;
        let temFim = false;
        let edgeBleedingDetected = false;

        // --- AVALIAÇÃO DA BORDA INICIAL (temInicio) ---
        let bestPrefixSim = 0;

        // 1.1 Comparação do texto do prefixo com a frase alvo completa e com a primeira palavra
        if (prefixText.length > 0) {
            const simTarget = this.calculateWordSimilarity(prefixText, target);
            const simFirst = this.calculateWordSimilarity(prefixText, firstWord);
            bestPrefixSim = Math.max(simTarget, simFirst);

            // 1.2 Comparação fonética dos tokens do prefixo
            const prefixTokens = this.tokenize(prefixText);
            if (prefixTokens.length > 0) {
                const simTokensFirst = this.calculateSimilarity(prefixTokens, firstWordGabarito);
                const simTokensTarget = this.calculateSimilarity(prefixTokens, gabaritoArray);
                bestPrefixSim = Math.max(bestPrefixSim, simTokensFirst, simTokensTarget);
            }

            if (bestPrefixSim >= effectiveEdgeThreshold) {
                temInicio = true;
            }
        }

        // 1.3 Absorção de Pontas Externa (Tokens residuais antes da janela de soletração)
        if (!temInicio && startIndex > 0) {
            const leftoverPrefixTokens = tokens.slice(0, startIndex);
            if (leftoverPrefixTokens.length > 0) {
                const simResFirst = this.calculateSimilarity(leftoverPrefixTokens, firstWordGabarito);
                const simResTarget = this.calculateSimilarity(leftoverPrefixTokens, gabaritoArray);
                const maxResSim = Math.max(simResFirst, simResTarget);
                if (maxResSim >= effectiveEdgeThreshold) {
                    temInicio = true;
                    edgeBleedingDetected = true;
                    bestPrefixSim = Math.max(bestPrefixSim, maxResSim);
                }
            }
        }

        // 1.4 Absorção de Pontas Interna (Vazamento Acústico onde a palavra inicial fundiu no miolo)
        if (!temInicio && isHybridEligible) {
            // Em expressões compostas com miolo >= 90%, verifica se o início do miolo contém o eco da primeira palavra
            if (firstWordGabarito.length > 0 && matchedTokens.length >= firstWordGabarito.length) {
                const headSlice = matchedTokens.slice(0, firstWordGabarito.length);
                const headSim = this.calculateSimilarity(headSlice, firstWordGabarito);
                if (headSim >= effectiveEdgeThreshold || headSim >= 0.50) {
                    temInicio = true;
                    edgeBleedingDetected = true;
                    bestPrefixSim = Math.max(bestPrefixSim, headSim);
                }
            }
        }

        // --- AVALIAÇÃO DA BORDA FINAL (temFim) ---
        let bestSuffixSim = 0;

        // 2.1 Comparação do texto do sufixo com a frase alvo completa e com a última palavra
        if (suffixText.length > 0) {
            const simTarget = this.calculateWordSimilarity(suffixText, target);
            const simLast = this.calculateWordSimilarity(suffixText, lastWord);
            bestSuffixSim = Math.max(simTarget, simLast);

            // 2.2 Comparação fonética dos tokens do sufixo
            const suffixTokens = this.tokenize(suffixText);
            if (suffixTokens.length > 0) {
                const simTokensLast = this.calculateSimilarity(suffixTokens, lastWordGabarito);
                const simTokensTarget = this.calculateSimilarity(suffixTokens, gabaritoArray);
                bestSuffixSim = Math.max(bestSuffixSim, simTokensLast, simTokensTarget);
            }

            if (bestSuffixSim >= effectiveEdgeThreshold) {
                temFim = true;
            }
        }

        // 2.3 Absorção de Pontas Externa (Tokens residuais após a janela de soletração)
        if (!temFim && endIndex < tokens.length) {
            const leftoverSuffixTokens = tokens.slice(endIndex);
            if (leftoverSuffixTokens.length > 0) {
                const simResLast = this.calculateSimilarity(leftoverSuffixTokens, lastWordGabarito);
                const simResTarget = this.calculateSimilarity(leftoverSuffixTokens, gabaritoArray);
                const maxResSim = Math.max(simResLast, simResTarget);
                if (maxResSim >= effectiveEdgeThreshold) {
                    temFim = true;
                    edgeBleedingDetected = true;
                    bestSuffixSim = Math.max(bestSuffixSim, maxResSim);
                }
            }
        }

        // 2.4 Absorção de Pontas Interna (Vazamento Acústico onde a palavra final fundiu no miolo)
        if (!temFim && isHybridEligible) {
            // Em expressões compostas com miolo >= 90%, verifica se o final do miolo contém o eco da última palavra
            if (lastWordGabarito.length > 0 && matchedTokens.length >= lastWordGabarito.length) {
                const tailSlice = matchedTokens.slice(-lastWordGabarito.length);
                const tailSim = this.calculateSimilarity(tailSlice, lastWordGabarito);
                if (tailSim >= effectiveEdgeThreshold || tailSim >= 0.50) {
                    temFim = true;
                    edgeBleedingDetected = true;
                    bestSuffixSim = Math.max(bestSuffixSim, tailSim);
                }
            }
        }

        return {
            temInicio,
            temFim,
            prefixSim: bestPrefixSim,
            suffixSim: bestSuffixSim,
            edgeThresholdUsed: effectiveEdgeThreshold,
            edgeBleedingDetected
        };
    }

    /**
     * Constrói o gabarito de soletração oficial com suporte a letras (A-Z) e dígitos (0-9)
     * @param {string} palavraAlvo 
     * @returns {Array<string>} Gabarito de tokens (ex: ['I', 'N', 'SPACE', '1', '9', '8', '3'])
     */
    _buildGabarito(palavraAlvo) {
        if (!palavraAlvo || typeof palavraAlvo !== 'string') return [];
        // Converte hífens em espaços para tratar palavras compostas
        const words = palavraAlvo.trim().replace(/[-–—]/g, ' ').split(/\s+/).filter(w => w.length > 0);
        const gabarito = [];

        for (let wIdx = 0; wIdx < words.length; wIdx++) {
            const word = words[wIdx].replace(/[^a-zA-Z0-9]/g, '');
            for (let cIdx = 0; cIdx < word.length; cIdx++) {
                gabarito.push(word[cIdx].toUpperCase());
            }
            if (wIdx < words.length - 1) {
                gabarito.push('SPACE');
            }
        }
        return gabarito;
    }
}

if (typeof window !== 'undefined') {
    window.SpellingValidator = SpellingValidator;
    window.spellingValidator = new SpellingValidator();
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SpellingValidator;
}
