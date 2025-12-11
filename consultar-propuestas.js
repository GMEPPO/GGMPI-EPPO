/**
 * Sistema de Consulta de Propuestas
 * Carga y muestra todas las propuestas enviadas desde Supabase
 */

class ProposalsManager {
    constructor() {
        this.supabase = null;
        this.allProposals = [];
        this.filteredProposals = [];
        this.currentLanguage = localStorage.getItem('language') || 'pt';
        this.init();
    }

    async init() {
        console.log('🚀 Iniciando ProposalsManager...');
        
        try {
        await this.initializeSupabase();
            
            if (!this.supabase) {
                console.error('❌ Supabase no se inicializó correctamente');
                this.showLoadingError('No se pudo conectar con la base de datos');
                return;
            }
            
            // Cargar propuestas primero (más importante)
        await this.loadProposals();
            
            // Cargar productos en segundo plano (para búsqueda, no crítico)
            this.loadAllProducts().catch(error => {
                console.warn('⚠️ Error al cargar productos (no crítico):', error);
            });
            
        this.setupEventListeners();
        this.updateTranslations();
        } catch (error) {
            console.error('❌ Error crítico en init():', error);
            this.showLoadingError('Error al inicializar la página');
        }
    }

    showLoadingError(message) {
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
        
        const noProposals = document.getElementById('noProposals');
        if (noProposals) {
            noProposals.style.display = 'block';
            noProposals.innerHTML = `
                <i class="fas fa-exclamation-triangle" style="color: var(--danger-500); font-size: 3rem; margin-bottom: var(--space-4);"></i>
                <p style="font-size: 1.125rem; font-weight: 600; margin-bottom: var(--space-2);">${message}</p>
                <p style="font-size: 0.875rem; color: var(--text-secondary);">Por favor, recarga la página o contacta al administrador.</p>
                <button onclick="location.reload()" style="margin-top: var(--space-4); padding: var(--space-3) var(--space-5); background: var(--brand-blue); color: white; border: none; border-radius: var(--radius-md); cursor: pointer;">
                    Recargar Página
                </button>
            `;
        }
    }

    async loadAllProducts() {
        if (!this.supabase) {
            console.warn('⚠️ Supabase no inicializado, no se pueden cargar productos');
            return;
        }

        try {
            const { data, error } = await this.supabase
                .from('products')
                .select('*')
                .order('nombre', { ascending: true });

            if (error) {
                throw error;
            }

            this.allProducts = (data || []).map(product => {
                // Normalizar price_tiers
                let priceTiers = [];
                if (Array.isArray(product.price_tiers)) {
                    priceTiers = product.price_tiers;
                } else if (product.price_tiers) {
                    try {
                        priceTiers = typeof product.price_tiers === 'string' ? JSON.parse(product.price_tiers) : [product.price_tiers];
                    } catch (e) {
                        console.warn('Error parseando price_tiers para producto', product.id, e);
                        priceTiers = [];
                    }
                }

                return {
                    id: product.id,
                    nombre: product.nombre || '',
                    categoria: product.categoria || 'otros',
                    precio: parseFloat(product.precio) || 0,
                    price_tiers: priceTiers,
                    plazo_entrega: product.plazo_entrega || '',
                    referencia: product.id ? String(product.id) : ''
                };
            });

            // Obtener categorías únicas
            this.productCategories = [...new Set(this.allProducts.map(p => p.categoria).filter(Boolean))];
            this.filteredProducts = [...this.allProducts];

            console.log('✅ Productos cargados para búsqueda:', this.allProducts.length);
            console.log('📂 Categorías disponibles:', this.productCategories);
        } catch (error) {
            console.error('❌ Error al cargar productos:', error);
        }
    }

