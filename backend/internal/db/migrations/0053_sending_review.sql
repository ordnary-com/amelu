-- Sending review requests: a support ticket of its own kind (category
-- sending_review), opened from a domain's Domain status page while its
-- sending is paused. support_tickets.domain_id already ties it to the domain;
-- the API keeps it to one open review per domain and adds a system message
-- when the pause is lifted (handlers/sending_review.go).
ALTER TABLE support_tickets DROP CONSTRAINT support_tickets_category_check;
ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_category_check
    CHECK (category IN ('account', 'domains', 'delivery', 'billing', 'other', 'dedicated_ip', 'sending_review'));

CREATE INDEX support_tickets_open_sending_review_idx ON support_tickets (domain_id)
    WHERE category = 'sending_review' AND status <> 'closed';
