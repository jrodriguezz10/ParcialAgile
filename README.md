# Sistema de inscripcion y colegiacion de ingenieros

Aplicacion web con dos paneles:

- Portal del interesado: registro con correo y codigo de verificacion, solicitud con DNI y documentos, notificaciones, carnet virtual, pagos mensuales y descarga PDF.
- Panel administrador: revision de solicitudes, observaciones, aprobacion/rechazo, registro directo de colegiados, generacion de carnet fisico/virtual, padron y pagos manuales.

## Requisitos

- Node.js 20 o superior.
- MySQL 8 o MariaDB compatible.
- Base de datos y usuario configurados segun `backend/.env`.

## Base de datos

Si MySQL rechaza el usuario del `.env`, ejecuta con un usuario administrador:

```sql
source backend/database/init.sql;
```

Ese script crea la base, el usuario y todas las tablas principales. El backend tambien valida y actualiza el esquema automaticamente al iniciar.

Para exportar la base local antes de subirla a un MySQL remoto:

```bash
cd backend
npm run db:export
```

El comando crea un respaldo `.sql` en `backend/backups/`.

## Produccion en Vercel

Vercel no aloja MySQL dentro del proyecto. Para produccion usa un MySQL privado remoto compatible, por ejemplo PlanetScale, TiDB Cloud, Aiven, Railway u otro proveedor, y guarda las credenciales como variables privadas del proyecto `backend`.

Variables minimas del backend:

```text
DATABASE_URL=mysql://usuario:clave@host:3306/parcial_agile
DB_SSL=true
JWT_SECRET=un-secreto-largo
ADMIN_EMAIL=correo-admin
ADMIN_PASSWORD=clave-admin
CORS_ORIGIN=https://frontend-theta-rosy-97.vercel.app,https://frontend-rodriguezfrancis903-2617s-projects.vercel.app
FRONTEND_URL=https://frontend-theta-rosy-97.vercel.app
PUBLIC_BACKEND_URL=https://backend-eight-snowy-24.vercel.app
```

Variables minimas del frontend:

```text
VITE_API_URL=https://backend-eight-snowy-24.vercel.app
REACT_APP_API_URL=https://backend-eight-snowy-24.vercel.app
REACT_APP_MP_BACK_URL_BASE=https://frontend-theta-rosy-97.vercel.app
```

Despues de importar el respaldo `.sql` en el MySQL remoto y desplegar ambos proyectos, el panel administrador puede iniciar sesion y consultar usuarios, solicitudes, colegiados y pagos.

## Backend

```bash
cd backend
npm install
npm start
```

API local: `http://localhost:8084`

Credenciales admin por defecto, si no se cambian en `.env`:

- Correo: `admin@cip.local`
- Clave: `Admin12345`

Al iniciar el backend, esas credenciales se crean o actualizan para asegurar acceso al panel administrador.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

App local: `http://localhost:3001`

## Correo

El registro envia un codigo de verificacion al correo ingresado. El SMTP es obligatorio: si no configuras `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `SMTP_FROM`, el backend rechazara el registro y no mostrara codigos en pantalla.

## API DNI

Configura `RENIEC_BASE_URL` y `RENIEC_TOKEN` en `backend/.env`. El endpoint interno `GET /api/dni/:dni` usa esa API para completar nombres.

El registro manual del administrador exige una respuesta valida de la API DNI antes de crear el colegiado, para que los nombres no se escriban manualmente.

## Pagos

La mensualidad es `S/ 20.00`.

- Si falta cualquier mensualidad desde la inscripción hasta el mes actual, el colegiado queda `INHABILITADO`.
- Al regularizar todas las mensualidades pendientes, queda `HABILITADO`.
- El usuario puede iniciar pago por Mercado Pago.
- El administrador puede registrar pagos manuales.
- El cajero puede registrar varias mensualidades consecutivas en una sola operacion y consultar meses/monto vencido.

## Notificaciones por correo

El modulo Caja envia avisos de deuda al correo registrado del colegiado. Para envio manual desde el panel y envio automatico mensual, configura SMTP en Vercel:

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-correo@gmail.com
SMTP_PASS=tu-clave-de-aplicacion
SMTP_FROM="Colegio de Ingenieros <tu-correo@gmail.com>"
CRON_SECRET=secreto-aleatorio
```

Vercel ejecuta el aviso el dia 5 de cada mes mediante `/api/jobs/overdue-email`.

## Verificacion de carnet

El carnet genera un QR hacia la URL publica del frontend. Para produccion define en `frontend/.env`:

```text
VITE_PUBLIC_FRONTEND_URL=https://tu-dominio.com
```

Para probar desde un celular en la misma red, abre el frontend con la IP LAN de la computadora, no con `localhost`:

```text
http://IP-DE-TU-PC:3001
```

Ejemplo: `http://192.168.1.25:3001`. El backend ya acepta origenes de red local y el frontend calcula la API como `http://IP-DE-TU-PC:8084`.

La pagina publica del QR muestra solo el carnet virtual. Si el colegiado esta inhabilitado, el carnet se muestra con marca de agua.

## Estructura del codigo

```text
backend/
  database/
    init.sql                 SQL completo para crear base, usuario y tablas.
  src/
    app.js                   Configura Express, CORS, JSON, uploads y rutas.
    server.js                Conecta MySQL, ejecuta tareas de estado e inicia la API.
    config/
      database.js            Pool MySQL, migraciones automaticas y seed del admin.
      env.js                 Variables de entorno centralizadas.
    controllers/             Entrada HTTP: valida request simple y responde JSON.
    routes/                  Rutas publicas, auth, usuario, admin y pagos.
    services/                Logica de negocio: DNI, correo, colegiados y pagos.
    middleware/              Auth JWT, uploads, async handler y errores.
    utils/                   Formatos, fechas, archivos, textos y presenters.

frontend/
  src/
    App.jsx                  Enrutador de alto nivel de las paginas.
    pages/                   Pantallas principales: interesado, admin y verificacion.
    components/              Layout, UI compartida y carnet virtual.
    features/
      admin/                 Helpers del panel admin: registro manual y avisos.
      interesado/            Avisos del portal del interesado.
      notifications/         Lectura/no lectura de notificaciones por rol.
    lib/
      api.js                 Cliente fetch y manejo de tokens.
    constants/               Estados y perfiles vacios.
    utils/                   Formatos y descarga PDF.
    styles/                  CSS separado por base, dashboard, inicio y responsive.
```

Puntos rapidos para ubicar cambios:

- Registro manual del administrador: `frontend/src/pages/Admin.jsx`, `frontend/src/features/admin/manualMember.js` y `backend/src/services/admin-members.service.js`.
- Login del administrador: `frontend/src/features/admin/AdminAuth.jsx`.
- Consulta DNI: `backend/src/services/reniec.service.js` y endpoint `GET /api/dni/:dni`.
- Codigo por correo: `backend/src/services/mail.service.js` y `POST /api/auth/register/request`.
- Notificaciones leidas/no leidas: `frontend/src/components/layout.jsx` y `frontend/src/features/notifications/useNotificationReads.js`.
