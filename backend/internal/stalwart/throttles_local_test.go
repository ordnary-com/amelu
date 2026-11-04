package stalwart

import "testing"

// Stalwart applies outbound throttles to the local queue too; a rule that
// matched there held incoming mail for our own mailboxes until the next hour.
func TestThrottleRulesSkipLocalQueue(t *testing.T) {
	for _, rule := range []OutboundThrottle{
		{Description: "match all", Negate: true},
		{Description: "listed", If: "sender_domain == 'a.example'"},
		{Description: "all but listed", If: "sender_domain == 'a.example'", Negate: true},
	} {
		conds := rule.match()["match"].(map[string]any)
		first, ok := conds["0"].(map[string]any)
		if !ok || first["if"] != "queue_name == 'local'" || first["then"] != "false" {
			t.Errorf("%s: first condition is %v, want the local queue excluded", rule.Description, conds["0"])
		}
	}
}
