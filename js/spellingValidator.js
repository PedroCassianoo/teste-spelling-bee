/**
 * Motor de Validação Fonética do Spelling Bee (Pipeline Estrito de Higienização)
 * Implementa a arquitetura de 4 passos com isolamento de bordas via Regex (Trim Target).
 */

class SpellingValidator {
    constructor() {
        // Dicionário Oficial de Normalização Fonética (De-Para)
        this.DICIONARIO = {
            // A
            'a': 'A', 'ah': 'A', 'aye': 'A', 'eight': 'A', 'ay': 'A', 'ei': 'A',
            // B
            'be': 'B', 'bee': 'B', 'b': 'B',
            // C
            'see': 'C', 'sea': 'C', 'si': 'C', 'c': 'C',
            // D
            'de': 'D', 'di': 'D', 'thee': 'D', 'd': 'D', 'dee': 'D',
            // E
            'i': 'E', 'he': 'E', 'e': 'E', 'ee': 'E',
            // F
            'ef': 'F', 'half': 'F', 'if': 'F', 'f': 'F', 'eff': 'F',
            // G
            'jee': 'G', 'gee': 'G', 'g': 'G', 'ji': 'G',
            // H
            'aitch': 'H', 'age': 'H', 'eight': 'H', 'h': 'H', 'ach': 'H', 'eitch': 'H', 'hache': 'H',
            // I
            'eye': 'I', 'aye': 'I', 'ah': 'I', 'i': 'I', 'ai': 'I',
            // J
            'jay': 'J', 'hey': 'J', 'j': 'J', 'jei': 'J',
            // K
            'kay': 'K', 'ok': 'K', 'k': 'K', 'kei': 'K',
            // L
            'el': 'L', 'hell': 'L', 'l': 'L', 'ell': 'L',
            // M
            'em': 'M', 'am': 'M', 'm': 'M',
            // N
            'en': 'N', 'an': 'N', 'and': 'N', 'in': 'N', 'n': 'N',
            // O
            'oh': 'O', 'owe': 'O', 'zero': 'O', 'o': 'O', 'ou': 'O',
            // P
            'pe': 'P', 'pee': 'P', 'pea': 'P', 'p': 'P', 'pi': 'P',
            // Q
            'queue': 'Q', 'cue': 'Q', 'q': 'Q', 'kyu': 'Q',
            // R
            'are': 'R', 'our': 'R', 'ar': 'R', 'r': 'R',
            // S (Confusões críticas resolvidas pelo isolamento do miolo)
            'as': 'S', 'is': 'S', 'yes': 'S', 'ass': 'S', 'es': 'S', 's': 'S', 'ess': 'S',
            // T
            'tea': 'T', 'tee': 'T', 'ti': 'T', 't': 'T',
            // U
            'you': 'U', 'yu': 'U', 'u': 'U',
            // V
            've': 'V', 'vee': 'V', 'v': 'V', 'vi': 'V',
            // W
            'double you': 'W', 'double u': 'W', 'double-u': 'W', 'doubleyou': 'W', 'w': 'W', 'dabliu': 'W',
            // X
            'ex': 'X', 'axe': 'X', 'x': 'X',
            // Y
            'why': 'Y', 'wai': 'Y', 'y': 'Y', 'uai': 'Y',
            // Z
            'zee': 'Z', 'zed': 'Z', 'z': 'Z', 'zi': 'Z',

            // Comandos Especiais
            'space': 'SPACE', 'pace': 'SPACE', 'spice': 'SPACE', 'base': 'SPACE', 'spay': 'SPACE', 'blank': 'SPACE',
            'double': 'DOUBLE', 'buble': 'DOUBLE', 'dabble': 'DOUBLE', 'bobble': 'DOUBLE'
        };
    }

