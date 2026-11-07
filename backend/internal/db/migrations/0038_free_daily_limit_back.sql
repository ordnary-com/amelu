-- Undoes 0037: free keeps its daily cap of 150 like the paid plans keep theirs.
UPDATE plan_tiers SET max_outgoing_per_day = 150 WHERE id = 'free';
