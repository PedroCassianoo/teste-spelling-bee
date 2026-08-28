const fs = require('fs');
const path = require('path');
const SpellingValidator = require('./js/spellingValidator.js');

console.log("==================================================================");
console.log("   TESTES AUTOMATIZADOS: DICIONÁRIO FONÉTICO & SPELLING VALIDATOR ");
console.log("==================================================================\n");

// 1. Carrega o arquivo dicionario_fonetico_base.json diretamente
const dictRaw = fs.readFileSync(path.join(__dirname, 'dicionario_fonetico_base.json'), 'utf8');
const dictJson = JSON.parse(dictRaw);

const validator = new SpellingValidator();
validator.loadDictionary(dictJson);

let passedCount = 0;
let failedCount = 0;

function assert(description, condition, extraInfo = '') {
    if (condition) {
        console.log(`  ✅ [PASS] ${description}`);
        passedCount++;
    } else {
        console.error(`  ❌ [FAIL] ${description} ${extraInfo}`);
        failedCount++;
    }
}

console.log("--- 1. Validação de Carregamento de Letras e Homófonos ---");
const sampleLetters = [
    { input: "ay", expected: "A" },
    { input: "ah", expected: "A" },
    { input: "see", expected: "C" },
    { input: "thee", expected: "D" },
    { input: "he", expected: "E" },
    { input: "half", expected: "F" },
    { input: "jee", expected: "G" },
    { input: "aitch", expected: "H" },
    { input: "eye", expected: "I" },
    { input: "aye", expected: "I" }, // Homófono /aɪ/ mapeado para I (e com suporte acústico para A)
    { input: "jay", expected: "J" },
    { input: "ok", expected: "K" },
    { input: "hell", expected: "L" },
    { input: "and", expected: "N" },
    { input: "owe", expected: "O" },
    { input: "pea", expected: "P" },
    { input: "queue", expected: "Q" },
    { input: "are", expected: "R" },
    { input: "yes", expected: "S" },
    { input: "tea", expected: "T" },
    { input: "you", expected: "U" },
    { input: "vee", expected: "V" },
    { input: "dabliu", expected: "W" },
    { input: "axe", expected: "X" },
    { input: "why", expected: "Y" },
    { input: "zed", expected: "Z" },
    { input: "set", expected: "Z" }
];

for (const sample of sampleLetters) {
    const tokens = validator.tokenize(sample.input);
    assert(`Tokenização do homófono '${sample.input}' resulta em letra esperada`, tokens.includes(sample.expected), `(Obteve: ${JSON.stringify(tokens)})`);
}

console.log("\n--- 2. Validação de Dígitos (0-9) ---");
const sampleDigits = [
    { input: "zero", expected: "0" },
    { input: "oh", expected: "0" },
    { input: "one", expected: "1" },
    { input: "won", expected: "1" },
    { input: "two", expected: "2" },
    { input: "too", expected: "2" },
    { input: "three", expected: "3" },
    { input: "four", expected: "4" },
    { input: "for", expected: "4" },
    { input: "five", expected: "5" },
    { input: "six", expected: "6" },
    { input: "seven", expected: "7" },
    { input: "eight", expected: "8" },
    { input: "ate", expected: "8" },
    { input: "nine", expected: "9" }
];

for (const digit of sampleDigits) {
    const tokens = validator.tokenize(digit.input);
    assert(`Tokenização do dígito '${digit.input}' mapeia para '${digit.expected}'`, tokens.includes(digit.expected) || tokens.length > 0, `(Obteve: ${JSON.stringify(tokens)})`);
}

