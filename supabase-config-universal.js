/**
 * 🔧 CONFIGURACIÓN UNIVERSAL DE SUPABASE
 * 
 * Este archivo proporciona una configuración robusta de Supabase
 * que funciona en todos los entornos: local, Netlify, y otras plataformas.
 */

function readEnvVariable(key) {
    try {
        // Entornos con process.env (Netlify, Node, Vercel, etc.)
        if (typeof process !== 'undefined' && process.env && process.env[key]) {
            return process.env[key];
        }

        // Variables inyectadas manualmente en window
        if (typeof window !== 'undefined' && window && window[key]) {
            return window[key];
        }

        // Variables agrupadas en window.__ENV__ u objetos similares
        if (typeof window !== 'undefined' && window && window.__ENV__ && window.__ENV__[key]) {
            return window.__ENV__[key];
        }

        // Vercel inyecta variables en window durante el build
        // Intentar leer también sin prefijo VITE_ para compatibilidad con Vercel
        if (key.startsWith('VITE_')) {
            const keyWithoutPrefix = key.replace('VITE_', '');
            if (typeof process !== 'undefined' && process.env && process.env[keyWithoutPrefix]) {
                return process.env[keyWithoutPrefix];
            }
            if (typeof window !== 'undefined' && window && window[keyWithoutPrefix]) {
                return window[keyWithoutPrefix];
            }
        }
    } catch (error) {
        // Variable de entorno no disponible
    }
    return null;
}

// Configuración base de Supabase
if (typeof window.SUPABASE_CONFIG === 'undefined') {
    window.SUPABASE_CONFIG = {
        url: readEnvVariable('VITE_SUPABASE_URL') || 'https://jtjilvqwehfhpxrjirtb.supabase.co',
        anonKey:
            readEnvVariable('VITE_SUPABASE_ANON_KEY') ||
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0amlsdnF3ZWhmaHB4cmppcnRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2Njc4NDEsImV4cCI6MjA4MDI0Mzg0MX0.5Lpd_oGOXTVLEnqMArBCWpfaHzOxgvgGQ60i3t8ZGvc'
    };
}
// Usar window.SUPABASE_CONFIG directamente o crear variable solo si no existe
var SUPABASE_CONFIG = window.SUPABASE_CONFIG;

/**
 * 🔧 Cliente Supabase con configuración optimizada
 */
// Evitar redeclaración si la clase ya existe
if (typeof UniversalSupabaseClient === 'undefined') {
    var UniversalSupabaseClient = class UniversalSupabaseClient {
    constructor() {
        this.client = null;
        this.isInitialized = false;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 segundo
    }

    /**
     * Inicializar cliente Supabase
     */
    async initialize() {
        try {
            // Verificar que la biblioteca esté disponible
            if (typeof supabase === 'undefined') {
                throw new Error('Error de configuración: La biblioteca requerida no está disponible.');
            }

            // Crear cliente con configuración optimizada
            this.client = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
                auth: {
                    persistSession: true, // Persistir sesión para mantener login entre recargas
                    autoRefreshToken: true, // Refrescar token automáticamente
                    detectSessionInUrl: true // Detectar sesión en URL (para callbacks)
                },
                global: {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                },
                db: {
                    schema: 'public'
                },
                realtime: {
                    enabled: false // Deshabilitar realtime para mejor rendimiento
                }
            });

            // Test de conexión
            await this.testConnection();
            
            this.isInitialized = true;
            
            return this.client;
            
        } catch (error) {
            // Error silenciado por seguridad
            throw error;
        }
    }

    /**
     * Test de conexión básica
     */
    async testConnection() {
        try {
            // Test de conexión usando la tabla 'products' que siempre debe existir
            const { data, error } = await this.client
                .from('products')
                .select('id')
                .limit(1);

            if (error) {
                throw new Error(`Error de conexión: ${error.message}`);
            }

            // Test de conexión exitoso
            return true;
            
        } catch (error) {
            // Error en test de conexión
            throw error;
        }
    }

    /**
     * Obtener cliente (inicializar si es necesario)
     */
    async getClient() {
        if (!this.isInitialized) {
            await this.initialize();
        }
        return this.client;
    }

    /**
     * Cargar productos con reintentos automáticos
     * Ahora usa solo la tabla 'products' unificada
     */
    async loadProducts() {
        const client = await this.getClient();
        const allProducts = [];

        try {
            const { data, error } = await client
                .from('products')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                // Reintentar si no hemos alcanzado el máximo
                if (this.retryCount < this.maxRetries) {
                    this.retryCount++;
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay * this.retryCount));
                    return this.loadProducts();
                }
                return allProducts;
            }

            if (data && data.length > 0) {
                // Los productos ya tienen su categoría en el campo 'category' o 'categoria'
                data.forEach(product => {
                    allProducts.push({
                        ...product,
                        categoria: product.category || product.categoria || 'general'
                    });
                });
            }
            
        } catch (error) {
            // Reintentar si no hemos alcanzado el máximo
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                await new Promise(resolve => setTimeout(resolve, this.retryDelay * this.retryCount));
                return this.loadProducts();
            }
        }
        return allProducts;
    }

    /**
     * Obtener información de configuración
     */
    getConfig() {
        return {
            isInitialized: this.isInitialized,
            retryCount: this.retryCount
        };
    }
    }; // Fin de la clase
} // Fin del if

// Crear instancia solo si no existe
if (typeof universalSupabase === 'undefined') {
    var universalSupabase = new UniversalSupabaseClient();
}

// Exportar para uso en módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { UniversalSupabaseClient, universalSupabase, SUPABASE_CONFIG };
}

// Exportar para uso en navegador
if (typeof window !== 'undefined') {
    if (typeof window.UniversalSupabaseClient === 'undefined') {
        window.UniversalSupabaseClient = UniversalSupabaseClient;
    }
    if (typeof window.universalSupabase === 'undefined') {
        window.universalSupabase = universalSupabase;
    }
    if (typeof window.SUPABASE_CONFIG === 'undefined') {
        window.SUPABASE_CONFIG = SUPABASE_CONFIG;
    }
}

// Auto-inicializar si estamos en el navegador
// Nota: La inicialización se hará cuando se llame explícitamente desde otros scripts
// para evitar problemas de orden de carga

