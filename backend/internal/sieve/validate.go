package sieve

import (
	"strings"

	gosieve "github.com/migadu/go-sieve"
	"github.com/migadu/go-sieve/interp"
)

// enabledExtensions lists every Sieve extension our generated scripts are
// allowed to use. Kept deliberately narrow (rather than "enable
// everything" like the go-sieve example CLI does) so a future template
// change can't silently start depending on an extension we haven't
// reviewed.
var enabledExtensions = []string{
	"copy",
	"comparator-i;ascii-casemap",
	"imap4flags",
	"fileinto",
	"editheader",
	"variables",
}

func options() gosieve.Options {
	opts := gosieve.DefaultOptions()
	opts.EnabledExtensions = enabledExtensions
	return opts
}

// Validate parses script and reports any syntax or semantic error - the
// same check Stalwart would eventually reject the script for, but caught
// before it's ever sent there.
func Validate(script string) (*interp.Script, error) {
	return gosieve.Load(strings.NewReader(script), options())
}
