import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import styles from "./LoginPage.module.css";
import { API_URL } from "../api/client";

// What the API's Ordnary callback redirects back with (see
// backend/internal/handlers/ordnary_auth.go).
const ERRORS: Record<string, string> = {
  ordnary_auth_failed: "Sign-in failed. Please try again.",
  ordnary_email_unverified: "Verify your Ordnary account's email address, then sign in again.",
};

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const errorCode = searchParams.get("error");
  const error = errorCode ? (ERRORS[errorCode] ?? ERRORS.ordnary_auth_failed) : null;

  // The round trip through Ordnary ID takes a few seconds, longer when the
  // API has to start up, and the browser shows nothing while it waits. A
  // progress bar and a spinner in the button show the click did something.
  const [redirecting, setRedirecting] = useState(false);

  // Going back to this page restores it from the back/forward cache still
  // in that state; reset it.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setRedirecting(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return (
    <div className={styles.loginContainer}>
      {redirecting && <div className={styles.progressBar} role="progressbar" aria-label="Signing in" />}
      <div className={styles.loginCard}>
        <div className={styles.logoWrapper}>
          <img src="/icon-logo-crop.png" alt="Amelu" className={styles.logo} />
        </div>

        <h1 className={styles.title}>Mail hosting without the hassle</h1>
        <p className={styles.description}>
          Your own domain, your own mailboxes, fully managed. Set up email in minutes and let
          Amelu handle the rest.
        </p>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <a
          href={`${API_URL}/api/auth/ordnary/login`}
          className={styles.primaryButton}
          aria-disabled={redirecting}
          onClick={(event) => {
            if (redirecting) {
              event.preventDefault();
              return;
            }
            setRedirecting(true);
          }}
        >
          {redirecting ? (
            <span className={styles.spinner} aria-hidden="true" />
          ) : (
            <img src="/ordnary-mark-blue.png" alt="" className={styles.primaryButtonIcon} />
          )}
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
