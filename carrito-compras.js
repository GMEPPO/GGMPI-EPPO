/**
 * Sistema de Carrito de Compras - EPPO
 * Maneja la funcionalidad completa del carrito incluyendo agregar categorías
 */

class CartManager {
    constructor() {
        this.cart = this.loadCart();
        this.currentLanguage = localStorage.getItem('language') || 'pt';
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.renderCart();
        this.updateSummary();
    }

    /**
     * Cargar carrito desde localStorage
     */
    loadCart() {
        const savedCart = localStorage.getItem('eppo_cart');
        return savedCart ? JSON.parse(savedCart) : [];
    }

    /**
     * Guardar carrito en localStorage
     */
    saveCart() {
        localStorage.setItem('eppo_cart', JSON.stringify(this.cart));
    }

    /**
     * Agregar producto individual al carrito
     */
    addProduct(product, quantity = 1) {
        const existingItem = this.cart.find(item => 
            item.id === product.id && item.type === 'product'
        );

        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            this.cart.push({
                id: product.id,
                type: 'product',
                name: product.nombre,
                category: product.categoria,
                price: product.precio,
                image: product.foto,
                quantity: quantity,
                specs: this.getProductSpecs(product)
            });
        }

        this.saveCart();
        this.renderCart();
        this.updateSummary();
        this.showNotification('Producto agregado al carrito', 'success');
    }

    /**
     * Agregar categoría completa al carrito
     */
    addCategory(category, quantity, notes = '') {
        const categoryItem = {
            id: `category_${category}_${Date.now()}`,
            type: 'category',
            name: this.getCategoryName(category),
            category: category,
            quantity: quantity,
            notes: notes,
            price: 0, // Se calculará basado en productos seleccionados
            image: this.getCategoryImage(category)
        };

        this.cart.push(categoryItem);
        this.saveCart();
        this.renderCart();
        this.updateSummary();
        this.showNotification('Categoría agregada al carrito', 'success');
    }

    // Funciones de cantidad eliminadas - solo usar las funciones "simple" globales

    /**
     * Remover item del carrito
     */
    removeItem(itemId) {
        this.cart = this.cart.filter(item => item.id !== itemId);
        this.saveCart();
        this.renderCart();
        this.updateSummary();
        this.showNotification('Producto removido del carrito', 'info');
    }

    /**
     * Limpiar todo el carrito
     */
    clearCart() {
        if (this.cart.length === 0) return;
        
        if (confirm('¿Estás seguro de que quieres limpiar todo el carrito?')) {
            this.cart = [];
            this.saveCart();
            this.renderCart();
            this.updateSummary();
            this.showNotification('Carrito limpiado', 'info');
        }
    }

    /**
     * Renderizar el carrito
     */
    renderCart() {
        const cartItemsContainer = document.getElementById('cartItems');
        
        if (this.cart.length === 0) {
            cartItemsContainer.innerHTML = this.getEmptyCartHTML();
            return;
        }

        const itemsHTML = this.cart.map(item => this.renderCartItem(item)).join('');
        cartItemsContainer.innerHTML = itemsHTML;
    }

    /**
     * Renderizar un item del carrito
     */
    renderCartItem(item) {
        const totalPrice = item.price * item.quantity;
        const categoryName = this.getCategoryName(item.category);
        
        return `
            <div class="cart-item" data-item-id="${item.id}">
                <img src="${item.image}" alt="${item.name}" class="cart-item-image" onerror="this.src='secador.png'">
                
                <div class="cart-item-info">
                    <h3 class="cart-item-name">${item.name}</h3>
                    <span class="cart-item-category">${categoryName}</span>
                    ${item.specs ? `<div class="cart-item-specs">${item.specs}</div>` : ''}
                    ${item.notes ? `<div class="cart-item-notes"><strong>Notas:</strong> ${item.notes}</div>` : ''}
                </div>
                
                <div class="quantity-controls">
                    <button class="quantity-btn quantity-decrease" onclick="simpleDecrease('${item.id}')" ${item.quantity <= 1 ? 'disabled' : ''}>
                        <i class="fas fa-minus"></i>
                    </button>
                    <input type="number" class="quantity-input" value="${item.quantity}" min="1" max="1000" onchange="simpleSetQuantity('${item.id}', this.value)">
                    <button class="quantity-btn quantity-increase" onclick="simpleIncrease('${item.id}')">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
                
                <div class="cart-item-price">
                    ${item.type === 'category' ? 
                        `<div class="cart-item-unit-price">${this.getCategoryPriceText()}</div>` :
                        `<div class="cart-item-unit-price">€${item.price.toFixed(2)} / unidad</div>`
                    }
                    <div class="cart-item-total">€${totalPrice.toFixed(2)}</div>
                </div>
                
                <button class="remove-item" onclick="simpleRemove('${item.id}')" title="Eliminar">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
    }

    /**
     * Obtener HTML para carrito vacío
     */
    getEmptyCartHTML() {
        const translations = {
            pt: {
                title: 'Carrinho Vazio',
                text: 'Não há produtos no seu carrinho.',
                button: 'Continuar Comprando'
            },
            es: {
                title: 'Carrito Vacío',
                text: 'No hay productos en tu carrito.',
                button: 'Continuar Comprando'
            },
            en: {
                title: 'Empty Cart',
                text: 'There are no products in your cart.',
                button: 'Continue Shopping'
            }
        };

        const t = translations[this.currentLanguage] || translations.pt;

        return `
            <div class="empty-cart">
                <div class="empty-cart-icon">
                    <i class="fas fa-shopping-cart"></i>
                </div>
                <h2 class="empty-cart-title">${t.title}</h2>
                <p class="empty-cart-text">${t.text}</p>
                <a href="productos-dinamico.html" class="btn-continue-shopping">${t.button}</a>
            </div>
        `;
    }

    /**
     * Actualizar resumen del carrito
     */
    updateSummary() {
        const totalItems = this.cart.reduce((total, item) => total + item.quantity, 0);

        document.getElementById('items-count').textContent = totalItems;

        // Habilitar/deshabilitar botón de enviar pedido
        const checkoutBtn = document.getElementById('checkoutBtn');
        checkoutBtn.disabled = this.cart.length === 0;
    }

    /**
     * Obtener especificaciones del producto
     */
    getProductSpecs(product) {
        const specs = [];
        
        if (product.potencia) specs.push(`${product.potencia}W`);
        if (product.color) {
            const colorName = window.translationSystem ? 
                window.translationSystem.translateColor(product.color) : 
                product.color;
            specs.push(colorName);
        }
        if (product.tipo) {
            const typeName = window.translationSystem ? 
                window.translationSystem.translateType(product.tipo) : 
                product.tipo;
            specs.push(typeName);
        }

        return specs.join(' • ');
    }

    /**
     * Obtener nombre de categoría traducido
     */
    getCategoryName(category) {
        const translations = {
            pt: {
                'secadores': 'Secadores',
                'ironing': 'Passar a ferro',
                'porta-malas': 'Porta-malas'
            },
            es: {
                'secadores': 'Secadores',
                'ironing': 'Planchado',
                'porta-malas': 'Portamaletas'
            },
            en: {
                'secadores': 'Hair Dryers',
                'ironing': 'Ironing',
                'porta-malas': 'Luggage Racks'
            }
        };

        const t = translations[this.currentLanguage] || translations.pt;
        return t[category] || category;
    }

    /**
     * Obtener imagen de categoría
     */
    getCategoryImage(category) {
        const images = {
            'secadores': 'secador.png',
            'ironing': 'Ironing.png',
            'porta-malas': 'PORTA MALAS.png'
        };
        return images[category] || 'secador.png';
    }

    /**
     * Obtener texto de precio para categorías
     */
    getCategoryPriceText() {
        const translations = {
            pt: 'Preço sob consulta',
            es: 'Precio a consultar',
            en: 'Price on request'
        };
        return translations[this.currentLanguage] || translations.pt;
    }

    /**
     * Configurar event listeners
     */
    setupEventListeners() {
        // Formulario para agregar categoría
        const addCategoryForm = document.getElementById('addCategoryForm');
        if (addCategoryForm) {
            addCategoryForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleAddCategory();
            });
        }

        // Cerrar modal al hacer clic fuera
        const modal = document.getElementById('addCategoryModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeAddCategoryModal();
                }
            });
        }

        // Los controles de cantidad ahora usan onclick directamente en el HTML
    }

    /**
     * Manejar agregar categoría
     */
    handleAddCategory() {
        const category = document.getElementById('categorySelect').value;
        const quantity = parseInt(document.getElementById('quantityInput').value);
        const notes = document.getElementById('notesInput').value;

        if (!category || quantity < 1) {
            this.showNotification('Por favor completa todos los campos requeridos', 'error');
            return;
        }

        this.addCategory(category, quantity, notes);
        this.closeAddCategoryModal();
        
        // Limpiar formulario
        document.getElementById('addCategoryForm').reset();
        document.getElementById('quantityInput').value = 1;
    }

    /**
     * Mostrar notificación
     */
    showNotification(message, type = 'info') {
        // Crear elemento de notificación
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#2563eb'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1001;
            font-weight: 500;
            transform: translateX(100%);
            transition: transform 0.3s ease;
        `;
        notification.textContent = message;

        document.body.appendChild(notification);

        // Animar entrada
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        // Remover después de 3 segundos
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    /**
     * Actualizar idioma
     */
    updateLanguage(lang) {
        this.currentLanguage = lang;
        this.renderCart();
        this.updateSummary();
    }

    /**
     * Enviar pedido
     */
    sendOrder() {
        if (this.cart.length === 0) {
            this.showNotification('El carrito está vacío', 'error');
            return;
        }

        // Mostrar confirmación
        const totalItems = this.cart.reduce((total, item) => total + item.quantity, 0);
        const confirmMessage = `¿Estás seguro de que quieres enviar el pedido con ${totalItems} productos?`;
        
        if (confirm(confirmMessage)) {
            // Aquí puedes implementar la lógica para enviar el pedido
            // Por ejemplo, enviar a un servidor, generar PDF, etc.
            this.showNotification('Pedido enviado correctamente', 'success');
            
            // Limpiar el carrito después de enviar
            this.cart = [];
            this.saveCart();
            this.renderCart();
            this.updateSummary();
        }
    }
}

