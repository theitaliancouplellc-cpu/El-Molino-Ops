import type {Metadata} from 'next';
import styles from '../public-info.module.css';

export const metadata:Metadata={
 title:'Support | El Molino Ops',
 description:'Support and account help for El Molino Ops.',
};

export default function SupportPage(){
 return <main className={styles.shell}><div className={styles.wrap}>
  <section className={styles.hero}>
   <p className={styles.eyebrow}>El Molino Ops · Support</p>
   <h1 className={styles.title}>Support<br/><span lang="es">Soporte</span></h1>
   <p className={styles.lead}>Help with account access, the employee app, notifications, and privacy requests. <span lang="es">Ayuda con acceso a la cuenta, la aplicación de empleados, notificaciones y solicitudes de privacidad.</span></p>
  </section>
  <nav className={styles.nav} aria-label="Public information"><a href="/privacy">Privacy / Privacidad</a><a href="/delete-account">Delete account / Eliminar cuenta</a><a href="/">Open app / Abrir app</a></nav>

  <section className={styles.card}>
   <h2>Contact / Contacto</h2>
   <p>For El Molino Ops support, email <a href="mailto:theitaliancouplellc@gmail.com?subject=El%20Molino%20Ops%20Support">theitaliancouplellc@gmail.com</a>.</p>
   <p lang="es-MX">Para soporte de El Molino Ops, escribe a <a href="mailto:theitaliancouplellc@gmail.com?subject=Soporte%20El%20Molino%20Ops">theitaliancouplellc@gmail.com</a>.</p>
   <div className={styles.nav}><a className={`${styles.button} ${styles.primary}`} href="mailto:theitaliancouplellc@gmail.com?subject=El%20Molino%20Ops%20Support">Email support / Escribir a soporte</a></div>
  </section>

  <section className={styles.card}>
   <h2>Quick help / Ayuda rápida</h2>
   <div className={styles.grid}>
    <div className={styles.mini}><b>Can’t sign in / No puedes iniciar sesión</b><p>Confirm the account email, complete the required password and MFA steps, and retry on a stable connection. If access is still blocked, contact support rather than creating a duplicate account.</p><p lang="es-MX">Confirma el correo de la cuenta, completa los pasos requeridos de contraseña y autenticación de dos factores e inténtalo de nuevo con una conexión estable. Si el acceso sigue bloqueado, comunícate con soporte en lugar de crear otra cuenta.</p></div>
    <div className={styles.mini}><b>Wrong role or restaurant / Puesto o restaurante incorrecto</b><p>Role and restaurant access are manager-authorized. Ask management to correct the verified employee assignment.</p><p lang="es-MX">El puesto y el acceso al restaurante los autoriza gerencia. Pide a gerencia que corrija la asignación verificada del empleado.</p></div>
    <div className={styles.mini}><b>Notifications / Notificaciones</b><p>Check notification preferences in the account area and confirm device notification permission is enabled. Device registrations can be revoked and re-enabled per device.</p><p lang="es-MX">Revisa las preferencias de notificaciones en la cuenta y confirma que el permiso del dispositivo esté habilitado. El registro puede cancelarse y volver a activarse por dispositivo.</p></div>
    <div className={styles.mini}><b>Privacy or deletion / Privacidad o eliminación</b><p>Read the <a href="/privacy">privacy policy</a> or submit an account-deletion request from the <a href="/delete-account">public deletion page</a>.</p><p lang="es-MX">Consulta la <a href="/privacy">política de privacidad</a> o envía una solicitud desde la <a href="/delete-account">página pública de eliminación</a>.</p></div>
   </div>
  </section>

  <section className={styles.card}>
   <h2>When contacting support / Al contactar soporte</h2>
   <p>Include the account email, whether you are using web, iPhone, or Android, and a short description of what happened. Do <b>not</b> send your password, MFA code, private API keys, push tokens, or other credentials.</p>
   <p lang="es-MX">Incluye el correo de la cuenta, si usas web, iPhone o Android y una descripción breve de lo sucedido. <b>No</b> envíes tu contraseña, código de autenticación de dos factores, claves privadas de API, tokens de notificaciones ni otras credenciales.</p>
  </section>
  <p className={styles.footer}>El Molino Ops · <a href="/privacy">Privacy / Privacidad</a> · <a href="/delete-account">Account deletion / Eliminación de cuenta</a></p>
 </div></main>
}
