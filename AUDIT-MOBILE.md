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

El repositorio contiene el cliente, pero no el código fuente del backend de Apps Script. Por tanto, no es posible auditar su autenticación, autorización, validación, almacenamiento, protección frente a escrituras concurrentes ni tratamiento de errores. La URL de Apps Script no es autenticación. La URL que estuvo incluida en el código anterior ya pudo quedar expuesta en el historial público de Git; si ese despliegue sigue activo, conviene crear una nueva implementación segura y desactivar la anterior.

La sincronización actual transmite un snapshot completo de registros, servicios y perfil. No implementa resolución de conflictos ni fusión segura de cambios simultáneos entre dispositivos. Antes de usarla como fuente principal de datos hay que revisar el Apps Script desplegado.

### 2. Persistencia y recuperación

Los datos se guardan en localStorage. Es sencillo y gratuito, pero no ofrece sincronización entre navegadores, aislamiento por usuario ni garantías de almacenamiento duradero. La copia JSON es importante. Para un uso intensivo offline, IndexedDB sería una evolución más robusta.

### 3. Calidad y pruebas

No hay suite automatizada, pipeline CI, linting ni pruebas de regresión en el repositorio. Los cambios de esta rama requieren validación manual en Safari iOS, Chrome Android y escritorio, incluyendo instalación, actualización, modo avión, cronómetro, edición, exportación y restauración.

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
- [ ] Activar Sheets, desconectar y verificar que no se envían más cambios.
- [ ] Activar modo avión, navegar por la app y volver a conectar.
- [ ] Verificar que una actualización del service worker entrega la versión nueva.
- [ ] Probar pantallas de 320, 360, 390 y 430 px de ancho.

## Recomendación de arquitectura

Mantener HORAE como PWA sin framework mientras siga siendo una herramienta personal y de bajo coste. La siguiente mejora estructural debería ser separar la lógica de negocio de la interfaz y añadir pruebas automatizadas. Si se necesita sincronización fiable entre dispositivos, incorporar un backend con autenticación y control de conflictos; no intentar resolverlo únicamente desde localStorage.
