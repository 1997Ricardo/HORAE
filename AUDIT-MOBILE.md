# HORAE — Auditoría técnica y plan de calidad móvil

Fecha: 21/11/2026  
Rama de trabajo: `feat/mobile-first-hardening`

## Resumen ejecutivo

HORAE es una PWA estática construida con HTML, CSS y JavaScript sin framework. Su arquitectura ligera es adecuada para una aplicación personal centrada en el móvil y evita dependencias y costes de infraestructura en el uso local.

La revisión cubrió la estructura del repositorio, la interfaz, el estado local, el cronómetro, los registros, los informes, la integración con Apps Script y el ciclo de vida de la PWA.

## Cambios aplicados en esta rama

- Se impide que las modificaciones locales activen sincronización si el usuario ha desconectado Google Sheets.
- Se cancela cualquier sincronización pendiente al desconectar.
- La reconexión solicita confirmación y recomienda descargar una copia antes de enviar datos.
- El evento de reconexión a internet solo sincroniza cuando la conexión está activada.
- Se gestionan los errores de escritura en localStorage para evitar que una cuota agotada rompa silenciosamente el flujo.
- Se conservan catálogos vacíos al volver a abrir la aplicación.
- Los servicios de importe fijo no pueden iniciarse con el cronómetro.
- Los registros generados por el cronómetro se identifican expresamente como registros por horas.
- El cálculo del importe contempla registros de importe fijo heredados.
- El periodo de los informes valida el formato AAAA-MM antes de generar el documento.
- Se escapan identificadores y clases de servicios procedentes de datos importados antes de insertarlos en el HTML.
- Las jornadas pasan a mostrarse como tarjetas en pantallas pequeñas, evitando la tabla horizontal.
- Se amplían las áreas táctiles, se adaptan formularios y diálogos al móvil y se respetan las áreas seguras del dispositivo.
- Se añaden metadatos de instalación móvil y color de tema.
- El service worker usa una estrategia network-first con fallback offline y solo elimina cachés antiguas propias de HORAE.
- Se corrige la documentación de Google Sheets: el repositorio no contiene `Code.gs`.
- Se elimina la URL de despliegue de Apps Script del código fuente público; debe introducirse manualmente en Configuración.
- Se elimina `.DS_Store` y se añade `.gitignore`.

## Hallazgos pendientes / límites actuales

### 1. Google Sheets y backend

Se ha incorporado `Code.gs` al repositorio y se ha endurecido el contrato de sincronización:

- Token compartido almacenado en Script Properties, generado/rotado con `generateApiToken()`.
- Validación de token en cada operación de lectura y escritura.
- Validación de tamaño de petición, arrays, identificadores duplicados, fechas, horas, textos y números.
- Neutralización de cadenas que podrían interpretarse como fórmulas en Google Sheets.
- Control optimista de revisiones bajo `LockService`: una sincronización con una revisión obsoleta se rechaza.
- Acción `pull` para descargar el estado remoto antes de sustituir los datos locales.
- El token se almacena en el navegador, no se exporta en copias JSON y debe configurarse manualmente en cada dispositivo.

Limitaciones que siguen vigentes: el token es un secreto compartido, no autenticación individual; un dispositivo comprometido puede exponerlo. La sincronización transmite snapshots completos, no hace merge de cambios y las eliminaciones requieren descargar/actualizar el snapshot. El servicio Apps Script no ofrece aquí una capa multiusuario ni permisos por usuario. Para uso con información sensible o varios usuarios, se recomienda una API con autenticación real.

La URL de Apps Script estuvo incluida en una versión anterior del código público. Eliminarla de la versión actual no la elimina del historial Git: rota el token, crea una implementación nueva y desactiva la anterior si sigue activa.

### 2. Persistencia y recuperación

Los datos se guardan en localStorage. Es sencillo y gratuito, pero no ofrece sincronización entre navegadores, aislamiento por usuario ni garantías de almacenamiento duradero. La copia JSON es importante. Para un uso intensivo offline, IndexedDB sería una evolución más robusta.

### 3. Calidad y pruebas

El repositorio todavía no tiene una suite de pruebas funcionales ni linting. Esta rama añade un pipeline CI básico para comprobar sintaxis JavaScript, JSON del manifest y presencia de recursos PWA, pero no sustituye las pruebas de regresión. Sigue siendo necesaria la validación manual en Safari iOS, Chrome Android y escritorio, incluyendo instalación, actualización, modo avión, cronómetro, edición, exportación y restauración.

### 4. Privacidad y seguridad

La aplicación guarda datos en el dispositivo y puede enviarlos al endpoint de Apps Script configurado. No hay autenticación propia ni separación multiusuario. No se deben introducir datos sensibles ni habilitar acceso público al backend sin controles de identidad y autorización.

### 5. Accesibilidad y experiencia

Se han mejorado los objetivos táctiles y los formularios móviles. Queda pendiente una auditoría completa con VoiceOver y TalkBack, contraste WCAG, navegación por teclado y pruebas de zoom del navegador.

## Checklist de validación manual antes de publicar

- [ ] Abrir la app en iPhone Safari y Android Chrome.
- [ ] Añadirla a la pantalla de inicio e iniciarla en modo standalone.
- [ ] Crear, editar y borrar una jornada.
- [ ] Registrar una jornada nocturna que cruza medianoche.
- [ ] Iniciar el cronómetro, cerrar la app, volver a abrirla y finalizar.
- [ ] Confirmar que un servicio de importe fijo no ofrece cronómetro.
- [ ] Generar un informe válido y probar un periodo inválido.
- [ ] Exportar CSV y JSON; restaurar la copia JSON en un dispositivo de prueba.
- [ ] Configurar URL y token; comprobar que un token incorrecto es rechazado.\n- [ ] Activar Sheets, desconectar y verificar que no se envían más cambios.\n- [ ] Conectar dos dispositivos, sincronizar desde uno y verificar que el otro recibe conflicto de revisión.\n- [ ] Descargar desde Sheets en el segundo dispositivo y comprobar que se actualiza la revisión.
- [ ] Activar modo avión, navegar por la app y volver a conectar.
- [ ] Verificar que una actualización del service worker entrega la versión nueva.
- [ ] Probar pantallas de 320, 360, 390 y 430 px de ancho.

## Recomendación de arquitectura

Mantener HORAE como PWA sin framework mientras siga siendo una herramienta personal y de bajo coste. La siguiente mejora estructural debería ser separar la lógica de negocio de la interfaz y añadir pruebas automatizadas. Si se necesita sincronización fiable entre dispositivos, incorporar un backend con autenticación y control de conflictos; no intentar resolverlo únicamente desde localStorage.
