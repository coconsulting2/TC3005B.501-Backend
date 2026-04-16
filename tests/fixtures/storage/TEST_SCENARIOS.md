# Escenarios de Prueba — S3 Storage

**Colección:** S3-Storage.postman_collection.json  
**Versión Postman:** v11.x (formato collection v2.1)  
**Ambiente:** AWS S3 test environment  
**Servidor:** `https://localhost:3000`  

---

## Configuración previa

### Variables de la colección

| Variable   | Descripción                                        | Cómo obtenerla                         |
|------------|----------------------------------------------------|----------------------------------------|
| `baseUrl`  | URL base del servidor                              | `https://localhost:3000` (por defecto) |
| `authToken`| JWT válido del usuario autenticado                 | Endpoint de login (`POST /api/user/login`) |
| `s3Key`    | S3 object key de un upload previo                  | Se auto-llena tras ejecutar TC-S3-001  |
| `orgId`    | Identificador de organización                      | `org-test-001` (valor de prueba)       |
| `viajeId`  | Identificador del viaje                            | `viaje-test-001` (valor de prueba)     |

### Archivos de prueba

| Archivo               | Tamaño  | MIME type            | Propósito                                |
|-----------------------|---------|----------------------|------------------------------------------|
| `valid.pdf`           | 597 B   | application/pdf      | Upload happy path                        |
| `valid.xml`           | 2.2 KB  | text/xml             | Verificar rechazo de XML (no permitido)  |
| `large_file_11mb.pdf` | 11 MB   | application/pdf      | Verificar rechazo por tamaño > 10MB      |
| `malicious.exe`       | 74 B    | application/octet-stream | Verificar rechazo de extensión inválida |
| `corrupted.pdf`       | 382 B   | application/pdf      | Verificar comportamiento con contenido corrupto |

---

## Resumen de escenarios

| ID         | Nombre                                   | Endpoint              | Tipo     | HTTP esperado |
|------------|------------------------------------------|-----------------------|----------|---------------|
| TC-S3-001  | Upload PDF válido                        | POST /upload          | Positivo | 201           |
| TC-S3-002  | Upload archivo > 10MB                    | POST /upload          | Negativo | 400           |
| TC-S3-003  | Upload extensión inválida (.exe)          | POST /upload          | Negativo | 400           |
| TC-S3-004  | Upload XML (tipo MIME no permitido)       | POST /upload          | Negativo | 400           |
| TC-S3-005  | Upload PDF corrompido                    | POST /upload          | Borde    | 201 (ver nota)|
| TC-S3-006  | Upload sin token de autenticación         | POST /upload          | Negativo | 401           |
| TC-S3-007  | Upload con token inválido/expirado        | POST /upload          | Negativo | 403           |
| TC-S3-008  | Upload sin campo 'file' en el body        | POST /upload          | Negativo | 400           |
| TC-S3-009  | Download - Obtener URL prefirmada         | GET /:id/download     | Positivo | 200           |
| TC-S3-010  | Download - Key inexistente en S3          | GET /:id/download     | Borde    | 200 (ver nota)|
| TC-S3-011  | Download sin token de autenticación       | GET /:id/download     | Negativo | 401           |
| TC-S3-012  | Delete - Endpoint no implementado         | DELETE /:id           | Gap      | 404           |

---

## Detalle de escenarios

### TC-S3-001 — Upload PDF válido (Happy Path)

**Descripción:** Subir un PDF bien formado dentro del límite de 10MB con autenticación válida.

**Precondiciones:**
- Servidor corriendo con credenciales AWS configuradas
- `authToken` válido en las variables de colección

**Pasos:**
1. Adjuntar `valid.pdf` en el campo `file`
2. Enviar `orgId` y `viajeId` en el body
3. Header `Authorization: Bearer <token>`

**Resultado esperado:**
```json
HTTP 201
{
  "message": "File uploaded to S3 successfully",
  "key": "orgtest001/viajetest001/<uuid>/valid.pdf",
  "bucket": "<nombre-del-bucket>"
}
```

**Validaciones automáticas:**
- Status 201
- Campo `message` correcto
- Campos `key` y `bucket` presentes y no vacíos
- Formato del key: 4 segmentos separados por `/`
- La variable `s3Key` se guarda automáticamente para TC-S3-009

