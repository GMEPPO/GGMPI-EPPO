# 🔧 DIAGNÓSTICO COMPLETO - PROBLEMA DE CONEXIÓN SUPABASE

## 🚨 **Problema Reportado**

No se está conectando con Supabase usando:
- **URL:** `https://fzlvsgjvilompkjmqeoj.supabase.co`
- **API Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6bHZzZ2p2aWxvbXBram1xZW9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzNjQyODYsImV4cCI6MjA3Mzk0MDI4Nn0.KbH8qLOoWrVeXcTHelQNIzXoz0tutVGJHqkYw3GPFPY`

---

## 🛠️ **Herramientas de Diagnóstico Creadas**

### **1. 📄 `test-connection-simple.html`**
- **Propósito:** Diagnóstico completo paso a paso
- **Tests incluidos:**
  - ✅ Verificar script de Supabase
  - ✅ Crear cliente Supabase
  - ✅ Probar conexión básica
  - ✅ Probar tabla secadores
  - ✅ Verificar políticas RLS
  - ✅ Obtener datos del producto

### **2. 📄 `productos-debug-simple.html`**
- **Propósito:** Versión simplificada para debug
- **Características:**
  - ✅ Log detallado en tiempo real
  - ✅ Estado de conexión visual
  - ✅ Carga y muestra productos
  - ✅ Manejo de errores mejorado

### **3. 📄 `verify-api-key.html`**
- **Propósito:** Verificar validez de API Key
- **Funciones:**
  - ✅ Decodificar JWT
  - ✅ Verificar expiración
  - ✅ Probar conectividad directa
  - ✅ Validar formato

---

## 🔍 **Pasos para Diagnosticar**

### **Paso 1: Verificar API Key**
1. **Abrir** `verify-api-key.html` en el navegador
2. **Revisar** la información decodificada del JWT
3. **Verificar** que no esté expirado
4. **Comprobar** conectividad básica

### **Paso 2: Diagnóstico Completo**
1. **Abrir** `test-connection-simple.html` en el navegador
2. **Ejecutar** todos los tests en orden
3. **Identificar** en qué paso falla
4. **Revisar** los mensajes de error específicos

### **Paso 3: Debug Simplificado**
1. **Abrir** `productos-debug-simple.html` en el navegador
2. **Revisar** el log de debug en tiempo real
3. **Verificar** si los productos se cargan
4. **Identificar** errores específicos

---

## 🚨 **Posibles Problemas y Soluciones**

### **1. API Key Expirada**
**Síntomas:** Error de autenticación
**Solución:**
1. Ir a Supabase Dashboard
2. Settings → API
3. Generar nueva API Key
4. Actualizar en el código

### **2. URL Incorrecta**
**Síntomas:** Error de conexión
**Solución:**
1. Verificar URL en Supabase Dashboard
2. Asegurar que sea `https://fzlvsgjvilompkjmqeoj.supabase.co`
3. Verificar que el proyecto existe

### **3. Tabla No Existe**
**Síntomas:** Error "relation does not exist"
**Solución:**
```sql
-- Crear tabla secadores
CREATE TABLE secadores (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    descripcion_pt TEXT,
    descripcion_es TEXT,
    foto VARCHAR(500),
    precio DECIMAL(10,2) NOT NULL,
    potencia INTEGER DEFAULT 0,
    color VARCHAR(50),
    tipo VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### **4. Políticas RLS Bloqueando**
**Síntomas:** Error de permisos
**Solución:**
```sql
-- Habilitar RLS
ALTER TABLE secadores ENABLE ROW LEVEL SECURITY;

-- Crear política para lectura pública
CREATE POLICY "Permitir lectura pública de secadores" ON secadores
    FOR SELECT USING (true);
```

### **5. Datos No Insertados**
**Síntomas:** Tabla vacía
**Solución:**
```sql
-- Insertar producto de prueba
INSERT INTO secadores (nombre, descripcion_pt, descripcion_es, foto, precio, potencia, color, tipo) VALUES
('CW-Bedford', 'Melhore a experiência dos seus hóspedes', 'Mejore la experiencia de sus huéspedes', 'https://static...', 89.99, 1800, 'black', 'suelto');
```

### **6. Problema de Red/CORS**
**Síntomas:** Error de red
**Solución:**
1. Verificar conexión a internet
2. Probar desde otro navegador
3. Verificar configuración de CORS en Supabase

---

## 📋 **Checklist de Verificación**

### **✅ Configuración Básica**
- [ ] URL de Supabase correcta
- [ ] API Key válida y no expirada
- [ ] Script de Supabase cargado
- [ ] Cliente inicializado correctamente

### **✅ Base de Datos**
- [ ] Tabla `secadores` existe
- [ ] Tabla tiene datos
- [ ] Políticas RLS configuradas
- [ ] Permisos de lectura pública

### **✅ Red y Conectividad**
- [ ] Conexión a internet funciona
- [ ] URL de Supabase accesible
- [ ] No hay bloqueos de firewall
- [ ] CORS configurado correctamente

---

## 🚀 **Próximos Pasos**

### **1. Inmediato**
1. **Abrir** `verify-api-key.html` para verificar API Key
2. **Abrir** `test-connection-simple.html` para diagnóstico completo
3. **Identificar** el problema específico
4. **Aplicar** la solución correspondiente

### **2. Si Todo Funciona**
1. **Verificar** que los productos aparecen
2. **Probar** las páginas principales
3. **Confirmar** que la funcionalidad está completa

### **3. Si Persiste el Problema**
1. **Revisar** la consola del navegador (F12)
2. **Verificar** la configuración de Supabase
3. **Contactar** soporte si es necesario

---

## 📞 **Información de Debug**

### **Configuración Actual:**
- **URL:** `https://fzlvsgjvilompkjmqeoj.supabase.co`
- **API Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **Tabla:** `secadores`
- **Producto:** CW-Bedford

### **Archivos de Diagnóstico:**
- ✅ `test-connection-simple.html` - Diagnóstico completo
- ✅ `productos-debug-simple.html` - Debug simplificado
- ✅ `verify-api-key.html` - Verificación de API Key

### **Archivos Principales Corregidos:**
- ✅ `productos-dinamico-supabase.js` - Tabla corregida
- ✅ `productos-supabase.js` - Tabla corregida
- ✅ `comparar-productos.html` - Mapeo de tablas

¡Con estas herramientas deberías poder identificar y solucionar el problema de conexión!


