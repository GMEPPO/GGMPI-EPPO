# Configuración del Bucket 'product-images' en Supabase Storage

Este documento detalla los pasos necesarios para crear y configurar el bucket de almacenamiento `product-images` en Supabase, que se utiliza para guardar las imágenes de los productos.

---

## 1. Crear el Bucket en Supabase Dashboard

1. **Accede a tu proyecto Supabase**: Inicia sesión en tu Supabase Dashboard.
2. **Navega a Storage**: En el menú lateral izquierdo, haz clic en "Storage" (Almacenamiento).
3. **Crea un nuevo bucket**:
   *   Haz clic en el botón "New bucket" (Nuevo bucket).
   *   **Nombre del bucket**: Ingresa `product-images` (es crucial que el nombre sea exactamente este).
   *   **Público/Privado**: Marca la opción "Public bucket" (Bucket público). Esto permitirá que las imágenes sean accesibles directamente a través de una URL.
   *   Haz clic en "Create bucket" (Crear bucket).

---

## 2. Configurar Políticas de Acceso (RLS - Row Level Security)

Aunque el bucket sea público, es una buena práctica tener políticas RLS para controlar quién puede subir o eliminar archivos. Para este caso, permitiremos que los usuarios autenticados puedan subir y ver archivos.

1. **Selecciona el bucket `product-images`**: En la sección "Storage", haz clic en el bucket `product-images` que acabas de crear.
2. **Navega a "Policies"**: Haz clic en la pestaña "Policies" (Políticas).
3. **Crea una nueva política para `SELECT` (lectura)**:
   *   Haz clic en "New policy" (Nueva política).
   *   Selecciona "Create a policy from scratch" (Crear una política desde cero).
   *   **Name**: `Allow authenticated users to view product images` (Permitir a usuarios autenticados ver imágenes de productos)
   *   **For operations**: `SELECT`
   *   **Target Roles**: `authenticated`
   *   **Using a custom SQL expression**: Deja esto vacío o usa `true` si quieres que todos los autenticados puedan ver todo. Para un bucket público, la visibilidad ya está gestionada por el ajuste de "Public bucket", pero esta política asegura que los usuarios autenticados tienen permiso explícito.
   *   Haz clic en "Review" y luego "Save policy".

4. **Crea una nueva política para `INSERT` (subida)**:
   *   Haz clic en "New policy".
   *   Selecciona "Create a policy from scratch".
   *   **Name**: `Allow authenticated users to upload product images` (Permitir a usuarios autenticados subir imágenes de productos)
   *   **For operations**: `INSERT`
   *   **Target Roles**: `authenticated`
   *   **Using a custom SQL expression**: `(bucket_id = 'product-images')` (Esto asegura que solo puedan insertar en este bucket específico).
   *   Haz clic en "Review" y luego "Save policy".

5. **Crea una nueva política para `UPDATE` (sobrescribir/renombrar)**:
   *   Haz clic en "New policy".
   *   Selecciona "Create a policy from scratch".
   *   **Name**: `Allow authenticated users to update product images` (Permitir a usuarios autenticados actualizar imágenes de productos)
   *   **For operations**: `UPDATE`
   *   **Target Roles**: `authenticated`
   *   **Using a custom SQL expression**: `(bucket_id = 'product-images')`
   *   Haz clic en "Review" y luego "Save policy".

6. **Crea una nueva política para `DELETE` (eliminar)**:
   *   Haz clic en "New policy".
   *   Selecciona "Create a policy from scratch".
   *   **Name**: `Allow authenticated users to delete product images` (Permitir a usuarios autenticados eliminar imágenes de productos)
   *   **For operations**: `DELETE`
   *   **Target Roles**: `authenticated`
   *   **Using a custom SQL expression**: `(bucket_id = 'product-images')`
   *   Haz clic en "Review" y luego "Save policy".

---

## 3. Estructura de Archivos Esperada

Las imágenes de productos se guardarán dentro de una subcarpeta `productos/` dentro del bucket `product-images`.

*   **Ruta**: `product-images/productos/{nombre-archivo-unico}.{extension}`
*   **Ejemplo**: `product-images/productos/foto_1234567890_abc123.jpg`
*   **Formato de nombre**: `{campo}_{timestamp}_{random}.{extension}`

---

## 4. Configuración de Límites (Opcional)

Puedes configurar límites adicionales para el bucket:

1. **File Size Limit**: El código actualmente limita las imágenes a 5MB. Puedes configurar esto en el bucket también:
   *   En la configuración del bucket, establece "File size limit" a `5 MB` (o el valor que prefieras).

2. **Allowed MIME Types**: Puedes restringir los tipos de archivo permitidos:
   *   En la configuración del bucket, en "Allowed MIME types", ingresa: `image/jpeg, image/jpg, image/png, image/gif, image/webp, image/avif`
   *   Esto asegura que solo se puedan subir imágenes válidas.

---

## 5. Notas Importantes

*   Asegúrate de que el nombre del bucket sea `product-images` exactamente, ya que el código lo referencia directamente en `admin-productos.js` (líneas 6698 y 6711).
*   Las políticas RLS son fundamentales para la seguridad. Si tienes problemas para subir o ver archivos, revisa estas políticas.
*   El código JavaScript se encarga de generar nombres únicos para los archivos y gestionar las rutas dentro del bucket.
*   Si las imágenes ya se estaban guardando sin el bucket, es posible que:
    *   Supabase haya creado el bucket automáticamente en algún momento
    *   O que las URLs se estuvieran guardando en la base de datos pero las imágenes no se subieran realmente
    *   Verifica en el bucket si hay archivos existentes después de crearlo

---

## 6. Verificación

Después de crear el bucket y configurar las políticas:

1. Intenta subir una imagen de producto desde `admin-productos.html`.
2. Verifica en el Dashboard de Supabase que el archivo aparece en `product-images/productos/`.
3. Verifica que la URL pública funciona y la imagen se muestra correctamente.
4. Si encuentras errores, revisa la consola del navegador para ver mensajes de error específicos.

---

## 7. Troubleshooting

### Error: "Bucket not found"
*   Verifica que el bucket se llama exactamente `product-images` (sin espacios, sin mayúsculas adicionales).
*   Verifica que el bucket está marcado como "Public".

### Error: "new row violates row-level security policy"
*   Verifica que has creado las políticas RLS correctamente.
*   Asegúrate de que estás autenticado cuando intentas subir imágenes.

### Las imágenes no se muestran
*   Verifica que el bucket es público.
*   Verifica que la URL pública es correcta (debe incluir `/storage/v1/object/public/product-images/`).
*   Revisa la consola del navegador para errores de CORS o de carga de imágenes.