    async initializeSupabase() {
        try {
            console.log('🔄 Inicializando Supabase...');
            if (window.universalSupabase) {
                console.log('📦 Usando universalSupabase');
                this.supabase = await window.universalSupabase.getClient();
            } else if (typeof supabase !== 'undefined') {
                console.log('📦 Usando supabase global');
                const SUPABASE_URL = 'https://fzlvsgjvilompkjmqeoj.supabase.co';
                const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6bHZzZ2p2aWxvbXBram1xZW9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzNjQyODYsImV4cCI6MjA3Mzk0MDI4Nn0.KbH8qLOoWrVeXcTHelQNIzXoz0tutVGJHqkYw3GPFPY';
                this.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                    auth: { persistSession: false }
                });
            } else {
                console.error('❌ No se encontró cliente Supabase disponible');
                throw new Error('No se encontró cliente Supabase');
            }
            console.log('✅ Supabase inicializado para consulta de propuestas');
        } catch (error) {
            console.error('❌ Error al inicializar Supabase:', error);
            throw error;
        }
    }

    async loadProposals() {
        console.log('📋 loadProposals() llamado');
        
        if (!this.supabase) {
            console.error('❌ Supabase no inicializado en loadProposals');
            this.showLoadingError('Error: No se pudo conectar con la base de datos');
            return;
        }

        try {
            // Mostrar indicador de carga
            const loadingIndicator = document.getElementById('loadingIndicator');
            const proposalsTable = document.getElementById('proposalsTable');
            const noProposals = document.getElementById('noProposals');
            
            if (!loadingIndicator) {
                console.error('❌ No se encontró loadingIndicator en el DOM');
            }
            
            if (loadingIndicator) loadingIndicator.style.display = 'block';
            if (proposalsTable) proposalsTable.style.display = 'none';
            if (noProposals) noProposals.style.display = 'none';

            // Cargar presupuestos con sus artículos
            console.log('🔄 Cargando presupuestos desde Supabase...');
            const { data: presupuestos, error: presupuestosError } = await this.supabase
                .from('presupuestos')
                .select('*')
                .order('created_at', { ascending: false });

            if (presupuestosError) {
                console.error('❌ Error en consulta de presupuestos:', presupuestosError);
                throw presupuestosError;
            }

            console.log('📊 Presupuestos recibidos:', presupuestos ? presupuestos.length : 0);

            // Cargar artículos para cada presupuesto
            if (presupuestos && presupuestos.length > 0) {
                const presupuestoIds = presupuestos.map(p => p.id);
                console.log('🔄 Cargando artículos para', presupuestoIds.length, 'presupuestos...');
                
                const { data: articulos, error: articulosError } = await this.supabase
                    .from('presupuestos_articulos')
                    .select('*')
                    .in('presupuesto_id', presupuestoIds);

                if (articulosError) {
                    console.error('❌ Error al cargar artículos:', articulosError);
                    // Continuar aunque haya error, pero con artículos vacíos
                } else {
                    console.log('📦 Artículos cargados:', articulos ? articulos.length : 0);
                }

                // Agrupar artículos por presupuesto
                const articulosPorPresupuesto = {};
                if (articulos) {
                    articulos.forEach(articulo => {
                        if (!articulosPorPresupuesto[articulo.presupuesto_id]) {
                            articulosPorPresupuesto[articulo.presupuesto_id] = [];
                        }
                        articulosPorPresupuesto[articulo.presupuesto_id].push(articulo);
                    });
                }

                // Combinar datos
                this.allProposals = presupuestos.map(presupuesto => ({
                    ...presupuesto,
                    articulos: articulosPorPresupuesto[presupuesto.id] || [],
                    total: (articulosPorPresupuesto[presupuesto.id] || []).reduce((sum, art) => {
                        return sum + (parseFloat(art.precio) || 0) * (parseInt(art.cantidad) || 0);
                    }, 0)
                }));

                console.log('✅ Propuestas cargadas:', this.allProposals.length);
            } else {
                this.allProposals = [];
            }

            this.filteredProposals = [...this.allProposals];
            this.renderProposals();

        } catch (error) {
            console.error('❌ Error al cargar propuestas:', error);
            this.showError('Error al cargar las propuestas');
            
            // Asegurar que se oculte el indicador de carga
            const loadingIndicator = document.getElementById('loadingIndicator');
            if (loadingIndicator) {
                loadingIndicator.style.display = 'none';
            }
            
            // Mostrar mensaje de error
            const noProposals = document.getElementById('noProposals');
            if (noProposals) {
                noProposals.style.display = 'block';
                const message = this.currentLanguage === 'es' ? 
                    'Error al cargar las propuestas. Por favor, recarga la página.' : 
                    this.currentLanguage === 'pt' ?
                    'Erro ao carregar as propostas. Por favor, recarregue a página.' :
                    'Error loading proposals. Please reload the page.';
                noProposals.innerHTML = `<i class="fas fa-exclamation-triangle"></i><p>${message}</p>`;
            }
        } finally {
            const loadingIndicator = document.getElementById('loadingIndicator');
            if (loadingIndicator) {
                loadingIndicator.style.display = 'none';
            }
        }
    }

    renderProposals() {
        const tbody = document.getElementById('proposalsTableBody');
        const table = document.getElementById('proposalsTable');
        const noProposals = document.getElementById('noProposals');
        const loadingIndicator = document.getElementById('loadingIndicator');

        // Asegurar que el indicador de carga esté oculto
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }

        if (!tbody) {
            console.error('❌ No se encontró el tbody de la tabla');
            return;
        }

        tbody.innerHTML = '';

        if (this.filteredProposals.length === 0) {
            if (table) table.style.display = 'none';
            if (noProposals) {
            noProposals.style.display = 'block';
            }
            return;
        }

        if (table) table.style.display = 'table';
        if (noProposals) noProposals.style.display = 'none';

        this.filteredProposals.forEach(proposal => {
            const row = document.createElement('tr');
            
            // Formatear fechas
            const fechaInicio = new Date(proposal.fecha_propuesta);
            const fechaInicioFormateada = fechaInicio.toLocaleDateString(this.currentLanguage === 'es' ? 'es-ES' : 
                                                           this.currentLanguage === 'pt' ? 'pt-PT' : 'en-US');
            
            const fechaUltimaActualizacion = proposal.fecha_ultima_actualizacion ? 
                new Date(proposal.fecha_ultima_actualizacion) : null;
            const fechaUltimaFormateada = fechaUltimaActualizacion ? 
                fechaUltimaActualizacion.toLocaleDateString(this.currentLanguage === 'es' ? 'es-ES' : 
                                                           this.currentLanguage === 'pt' ? 'pt-PT' : 'en-US') : '-';

            // Número de propuesta (primeros 8 caracteres del UUID)
            const proposalNumber = proposal.id ? proposal.id.substring(0, 8).toUpperCase() : '-';

            // Estado
            const statusClass = this.getStatusClass(proposal.estado_propuesta);
            const statusText = this.getStatusText(proposal.estado_propuesta);

            row.innerHTML = `
                <td>${proposalNumber}</td>
                <td>${fechaInicioFormateada}</td>
                <td>${fechaUltimaFormateada}</td>
                <td>${proposal.nombre_cliente || '-'}</td>
                <td>${proposal.nombre_comercial || '-'}</td>
                <td>${proposal.articulos.length}</td>
                <td>€${proposal.total.toFixed(2)}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <button class="btn-view-details" onclick="window.proposalsManager.viewProposalDetails('${proposal.id}')">
                        <i class="fas fa-eye"></i> <span id="view-details-text">Ver Detalles</span>
                    </button>
                </td>
            `;

            tbody.appendChild(row);
        });
    }

    getStatusClass(status) {
        const statusLower = (status || '').toLowerCase();
        if (statusLower.includes('enviada') || statusLower.includes('enviado') || statusLower === 'propuesta enviada') {
            return 'status-sent';
        } else if (statusLower.includes('pendiente')) {
            return 'status-pending';
        } else if (statusLower.includes('aprobada') || statusLower.includes('aprovada')) {
            return 'status-approved';
        } else if (statusLower.includes('rechazada') || statusLower.includes('rejeitada')) {
            return 'status-rejected';
        } else if (statusLower.includes('en curso') || statusLower.includes('em curso') || statusLower === 'propuesta_en_curso') {
            return 'status-pending'; // Mismo estilo que pendiente
        } else if (statusLower.includes('aguarda') && statusLower.includes('pagamento')) {
            return 'status-aguarda-pagamento';
        } else if (statusLower.includes('aguarda') && statusLower.includes('aprovacao')) {
            return 'status-aguarda-aprovacao';
        } else if (statusLower.includes('aguarda') && (statusLower.includes('creacion') || statusLower.includes('criação'))) {
            return 'status-aguarda-aprovacao'; // Mismo estilo que aguarda aprovação
        } else if (statusLower.includes('encomendado')) {
            return 'status-encomendado';
        } else if (statusLower.includes('concluida') || statusLower.includes('concluída')) {
            return 'status-encomendado'; // Mismo estilo que encomendado
        }
        return 'status-sent';
    }

    getStatusText(status) {
        const statusLower = (status || '').toLowerCase();
        if (this.currentLanguage === 'es') {
            if (statusLower.includes('enviada') || statusLower.includes('enviado') || statusLower === 'propuesta enviada') {
                return 'Enviada';
            } else if (statusLower.includes('en curso') || statusLower === 'propuesta_en_curso') {
                return 'Propuesta en Curso';
            } else if (statusLower.includes('pendiente')) {
                return 'Pendiente';
            } else if (statusLower.includes('aprobada') || statusLower.includes('aprovada')) {
                return 'Aprobada';
            } else if (statusLower.includes('rechazada') || statusLower.includes('rejeitada') || statusLower === 'rejeitada') {
                return 'Rechazada';
            } else if (statusLower.includes('aguarda') && statusLower.includes('pagamento') || statusLower === 'aguarda_pagamento') {
                return 'Aguarda Pago';
            } else if (statusLower.includes('aguarda') && statusLower.includes('aprovacao') || statusLower === 'aguarda_aprovacao') {
                return 'Aguarda Aprobación de Dossier';
            } else if (statusLower.includes('aguarda') && (statusLower.includes('creacion') || statusLower.includes('creación')) || statusLower === 'aguarda_creacion_cliente') {
                return 'Aguarda Creación de Cliente';
            } else if (statusLower.includes('encomendado') || statusLower === 'encomendado') {
                return 'Encomendado';
            } else if (statusLower.includes('concluida') || statusLower.includes('concluída') || statusLower === 'encomenda_concluida') {
                return 'Encomenda Concluída';
            }
            return status || 'Enviada';
        } else if (this.currentLanguage === 'pt') {
            if (statusLower.includes('enviada') || statusLower.includes('enviado') || statusLower === 'propuesta enviada') {
                return 'Enviada';
            } else if (statusLower.includes('en curso') || statusLower.includes('em curso') || statusLower === 'propuesta_en_curso') {
                return 'Proposta em Curso';
            } else if (statusLower.includes('pendiente')) {
                return 'Pendente';
            } else if (statusLower.includes('aprobada') || statusLower.includes('aprovada')) {
                return 'Aprovada';
            } else if (statusLower.includes('rechazada') || statusLower.includes('rejeitada') || statusLower === 'rejeitada') {
                return 'Rejeitada';
            } else if (statusLower.includes('aguarda') && statusLower.includes('pagamento') || statusLower === 'aguarda_pagamento') {
                return 'Aguarda Pagamento';
            } else if (statusLower.includes('aguarda') && statusLower.includes('aprovacao') || statusLower === 'aguarda_aprovacao') {
                return 'Aguarda Aprovação de Dossier';
            } else if (statusLower.includes('aguarda') && (statusLower.includes('creacion') || statusLower.includes('criação')) || statusLower === 'aguarda_creacion_cliente') {
                return 'Aguarda Criação de Cliente';
            } else if (statusLower.includes('encomendado') || statusLower === 'encomendado') {
                return 'Encomendado';
            } else if (statusLower.includes('concluida') || statusLower.includes('concluída') || statusLower === 'encomenda_concluida') {
                return 'Encomenda Concluída';
            }
            return status || 'Enviada';
        } else {
            if (statusLower.includes('en curso') || statusLower.includes('in progress') || statusLower === 'propuesta_en_curso') {
                return 'Proposal in Progress';
            } else if (statusLower.includes('concluida') || statusLower.includes('concluída') || statusLower === 'encomenda_concluida') {
                return 'Order Completed';
            } else if (statusLower.includes('aguarda') && (statusLower.includes('creacion') || statusLower.includes('creation')) || statusLower === 'aguarda_creacion_cliente') {
                return 'Awaiting Client Creation';
            }
            return status || 'Sent';
        }
    }

    canChangeStatus(currentStatus) {
        const statusLower = (currentStatus || '').toLowerCase();
        
        // No permitir cambiar el estado si está en "encomenda concluida" o "rejeitada"
        if (statusLower.includes('concluida') || statusLower.includes('concluída') || statusLower === 'encomenda_concluida') {
            return false;
        }
        if (statusLower.includes('rechazada') || statusLower.includes('rejeitada') || statusLower === 'rejeitada') {
            return false;
        }
        
        // Permitir cambiar el estado desde cualquier otro estado
        return true;
    }

    viewProposalDetails(proposalId) {
        const proposal = this.allProposals.find(p => p.id === proposalId);
        if (!proposal) {
            console.error('Propuesta no encontrada:', proposalId);
            return;
        }

        const modal = document.getElementById('proposalDetailsModal');
        const content = document.getElementById('proposalDetailsContent');

        // Formatear fechas
        const fechaPropuesta = new Date(proposal.fecha_propuesta);
        const fechaUltimaActualizacion = proposal.fecha_ultima_actualizacion ? 
            new Date(proposal.fecha_ultima_actualizacion) : null;

        const fechaFormateada = fechaPropuesta.toLocaleDateString(
            this.currentLanguage === 'es' ? 'es-ES' : 
            this.currentLanguage === 'pt' ? 'pt-PT' : 'en-US',
            { year: 'numeric', month: 'long', day: 'numeric' }
        );

        const fechaActualizacionFormateada = fechaUltimaActualizacion ? 
            fechaUltimaActualizacion.toLocaleDateString(
                this.currentLanguage === 'es' ? 'es-ES' : 
                this.currentLanguage === 'pt' ? 'pt-PT' : 'en-US',
                { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }
            ) : '-';

        // Calcular total
        const total = proposal.articulos.reduce((sum, art) => {
            return sum + (parseFloat(art.precio) || 0) * (parseInt(art.cantidad) || 0);
        }, 0);

        content.innerHTML = `
            <div class="proposal-actions">
                <button class="btn-edit-proposal" onclick="window.proposalsManager.editProposal('${proposal.id}')">
                    <i class="fas fa-edit"></i> <span id="edit-proposal-text">Editar Propuesta</span>
                </button>
            </div>
            <div class="proposal-details">
                <div class="detail-item">
                    <div class="detail-label">Cliente</div>
                    <div class="detail-value">${proposal.nombre_cliente || '-'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Comercial</div>
                    <div class="detail-value">${proposal.nombre_comercial || '-'}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Fecha de Propuesta</div>
                    <div class="detail-value">${fechaFormateada}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Estado</div>
                    <div class="detail-value">
                        <span class="status-badge ${this.getStatusClass(proposal.estado_propuesta)}">
                            ${this.getStatusText(proposal.estado_propuesta)}
                        </span>
                        ${this.canChangeStatus(proposal.estado_propuesta) ? `
                            <select class="status-select" id="status-select-${proposal.id}" onchange="window.proposalsManager.handleStatusChange('${proposal.id}', this.value)">
                                <option value="">${this.currentLanguage === 'es' ? 'Cambiar estado...' : this.currentLanguage === 'pt' ? 'Alterar estado...' : 'Change status...'}</option>
                                <option value="propuesta_en_curso">${this.getStatusText('propuesta_en_curso')}</option>
                                <option value="aguarda_pagamento">${this.getStatusText('aguarda_pagamento')}</option>
                                <option value="aguarda_aprovacao">${this.getStatusText('aguarda_aprovacao')}</option>
                                <option value="aguarda_creacion_cliente">${this.getStatusText('aguarda_creacion_cliente')}</option>
                                <option value="encomendado">${this.getStatusText('encomendado')}</option>
                                <option value="encomenda_concluida">${this.getStatusText('encomenda_concluida')}</option>
                                <option value="rejeitada">${this.getStatusText('rejeitada')}</option>
                            </select>
                        ` : ''}
                    </div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Última Actualización</div>
                    <div class="detail-value">${fechaActualizacionFormateada}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Modificaciones</div>
                    <div class="detail-value">${proposal.veces_modificado || 0}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Total</div>
                    <div class="detail-value">€${total.toFixed(2)}</div>
                </div>
            </div>

            <div class="articles-section">
                <h4 class="articles-title" id="articles-title">Artículos de la Propuesta</h4>
                <table class="articles-table">
                    <thead>
                        <tr>
                            <th id="th-article-name">Nombre</th>
                            <th id="th-article-ref">Referencia</th>
                            <th id="th-article-qty">Cantidad</th>
                            <th id="th-article-price">Precio Unit.</th>
                            <th id="th-article-total">Total</th>
                            <th id="th-article-delivery">Plazo Entrega</th>
                            <th id="th-article-personalization">Personalización</th>
                            <th id="th-article-notes">Observaciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${proposal.articulos.map(articulo => `
                            <tr>
                                <td>${articulo.nombre_articulo || '-'}</td>
                                <td>${articulo.referencia_articulo || '-'}</td>
                                <td>${articulo.cantidad || 0}</td>
                                <td>€${(parseFloat(articulo.precio) || 0).toFixed(2)}</td>
                                <td>€${((parseFloat(articulo.precio) || 0) * (parseInt(articulo.cantidad) || 0)).toFixed(2)}</td>
                                <td>${articulo.plazo_entrega || '-'}</td>
                                <td>
                                    ${articulo.precio_personalizado ? 
                                        `<span class="personalized-badge">${articulo.tipo_personalizacion || 'Personalizado'}</span>` : 
                                        '<span style="color: var(--text-secondary);">-</span>'
                                    }
                                </td>
                                <td>${articulo.observaciones || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        modal.classList.add('active');
        this.updateTranslations();
    }

    editProposal(proposalId) {
        const proposal = this.allProposals.find(p => p.id === proposalId);
        if (!proposal) {
            console.error('Propuesta no encontrada:', proposalId);
            return;
        }

        // Guardar información de la propuesta en localStorage para cargarla en el carrito
        const proposalData = {
            id: proposal.id,
            nombre_cliente: proposal.nombre_cliente,
            nombre_comercial: proposal.nombre_comercial,
            fecha_propuesta: proposal.fecha_propuesta,
            estado_propuesta: proposal.estado_propuesta,
            articulos: proposal.articulos || []
        };

        localStorage.setItem('editing_proposal', JSON.stringify(proposalData));
        
        // Redirigir a la página de presupuesto
        window.location.href = `carrito-compras.html?edit=${proposalId}`;
    }

    setupEventListeners() {
        // Filtros en tiempo real
        const searchClient = document.getElementById('searchClientInput');
        const searchCommercial = document.getElementById('searchCommercialInput');
        const filterDateFrom = document.getElementById('filterDateFrom');
        const filterDateTo = document.getElementById('filterDateTo');
        const filterStatus = document.getElementById('filterStatus');

        if (searchClient) {
            searchClient.addEventListener('input', () => this.applyFilters());
        }
        if (searchCommercial) {
            searchCommercial.addEventListener('input', () => this.applyFilters());
        }
        if (filterDateFrom) {
            filterDateFrom.addEventListener('change', () => this.applyFilters());
        }
        if (filterDateTo) {
            filterDateTo.addEventListener('change', () => this.applyFilters());
        }
        if (filterStatus) {
            filterStatus.addEventListener('change', () => this.applyFilters());
        }
    }

    applyFilters() {
        const searchClient = document.getElementById('searchClientInput')?.value.toLowerCase() || '';
        const searchCommercial = document.getElementById('searchCommercialInput')?.value.toLowerCase() || '';
        const dateFrom = document.getElementById('filterDateFrom')?.value || '';
        const dateTo = document.getElementById('filterDateTo')?.value || '';
        const status = document.getElementById('filterStatus')?.value || '';

        this.filteredProposals = this.allProposals.filter(proposal => {
            // Filtro por cliente
            if (searchClient && !proposal.nombre_cliente?.toLowerCase().includes(searchClient)) {
                return false;
            }

            // Filtro por comercial
            if (searchCommercial && !proposal.nombre_comercial?.toLowerCase().includes(searchCommercial)) {
                return false;
            }

            // Filtro por fecha
            if (dateFrom) {
                const proposalDate = new Date(proposal.fecha_propuesta);
                const fromDate = new Date(dateFrom);
                if (proposalDate < fromDate) {
                    return false;
                }
            }

            if (dateTo) {
                const proposalDate = new Date(proposal.fecha_propuesta);
                const toDate = new Date(dateTo);
                toDate.setHours(23, 59, 59, 999);
                if (proposalDate > toDate) {
                    return false;
                }
            }

            // Filtro por estado
            if (status) {
                const proposalStatus = (proposal.estado_propuesta || '').toLowerCase();
                if (!proposalStatus.includes(status.toLowerCase())) {
                    return false;
                }
            }

            return true;
        });

        this.renderProposals();
    }

    clearFilters() {
        document.getElementById('searchClientInput').value = '';
        document.getElementById('searchCommercialInput').value = '';
        document.getElementById('filterDateFrom').value = '';
        document.getElementById('filterDateTo').value = '';
        document.getElementById('filterStatus').value = '';
        this.filteredProposals = [...this.allProposals];
        this.renderProposals();
    }

    showError(message) {
        console.error(message);
        // Podrías mostrar una notificación aquí
    }

    applyFilters() {
        const searchClient = document.getElementById('searchClientInput')?.value.toLowerCase() || '';
        const searchCommercial = document.getElementById('searchCommercialInput')?.value.toLowerCase() || '';
        const dateFrom = document.getElementById('filterDateFrom')?.value || '';
        const dateTo = document.getElementById('filterDateTo')?.value || '';
        const status = document.getElementById('filterStatus')?.value || '';

        this.filteredProposals = this.allProposals.filter(proposal => {
            // Filtro por cliente
            if (searchClient && !proposal.nombre_cliente?.toLowerCase().includes(searchClient)) {
                return false;
            }

            // Filtro por comercial
            if (searchCommercial && !proposal.nombre_comercial?.toLowerCase().includes(searchCommercial)) {
                return false;
            }

            // Filtro por fecha
            if (dateFrom) {
                const proposalDate = new Date(proposal.fecha_propuesta);
                const fromDate = new Date(dateFrom);
                if (proposalDate < fromDate) {
                    return false;
                }
            }

            if (dateTo) {
                const proposalDate = new Date(proposal.fecha_propuesta);
                const toDate = new Date(dateTo);
                toDate.setHours(23, 59, 59, 999);
                if (proposalDate > toDate) {
                    return false;
                }
            }

            // Filtro por estado
            if (status) {
                const proposalStatus = (proposal.estado_propuesta || '').toLowerCase();
                if (!proposalStatus.includes(status.toLowerCase())) {
                    return false;
                }
            }

            return true;
        });

        this.renderProposals();
    }

    clearFilters() {
        document.getElementById('searchClientInput').value = '';
        document.getElementById('searchCommercialInput').value = '';
        document.getElementById('filterDateFrom').value = '';
        document.getElementById('filterDateTo').value = '';
        document.getElementById('filterStatus').value = '';
        this.filteredProposals = [...this.allProposals];
        this.renderProposals();
    }

    showError(message) {
        console.error(message);
        // Podrías mostrar una notificación aquí
    }

    updateTranslations() {
        const lang = this.currentLanguage;
        const translations = {
            pt: {
                title: 'Consultar Propostas',
                searchClient: 'Buscar por cliente...',
                searchCommercial: 'Buscar por comercial...',
                allStatuses: 'Todos os estados',
                applyFilters: 'Aplicar Filtros',
                clear: 'Limpar',
                loading: 'Carregando propostas...',
                noProposals: 'Não foram encontradas propostas',
                proposalNumber: 'Nº Proposta',
                startDate: 'Data Início',
                lastUpdate: 'Última Actualização',
                client: 'Cliente',
                commercial: 'Comercial',
                articles: 'Produtos',
                total: 'Total',
                status: 'Estado',
                actions: 'Ações',
                viewDetails: 'Ver Detalhes',
                proposalDetails: 'Detalhes da Proposta',
                articlesTitle: 'Artigos da Proposta',
                articleName: 'Nome',
                articleRef: 'Referência',
                articleQty: 'Quantidade',
                articlePrice: 'Preço Unit.',
                articleTotal: 'Total',
                articleDelivery: 'Prazo de Entrega',
                articlePersonalization: 'Personalização',
                articleNotes: 'Observações',
                editProposal: 'Editar Proposta'
            },
            es: {
                title: 'Consultar Propuestas',
                searchClient: 'Buscar por cliente...',
                searchCommercial: 'Buscar por comercial...',
                allStatuses: 'Todos los estados',
                applyFilters: 'Aplicar Filtros',
                clear: 'Limpiar',
                loading: 'Cargando propuestas...',
                noProposals: 'No se encontraron propuestas',
                proposalNumber: 'Nº Propuesta',
                startDate: 'Fecha Inicio',
                lastUpdate: 'Última Actualización',
                client: 'Cliente',
                commercial: 'Comercial',
                articles: 'Productos',
                total: 'Total',
                status: 'Estado',
                actions: 'Acciones',
                viewDetails: 'Ver Detalles',
                proposalDetails: 'Detalles de la Propuesta',
                articlesTitle: 'Artículos de la Propuesta',
                articleName: 'Nombre',
                articleRef: 'Referencia',
                articleQty: 'Cantidad',
                articlePrice: 'Precio Unit.',
                articleTotal: 'Total',
                articleDelivery: 'Plazo de Entrega',
                articlePersonalization: 'Personalización',
                articleNotes: 'Observaciones',
                editProposal: 'Editar Propuesta'
            },
            en: {
                title: 'View Proposals',
                searchClient: 'Search by client...',
                searchCommercial: 'Search by commercial...',
                allStatuses: 'All statuses',
                applyFilters: 'Apply Filters',
                clear: 'Clear',
                loading: 'Loading proposals...',
                noProposals: 'No proposals found',
                proposalNumber: 'Proposal #',
                startDate: 'Start Date',
                lastUpdate: 'Last Update',
                client: 'Client',
                commercial: 'Commercial',
                articles: 'Products',
                total: 'Total',
                status: 'Status',
                actions: 'Actions',
                viewDetails: 'View Details',
                proposalDetails: 'Proposal Details',
                articlesTitle: 'Proposal Articles',
                articleName: 'Name',
                articleRef: 'Reference',
                articleQty: 'Quantity',
                articlePrice: 'Unit Price',
                articleTotal: 'Total',
                articleDelivery: 'Delivery Time',
                articlePersonalization: 'Personalization',
                articleNotes: 'Observations',
                editProposal: 'Edit Proposal'
            }
        };

        const t = translations[lang] || translations.pt;

        // Actualizar textos
        const elements = {
            'proposals-page-title': t.title,
            'searchClientInput': { placeholder: t.searchClient },
            'searchCommercialInput': { placeholder: t.searchCommercial },
            'apply-filters-text': t.applyFilters,
            'clear-filters-text': t.clear,
            'loading-text': t.loading,
            'no-proposals-text': t.noProposals,
            'th-proposal-number': t.proposalNumber,
            'th-start-date': t.startDate,
            'th-last-update': t.lastUpdate,
            'th-client': t.client,
            'th-commercial': t.commercial,
            'th-articles': t.articles,
            'th-total': t.total,
            'th-status': t.status,
            'th-actions': t.actions,
            'view-details-text': t.viewDetails,
            'modal-title': t.proposalDetails,
            'articles-title': t.articlesTitle,
            'th-article-name': t.articleName,
            'th-article-ref': t.articleRef,
            'th-article-qty': t.articleQty,
            'th-article-price': t.articlePrice,
            'th-article-total': t.articleTotal,
            'th-article-delivery': t.articleDelivery,
            'th-article-personalization': t.articlePersonalization,
            'th-article-notes': t.articleNotes,
            'edit-proposal-text': t.editProposal
        };

        Object.entries(elements).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) {
                if (typeof value === 'string') {
                    el.textContent = value;
                } else {
                    Object.entries(value).forEach(([key, val]) => {
                        el[key] = val;
                    });
                }
            }
        });

        // Actualizar opciones del select de estado
        const statusSelect = document.getElementById('filterStatus');
        if (statusSelect) {
            const lang = this.currentLanguage;
            const statusOptions = {
                pt: {
                    all: 'Todos os estados',
                    enviada: 'Enviada',
                    propuesta_en_curso: 'Proposta em Curso',
                    aguarda_pagamento: 'Aguarda Pagamento',
                    aguarda_aprovacao: 'Aguarda Aprovação de Dossier',
                    aguarda_creacion_cliente: 'Aguarda Criação de Cliente',
                    encomendado: 'Encomendado',
                    encomenda_concluida: 'Encomenda Concluída',
                    rejeitada: 'Rejeitada'
                },
                es: {
                    all: 'Todos los estados',
                    enviada: 'Enviada',
                    propuesta_en_curso: 'Propuesta en Curso',
                    aguarda_pagamento: 'Aguarda Pago',
                    aguarda_aprovacao: 'Aguarda Aprobación de Dossier',
                    aguarda_creacion_cliente: 'Aguarda Creación de Cliente',
                    encomendado: 'Encomendado',
                    encomenda_concluida: 'Encomenda Concluída',
                    rejeitada: 'Rechazada'
                },
                en: {
                    all: 'All statuses',
                    enviada: 'Sent',
                    propuesta_en_curso: 'Proposal in Progress',
                    aguarda_pagamento: 'Awaiting Payment',
                    aguarda_aprovacao: 'Awaiting Dossier Approval',
                    aguarda_creacion_cliente: 'Awaiting Client Creation',
                    encomendado: 'Ordered',
                    encomenda_concluida: 'Order Completed',
                    rejeitada: 'Rejected'
                }
            };

            const statusT = statusOptions[lang] || statusOptions.pt;
            
            // Actualizar todas las opciones
            statusSelect.innerHTML = `
                <option value="">${statusT.all}</option>
                <option value="propuesta enviada">${statusT.enviada}</option>
                <option value="propuesta_en_curso">${statusT.propuesta_en_curso}</option>
                <option value="aguarda_pagamento">${statusT.aguarda_pagamento}</option>
                <option value="aguarda_aprovacao">${statusT.aguarda_aprovacao}</option>
                <option value="aguarda_creacion_cliente">${statusT.aguarda_creacion_cliente}</option>
                <option value="encomendado">${statusT.encomendado}</option>
                <option value="encomenda_concluida">${statusT.encomenda_concluida}</option>
                <option value="rejeitada">${statusT.rejeitada}</option>
            `;
        }
    }

    async handleStatusChange(proposalId, newStatus) {
        if (!newStatus) {
            return;
        }

        const proposal = this.allProposals.find(p => p.id === proposalId);
        if (!proposal) {
            console.error('Propuesta no encontrada:', proposalId);
            return;
        }

        // Resetear el select
        const select = document.getElementById(`status-select-${proposalId}`);
        if (select) {
            select.value = '';
        }

        if (newStatus === 'encomendado') {
            this.openEncomendadoModal(proposal);
        } else if (newStatus === 'encomenda_concluida') {
            this.openEncomendaConcluidaModal(proposal);
        } else if (newStatus === 'rejeitada') {
            this.openRejeitadaModal(proposal);
        } else {
            // Para aguarda_pagamento y aguarda_aprovacao, cambiar directamente
            await this.updateProposalStatus(proposalId, newStatus);
        }
    }

    openEncomendadoModal(proposal, isConcluida = false) {
        const modal = document.getElementById('changeStatusEncomendadoModal');
        const productsList = document.getElementById('encomendado-products-list');
        
        if (!modal || !productsList) {
            console.error('Modal elements not found');
            return;
        }

        // Guardar si es para "concluída"
        modal.setAttribute('data-is-concluida', isConcluida ? 'true' : 'false');

        // Limpiar lista anterior
        productsList.innerHTML = '';

        // Crear checkboxes para cada artículo
        proposal.articulos.forEach((articulo, index) => {
            const item = document.createElement('div');
            item.className = 'product-checkbox-item';
            // Usar el ID del artículo de la base de datos
            const articuloId = articulo.id || `temp-${index}`;
            item.innerHTML = `
                <input type="checkbox" id="product-${proposal.id}-${index}" value="${articuloId}" data-articulo-id="${articuloId}">
                <label for="product-${proposal.id}-${index}" style="flex: 1; cursor: pointer;">
                    <strong>${articulo.nombre_articulo || '-'}</strong> 
                    (Ref: ${articulo.referencia_articulo || '-'}) - 
                    ${this.currentLanguage === 'es' ? 'Cantidad' : this.currentLanguage === 'pt' ? 'Quantidade' : 'Quantity'}: ${articulo.cantidad || 0}
                </label>
            `;
            productsList.appendChild(item);
        });

        // Limpiar inputs de números de encomenda
        const number1Input = document.getElementById('encomendado-number1-input');
        const number2Input = document.getElementById('encomendado-number2-input');
        const dateInput = document.getElementById('encomendado-date-input');
        if (number1Input) {
            number1Input.value = '';
        }
        if (number2Input) {
            number2Input.value = '';
        }
        if (dateInput) {
            // Establecer fecha por defecto como hoy
            const today = new Date().toISOString().split('T')[0];
            dateInput.value = today;
        }

        // Guardar el ID de la propuesta en el modal para usarlo al guardar
        modal.setAttribute('data-proposal-id', proposal.id);

        // Actualizar traducciones antes de mostrar el modal
        this.updateEncomendadoTranslations();

        // Mostrar modal
        modal.classList.add('active');
    }

    async openEncomendaConcluidaModal(proposal) {
        // Verificar el estado actual
        const currentStatus = (proposal.estado_propuesta || '').toLowerCase();
        const isFromEncomendado = currentStatus.includes('encomendado');
        
        // Verificar si ya tiene datos de encomenda (números y fecha)
        const hasEncomendaData = proposal.numeros_encomenda && proposal.data_encomenda;

        // Si viene de "encomendado" y ya tiene datos, solo cambiar el estado
        if (isFromEncomendado && hasEncomendaData) {
            await this.updateProposalStatus(proposal.id, 'encomenda_concluida');
        } else {
            // Si viene de otros estados (enviada, aguarda pagamento, aguarda aprovacao) 
            // o no tiene datos de encomenda, solo preguntar productos, sin números de encomenda
            // Esto es para casos donde tienen productos en stock y el cliente avanza solo con parte
            this.openEncomendaConcluidaProductsOnlyModal(proposal);
        }
    }

    openEncomendaConcluidaProductsOnlyModal(proposal) {
        const modal = document.getElementById('changeStatusEncomendaConcluidaModal');
        const productsList = document.getElementById('concluida-products-list');
        
        if (!modal || !productsList) {
            console.error('Modal elements not found');
            return;
        }

        // Limpiar lista anterior
        productsList.innerHTML = '';

        // Crear checkboxes para cada artículo
        proposal.articulos.forEach((articulo, index) => {
            const item = document.createElement('div');
            item.className = 'product-checkbox-item';
            // Usar el ID del artículo de la base de datos
            const articuloId = articulo.id || `temp-${index}`;
            item.innerHTML = `
                <input type="checkbox" id="concluida-product-${proposal.id}-${index}" value="${articuloId}" data-articulo-id="${articuloId}">
                <label for="concluida-product-${proposal.id}-${index}" style="flex: 1; cursor: pointer;">
                    <strong>${articulo.nombre_articulo || '-'}</strong> 
                    (Ref: ${articulo.referencia_articulo || '-'}) - 
                    ${this.currentLanguage === 'es' ? 'Cantidad' : this.currentLanguage === 'pt' ? 'Quantidade' : 'Quantity'}: ${articulo.cantidad || 0}
                </label>
            `;
            productsList.appendChild(item);
        });

        // Guardar el ID de la propuesta en el modal
        modal.setAttribute('data-proposal-id', proposal.id);

        // Actualizar traducciones
        this.updateEncomendaConcluidaTranslations();

        // Mostrar modal
        modal.classList.add('active');
    }

    async saveEncomendaConcluidaStatus() {
        const modal = document.getElementById('changeStatusEncomendaConcluidaModal');
        const proposalId = modal?.getAttribute('data-proposal-id');
        
        if (!proposalId) {
            console.error('Proposal ID not found');
            return;
        }

        const proposal = this.allProposals.find(p => p.id === proposalId);
        if (!proposal) {
            console.error('Proposal not found');
            return;
        }

        // Obtener productos seleccionados
        const checkboxes = modal.querySelectorAll('input[type="checkbox"]:checked');
        const selectedArticleIds = Array.from(checkboxes).map(cb => cb.getAttribute('data-articulo-id'));

        if (selectedArticleIds.length === 0) {
            const message = this.currentLanguage === 'es' ? 
                'Debe seleccionar al menos un producto' : 
                this.currentLanguage === 'pt' ?
                'Deve selecionar pelo menos um produto' :
                'You must select at least one product';
            this.showNotification(message, 'error');
            return;
        }

        if (!this.supabase) {
            await this.initializeSupabase();
        }

        try {
            // Actualizar estado
            await this.updateProposalStatus(proposalId, 'encomenda_concluida');

            // Eliminar productos concluídos anteriores para este presupuesto
            const { error: deleteError } = await this.supabase
                .from('presupuestos_articulos_concluidos')
                .delete()
                .eq('presupuesto_id', proposalId);

            if (deleteError) {
                console.warn('Error al eliminar productos concluídos anteriores:', deleteError);
            }

            // Guardar productos concluídos (con los que el cliente avanzó)
            if (selectedArticleIds.length > 0) {
                const concluidosData = selectedArticleIds.map(articleId => ({
                    presupuesto_id: proposalId,
                    articulo_id: articleId
                }));

                const { error: insertError } = await this.supabase
                    .from('presupuestos_articulos_concluidos')
                    .insert(concluidosData);

                if (insertError) {
                    console.warn('Error al guardar productos concluídos:', insertError);
                    // Si la tabla no existe, mostrar mensaje pero continuar
                    if (!insertError.message.includes('does not exist')) {
                        throw insertError;
                    }
                }
            }

            // Cerrar modal
            this.closeEncomendaConcluidaModal();

        } catch (error) {
            console.error('Error al guardar estado encomenda concluída:', error);
            const message = this.currentLanguage === 'es' ? 
                `Error al guardar: ${error.message}` : 
                this.currentLanguage === 'pt' ?
                `Erro ao guardar: ${error.message}` :
                `Error saving: ${error.message}`;
            this.showNotification(message, 'error');
        }
    }

    closeEncomendaConcluidaModal() {
        const modal = document.getElementById('changeStatusEncomendaConcluidaModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    updateEncomendaConcluidaTranslations() {
        const lang = this.currentLanguage;
        const translations = {
            pt: {
                title: 'Marcar como Encomenda Concluída',
                productsLabel: 'Selecione os produtos com os quais o cliente avançou:',
                cancel: 'Cancelar',
                save: 'Guardar'
            },
            es: {
                title: 'Marcar como Encomenda Concluída',
                productsLabel: 'Seleccione los productos con los que el cliente avanzó:',
                cancel: 'Cancelar',
                save: 'Guardar'
            },
            en: {
                title: 'Mark as Order Completed',
                productsLabel: 'Select the products the client advanced with:',
                cancel: 'Cancel',
                save: 'Save'
            }
        };

        const t = translations[lang] || translations.pt;

        const elements = {
            'concluida-modal-title': t.title,
            'concluida-products-label': t.productsLabel,
            'concluida-cancel-btn': t.cancel,
            'concluida-save-text': t.save
        };

        Object.entries(elements).forEach(([id, text]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = text;
            }
        });
    }

    openRejeitadaModal(proposal) {
        const modal = document.getElementById('changeStatusRejeitadaModal');
        
        if (!modal) {
            console.error('Modal not found');
            return;
        }

        // Limpiar selecciones anteriores
        const radios = modal.querySelectorAll('input[name="rejeitada-reason"]');
        radios.forEach(radio => radio.checked = false);
        
        const otherInput = document.getElementById('rejeitada-other-input');
        if (otherInput) {
            otherInput.value = '';
        }
        
        const otherGroup = document.getElementById('rejeitada-other-reason-group');
        if (otherGroup) {
            otherGroup.style.display = 'none';
        }

        // Agregar listener para mostrar/ocultar campo "Outro"
        radios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.value === 'outro') {
                    if (otherGroup) {
                        otherGroup.style.display = 'block';
                    }
                } else {
                    if (otherGroup) {
                        otherGroup.style.display = 'none';
                    }
                }
            });
        });

        // Guardar el ID de la propuesta en el modal
        modal.setAttribute('data-proposal-id', proposal.id);

        // Mostrar modal
        modal.classList.add('active');
        this.updateRejeitadaTranslations();
    }

    async updateProposalStatus(proposalId, newStatus, additionalData = {}) {
        if (!this.supabase) {
            await this.initializeSupabase();
        }

        try {
            const updateData = {
                estado_propuesta: newStatus,
                ...additionalData
            };

            const { error } = await this.supabase
                .from('presupuestos')
                .update(updateData)
                .eq('id', proposalId);

            if (error) {
                throw error;
            }

            // Recargar propuestas
            await this.loadProposals();
            
            // Cerrar modal de detalles y volver a abrirlo con los datos actualizados
            const proposal = this.allProposals.find(p => p.id === proposalId);
            if (proposal) {
                this.viewProposalDetails(proposalId);
            }

            const message = this.currentLanguage === 'es' ? 
                'Estado actualizado correctamente' : 
                this.currentLanguage === 'pt' ?
                'Estado atualizado com sucesso' :
                'Status updated successfully';
            this.showNotification(message, 'success');

        } catch (error) {
            console.error('Error al actualizar estado:', error);
            const message = this.currentLanguage === 'es' ? 
                `Error al actualizar estado: ${error.message}` : 
                this.currentLanguage === 'pt' ?
                `Erro ao atualizar estado: ${error.message}` :
                `Error updating status: ${error.message}`;
            this.showNotification(message, 'error');
        }
    }

    async saveEncomendadoStatus() {
        const modal = document.getElementById('changeStatusEncomendadoModal');
        const proposalId = modal?.getAttribute('data-proposal-id');
        
        if (!proposalId) {
            console.error('Proposal ID not found');
            return;
        }

        const proposal = this.allProposals.find(p => p.id === proposalId);
        if (!proposal) {
            console.error('Proposal not found');
            return;
        }

        // Obtener productos seleccionados
        const checkboxes = modal.querySelectorAll('input[type="checkbox"]:checked');
        const selectedArticleIds = Array.from(checkboxes).map(cb => cb.getAttribute('data-articulo-id'));

        if (selectedArticleIds.length === 0) {
            const message = this.currentLanguage === 'es' ? 
                'Debe seleccionar al menos un producto' : 
                this.currentLanguage === 'pt' ?
                'Deve selecionar pelo menos um produto' :
                'You must select at least one product';
            this.showNotification(message, 'error');
            return;
        }

        // Obtener números de encomenda
        const number1Input = document.getElementById('encomendado-number1-input');
        const number2Input = document.getElementById('encomendado-number2-input');
        const dateInput = document.getElementById('encomendado-date-input');
        const number1 = number1Input?.value.trim() || '';
        const number2 = number2Input?.value.trim() || '';
        const encomendaDate = dateInput?.value || '';

        if (!number1) {
            const message = this.currentLanguage === 'es' ? 
                'Debe ingresar el número de encomenda 1 (obligatorio)' : 
                this.currentLanguage === 'pt' ?
                'Deve inserir o número de encomenda 1 (obrigatório)' :
                'You must enter order number 1 (required)';
            this.showNotification(message, 'error');
            return;
        }

        if (!encomendaDate) {
            const message = this.currentLanguage === 'es' ? 
                'Debe seleccionar la fecha de encomenda (obligatorio)' : 
                this.currentLanguage === 'pt' ?
                'Deve selecionar a data de encomenda (obrigatória)' :
                'You must select the order date (required)';
            this.showNotification(message, 'error');
            return;
        }

        // Combinar números (si hay dos, separados por coma)
        const numbers = number2 ? `${number1}, ${number2}` : number1;

        if (!this.supabase) {
            await this.initializeSupabase();
        }

        try {
            // Determinar el estado final (puede ser "encomendado" o "encomenda_concluida")
            const modal = document.getElementById('changeStatusEncomendadoModal');
            const isConcluida = modal?.getAttribute('data-is-concluida') === 'true';
            const finalStatus = isConcluida ? 'encomenda_concluida' : 'encomendado';

            // Actualizar estado, números de encomenda y fecha
            await this.updateProposalStatus(proposalId, finalStatus, {
                numeros_encomenda: numbers,
                data_encomenda: encomendaDate
            });

            // Eliminar artículos encomendados anteriores para este presupuesto
            const { error: deleteError } = await this.supabase
                .from('presupuestos_articulos_encomendados')
                .delete()
                .eq('presupuesto_id', proposalId);

            if (deleteError) {
                console.warn('Error al eliminar artículos encomendados anteriores:', deleteError);
            }

            // Guardar artículos encomendados
            if (selectedArticleIds.length > 0) {
                const encomendadosData = selectedArticleIds.map(articleId => ({
                    presupuesto_id: proposalId,
                    articulo_id: articleId
                }));

                const { error: insertError } = await this.supabase
                    .from('presupuestos_articulos_encomendados')
                    .insert(encomendadosData);

                if (insertError) {
                    console.warn('Error al guardar artículos encomendados:', insertError);
                }
            }

            // Cerrar modal
            this.closeEncomendadoModal();

        } catch (error) {
            console.error('Error al guardar estado encomendado:', error);
        }
    }

    async saveRejeitadaStatus() {
        const modal = document.getElementById('changeStatusRejeitadaModal');
        const proposalId = modal?.getAttribute('data-proposal-id');
        
        if (!proposalId) {
            console.error('Proposal ID not found');
            return;
        }

        // Obtener motivo seleccionado
        const selectedReason = modal.querySelector('input[name="rejeitada-reason"]:checked')?.value;

        if (!selectedReason) {
            const message = this.currentLanguage === 'es' ? 
                'Debe seleccionar un motivo de rechazo' : 
                this.currentLanguage === 'pt' ?
                'Deve selecionar um motivo de rejeição' :
                'You must select a rejection reason';
            this.showNotification(message, 'error');
            return;
        }

        const additionalData = {
            motivo_rechazo: selectedReason
        };

        if (selectedReason === 'outro') {
            const otherInput = document.getElementById('rejeitada-other-input');
            const otherReason = otherInput?.value.trim() || '';

            if (!otherReason) {
                const message = this.currentLanguage === 'es' ? 
                    'Debe especificar el motivo de rechazo' : 
                    this.currentLanguage === 'pt' ?
                    'Deve especificar o motivo de rejeição' :
                    'You must specify the rejection reason';
                this.showNotification(message, 'error');
                return;
            }

            additionalData.motivo_rechazo_otro = otherReason;
        }

        try {
            await this.updateProposalStatus(proposalId, 'rejeitada', additionalData);
            this.closeRejeitadaModal();
        } catch (error) {
            console.error('Error al guardar estado rejeitada:', error);
        }
    }

    closeEncomendadoModal() {
        const modal = document.getElementById('changeStatusEncomendadoModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    closeRejeitadaModal() {
        const modal = document.getElementById('changeStatusRejeitadaModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    updateEncomendadoTranslations() {
        const lang = this.currentLanguage;
        const modal = document.getElementById('changeStatusEncomendadoModal');
        const isConcluida = modal?.getAttribute('data-is-concluida') === 'true';

        const translations = {
            pt: {
                titleEncomendado: 'Marcar como Encomendado',
                titleConcluida: 'Marcar como Encomenda Concluída',
                productsLabel: 'Selecione os produtos que foram encomendados:',
                number1Label: 'Número de Encomenda 1 *',
                number2Label: 'Número de Encomenda 2 (opcional)',
                dateLabel: 'Data de Encomenda *',
                cancel: 'Cancelar',
                save: 'Guardar'
            },
            es: {
                titleEncomendado: 'Marcar como Encomendado',
                titleConcluida: 'Marcar como Encomenda Concluída',
                productsLabel: 'Seleccione los productos que fueron encomendados:',
                number1Label: 'Número de Encomenda 1 *',
                number2Label: 'Número de Encomenda 2 (opcional)',
                dateLabel: 'Fecha de Encomenda *',
                cancel: 'Cancelar',
                save: 'Guardar'
            },
            en: {
                titleEncomendado: 'Mark as Ordered',
                titleConcluida: 'Mark as Order Completed',
                productsLabel: 'Select the products that were ordered:',
                number1Label: 'Order Number 1 *',
                number2Label: 'Order Number 2 (optional)',
                dateLabel: 'Order Date *',
                cancel: 'Cancel',
                save: 'Save'
            }
        };

        const t = translations[lang] || translations.pt;
        const title = isConcluida ? t.titleConcluida : t.titleEncomendado;

        const elements = {
            'encomendado-modal-title': title,
            'encomendado-products-label': t.productsLabel,
            'encomendado-number1-label': t.number1Label,
            'encomendado-number2-label': t.number2Label,
            'encomendado-date-label': t.dateLabel,
            'encomendado-cancel-btn': t.cancel,
            'encomendado-save-text': t.save
        };

        Object.entries(elements).forEach(([id, text]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = text;
            }
        });
    }

    updateRejeitadaTranslations() {
        const lang = this.currentLanguage;
        const translations = {
            pt: {
                title: 'Marcar como Rejeitada',
                reasonLabel: 'Motivo da Rejeição:',
                precos: 'Preços',
                prazo: 'Prazo de entrega',
                outro: 'Outro',
                otherLabel: 'Especifique o motivo:',
                cancel: 'Cancelar',
                save: 'Guardar'
            },
            es: {
                title: 'Marcar como Rechazada',
                reasonLabel: 'Motivo del Rechazo:',
                precos: 'Precios',
                prazo: 'Plazo de entrega',
                outro: 'Otro',
                otherLabel: 'Especifique el motivo:',
                cancel: 'Cancelar',
                save: 'Guardar'
            },
            en: {
                title: 'Mark as Rejected',
                reasonLabel: 'Rejection Reason:',
                precos: 'Prices',
                prazo: 'Delivery time',
                outro: 'Other',
                otherLabel: 'Specify the reason:',
                cancel: 'Cancel',
                save: 'Save'
            }
        };

        const t = translations[lang] || translations.pt;

        const elements = {
            'rejeitada-modal-title': t.title,
            'rejeitada-reason-label': t.reasonLabel,
            'reason-precos-text': t.precos,
            'reason-prazo-text': t.prazo,
            'reason-outro-text': t.outro,
            'rejeitada-other-label': t.otherLabel,
            'rejeitada-cancel-btn': t.cancel,
            'rejeitada-save-text': t.save
        };

        Object.entries(elements).forEach(([id, text]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = text;
            }
        });
    }

    showNotification(message, type = 'info') {
        // Crear notificación temporal
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 16px 24px;
            border-radius: 8px;
            color: white;
            font-weight: 600;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            animation: slideIn 0.3s ease;
        `;

        if (type === 'success') {
            notification.style.background = '#10b981';
        } else if (type === 'error') {
            notification.style.background = '#ef4444';
        } else {
            notification.style.background = '#3b82f6';
        }

        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Funciones globales para cerrar modales
function closeProposalDetails() {
    const modal = document.getElementById('proposalDetailsModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function closeEncomendadoModal() {
    if (window.proposalsManager) {
        window.proposalsManager.closeEncomendadoModal();
    }
}

function closeEncomendaConcluidaModal() {
    if (window.proposalsManager) {
        window.proposalsManager.closeEncomendaConcluidaModal();
    }
}

function saveEncomendaConcluidaStatus() {
    if (window.proposalsManager) {
        window.proposalsManager.saveEncomendaConcluidaStatus();
    }
}

function closeRejeitadaModal() {
    if (window.proposalsManager) {
        window.proposalsManager.closeRejeitadaModal();
    }
}

function saveEncomendadoStatus() {
    if (window.proposalsManager) {
        window.proposalsManager.saveEncomendadoStatus();
    }
}

function saveRejeitadaStatus() {
    if (window.proposalsManager) {
        window.proposalsManager.saveRejeitadaStatus();
    }
}

// Funciones globales
function applyFilters() {
    if (window.proposalsManager) {
        window.proposalsManager.applyFilters();
    }
}

function clearFilters() {
    if (window.proposalsManager) {
        window.proposalsManager.clearFilters();
    }
}

function closeProposalDetails() {
    const modal = document.getElementById('proposalDetailsModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM cargado, inicializando ProposalsManager...');
    
    try {
    window.proposalsManager = new ProposalsManager();
        console.log('✅ ProposalsManager creado');
    } catch (error) {
        console.error('❌ Error al crear ProposalsManager:', error);
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
        const noProposals = document.getElementById('noProposals');
        if (noProposals) {
            noProposals.style.display = 'block';
            noProposals.innerHTML = `
                <i class="fas fa-exclamation-triangle" style="color: var(--danger-500); font-size: 3rem; margin-bottom: var(--space-4);"></i>
                <p style="font-size: 1.125rem; font-weight: 600; margin-bottom: var(--space-2);">Error al inicializar la página</p>
                <p style="font-size: 0.875rem; color: var(--text-secondary);">${error.message}</p>
                <button onclick="location.reload()" style="margin-top: var(--space-4); padding: var(--space-3) var(--space-5); background: var(--brand-blue); color: white; border: none; border-radius: var(--radius-md); cursor: pointer;">
                    Recargar Página
                </button>
            `;
        }
    }

    // Escuchar cambios de idioma
    const languageSelect = document.getElementById('language-select');
    if (languageSelect) {
        languageSelect.addEventListener('change', () => {
            window.proposalsManager.currentLanguage = localStorage.getItem('language') || 'pt';
            window.proposalsManager.updateTranslations();
            window.proposalsManager.renderProposals();
        });
    }

    // Cerrar modal al hacer clic fuera
    const modal = document.getElementById('proposalDetailsModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeProposalDetails();
            }
        });
    }

});