// Funciones globales para el HTML
function openAddCategoryModal() {
    const modal = document.getElementById('addCategoryModal');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeAddCategoryModal() {
    const modal = document.getElementById('addCategoryModal');
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

function clearCart() {
    if (window.cartManager) {
        window.cartManager.clearCart();
    }
}

function sendOrder() {
    if (window.cartManager) {
        window.cartManager.sendOrder();
    }
}

// Funciones duplicadas eliminadas - solo usar las funciones "simple"

// FUNCIONES SIMPLES PARA LOS BOTONES DEL CARRITO
function simpleIncrease(itemId) {
    alert('Aumentando cantidad para: ' + itemId);
    console.log('SIMPLE INCREASE para:', itemId);
    
    try {
        // Obtener carrito del localStorage
        let cart = JSON.parse(localStorage.getItem('eppo_cart') || '[]');
        console.log('Carrito obtenido:', cart);
        
        // Encontrar el item
        let item = cart.find(item => item.id === itemId);
        console.log('Item encontrado:', item);
        
        if (item) {
            // Aumentar cantidad
            item.quantity = item.quantity + 1;
            console.log('Nueva cantidad:', item.quantity);
            
            // Guardar en localStorage
            localStorage.setItem('eppo_cart', JSON.stringify(cart));
            console.log('Carrito guardado');
            
            // Recargar la página del carrito
            location.reload();
            
            console.log('Cantidad aumentada a:', item.quantity);
        } else {
            alert('Item no encontrado con ID: ' + itemId);
            console.log('Item no encontrado');
        }
    } catch (error) {
        alert('Error: ' + error.message);
        console.error('Error en simpleIncrease:', error);
    }
}

function simpleDecrease(itemId) {
    alert('Disminuyendo cantidad para: ' + itemId);
    console.log('SIMPLE DECREASE para:', itemId);
    
    try {
        // Obtener carrito del localStorage
        let cart = JSON.parse(localStorage.getItem('eppo_cart') || '[]');
        console.log('Carrito obtenido:', cart);
        
        // Encontrar el item
        let item = cart.find(item => item.id === itemId);
        console.log('Item encontrado:', item);
        
        if (item && item.quantity > 1) {
            // Disminuir cantidad
            item.quantity = item.quantity - 1;
            console.log('Nueva cantidad:', item.quantity);
            
            // Guardar en localStorage
            localStorage.setItem('eppo_cart', JSON.stringify(cart));
            console.log('Carrito guardado');
            
            // Recargar la página del carrito
            location.reload();
            
            console.log('Cantidad disminuida a:', item.quantity);
        } else {
            alert('No se puede disminuir la cantidad (mínimo 1)');
            console.log('No se puede disminuir la cantidad');
        }
    } catch (error) {
        alert('Error: ' + error.message);
        console.error('Error en simpleDecrease:', error);
    }
}

function simpleSetQuantity(itemId, quantity) {
    alert('Estableciendo cantidad para: ' + itemId + ' a ' + quantity);
    console.log('SIMPLE SET QUANTITY para:', itemId, 'cantidad:', quantity);
    
    try {
        // Obtener carrito del localStorage
        let cart = JSON.parse(localStorage.getItem('eppo_cart') || '[]');
        console.log('Carrito obtenido:', cart);
        
        // Encontrar el item
        let item = cart.find(item => item.id === itemId);
        console.log('Item encontrado:', item);
        
        if (item) {
            // Validar cantidad
            let newQuantity = parseInt(quantity) || 1;
            if (newQuantity < 1) newQuantity = 1;
            if (newQuantity > 1000) newQuantity = 1000;
            
            console.log('Cantidad validada:', newQuantity);
            
            // Establecer cantidad
            item.quantity = newQuantity;
            
            // Guardar en localStorage
            localStorage.setItem('eppo_cart', JSON.stringify(cart));
            console.log('Carrito guardado');
            
            // Recargar la página del carrito
            location.reload();
            
            console.log('Cantidad establecida a:', newQuantity);
        } else {
            alert('Item no encontrado con ID: ' + itemId);
            console.log('Item no encontrado');
        }
    } catch (error) {
        alert('Error: ' + error.message);
        console.error('Error en simpleSetQuantity:', error);
    }
}

function simpleRemove(itemId) {
    alert('Eliminando item: ' + itemId);
    console.log('SIMPLE REMOVE para:', itemId);
    
    try {
        // Obtener carrito del localStorage
        let cart = JSON.parse(localStorage.getItem('eppo_cart') || '[]');
        console.log('Carrito obtenido:', cart);
        
        // Filtrar el item
        let newCart = cart.filter(item => item.id !== itemId);
        console.log('Nuevo carrito:', newCart);
        
        // Guardar en localStorage
        localStorage.setItem('eppo_cart', JSON.stringify(newCart));
        console.log('Carrito guardado');
        
        // Recargar la página del carrito
        location.reload();
        
        console.log('Item eliminado');
    } catch (error) {
        alert('Error: ' + error.message);
        console.error('Error en simpleRemove:', error);
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.cartManager = new CartManager();
});

// Función para agregar producto desde otras páginas
window.addToCart = function(product, quantity = 1) {
    if (window.cartManager) {
        window.cartManager.addProduct(product, quantity);
    } else {
        // Si no estamos en la página del carrito, redirigir
        const cart = JSON.parse(localStorage.getItem('eppo_cart') || '[]');
        const existingItem = cart.find(item => 
            item.id === product.id && item.type === 'product'
        );

        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            cart.push({
                id: product.id,
                type: 'product',
                name: product.nombre,
                category: product.categoria,
                price: product.precio,
                image: product.foto,
                quantity: quantity,
                specs: getProductSpecs(product)
            });
        }

        localStorage.setItem('eppo_cart', JSON.stringify(cart));
        
        // Mostrar notificación
        showQuickNotification('Producto agregado al carrito');
    }
};

// Función para obtener especificaciones del producto (versión global)
function getProductSpecs(product) {
    const specs = [];
    
    if (product.potencia) specs.push(`${product.potencia}W`);
    if (product.color) {
        const colorName = window.translationSystem ? 
            window.translationSystem.translateColor(product.color) : 
            product.color;
        specs.push(colorName);
    }
    if (product.tipo) {
        const typeName = window.translationSystem ? 
            window.translationSystem.translateType(product.tipo) : 
            product.tipo;
        specs.push(typeName);
    }

    return specs.join(' • ');
}

// Función para mostrar notificación rápida
function showQuickNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1001;
        font-weight: 500;
        transform: translateX(100%);
        transition: transform 0.3s ease;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);

    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
}
