# Sistema de Usuarios y Roles - Instrucciones

## Descripción
Sistema completo de autenticación y autorización basado en Supabase Auth con gestión de roles y permisos.

## Componentes Creados

### 1. Archivos JavaScript
- **`auth.js`**: Sistema de autenticación con Supabase Auth
  - Login, registro, logout
  - Gestión de sesiones
  - Recuperación de contraseña
  
- **`roles.js`**: Sistema de roles y permisos
  - 4 roles predefinidos: admin, editor, viewer, comercial
  - Control de acceso basado en permisos
  - Gestión de roles de usuarios

### 2. Páginas HTML
- **`login.html`**: Página de inicio de sesión
- **`gestion-usuarios.html`**: Gestión de usuarios y roles (actualizada)

### 3. Base de Datos
- **`sql/crear-tabla-user-roles.sql`**: Script para crear tabla de roles

## Configuración Inicial

### Paso 1: Crear tabla en Supabase
1. Ve a tu proyecto en Supabase Dashboard
2. Abre el SQL Editor
3. Ejecuta el script `sql/crear-tabla-user-roles.sql`
4. Verifica que la tabla `user_roles` se haya creado correctamente

### Paso 2: Configurar Supabase Auth
1. En Supabase Dashboard, ve a **Authentication > Settings**
2. Configura las opciones de autenticación:
   - **Enable Email Auth**: Activado
   - **Enable Email Confirmations**: Opcional (recomendado para producción)
   - **Site URL**: Tu URL de producción
   - **Redirect URLs**: Añade las URLs permitidas

### Paso 3: Crear primer usuario administrador
1. Opción A: Desde Supabase Dashboard
   - Ve a **Authentication > Users**
   - Clic en **Add User**
   - Ingresa email y contraseña
   - Crea el usuario
   - Luego ejecuta este SQL para asignar rol de admin:
   ```sql
   INSERT INTO user_roles (user_id, role)
   VALUES ('ID_DEL_USUARIO', 'admin');
   ```

2. Opción B: Desde la aplicación
   - Accede a `login.html`
   - Crea una cuenta (si está habilitado el registro público)
   - Luego asigna el rol de admin desde Supabase SQL Editor

## Roles Disponibles

### 1. **admin** (Administrador)
- Acceso completo a todas las funcionalidades
- Puede gestionar usuarios y roles
- Permisos: `['*']` (todos)

### 2. **editor** (Editor)
- Puede ver y editar productos
- Puede crear y editar propuestas
- Puede ver stock
- Permisos: `['view-products', 'edit-products', 'view-proposals', 'create-proposals', 'edit-proposals', 'view-stock']`

### 3. **viewer** (Visualizador)
- Solo lectura
- Puede ver productos y propuestas
- Permisos: `['view-products', 'view-proposals', 'view-stock']`

### 4. **comercial** (Comercial)
- Puede crear y editar propuestas
- Puede ver productos y stock
- Permisos: `['view-products', 'create-proposals', 'edit-proposals', 'view-proposals', 'view-stock']`

## Permisos por Página

| Página | Permisos Requeridos |
|--------|---------------------|
| `index.html` | `view-products` |
| `productos-dinamico.html` | `view-products` |
| `producto-detalle.html` | `view-products` |
| `carrito-compras.html` | `create-proposals`, `edit-proposals` |
| `consultar-propuestas.html` | `view-proposals` |
| `admin-productos.html` | `edit-products` |
| `selector-productos.html` | `view-stock` |
| `gestion-usuarios.html` | `*` (solo admin) |
| `gestion-logos-propuesta.html` | `edit-proposals` |
| `comparar-productos.html` | `view-products` |

## Uso del Sistema

### Iniciar Sesión
1. Accede a `login.html`
2. Ingresa email y contraseña
3. El sistema verifica credenciales con Supabase Auth
4. Redirige a `index.html` si es exitoso

### Gestionar Usuarios
1. Accede a `gestion-usuarios.html` (requiere rol admin)
2. Verás lista de todos los usuarios
3. Para crear usuario:
   - Clic en "Agregar Usuario"
   - Ingresa email, contraseña y selecciona rol
   - El usuario recibirá email de confirmación (si está habilitado)
4. Para cambiar rol:
   - Selecciona nuevo rol en el dropdown de la tabla
   - El cambio se guarda automáticamente

### Control de Acceso
El sistema verifica automáticamente los permisos al acceder a cada página. Si un usuario no tiene permisos:
- Se muestra un mensaje de error
- Se redirige a `index.html`

## Notas Importantes

### Admin API de Supabase
Para gestionar usuarios completamente (crear, eliminar) desde la aplicación, necesitas:
1. **Service Role Key** de Supabase (NUNCA exponer en el frontend)
2. Crear una **Edge Function** o **backend** que use el Admin API
3. O usar el Admin API directamente desde Supabase Dashboard

**IMPORTANTE**: La `service_role` key nunca debe estar en el código del frontend. Solo úsala en:
- Edge Functions de Supabase
- Backend seguro
- Scripts de administración

### Políticas RLS (Row Level Security)
La tabla `user_roles` tiene RLS habilitado:
- Los usuarios pueden ver su propio rol
- Solo admins pueden insertar/actualizar/eliminar roles

### Crear Usuarios desde Supabase Dashboard
Puedes crear usuarios directamente desde Supabase:
1. Ve a **Authentication > Users**
2. Clic en **Add User**
3. Ingresa email y contraseña
4. El usuario se crea inmediatamente
5. Luego asigna el rol desde `gestion-usuarios.html` o ejecutando SQL

## Solución de Problemas

### Error: "No se puede usar Admin API"
- **Causa**: El Admin API requiere `service_role` key
- **Solución**: Usa el método alternativo o crea una Edge Function

### Error: "No tienes permiso para acceder"
- **Causa**: El usuario no tiene el rol necesario
- **Solución**: Asigna el rol correcto desde `gestion-usuarios.html`

### Error: "Tabla user_roles no existe"
- **Causa**: No se ejecutó el script SQL
- **Solución**: Ejecuta `sql/crear-tabla-user-roles.sql` en Supabase

### Usuario no puede iniciar sesión
- Verifica que el email esté confirmado (si está habilitado)
- Verifica que la contraseña sea correcta
- Revisa la consola del navegador para errores

## Próximos Pasos

1. **Implementar control de acceso en páginas principales**:
   - Añadir verificación de permisos al inicio de cada página
   - Redirigir a login si no está autenticado
   - Mostrar/ocultar elementos según permisos

2. **Crear Edge Function para Admin API**:
   - Crear función para crear usuarios sin confirmación
   - Crear función para eliminar usuarios
   - Proteger con autenticación y verificación de rol admin

3. **Mejorar UI/UX**:
   - Añadir indicador de usuario logueado
   - Añadir menú de usuario con opción de logout
   - Mejorar mensajes de error y éxito

