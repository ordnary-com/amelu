package handlers

import (
	"testing"

	"amelu/backend/internal/stalwart"
)

func TestToCloudflareRecord(t *testing.T) {
	ten := 10
	mx, ok := toCloudflareRecord(stalwart.ZoneRecord{Name: "example.com.", Type: "MX", Priority: &ten, Content: "marduk.mx.amelu.org."})
	if !ok || mx.Name != "example.com" || mx.Content != "marduk.mx.amelu.org" || *mx.Priority != 10 {
		t.Fatalf("mx: %+v", mx)
	}
	srv, ok := toCloudflareRecord(stalwart.ZoneRecord{Name: "_imaps._tcp.example.com.", Type: "SRV", Content: "0 1 993 marduk.mx.amelu.org."})
	if !ok || srv.Data["port"] != 993 || srv.Data["target"] != "marduk.mx.amelu.org" {
		t.Fatalf("srv: %+v", srv)
	}
	if _, ok := toCloudflareRecord(stalwart.ZoneRecord{Type: "SRV", Content: "broken"}); ok {
		t.Fatal("a malformed SRV must be skipped")
	}
	if _, ok := toCloudflareRecord(stalwart.ZoneRecord{Type: "NAPTR", Content: "x"}); ok {
		t.Fatal("unknown types are skipped")
	}
}

func TestZoneRecordRequestNames(t *testing.T) {
	for in, want := range map[string]string{"@": "example.com", "": "example.com", "www": "www.example.com", "www.example.com": "www.example.com", "shop.example.com.": "shop.example.com"} {
		rec, err := zoneRecordRequest{Type: "a", Name: in, Content: "192.0.2.1"}.toRecord("example.com")
		if err != nil || rec.Name != want || rec.Type != "A" {
			t.Errorf("%q: got %q %v", in, rec.Name, err)
		}
	}
	if _, err := (zoneRecordRequest{Type: "NS", Name: "@", Content: "ns.other.net"}).toRecord("example.com"); err == nil {
		t.Error("apex NS must be refused")
	}
	if _, err := (zoneRecordRequest{Type: "PTR", Name: "x", Content: "y"}).toRecord("example.com"); err == nil {
		t.Error("unsupported type must be refused")
	}
	srv, err := zoneRecordRequest{Type: "SRV", Name: "_sip._tcp", Content: "0 5 5060 sip.example.com."}.toRecord("example.com")
	if err != nil || srv.Data["port"] != 5060 || srv.Content != "" {
		t.Errorf("srv: %+v %v", srv, err)
	}
}
