package handlers

import (
	"database/sql"
	"testing"
	"time"

	"amelu/backend/internal/db"
)

func TestValidateWebmailBranding(t *testing.T) {
	ok := updateWebmailBrandingRequest{Enabled: true, Subdomain: " Acme ", ProductName: "Acme Mail", AccentColor: "#AA00CC", SupportURL: "https://acme.example/help"}
	if msg := validateWebmailBranding(&ok); msg != "" {
		t.Fatalf("valid request refused: %s", msg)
	}
	if ok.Subdomain != "acme" || ok.AccentColor != "#aa00cc" {
		t.Fatalf("not normalised: %+v", ok)
	}
	bad := []updateWebmailBrandingRequest{
		{Subdomain: "ab"},
		{Subdomain: "-acme"},
		{Subdomain: "ac--me"},
		{Subdomain: "webmail"},
		{Enabled: true},
		{Subdomain: "acme", AccentColor: "blue"},
		{Subdomain: "acme", SupportURL: "http://acme.example"},
		{Subdomain: "acme", ProductName: "line\nbreak"},
	}
	for _, req := range bad {
		if msg := validateWebmailBranding(&req); msg == "" {
			t.Errorf("accepted %+v", req)
		}
	}
}

func TestSniffWebmailLogo(t *testing.T) {
	cases := map[string]string{
		"\x89PNG\r\n\x1a\nrest":                       "image/png",
		"\xff\xd8\xffrest":                            "image/jpeg",
		"RIFF\x00\x00\x00\x00WEBPVP8 ":                "image/webp",
		"<svg xmlns=\"http://www.w3.org/2000/svg\"/>": "",
	}
	for in, want := range cases {
		if got := sniffWebmailLogo([]byte(in)); got != want {
			t.Errorf("sniff(%q) = %q, want %q", in[:4], got, want)
		}
	}
}

func TestNormalizeHostname(t *testing.T) {
	if got := normalizeHostname(" Webmail.Example.COM. "); got != "webmail.example.com" {
		t.Errorf("got %q", got)
	}
	for _, in := range []string{"localhost", "web mail.example.com", "-a.example.com", "", "a..example.com"} {
		if got := normalizeHostname(in); got != "" {
			t.Errorf("normalizeHostname(%q) = %q, want empty", in, got)
		}
	}
}

func TestWebmailURLFor(t *testing.T) {
	a := &App{WebmailURL: "https://webmail.amelu.org", WebmailSubdomainSuffix: "webmail.amelu.org"}
	b := &db.WebmailBranding{Enabled: true, Subdomain: "acme", LogoUpdatedAt: sql.NullTime{Time: time.Now()}}
	if got := a.webmailURLFor(b, true); got != "https://acme.webmail.amelu.org" {
		t.Errorf("subdomain: %s", got)
	}
	b.CustomHostname, b.CustomHostnameStatus = "webmail.acme.example", "pending"
	if got := a.webmailURLFor(b, true); got != "https://acme.webmail.amelu.org" {
		t.Errorf("pending hostname must not be used yet: %s", got)
	}
	b.CustomHostnameStatus = "active"
	if got := a.webmailURLFor(b, true); got != "https://webmail.acme.example" {
		t.Errorf("active hostname: %s", got)
	}
	if got := a.webmailURLFor(b, false); got != a.WebmailURL {
		t.Errorf("plan without branding: %s", got)
	}
	b.Enabled = false
	if got := a.webmailURLFor(b, true); got != a.WebmailURL {
		t.Errorf("disabled: %s", got)
	}
}