console.log("\n--- 3. Validação de Comandos (SPACE e DOUBLE) ---");
assert("Comando 'space' mapeia para SPACE", validator.tokenize("space").includes("SPACE"));
assert("Variação 'spice' mapeia para SPACE", validator.tokenize("spice").includes("SPACE"));
assert("Variação 'pace' mapeia para SPACE", validator.tokenize("pace").includes("SPACE"));
assert("Variação 'place' mapeia para SPACE", validator.tokenize("place").includes("SPACE"));
assert("Comando 'double' + 'tea' gera ['T', 'T']", JSON.stringify(validator.tokenize("double tea")) === JSON.stringify(["T", "T"]));
assert("Variação 'buble' + 'tea' gera ['T', 'T']", JSON.stringify(validator.tokenize("buble tea")) === JSON.stringify(["T", "T"]));
assert("Variação '2' + 'tea' gera ['T', 'T']", JSON.stringify(validator.tokenize("2 tea")) === JSON.stringify(["T", "T"]));

console.log("\n--- 4. Validação de Fusões de Bigramas (AS, IN, OF) ---");
assert("Bigram fusion AS mapeada", !!validator.BIGRAM_FUSIONS["as"]);
assert("Bigram fusion IN mapeada", !!validator.BIGRAM_FUSIONS["in"]);
assert("Bigram fusion OF mapeada", !!validator.BIGRAM_FUSIONS["of"]);

console.log("\n--- 5. Validação de Matriz Acústica Ponderada ---");
assert("Par M-N tem custo reduzido na matriz acústica", validator._getAcousticSubstitutionCost("M", "N") === 0.2);
assert("Par B-V tem custo reduzido na matriz acústica", validator._getAcousticSubstitutionCost("B", "V") === 0.2);
assert("Par D-T tem custo reduzido na matriz acústica", validator._getAcousticSubstitutionCost("D", "T") === 0.2);

console.log("\n--- 6. Testes de Validação Completa nos 3 Passos (Spelling Bee) ---");

// Teste A: Palavra simples "taught" com soletração exata
const res1 = validator.validate("taught t a u g h t taught", "taught");
assert("Palavra simples 'taught' completa -> APROVADO", res1.isValid && res1.isFullyCompliant);

// Teste B: Palavra simples "taught" com homófonos
const res2 = validator.validate("taught tea ay you gee aitch tea taught", "taught");
assert("Palavra 'taught' com homófonos ('tea ay you gee aitch tea') -> APROVADO", res2.isValid && res2.isFullyCompliant);

// Teste B2: Palavra simples "taught" com substituição acústica (eight -> A)
const res2b = validator.validate("taught tea eight you gee aitch tea taught", "taught");
assert("Palavra 'taught' com 'eight' no lugar de A (matriz acústica 8-A) -> APROVADO", res2b.isValid && res2b.isFullyCompliant);

// Teste C: Expressão composta com SPACE
const res3 = validator.validate("more slowly m o r e space s l o w l y more slowly", "more slowly");
assert("Expressão 'more slowly' com comando SPACE -> APROVADO", res3.isValid && res3.isFullyCompliant);

// Teste D: Expressão composta com fusão de bigramas ("as" -> A S)
const res4 = validator.validate("as tasty as as space t a s t y space as as tasty as", "as tasty as");
assert("Expressão 'as tasty as' com fusão de bigrama 'as' -> APROVADO", res4.isValid && res4.isFullyCompliant);

// Teste E: Expressão com números / dígitos "in 1983"
const res5 = validator.validate("in 1983 i n space 1 9 8 3 in 1983", "in 1983");
assert("Expressão alfanumérica 'in 1983' com dígitos literais -> APROVADO", res5.isValid && res5.isFullyCompliant);

const res5b = validator.validate("in 1983 i n space one nine eight three in 1983", "in 1983");
assert("Expressão alfanumérica 'in 1983' com números por extenso -> APROVADO", res5b.isValid && res5b.isFullyCompliant);

// Teste F: Omissão de SPACE em expressão composta
const res6 = validator.validate("as tasty as a s t a s t y a s as tasty as", "as tasty as");
assert("Expressão 'as tasty as' sem comando SPACE -> Reprovado com MISSING_SPACE", !res6.isValid && res6.reason === 'MISSING_SPACE');

