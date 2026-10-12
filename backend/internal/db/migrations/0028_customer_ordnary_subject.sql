-- Ordnary's stable user id (the OIDC "sub"). Customers used to be matched to
-- an Ordnary login by email alone, so changing the email in Ordnary orphaned
-- the Amelu account. NULL until the customer's next Ordnary login links it.
ALTER TABLE customers ADD COLUMN ordnary_subject TEXT UNIQUE;
