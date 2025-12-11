# Instrucciones para configurar Supabase con la Web de Productos

## 1. Crear proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com) y crea una cuenta
2. Crea un nuevo proyecto
3. Anota la URL del proyecto y la clave anónima (anon key)

## 2. Ejecutar el script SQL

1. En el dashboard de Supabase, ve a **SQL Editor**
2. Copia y pega el contenido del archivo `supabase_products_table.sql`
3. Ejecuta el script
4. Verifica que la tabla `products` se haya creado correctamente

## 3. Configurar la conexión en tu web

1. Abre el archivo `supabase_config.js`
2. Reemplaza los valores:
   - `TU_SUPABASE_URL_AQUI` con la URL de tu proyecto
   - `TU_SUPABASE_ANON_KEY_AQUI` con tu clave anónima

## 4. Instalar dependencias

Si usas npm:
```bash
npm install @supabase/supabase-js
```

Si usas CDN, agrega este script a tu HTML:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

## 5. Usar en tu aplicación

### Ejemplo básico:
```javascript
import { getProducts } from './supabase_config.js'

// Obtener todos los productos
const productos = await getProducts()
console.log(productos)
```

### Ejemplo con filtros:
```javascript
import { filterProducts } from './supabase_config.js'

// Filtrar productos
const filtros = {
    categoria: ['secadores'],
    precioMax: 100,
    color: ['black', 'white']
}

const productosFiltrados = await filterProducts(filtros)
```

## 6. Estructura de la tabla

La tabla `products` tiene las siguientes columnas:

- `id`: ID único (auto-incremento)
- `nombre`: Nombre del producto
- `descripcion`: Descripción del producto
- `foto`: URL de la imagen
- `precio`: Precio en decimal
- `potencia`: Potencia en watts (0 si no aplica)
- `color`: Color del producto
- `tipo`: Tipo específico del producto
- `categoria`: Categoría principal (secadores, ironing, porta-malas)
- `features`: Características en formato JSON
- `badge`: Etiqueta especial (NEW, HOT, PREMIUM, etc.)
- `created_at`: Fecha de creación
- `updated_at`: Fecha de última actualización

## 7. Seguridad

- La tabla tiene Row Level Security (RLS) habilitado
- Por defecto, permite lectura pública
- Para operaciones de escritura, necesitarás configurar políticas adicionales

## 8. Datos de ejemplo

El script incluye datos de ejemplo basados en tus archivos JSON existentes. Puedes modificarlos o agregar más productos directamente desde el dashboard de Supabase.

## 9. Próximos pasos

1. Modifica tu archivo `productos-dinamico.js` para usar las funciones de Supabase
2. Reemplaza las llamadas a archivos JSON locales con las funciones de Supabase
3. Prueba la conexión y los filtros
4. Agrega más productos desde el dashboard de Supabase