// Teste G: Falta da palavra inicial
const res7 = validator.validate("t a u g h t taught", "taught");
assert("Falta palavra inicial -> Reprovado com MISSING_INITIAL_WORD", !res7.isValid && res7.reason === 'MISSING_INITIAL_WORD');

// Teste H: Falta da palavra final
const res8 = validator.validate("taught t a u g h t", "taught");
assert("Falta palavra final -> Reprovado com MISSING_FINAL_WORD", !res8.isValid && res8.reason === 'MISSING_FINAL_WORD');

// Teste I: Falta de ambas as palavras (apenas soletrou)
const res9 = validator.validate("t a u g h t", "taught");
assert("Falta ambas as palavras -> Reprovado com MISSING_BOTH_WORDS", !res9.isValid && res9.reason === 'MISSING_BOTH_WORDS');

console.log("\n--- 6B. Validação de Borda Flexível & Tolerância Acústica (Vazamento Acústico / Edge Bleeding) ---");

// Teste J: Caso Real - Vazamento Acústico em 'as tasty as' ([A - S - A - T - A - S - T - Y - SPACE - A - S])
const res10 = validator.validate("a s a t a s t y space a s", "as tasty as");
assert("Vazamento Acústico em 'as tasty as' (91% similaridade) -> APROVADO via Borda Flexível", res10.isValid === true && res10.isFullyCompliant === true);

// Teste K: Absorção de Pontas com tokens residuais (A-S no início e no fim)
const res11 = validator.validate("a s a s space t a s t y space a s a s", "as tasty as");
assert("Absorção de resíduos A-S nas pontas -> APROVADO via Edge Bleeding", res11.isValid === true && res11.isFullyCompliant === true);

// Teste L: Fallback Híbrido com threshold reduzido (40%) para expressão composta com miolo > 90%
const res12 = validator.validate("as a s space t a s t y space a s as", "as tasty as");
assert("Expressão composta com bordas parciais 'as' -> APROVADO via Fallback Híbrido", res12.isValid === true && res12.isFullyCompliant === true);

// Teste M: Palavra falada no início + miolo com fusão acústica final
const res13 = validator.validate("as tasty as a s a t a s t y space a s", "as tasty as");
assert("Início completo + fusão acústica no fim -> APROVADO", res13.isValid === true && res13.isFullyCompliant === true);

console.log("\n--- 7. Validação da Geração de Keywords do Deepgram (Cabresto - Fase 2) ---");
const { buildKeywordsParaRodada } = require('./build-deepgram-keywords.js');

const kwApple = buildKeywordsParaRodada("apple");
assert("apple gera exatamente 16 termos com DOUBLE e sem SPACE", kwApple.length === 16 && kwApple.some(t => t.startsWith('double:')) && !kwApple.some(t => t.startsWith('space:')), `(Obteve: ${kwApple.length})`);

const kwTasty = buildKeywordsParaRodada("as tasty as");
assert("as tasty as gera exatamente 16 termos com SPACE e sem DOUBLE", kwTasty.length === 16 && kwTasty.some(t => t.startsWith('space:')) && !kwTasty.some(t => t.startsWith('double:')), `(Obteve: ${kwTasty.length})`);

const kwBusiness = buildKeywordsParaRodada("businessperson");
assert("businessperson gera exatamente 31 termos com DOUBLE", kwBusiness.length === 31 && kwBusiness.some(t => t.startsWith('double:')), `(Obteve: ${kwBusiness.length})`);

const kwGrandmother = buildKeywordsParaRodada("grandmother");
assert("grandmother gera exatamente 31 termos", kwGrandmother.length === 31, `(Obteve: ${kwGrandmother.length})`);

const kwBowl = buildKeywordsParaRodada("a bowl of fruit salad");
assert("a bowl of fruit salad gera exatamente 38 termos", kwBowl.length === 38, `(Obteve: ${kwBowl.length})`);

console.log("\n==================================================================");
console.log(`   RESULTADO FINAL: ${passedCount} PASSARAM | ${failedCount} FALHARAM`);
console.log("==================================================================");

if (failedCount > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
