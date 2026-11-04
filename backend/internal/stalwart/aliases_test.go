package stalwart

import (
	"context"
	"errors"
	"testing"
)

func aliasFake(t *testing.T, notUpdated any) (*webmailFake, *Client) {
	f, c := newWebmailFake(t)
	f.respond["x:Account/query"] = map[string]any{"ids": []string{"acc"}}
	f.respond["x:Domain/query"] = map[string]any{"ids": []string{"dom"}}
	f.respond["x:Account/get"] = map[string]any{"list": []any{map[string]any{"aliases": map[string]any{
		"0": map[string]any{"name": "sales", "domainId": "dom", "enabled": true},
	}}}}
	f.respond["x:Account/set"] = map[string]any{"notUpdated": notUpdated}
	return f, c
}

func TestAddAccountAliasRefusesTheSameAliasTwice(t *testing.T) {
	f, c := aliasFake(t, map[string]any{})
	err := c.AddAccountAlias(context.Background(), "john", "example.com", "sales")
	if !errors.Is(err, ErrAddressInUse) {
		t.Fatalf("err = %v, want ErrAddressInUse", err)
	}
	for _, call := range f.calls {
		if call["method"] == "x:Account/set" {
			t.Fatal("stored the alias a second time")
		}
	}
}

func TestAddAccountAliasMapsPrimaryKeyViolation(t *testing.T) {
	_, c := aliasFake(t, map[string]any{"acc": map[string]any{"type": "primaryKeyViolation", "properties": []string{"email"}}})
	err := c.AddAccountAlias(context.Background(), "john", "example.com", "support")
	if !errors.Is(err, ErrAddressInUse) {
		t.Fatalf("err = %v, want ErrAddressInUse", err)
	}
}

func TestAddAccountAliasAddsANewOne(t *testing.T) {
	f, c := aliasFake(t, map[string]any{})
	if err := c.AddAccountAlias(context.Background(), "john", "example.com", "support"); err != nil {
		t.Fatal(err)
	}
	last := f.calls[len(f.calls)-1]
	update := last["args"].(map[string]any)["update"].(map[string]any)["acc"].(map[string]any)
	if _, ok := update["aliases/1"]; !ok {
		t.Fatalf("update = %v, want aliases/1", update)
	}
}
