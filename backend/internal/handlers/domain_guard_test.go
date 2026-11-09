package handlers

import "testing"

func TestDomainPathMatchesOnlyDomainIDs(t *testing.T) {
	const id = "26aadfd3-f9ec-42e7-b7d8-217a2adf6a26"
	cases := map[string]string{
		"/api/domains/" + id:                       "",
		"/api/domains/" + id + "/mailboxes":        "/mailboxes",
		"/api/domains/" + id + "/verify-ownership": "/verify-ownership",
	}
	for path, rest := range cases {
		m := domainPath.FindStringSubmatch(path)
		if m == nil || m[1] != id || m[2] != rest {
			t.Errorf("%s: got %v", path, m)
		}
	}
	for _, path := range []string{"/api/domains", "/api/domains/order", "/api/mailboxes/" + id} {
		if domainPath.MatchString(path) {
			t.Errorf("%s should not match", path)
		}
	}
	if unverifiedDomainPaths["/mailboxes"] || unverifiedDomainPaths["/dns"] || !unverifiedDomainPaths["/verify-ownership"] {
		t.Error("unexpected allow list")
	}
}
