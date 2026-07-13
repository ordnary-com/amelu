package sieve

import "fmt"

// GenerateInternalAccessScript produces a Sieve script that rejects any
// mail not sent from ownDomain - Migadu's "Internal Access" feature:
// "restricted to receive messages only via our own outgoing servers."
// Uses the plain RFC 5228 address-part tag ":domain", no extension needed.
func GenerateInternalAccessScript(ownDomain string) (string, error) {
	if ownDomain == "" {
		return "", fmt.Errorf("own domain is required")
	}
	return fmt.Sprintf(
		"if not address :domain :is \"from\" %s {\n\tdiscard;\n\tstop;\n}\n",
		quoteSieveString(ownDomain),
	), nil
}

// Forward is one Bcc-Captures-style copy destination for a mailbox's
// Forwarding feature - sends a copy of incoming mail elsewhere while the
// original still lands normally, skipping mail Stalwart's own classifier
// already flagged (Migadu: "if considered spam... it will not be
// forwarded further, a copy is placed in Junk instead").
type Forward struct {
	Destination string
}

func GenerateForwardingScript(forwards []Forward) (string, error) {
	if len(forwards) == 0 {
		return "", nil
	}
	script := `require ["copy"];` + "\n" + `if header :contains "X-Spam-Status" "No" {` + "\n"
	for _, f := range forwards {
		if f.Destination == "" {
			return "", fmt.Errorf("forwarding destination is required")
		}
		script += fmt.Sprintf("\tredirect :copy %s;\n", quoteSieveString(f.Destination))
	}
	script += "}\n"
	return script, nil
}

// GenerateDelegationScript produces a Sieve script that reassigns incoming
// mail to one or more other mailboxes on the same domain - unlike
// Forwarding, this is a plain (non-:copy) redirect per Migadu's own
// framing of delegation as "forward", not "copy": the original mailbox
// does not also keep the message.
func GenerateDelegationScript(delegateAddresses []string) (string, error) {
	if len(delegateAddresses) == 0 {
		return "", nil
	}
	script := ""
	for _, addr := range delegateAddresses {
		if addr == "" {
			continue
		}
		script += fmt.Sprintf("redirect %s;\n", quoteSieveString(addr))
	}
	if script == "" {
		return "", nil
	}
	return script, nil
}
