import type {Metadata} from 'next';
import styles from '../public-info.module.css';

export const metadata:Metadata={
 title:'Privacy Policy | El Molino Ops',
 description:'Privacy policy for the El Molino Ops restaurant operations application.',
};

export default function PrivacyPage(){
 return <main className={styles.shell}><div className={styles.wrap}>
  <section className={styles.hero}>
   <p className={styles.eyebrow}>El Molino Ops · Privacy</p>
   <h1 className={styles.title}>Privacy Policy<br/><span lang="es">Política de Privacidad</span></h1>
   <p className={styles.lead}>How El Molino Ops handles account, workforce, restaurant-operation, device, and reliability data. <span lang="es">Cómo El Molino Ops maneja datos de cuenta, personal, operación del restaurante, dispositivo y confiabilidad.</span></p>
   <div className={styles.meta}><span className={styles.pill}>Effective / Vigente: August 18, 2026</span><span className={styles.pill}>App: El Molino Ops</span></div>
  </section>
  <nav className={styles.nav} aria-label="Public information"><a href="/support">Support / Soporte</a><a href="/delete-account">Delete account / Eliminar cuenta</a><a href="/">Open app / Abrir app</a></nav>

  <section className={styles.card}>
   <h2>English</h2>
   <p>El Molino Ops is a restaurant workforce and operations application. This policy describes the information the service processes when authorized users use the web, iOS, or Android experience.</p>
   <h3>Information processed</h3>
   <ul>
    <li><b>Account and identity:</b> email address, display name, authentication state, multi-factor authentication status, application role, restaurant assignment, and account-access records.</li>
    <li><b>Workforce and scheduling:</b> job positions, availability, time-off requests, schedules, shift activity, attendance information, time-clock records, training progress, and tip/payroll-related operational records when those features are used.</li>
    <li><b>Restaurant operations:</b> tasks, checklists, procedures, announcements, team discussions, manager notes, inventory and food-safety records, operational incidents, and other records users create while operating the restaurant.</li>
    <li><b>User-provided media:</b> files, photos, camera captures, or recordings only when a user chooses a feature that uploads or records them and grants the required device permission.</li>
    <li><b>Device and notification data:</b> platform, app-install/device registration identifiers, push-notification tokens, notification preferences, and delivery status needed to deliver and revoke notifications.</li>
    <li><b>Reliability and usage data:</b> bounded diagnostic events, feature-use events, platform/release identifiers, and privacy-filtered error categories used to secure, debug, and improve the service.</li>
   </ul>
   <h3>How information is used</h3>
   <p>Information is used to authenticate users; enforce employee, manager, and administrator permissions; operate scheduling and restaurant workflows; deliver requested notifications; maintain audit and recovery records; investigate security or reliability problems; provide support; and improve the application.</p>
   <h3>Service providers and integrations</h3>
   <p>El Molino Ops uses service providers only as needed for application functionality. Current architecture includes Supabase for authentication, database, storage, and backend functions; Cloudflare for production hosting and network delivery; Apple and Google platform services for native distribution and push delivery; PostHog for privacy-bounded product/reliability analytics; and Toast when an authorized restaurant integration is configured. AI features may send a user question and bounded restaurant context to the AI provider configured for that feature. Authentication secrets, passwords, and provider credentials are not intended to be included in AI prompts.</p>
   <h3>Security</h3>
   <p>The service uses HTTPS, server-side authorization, row-level database controls, multi-factor authentication for protected application access, secret-controlled backend operations, bounded telemetry, and restricted credential storage. No security measure can guarantee absolute security.</p>
   <h3>Retention and deletion</h3>
   <p>Data is retained for as long as it is reasonably needed to operate the service, maintain security and audit integrity, or meet legitimate restaurant, employment, payroll, tax, legal, or regulatory obligations. A user may request deletion from the Account screen or through the public <a href="/delete-account">account-deletion page</a>. A deletion request covers the account and associated personal data, subject to records that must legitimately be retained. Where continued identity is not required, retained business records may be deleted or de-identified as appropriate.</p>
   <h3>Privacy choices</h3>
   <p>Users can manage notification preferences in the app, deny optional device permissions, request account deletion, and contact support regarding access, correction, or privacy questions. Some functionality may not work when a permission required for that feature is denied.</p>
   <h3>Children</h3>
   <p>El Molino Ops is a workforce application and is not directed to children under 13. Employment records for legally employed minors, if applicable, are handled as workforce records under the same security controls.</p>
   <h3>Contact</h3>
   <p>Privacy questions and requests: <a href="mailto:theitaliancouplellc@gmail.com">theitaliancouplellc@gmail.com</a>. Support information is also available at <a href="/support">/support</a>.</p>
  </section>

  <section className={styles.card} lang="es-MX">
   <h2><span className={styles.lang}>Español (México)</span></h2>
   <p>El Molino Ops es una aplicación para la operación del restaurante y la administración del personal. Esta política explica qué información procesa el servicio cuando usuarios autorizados utilizan la experiencia web, iOS o Android.</p>
   <h3>Información que se procesa</h3>
   <ul>
    <li><b>Cuenta e identidad:</b> correo electrónico, nombre visible, estado de autenticación, estado de autenticación de dos factores, nivel de acceso dentro de la aplicación, restaurante asignado y registros relacionados con el acceso a la cuenta.</li>
    <li><b>Personal y horarios:</b> puestos, disponibilidad, solicitudes de tiempo libre, horarios, actividad de turnos, asistencia, registros de reloj checador, avance de capacitación y registros operativos relacionados con propinas o nómina cuando se utilizan esas funciones.</li>
    <li><b>Operación del restaurante:</b> tareas, listas de verificación, procedimientos, avisos, conversaciones del equipo, notas de gerencia, inventario, inocuidad alimentaria, incidentes y demás registros creados durante la operación.</li>
    <li><b>Archivos aportados por el usuario:</b> archivos, fotos, capturas de cámara o grabaciones únicamente cuando el usuario elige una función que las carga o graba y concede el permiso correspondiente del dispositivo.</li>
    <li><b>Dispositivo y notificaciones:</b> plataforma, identificadores de instalación o registro del dispositivo, tokens para notificaciones push, preferencias y estado de entrega necesarios para enviar o cancelar notificaciones.</li>
    <li><b>Confiabilidad y uso:</b> eventos de diagnóstico limitados, eventos de uso de funciones, identificadores de plataforma o versión y categorías de error filtradas para proteger la privacidad, utilizadas para seguridad, diagnóstico y mejora del servicio.</li>
   </ul>
   <h3>Para qué se usa la información</h3>
   <p>La información se usa para autenticar usuarios; aplicar permisos de empleados, gerentes y administradores; operar horarios y procesos del restaurante; entregar notificaciones solicitadas; mantener registros de auditoría y recuperación; investigar problemas de seguridad o funcionamiento; brindar soporte y mejorar la aplicación.</p>
   <h3>Proveedores e integraciones</h3>
   <p>El Molino Ops utiliza proveedores únicamente cuando son necesarios para el funcionamiento de la aplicación. La arquitectura actual incluye Supabase para autenticación, base de datos, almacenamiento y funciones de backend; Cloudflare para alojamiento de producción y entrega por red; servicios de plataforma de Apple y Google para distribución móvil y notificaciones push; PostHog para analítica de producto y confiabilidad con límites de privacidad; y Toast cuando el restaurante configura esa integración. Las funciones de IA pueden enviar la pregunta del usuario y un contexto limitado del restaurante al proveedor de IA configurado para esa función. Las contraseñas, secretos de autenticación y credenciales de proveedores no están destinados a incluirse en los prompts de IA.</p>
   <h3>Seguridad</h3>
   <p>El servicio utiliza HTTPS, autorización del lado del servidor, controles de acceso a nivel de filas en la base de datos, autenticación de dos factores para el acceso protegido, operaciones de backend protegidas por secretos, telemetría limitada y almacenamiento restringido de credenciales. Ninguna medida de seguridad puede garantizar protección absoluta.</p>
   <h3>Conservación y eliminación</h3>
   <p>Los datos se conservan durante el tiempo razonablemente necesario para operar el servicio, mantener la seguridad y la integridad de auditoría o cumplir obligaciones legítimas del restaurante, laborales, de nómina, fiscales, legales o regulatorias. El usuario puede solicitar la eliminación desde la pantalla Cuenta o mediante la página pública de <a href="/delete-account">eliminación de cuenta</a>. La solicitud abarca la cuenta y los datos personales asociados, salvo registros que deban conservarse legítimamente. Cuando ya no sea necesario mantener la identidad, los registros comerciales conservados podrán eliminarse o desidentificarse según corresponda.</p>
   <h3>Opciones de privacidad</h3>
   <p>Los usuarios pueden administrar preferencias de notificaciones dentro de la aplicación, negar permisos opcionales del dispositivo, solicitar la eliminación de su cuenta y comunicarse con soporte para preguntas sobre acceso, corrección o privacidad. Algunas funciones pueden dejar de funcionar si se niega un permiso necesario para esa función.</p>
   <h3>Menores de edad</h3>
   <p>El Molino Ops es una aplicación de trabajo y no está dirigida a menores de 13 años. Si existen empleados menores de edad contratados legalmente, sus registros se manejan como información laboral bajo los mismos controles de seguridad.</p>
   <h3>Contacto</h3>
   <p>Preguntas y solicitudes de privacidad: <a href="mailto:theitaliancouplellc@gmail.com">theitaliancouplellc@gmail.com</a>. También hay información de soporte en <a href="/support">/support</a>.</p>
  </section>
  <p className={styles.footer}>El Molino Ops · <a href="/privacy">Privacy / Privacidad</a> · <a href="/delete-account">Account deletion / Eliminación de cuenta</a></p>
 </div></main>
}
