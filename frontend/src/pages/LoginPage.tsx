import styles from "./LoginPage.module.css";
import { API_URL } from "../api/client";

export function LoginPage() {
  return (
    <div className={styles.loginContainer}>
      <div className={styles.loginCard}>
        <div className={styles.logoWrapper}>
          <img src="/icon-logo-crop.png" alt="Amelu" className={styles.logo} />
        </div>

        <h1 className={styles.title}>Mail hosting without the hassle</h1>
        <p className={styles.description}>
          Your own domain, your own mailboxes, fully managed. Set up email in minutes and let
          Amelu handle the rest.
        </p>

        <a href={`${API_URL}/api/auth/ordnary/login`} className={styles.primaryButton}>
          <img src="/ordnary-icon.png" alt="" className={styles.primaryButtonIcon} />
          Login with Ordnary account
        </a>

        <div className={styles.footer}>
          By continuing, you acknowledge that you have read and agree to our Terms of Service,
          Privacy Policy, and applicable data processing guidelines. You also agree to receive
          essential account and security notifications related to your use of Amelu.
        </div>
      </div>
    </div>
  );
}
