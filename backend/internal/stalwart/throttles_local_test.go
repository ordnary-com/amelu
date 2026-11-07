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
		if !ok || first["if"] != "is_local_domain(rcpt_domain)" || first["then"] != "false" {
			t.Errorf("%s: first condition is %v, want the local queue excluded", rule.Description, conds["0"])
		}
		second, ok := conds["1"].(map[string]any)
		if !ok || second["if"] != "source == 'report' || source == 'dsn'" || second["then"] != "false" {
			t.Errorf("%s: second condition is %v, want reports and bounces excluded", rule.Description, conds["1"])
		}
	}
}
