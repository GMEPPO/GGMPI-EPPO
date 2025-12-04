/**
 * Sistema de Autenticación con Supabase Auth
 * Maneja login, registro, sesiones y verificación de autenticación
 */

class AuthManager {
    constructor() {
        this.supabase = null;
        this.currentUser = null;
        this.isInitialized = false;
    }

    /**
     * Inicializar el sistema de autenticación
     */
    async initialize() {
        if (this.isInitialized) {
            return this.supabase;
        }

        try {
            // Obtener cliente Supabase
            if (window.universalSupabase) {
                this.supabase = await window.universalSupabase.getClient();
            } else if (typeof supabase !== 'undefined') {
                const SUPABASE_URL = 'https://fzlvsgjvilompkjmqeoj.supabase.co';
                const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6bHZzZ2p2aWxvbXBram1xZW9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzNjQyODYsImV4cCI6MjA3Mzk0MDI4Nn0.KbH8qLOoWrVeXcTHelQNIzXoz0tutVGJHqkYw3GPFPY';
                this.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                    auth: {
                        persistSession: true,
                        autoRefreshToken: true,
                        detectSessionInUrl: true
                    }
                });
            } else {
                throw new Error('Supabase no está disponible');
            }

            // Verificar sesión actual
            const { data: { session } } = await this.supabase.auth.getSession();
            if (session) {
                this.currentUser = session.user;
            }

            // Escuchar cambios de autenticación
            this.supabase.auth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_IN') {
                    this.currentUser = session?.user || null;
                } else if (event === 'SIGNED_OUT') {
                    this.currentUser = null;
                }
            });

            this.isInitialized = true;
            return this.supabase;
        } catch (error) {
            console.error('Error inicializando AuthManager:', error);
            throw error;
        }
    }

    /**
     * Obtener cliente Supabase
     */
    async getClient() {
        if (!this.isInitialized) {
            await this.initialize();
        }
        return this.supabase;
    }

    /**
     * Iniciar sesión con email y contraseña
     */
    async login(email, password) {
        try {
            const client = await this.getClient();
            const { data, error } = await client.auth.signInWithPassword({
                email: email.trim(),
                password: password
            });

            if (error) throw error;

            this.currentUser = data.user;
            return {
                success: true,
                user: data.user,
                session: data.session
            };
        } catch (error) {
            console.error('Error en login:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Registrar nuevo usuario
     */
    async signUp(email, password, metadata = {}) {
        try {
            const client = await this.getClient();
            const { data, error } = await client.auth.signUp({
                email: email.trim(),
                password: password,
                options: {
                    data: metadata
                }
            });

            if (error) throw error;

            return {
                success: true,
                user: data.user,
                session: data.session
            };
        } catch (error) {
            console.error('Error en registro:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Cerrar sesión
     */
    async logout() {
        try {
            const client = await this.getClient();
            const { error } = await client.auth.signOut();

            if (error) throw error;

            this.currentUser = null;
            return {
                success: true
            };
        } catch (error) {
            console.error('Error en logout:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Obtener usuario actual
     */
    async getCurrentUser() {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (this.currentUser) {
            return this.currentUser;
        }

        try {
            const client = await this.getClient();
            const { data: { user } } = await client.auth.getUser();
            this.currentUser = user;
            return user;
        } catch (error) {
            console.error('Error obteniendo usuario actual:', error);
            return null;
        }
    }

    /**
     * Verificar si el usuario está autenticado
     */
    async isAuthenticated() {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            const client = await this.getClient();
            // Usar getSession() que lee de localStorage y es más confiable
            const { data: { session } } = await client.auth.getSession();
            
            if (session && session.user) {
                this.currentUser = session.user;
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Error verificando autenticación:', error);
            return false;
        }
    }

    /**
     * Requerir autenticación (redirige a login si no está autenticado)
     */
    async requireAuth(redirectTo = 'login.html') {
        // Esperar un momento para que la sesión se cargue desde localStorage
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const isAuth = await this.isAuthenticated();
        if (!isAuth) {
            // Solo redirigir si no estamos ya en la página de login
            if (!window.location.pathname.includes('login.html')) {
                window.location.href = redirectTo;
            }
            return false;
        }
        return true;
    }

    /**
     * Enviar email de recuperación de contraseña
     */
    async resetPassword(email) {
        try {
            const client = await this.getClient();
            const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: `${window.location.origin}/reset-password.html`
            });

            if (error) throw error;

            return {
                success: true
            };
        } catch (error) {
            console.error('Error enviando email de recuperación:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Actualizar contraseña
     */
    async updatePassword(newPassword) {
        try {
            const client = await this.getClient();
            const { error } = await client.auth.updateUser({
                password: newPassword
            });

            if (error) throw error;

            return {
                success: true
            };
        } catch (error) {
            console.error('Error actualizando contraseña:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Crear usuario con Admin API (requiere service_role key)
     * Nota: Esto debe hacerse desde el backend por seguridad
     */
    async createUserWithAdmin(email, password, metadata = {}) {
        try {
            // IMPORTANTE: Esta función requiere usar el Admin API de Supabase
            // que necesita la service_role key. Por seguridad, esto debe hacerse
            // desde un backend o Edge Function de Supabase.
            
            // Por ahora, usamos signUp normal que requiere confirmación de email
            return await this.signUp(email, password, metadata);
        } catch (error) {
            console.error('Error creando usuario con Admin:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Crear instancia global
if (typeof window.authManager === 'undefined') {
    window.authManager = new AuthManager();
    // Auto-inicializar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.authManager.initialize();
        });
    } else {
        window.authManager.initialize();
    }
}

