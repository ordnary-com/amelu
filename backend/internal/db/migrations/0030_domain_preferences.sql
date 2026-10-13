-- How each customer arranges the domains on their dashboard: favorites first,
-- then their own drag-and-drop order. Personal, so per customer rather than
-- per organization: a teammate's ordering doesn't move yours.
CREATE TABLE customer_domain_preferences (
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    domain_id   UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    favorite    BOOLEAN NOT NULL DEFAULT false,
    -- NULL until the customer reorders; unordered domains go after ordered ones.
    position    INTEGER,
    PRIMARY KEY (customer_id, domain_id)
);
