import { useAuth } from "../context/AuthContext";
import { MAINTENANCE_NOTICE } from "../maintenance";
import styles from "./ConnectionOverlay.module.css";

/**
 * Over the loading screen when the first session check runs long or fails.
 * Says whether we're still waiting or can't reach the API at all, and that
 * mail itself is unaffected: that runs on separate servers.
 */
export function ConnectionOverlay() {
  const { connection, retryConnection } = useAuth();
  if (connection === "ok") return null;

  const unreachable = connection === "unreachable";

  return (
    <div className={styles.backdrop}>
      <div className={styles.card} role="alertdialog" aria-labelledby="connection-title" aria-describedby="connection-text">
        <img src="/icon-logo-crop.png" alt="Amelu" className={styles.logo} />

        <h1 id="connection-title" className={styles.title}>
          {unreachable ? "Amelu is currently unreachable" : "Amelu is taking longer than usual"}
        </h1>

        <p id="connection-text" className={styles.text}>
          {unreachable
            ? "We can't reach the Amelu servers right now. This is usually a temporary disruption or planned maintenance. We keep trying in the background and continue as soon as we're back."
            : "We're still connecting. This can take a few seconds when Amelu hasn't been used for a while."}
        </p>

        {MAINTENANCE_NOTICE && (
          <p className={styles.notice} role="status">
            {MAINTENANCE_NOTICE}
          </p>
        )}

        {unreachable && (
          <p className={styles.reassure}>
            Your email keeps working. Mail apps and webmail are not affected.
          </p>
        )}

        {unreachable && (
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={retryConnection}>
              Try again
            </button>
            <a className={styles.secondary} href="https://ordnary.com/status" target="_blank" rel="noopener noreferrer">
              Status page
            </a>
            <a className={styles.secondary} href="https://webmail.amelu.org">
              Open webmail
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
