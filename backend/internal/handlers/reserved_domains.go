package handlers

import "strings"

// Stalwart delivers mail for any domain it hosts locally instead of following
// MX, so a customer adding one of these would make every Amelu sender bounce
// on mail to Ordnary's own addresses.
var reservedDomains = []string{"ordnary.com", "ordnary.cloud", "amelu.org"}

// The same goes for the big free mail providers, and worse: on 5 November a
// customer added hotmail.com, and from then on every Amelu sender got "550
// 5.1.2 Mailbox does not exist" for every @hotmail.com recipient. Nobody owns
// these, so they can never be verified anyway. Exact names only: a subdomain
// like mail.gmail.com isn't something a customer can host either way.
var publicMailDomains = map[string]bool{
	"gmail.com": true, "googlemail.com": true,
	"hotmail.com": true, "hotmail.be": true, "hotmail.nl": true, "hotmail.fr": true, "hotmail.de": true,
	"hotmail.es": true, "hotmail.it": true, "hotmail.co.uk": true,
	"outlook.com": true, "outlook.be": true, "outlook.nl": true, "outlook.fr": true, "outlook.de": true,
	"outlook.es": true, "outlook.it": true,
	"live.com": true, "live.be": true, "live.nl": true, "live.fr": true, "live.de": true, "live.co.uk": true,
	"msn.com": true, "passport.com": true,
	"yahoo.com": true, "yahoo.co.uk": true, "yahoo.fr": true, "yahoo.de": true, "yahoo.es": true,
	"ymail.com": true, "rocketmail.com": true, "aol.com": true,
	"icloud.com": true, "me.com": true, "mac.com": true,
	"proton.me": true, "protonmail.com": true, "pm.me": true,
	"gmx.com": true, "gmx.net": true, "gmx.de": true, "web.de": true, "mail.com": true,
	"zoho.com": true, "yandex.com": true, "yandex.ru": true, "mail.ru": true,
	"ziggo.nl": true, "kpnmail.nl": true, "planet.nl": true, "telenet.be": true, "skynet.be": true,
	"orange.fr": true, "free.fr": true, "laposte.net": true,
}

func isReservedDomain(name string) bool {
	name = strings.ToLower(strings.TrimSuffix(name, "."))
	if publicMailDomains[name] {
		return true
	}
	for _, d := range reservedDomains {
		if name == d || strings.HasSuffix(name, "."+d) {
			return true
		}
	}
	return false
}

// reservedDomainMessage is the error for a domain isReservedDomain refuses.
func reservedDomainMessage(name string) string {
	if publicMailDomains[strings.ToLower(strings.TrimSuffix(name, "."))] {
		return "this is a public email provider's domain, add a domain you own instead"
	}
	return "this domain is reserved and can't be added"
}
