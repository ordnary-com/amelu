-- One-off maintenance the API runs by itself at startup (see
-- handlers.App.RunStartupMaintenance). A row means that task has been
-- claimed; it is removed again when the task fails, so the next start
-- retries it.
CREATE TABLE maintenance_runs (
    name TEXT PRIMARY KEY,
    ran_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
