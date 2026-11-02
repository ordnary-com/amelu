package cfsaas

import "testing"

func TestFold(t *testing.T) {
	var h hostnameResult
	h.Status, h.SSL.Status = "pending", "pending_validation"
	if got := h.fold().Status; got != "pending" {
		t.Errorf("pending: %s", got)
	}
	h.Status, h.SSL.Status = "active", "active"
	if got := h.fold().Status; got != "active" {
		t.Errorf("active: %s", got)
	}
	h.Status, h.SSL.Status = "active", "validation_timed_out"
	if got := h.fold().Status; got != "failed" {
		t.Errorf("timed out: %s", got)
	}
	h.VerificationErrors = []string{"custom hostname does not CNAME to this zone."}
	if got := h.fold().Error; got != h.VerificationErrors[0] {
		t.Errorf("error: %s", got)
	}
}
