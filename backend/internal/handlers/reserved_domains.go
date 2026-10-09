package handlers

import "strings"

// Stalwart delivers mail for any domain it hosts locally instead of following
// MX, so a customer adding one of these would make every Amelu sender bounce
// on mail to Ordnary's own addresses.
var reservedDomains = []string{"ordnary.com", "ordnary.cloud", "amelu.org"}

func isReservedDomain(name string) bool {
	name = strings.TrimSuffix(name, ".")
	for _, d := range reservedDomains {
		if name == d || strings.HasSuffix(name, "."+d) {
			return true
		}
	}
	return false
}
