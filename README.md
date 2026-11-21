# HORAE Pro — Control horario personal

Aplicación web instalable (PWA) para registrar jornadas, servicios, tarifas y generar informes mensuales. Interfaz premium oscura, responsive y en español.

## Incluye
- Panel mensual con horas, importes, jornadas, media por jornada y distribución por servicio.
- Registro manual de jornadas con validación de horas y tarifa histórica.
- Servicios por horas o por importe fijo (por ejemplo, programación mensual de 150 €), sin sumar horas ficticias.
- Cronómetro en directo: inicia una jornada, consulta el tiempo transcurrido y finaliza para guardarla. El estado se conserva si cierras o recargas la app.
- Catálogo editable de servicios y tarifas.
- Historial mensual con búsqueda, filtro, edición y eliminación.
- Informe A4 con resumen por servicio y espacios de firma; imprimir o guardar como PDF.
- Exportación mensual a CSV y copia de seguridad/restauración JSON.
- Persistencia local y sincronización con Google Sheets mediante Apps Script.
- PWA con manifest, iconos y service worker para cachear la interfaz.

## A. Publicar la web
1. Descomprime el ZIP.
2. Publica el contenido en un hosting estático HTTPS (Vercel, Netlify o GitHub Pages).
3. Conserva las rutas relativas de `manifest.webmanifest`, `sw.js` y `icons/`.
4. En iPhone: abre la URL en Safari → Compartir → Añadir a pantalla de inicio. En Android: menú del navegador → Instalar aplicación.

El service worker requiere HTTPS (excepto `localhost`). La app guarda datos en el navegador sin conexión, pero la sincronización con Sheets necesita internet.


> **Endpoint no preconfigurado:** por seguridad, la URL de Apps Script se introduce manualmente en Configuración después de comprobar el backend. No se incluye una URL de despliegue en el código público.

## B. Sincronización segura con Google Sheets

El repositorio incluye `Code.gs`, el backend de Google Apps Script. El endpoint utiliza un token compartido y control de revisiones para impedir que una sincronización antigua sobrescriba silenciosamente datos más recientes.

### Configuración inicial

1. Abre la hoja de cálculo de HORAE y entra en **Extensiones → Apps Script**.
2. Sustituye el código del proyecto por el contenido actual de `Code.gs`.
3. Ejecuta `setup()` una vez y concede los permisos solicitados.
4. Ejecuta `generateApiToken()` y copia el token que aparece en el registro de ejecución. No lo compartas.
5. En **Implementar → Nueva implementación → Aplicación web**, configura la ejecución como tú y el acceso que permita tu organización. El endpoint puede ser accesible por URL, pero las operaciones requieren el token.
6. Copia la URL terminada en `/exec`.
7. En HORAE → Configuración, introduce la URL y el token y pulsa **Conectar y sincronizar**.

### Conectar otro dispositivo

Introduce la misma URL y el mismo token en el segundo dispositivo. Si la hoja ya tiene datos, utiliza primero **Descargar desde Sheets** para obtener la revisión remota antes de realizar cambios.

### Seguridad y recuperación

- El token se guarda en el almacenamiento local del navegador y no se incluye en las copias JSON exportadas.
- Para rotar el token, ejecuta otra vez `generateApiToken()` y actualízalo en todos los dispositivos.
- La API valida el tamaño de las peticiones, los campos, los identificadores y los valores numéricos.
- El backend neutraliza textos que podrían interpretarse como fórmulas de Sheets.
- Cada sincronización envía una revisión esperada. Si otro dispositivo ya ha sincronizado, el backend rechaza la revisión antigua. Descarga primero la versión remota y conserva una copia local antes de sustituir datos.
- La sincronización sigue siendo de tipo snapshot: no fusiona automáticamente cambios simultáneos ni sincroniza eliminaciones como operaciones individuales.
- El token es un secreto compartido, no una identidad individual. Un dispositivo comprometido o una persona con el token puede acceder a los datos. No lo uses como sistema de autenticación empresarial o multiusuario.

## C. Generar PDF
1. Entra en Informes o pulsa Exportar informe.
2. Selecciona el mes, indica trabajador y empresa/responsable.
3. Genera la vista previa y pulsa Imprimir / Guardar como PDF.
4. En el diálogo de impresión, selecciona Guardar como PDF.

## Cálculo de duración
- La duración manual se calcula entre hora de inicio y fin; si la hora final es anterior, se interpreta como jornada nocturna.
- No se permite la misma hora de inicio y fin en el registro manual para evitar guardar 24 horas por error.
- El cronómetro conserva su inicio al recargar y guarda la duración real redondeada al minuto.
- Importe = minutos / 60 × tarifa por hora.
- Cada registro conserva la tarifa aplicada en el momento de crearlo. Cambiar la tarifa del servicio no altera registros anteriores.
- El importe es estimado; no contempla descansos no remunerados, complementos, impuestos ni reglas especiales de nómina.

## Copias de seguridad
- CSV: jornadas del mes activo para abrir en una hoja de cálculo.
- JSON: copia completa de registros, servicios y perfil, apta para restaurar.
- Guarda una copia fuera del móvil periódicamente.

## Estructura
```text
HORAE_Pro/
├── index.html
├── styles.css
├── app.js
├── Code.gs
├── sw.js
├── manifest.webmanifest
├── icons/
│   ├── icon.svg
│   ├── icon-192.png
│   └── icon-512.png
└── README.md
```