---

### TC-S3-002 — Upload archivo > 10MB

**Descripción:** Verificar que el middleware rechaza archivos que exceden `MAX_FILE_SIZE = 10 * 1024 * 1024`.

**Flujo técnico:**
```
Request → authenticateToken → fileValidation.single("file")
                                  ↓
                         Multer detecta LIMIT_FILE_SIZE
                                  ↓
                         handleMulterErrors → HTTP 400
```

**Resultado esperado:**
```json
HTTP 400
{
  "error": "File size exceeds the 10MB limit."
}
```

---

### TC-S3-003 — Upload extensión inválida (.exe)

**Descripción:** Verificar que `fileFilter` bloquea tipos MIME no permitidos.

**Tipos MIME permitidos** (definidos en `middleware/fileValidation.js`):
- `application/pdf`
- `image/jpeg`
- `image/png`

**Flujo técnico:**
```
fileFilter recibe file con mimetype = "application/octet-stream"
  → cb(new Error("Invalid file type. Only PDF, JPEG, and PNG are allowed."), false)
  → handleMulterErrors → HTTP 400
```

**Resultado esperado:**
```json
HTTP 400
{
  "error": "Invalid file type. Only PDF, JPEG, and PNG are allowed."
}
```

---

### TC-S3-004 — Upload XML (tipo MIME no permitido)

**Descripción:** El XML (`valid.xml`) es un CFDI 4.0 del SAT estructuralmente válido, pero su MIME type (`text/xml`) no está en la lista de tipos permitidos.

**Resultado esperado:**
```json
HTTP 400
{
  "error": "Invalid file type. Only PDF, JPEG, and PNG are allowed."
}
```

**Nota de diseño:** Si el sistema necesita almacenar XMLs de CFDI en S3, se debe agregar `text/xml` y `application/xml` a `allowedMimeTypes` en `middleware/fileValidation.js`.

---

### TC-S3-005 — Upload PDF corrompido (escenario borde)

**Descripción:** Archivo con cabecera `%PDF-1.4` válida pero contenido binario basura.

**Comportamiento actual:**
- Multer valida el MIME type enviado por el **cliente** en el `Content-Type` del multipart, no el contenido real del archivo.
- Si el cliente envía `Content-Type: application/pdf`, el archivo pasa `fileFilter`.
- S3 acepta cualquier contenido binario — no parsea ni valida documentos PDF.
- **El archivo corrupto es aceptado con HTTP 201.**

**Resultado esperado:**
```json
HTTP 201
{
  "message": "File uploaded to S3 successfully",
  "key": "...",
  "bucket": "..."
}
```

**Recomendación de mejora:** Implementar validación de contenido en servidor usando una librería como `pdf-parse` para verificar integridad antes de enviar a S3.

---

### TC-S3-006 — Upload sin token de autenticación

**Flujo:** `authenticateToken` verifica `req.headers.authorization`. Si no existe → HTTP 401 antes de llegar a `fileValidation`.

**Resultado esperado:**
```json
HTTP 401
{
  "error": "Token was not provided"
}
```

---

### TC-S3-007 — Upload con token inválido

**Flujo:** `jwt.verify()` falla con firma inválida o token expirado → HTTP 403.

**Resultado esperado:**
```json
HTTP 403
{
  "error": "Invalid Token"
}
```

---

### TC-S3-008 — Upload sin campo 'file'

**Descripción:** Request autenticado y bien formado, pero sin archivo adjunto.

**Flujo:** `fileValidation.single("file")` no encuentra el campo → `req.file` es `undefined` → `uploadFile` controller devuelve 400.

**Resultado esperado:**
```json
HTTP 400
{
  "error": "File is required."
}
```

---

### TC-S3-009 — Download — URL prefirmada (Happy Path)

**Descripción:** Obtener una URL prefirmada de S3 para descargar un archivo subido previamente.

**Precondición:** Ejecutar TC-S3-001 primero (la variable `s3Key` debe estar poblada).

