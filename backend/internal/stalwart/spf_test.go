package stalwart

import "testing"

func TestUseAmeluSPF(t *testing.T) {
	in := "example.com. IN MX 10 marduk.mx.amelu.org.\nexample.com. IN TXT \"v=spf1 mx -all\"\n"
	out := UseAmeluSPF(in)
	recs := ParseZoneFile(out)
	if len(recs) != 2 || recs[1].Content != AmeluSPF {
		t.Fatalf("got %+v", recs)
	}
}
