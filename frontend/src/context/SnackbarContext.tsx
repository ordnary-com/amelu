import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type SnackbarVariant = "info" | "error";

interface SnackbarState {
  id: number;
  message: string;
  variant: SnackbarVariant;
}

interface SnackbarApi {
  showSnackbar: (message: string, variant?: SnackbarVariant) => void;
}

const SnackbarContext = createContext<SnackbarApi | null>(null);

const AUTO_DISMISS_MS = 4000;

// M3 doesn't ship a snackbar in @material/web yet, so this is a small
// hand-rolled equivalent: a single message fades in at the bottom of the
// screen and auto-dismisses, styled with the same --md-sys-color tokens
// used everywhere else.
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [snackbar, setSnackbar] = useState<SnackbarState | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);

  const showSnackbar = useCallback((message: string, variant: SnackbarVariant = "info") => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const id = ++nextId.current;
    setSnackbar({ id, message, variant });
    timeoutRef.current = setTimeout(() => {
      setSnackbar((current) => (current?.id === id ? null : current));
    }, AUTO_DISMISS_MS);
  }, []);

  const dismiss = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setSnackbar(null);
  };

  return (
    <SnackbarContext.Provider value={{ showSnackbar }}>
      {children}
      {snackbar && (
        <div className={`snackbar snackbar-${snackbar.variant}`} role="status" aria-live="polite">
          <span>{snackbar.message}</span>
          <button type="button" className="snackbar-dismiss" onClick={dismiss} aria-label="Dismiss">
            &times;
          </button>
        </div>
      )}
    </SnackbarContext.Provider>
  );
}

export function useSnackbar(): SnackbarApi {
  const ctx = useContext(SnackbarContext);
  if (!ctx) throw new Error("useSnackbar must be used within SnackbarProvider");
  return ctx;
}