    /**
     * Pipeline Estrito de Higienização e Validação do Spelling Bee
     * @param {string} transcricaoStt - Retorno bruto do STT (Deepgram)
     * @param {string} palavraAlvo - Palavra/Frase alvo do gabarito (ex: "as tasty as", "happy")
     */
    validate(transcricaoStt, palavraAlvo) {
        if (!transcricaoStt || !transcricaoStt.trim()) {
            return {
                isValid: false,
                reason: 'NO_SPEECH',
                message: 'Não conseguimos capturar sua voz. Fale próximo ao microfone.',
                details: {}
            };
        }

        // =========================================================================
        // PASSO 1: Captura e Padronização Inicial
        // =========================================================================
        const cleanStr = (str) => str.toLowerCase().replace(/[-–—.,!?:;"]/g, ' ').replace(/\s+/g, ' ').trim();
        const rawText = cleanStr(transcricaoStt);
        const target = cleanStr(palavraAlvo);

        // Helper para escapar Regex
        const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // =========================================================================
        // PASSO 2: Extração das Bordas (Trim Target) ANTES de qualquer modificação
        // =========================================================================
        const prefixRegex = new RegExp(`^${escapeRegExp(target)}(\\s+|$)`, 'i');
        const suffixRegex = new RegExp(`(\\s+|^)${escapeRegExp(target)}$`, 'i');

        const hasInitialWord = prefixRegex.test(rawText);
        const hasFinalWord = suffixRegex.test(rawText);

        // Remove o alvo das pontas e isola estritamente o "Miolo"
        let miolo = rawText.replace(prefixRegex, '').replace(suffixRegex, '').trim();

        // =========================================================================
        // PASSO 3 & 4: Processamento do Miolo e Aplicação do Dicionário
        // =========================================================================
        const tokens = miolo.split(/\s+/).filter(t => t.length > 0);
        const resultadoSoletracao = [];
        let i = 0;

        while (i < tokens.length) {
            const token = tokens[i];
            const nextToken = tokens[i + 1] || '';
            const compoundToken = `${token} ${nextToken}`.trim();

            // 1. Tratar "double you" / "double u" -> 'W'
            if (this.DICIONARIO[compoundToken] === 'W') {
                resultadoSoletracao.push('W');
                i += 2;
                continue;
            }

            // 2. Tratar comando DOUBLE + [Letra] (ex: "double" + "tea" -> "T", "T")
            if (this.DICIONARIO[token] === 'DOUBLE' && nextToken) {
                const mappedLetter = this.DICIONARIO[nextToken] || nextToken.toUpperCase();
                resultadoSoletracao.push(mappedLetter);
                resultadoSoletracao.push(mappedLetter);
                i += 2;
                continue;
            }

            // 3. Aplicação do Dicionário De-Para no Token
            if (this.DICIONARIO[token]) {
                resultadoSoletracao.push(this.DICIONARIO[token]);
            } else {
                // Caso contenha caracteres soltos concatenados
                for (const ch of token) {
                    const mappedCh = this.DICIONARIO[ch] || ch.toUpperCase();
                    resultadoSoletracao.push(mappedCh);
                }
            }
            i++;
        }

        // =========================================================================
        // GABARITO CANÔNICO & COMPARAÇÃO
        // =========================================================================
        const gabaritoArray = this._buildGabarito(palavraAlvo);
        const stringFinalExtraida = resultadoSoletracao.join(' - ');
        const stringGabarito = gabaritoArray.join(' - ');

        // Comparação estrita
        const exactMatch = (stringFinalExtraida === stringGabarito);

        // Comparação tolerante para SPACE se o aluno soletrou todas as letras perfeitamente
        const targetWords = palavraAlvo.trim().split(/\s+/);
        const hasSpaceRequirement = targetWords.length > 1;
        const noSpaceParsed = resultadoSoletracao.filter(x => x !== 'SPACE').join('');
        const noSpaceExpected = gabaritoArray.filter(x => x !== 'SPACE').join('');
        const matchNoSpace = (noSpaceParsed === noSpaceExpected);

        let isValid = exactMatch || matchNoSpace;
        let isFullyCompliant = exactMatch && hasInitialWord && hasFinalWord;
        let message = '';
        let type = 'success';

        if (isFullyCompliant) {
            message = `🎉 Perfeito! Executou os 3 passos rigorosamente: Palavra ➔ Soletração ➔ Palavra!`;
        } else if (exactMatch) {
            if (!hasInitialWord && !hasFinalWord) {
                message = `✅ Soletração perfeita! Lembre-se de falar a palavra no início e no final.`;
            } else if (!hasInitialWord) {
                message = `✅ Soletração perfeita! Lembre-se de falar a palavra antes de começar.`;
            } else {
                message = `✅ Soletração perfeita! Lembre-se de repetir a palavra ao finalizar.`;
            }
        } else if (matchNoSpace && hasSpaceRequirement && !resultadoSoletracao.includes('SPACE')) {
            isValid = false;
            type = 'error';
            message = `⚠️ Você esqueceu de falar "SPACE" para separar as palavras da expressão!`;
        } else {
            isValid = false;
            type = 'error';
            message = `❌ Erro na soletração. Esperado: [${stringGabarito}]`;
        }

        return {
            isValid: isValid,
            isFullyCompliant: isFullyCompliant,
            type: type,
            message: message,
            details: {
                hasInitialWord,
                hasFinalWord,
                textoOriginal: rawText,
                mioloIdentificado: miolo,
                arrayLetras: resultadoSoletracao,
                stringFinal: stringFinalExtraida,
                stringGabarito: stringGabarito
            }
        };
    }

    _buildGabarito(palavraAlvo) {
        const words = palavraAlvo.trim().split(/\s+/);
        const gabarito = [];

        for (let wIdx = 0; wIdx < words.length; wIdx++) {
            const word = words[wIdx].replace(/[^a-zA-Z]/g, '');
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
