-- provisionOrdnaryCustomer (first-time Ordnary/SSO login) created the
-- organization and customer but, unlike Signup, never inserted the
-- organization_members row added by 0021 - so any customer who signed up
-- that way is stuck without a membership row, which breaks the
-- organization_members join in GetCustomerProfile and causes a login
-- redirect loop. Same backfill as 0021, restricted to customers still
-- missing a membership row, so it's a no-op for everyone else.
INSERT INTO organization_members (organization_id, customer_id, role)
SELECT organization_id, id, 'owner'
FROM customers
WHERE organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM organization_members m WHERE m.customer_id = customers.id
  );
