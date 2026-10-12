import { MAINTENANCE_NOTICE } from "../maintenance";
import styles from "./MaintenanceBanner.module.css";

/**
 * Top of every dashboard page while MAINTENANCE_NOTICE is set. Styled from a
 * CSS module rather than app.css: that file isn't content-hashed and sits in
 * browser caches for hours after a deploy, so a new rule there shows up
 * unstyled for anyone who already had the dashboard open.
 */
export function MaintenanceBanner() {
  if (!MAINTENANCE_NOTICE) return null;

  return (
    <div className={styles.banner} role="alert">
      <svg className={styles.icon} width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <div className={styles.body}>
        <p className={styles.title}>Maintenance in progress</p>
        <p className={styles.text}>{MAINTENANCE_NOTICE}</p>
      </div>
    </div>
  );
}
