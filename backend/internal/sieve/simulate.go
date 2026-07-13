package sieve

import (
	"context"
	"net/textproto"

	gosieve "github.com/migadu/go-sieve"
	"github.com/migadu/go-sieve/interp"
)

// SimResult is what a script did with one synthetic message: which
// addresses (if any) it redirected/copied to, which mailboxes (if any) it
// explicitly filed into, and whether it was still kept at its original
// destination via keep/implicit keep. fileinto is its own explicit
// delivery action distinct from keep - go-sieve correctly cancels
// ImplicitKeep for it, so Kept alone doesn't mean "was this message
// delivered anywhere" once fileinto is involved; check FiledInto too.
type SimResult struct {
	RedirectAddresses []string
	FiledInto         []string
	Kept              bool
}

// Simulate runs script against a synthetic message addressed From -> To
// with a fixed placeholder subject, using go-sieve's interpreter, and
// reports the resulting actions. This is what lets a generated Pattern
// Rewrite or Bcc Capture script be proven correct - "does this address end
// up redirected, and does the original still get delivered" - before it's
// ever installed on the mail cluster.
func Simulate(script *interp.Script, from, to string) (*SimResult, error) {
	return SimulateMessage(script, from, to, "sieve rule test message", nil)
}

// SimulateMessage is Simulate with control over the subject and any extra
// headers (e.g. "X-Spam-Status: Yes") a test needs to set up - used for
// spam-related scripts whose behavior depends on header content Simulate's
// fixed placeholder message doesn't provide.
func SimulateMessage(script *interp.Script, from, to, subject string, extraHeaders map[string]string) (*SimResult, error) {
	header := textproto.MIMEHeader{}
	header.Set("From", from)
	header.Set("To", to)
	header.Set("Subject", subject)
	for k, v := range extraHeaders {
		header.Set(k, v)
	}

	envelope := interp.EnvelopeStatic{From: from, To: to}
	message := interp.MessageStatic{
		Size:   0,
		Header: header,
	}

	data := gosieve.NewRuntimeData(script, interp.DummyPolicy{}, envelope, message)
	if err := script.Execute(context.Background(), data); err != nil {
		return nil, err
	}

	return &SimResult{
		RedirectAddresses: data.RedirectAddr,
		FiledInto:         data.Mailboxes,
		Kept:              data.Keep || data.ImplicitKeep,
	}, nil
}

// Delivered reports whether the message ended up anywhere at all - kept,
// implicitly kept, or explicitly filed into a mailbox. False means discard
// (or an unhandled reject) dropped it.
func (r *SimResult) Delivered() bool {
	return r.Kept || len(r.FiledInto) > 0
}