**Flujo técnico:**
```
GET /api/files/{encoded-s3-key}/download
  → authenticateToken
  → downloadFile controller
  → decodeURIComponent(req.params.id) → s3Key
  → getPresignedUrl(s3Key) → GetObjectCommand TTL=900s
  → HTTP 200 { url: "https://..." }
```

**Resultado esperado:**
```json
HTTP 200
{
  "url": "https://<bucket>.s3.<region>.amazonaws.com/<key>?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=900&..."
}
```

**Validaciones:**
- URL contiene `amazonaws.com`
- URL contiene `X-Amz-Expires=900` (15 minutos)

---

### TC-S3-010 — Download — Key inexistente (escenario borde)

**Descripción:** Verificar el comportamiento cuando se solicita URL para un objeto que no existe en S3.

**Comportamiento actual:**
- `getPresignedUrl()` usa `GetObjectCommand` que **no verifica existencia** — solo firma la URL.
- El servidor devuelve HTTP 200 con una URL "válida" criptográficamente.
- Al intentar usar esa URL, S3 devuelve `404 NoSuchKey` o `403 AccessDenied`.

**Resultado esperado:**
```json
HTTP 200
{
  "url": "https://...amazonaws.com/nonexistent-key?X-Amz-Expires=900&..."
}
```

**Recomendación de mejora:** Agregar `HeadObjectCommand` antes de `getSignedUrl` para verificar existencia y devolver HTTP 404 si el objeto no existe.

---

### TC-S3-011 — Download sin token

**Resultado esperado:**
```json
HTTP 401
{
  "error": "Token was not provided"
}
```

---

### TC-S3-012 — Delete (GAP identificado)

**Estado:** La ruta `DELETE /api/files/:id` **no está implementada**.

**Evidencia del gap:**
- `services/storageService.js` línea 97: función `deleteObject(key)` existe y funciona.
- `routes/fileRoutes.js`: no hay ningún `router.delete(...)` registrado.
- `controllers/fileController.js`: no hay controlador para delete.

**Resultado actual:**
```
HTTP 404
Cannot DELETE /api/files/...
```

**Implementación sugerida para una historia futura:**

```javascript
// routes/fileRoutes.js — agregar:
import { deleteFileController } from "../controllers/fileController.js";
router.delete("/:id", authenticateToken, authorizeRole(["admin"]), deleteFileController);

// controllers/fileController.js — agregar:
export const deleteFileController = async (req, res) => {
  try {
    const s3Key = decodeURIComponent(req.params.id);
    await deleteObject(s3Key);
    res.status(200).json({ message: "File deleted successfully" });
  } catch (error) {
    console.error("Error deleting from S3:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
```

**Consideraciones de seguridad:**
- Restringir delete solo a roles autorizados (`admin`)
- Validar que el `orgId` en el key corresponde a la organización del usuario autenticado
- Considerar soft-delete en base de datos antes de eliminar de S3

---

## Gaps y recomendaciones de mejora

| # | Gap / Mejora                                    | Prioridad | Archivo afectado              |
|---|-------------------------------------------------|-----------|-------------------------------|
| 1 | **DELETE endpoint no implementado**             | Alta      | `routes/fileRoutes.js`, `controllers/fileController.js` |
| 2 | PDF corrupto se acepta sin validar contenido    | Media     | `middleware/fileValidation.js`|
| 3 | Download de key inexistente devuelve URL inválida (no 404) | Media | `controllers/fileController.js`, `services/storageService.js` |
| 4 | XML no está en tipos permitidos (si se necesita)| Baja      | `middleware/fileValidation.js`|
| 5 | No hay validación de que el key pertenece al org del usuario en download | Alta | `controllers/fileController.js` |

---

## Orden de ejecución recomendado

Para pruebas manuales, ejecutar en este orden para que las variables se propaguen correctamente:

1. TC-S3-006 (sin auth — no requiere setup)
2. TC-S3-007 (token inválido — no requiere setup)
3. TC-S3-001 **← ejecutar primero de los positivos** (genera `s3Key`)
4. TC-S3-002
5. TC-S3-003
6. TC-S3-004
7. TC-S3-005
8. TC-S3-008
9. TC-S3-009 (requiere `s3Key` de TC-S3-001)
10. TC-S3-010
11. TC-S3-011
12. TC-S3-012
