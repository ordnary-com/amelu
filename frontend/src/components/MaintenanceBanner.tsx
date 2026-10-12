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
    <p className={styles.banner} role="alert">
      {MAINTENANCE_NOTICE}
    </p>
  );
}
