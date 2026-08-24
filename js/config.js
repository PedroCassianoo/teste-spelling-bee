// Configurações do Sistema e Gerenciamento da API Key da Deepgram

const CONFIG = {
    // Você pode colar sua chave diretamente aqui ou inseri-la pelo botão de configurações na interface
    DEEPGRAM_API_KEY: '',
    
    // Modelos padrão da Deepgram
    TTS_MODEL: 'aura-asteria-en', // Opções: aura-asteria-en, aura-luna-en, aura-zeus-en, etc.
    STT_MODEL: 'nova-2',          // Modelo de transcrição mais rápido e preciso
    LANGUAGE: 'en',               // Idioma das palavras
    
    // Obtém a chave salva no localStorage ou na variável estática
    getApiKey() {
        return localStorage.getItem('DEEPGRAM_API_KEY') || this.DEEPGRAM_API_KEY || '';
    },

    // Salva a chave no localStorage
    setApiKey(key) {
        if (key && key.trim() !== '') {
            localStorage.setItem('DEEPGRAM_API_KEY', key.trim());
        } else {
            localStorage.removeItem('DEEPGRAM_API_KEY');
        }
    },

    // Verifica se a chave está configurada
    hasApiKey() {
        return Boolean(this.getApiKey() && this.getApiKey().trim().length > 0);
    }
};

window.CONFIG = CONFIG;
