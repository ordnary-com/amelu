-- When the session's owner last confirmed it's them again through Ordnary's
-- sign-in form (account termination asks for that, Amelu has no passwords).
ALTER TABLE sessions ADD COLUMN reauthenticated_at TIMESTAMPTZ;
