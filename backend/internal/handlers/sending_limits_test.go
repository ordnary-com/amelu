package handlers

import (
	"strings"
	"testing"
)

func TestSendingLimitRules(t *testing.T) {
	plans := map[string][]string{"go": {"acme.nl"}, "pro": {"big.com"}, "free": {"tiny.io"}}
	aliases := map[string][]string{"acme.nl": {"acme.com"}, "tiny.io": {"tiny.eu"}}
	limits := map[string]int{"free": 150, "go": 1000, "pro": 3000}
	rules := sendingLimitRules(plans, aliases, limits)
	if len(rules) != 3 {
		t.Fatalf("got %d rules", len(rules))
	}
	goRule, proRule, freeRule := rules[0], rules[1], rules[2]
	if goRule.Count != 1000 || goRule.If != "sender_domain == 'acme.com' || sender_domain == 'acme.nl'" || goRule.Negate {
		t.Errorf("go rule: %+v", goRule)
	}
	if proRule.Count != 3000 || proRule.If != "sender_domain == 'big.com'" {
		t.Errorf("pro rule: %+v", proRule)
	}
	if freeRule.Count != 150 || !freeRule.Negate {
		t.Errorf("free rule: %+v", freeRule)
	}
	for _, want := range []string{"'amelu.org'", "'acme.nl'", "'acme.com'", "'big.com'"} {
		if !strings.Contains(freeRule.If, want) {
			t.Errorf("free rule should exclude %s: %s", want, freeRule.If)
		}
	}
	if strings.Contains(freeRule.If, "tiny") {
		t.Errorf("free domains must not be excluded from the free rule: %s", freeRule.If)
	}
	if !strings.HasPrefix(freeRule.Description, sendingLimitPrefix+"free,") {
		t.Errorf("description: %s", freeRule.Description)
	}
	if goRule.PeriodMs != 86400000 {
		t.Errorf("period: %d", goRule.PeriodMs)
	}
}

func TestSendingLimitRulesSkipOddNames(t *testing.T) {
	rules := sendingLimitRules(map[string][]string{"go": {"ok.nl", "bad'name.nl"}}, nil, map[string]int{"free": 150, "go": 1000})
	if strings.Contains(rules[0].If, "bad") {
		t.Errorf("a name with a quote must never reach the expression: %s", rules[0].If)
	}
}
