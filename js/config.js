// Configurações do Sistema, Deepgram e Supabase

const CONFIG = {
    // Chave da API Deepgram (TTS & STT)
    DEEPGRAM_API_KEY: '63115d67aaef0948541b69d2fe6b1f6adabdef19',
    
    // Modelos da Deepgram
    TTS_MODEL: 'aura-asteria-en', // Síntese de voz feminina em inglês natural
    STT_MODEL: 'nova-2',          // Modelo de transcrição de voz com máxima precisão
    LANGUAGE: 'en',

    // Configurações do Supabase
    SUPABASE_URL: 'https://huposeqxiumvexadrylt.supabase.co',
    SUPABASE_ANON_KEY: '',

    // Deepgram Key Management
    getApiKey() {
        return localStorage.getItem('DEEPGRAM_API_KEY') || this.DEEPGRAM_API_KEY || '';
    },
    setApiKey(key) {
        if (key && key.trim() !== '') {
            localStorage.setItem('DEEPGRAM_API_KEY', key.trim());
        } else {
            localStorage.removeItem('DEEPGRAM_API_KEY');
        }
    },
    hasApiKey() {
        return Boolean(this.getApiKey() && this.getApiKey().trim().length > 0);
    },

    // Supabase Key Management
    getSupabaseKey() {
        return localStorage.getItem('SUPABASE_ANON_KEY') || this.SUPABASE_ANON_KEY || '';
    },
    setSupabaseKey(key) {
        if (key && key.trim() !== '') {
            localStorage.setItem('SUPABASE_ANON_KEY', key.trim());
        } else {
            localStorage.removeItem('SUPABASE_ANON_KEY');
        }
    }
};

window.CONFIG = CONFIG;
