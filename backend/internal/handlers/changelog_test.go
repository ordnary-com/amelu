package handlers

import (
	"reflect"
	"testing"
)

func TestParseChangelog(t *testing.T) {
	feed := `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>Amelu: Sidebar stays in place</title><link>https://ordnary.com/changelog#change-60</link><guid isPermaLink="false">ordnary-changelog-60</guid><pubDate>Sun, 11 Oct 2026 12:00:00 GMT</pubDate><category>Amelu</category><description>- On a long page only the content scrolls - The menus have the same width, so the page no longer shifts side-ways</description></item>
<item><title>Netway: Something</title><guid>x</guid><pubDate>Sun, 11 Oct 2026 12:00:00 GMT</pubDate><category>Netway</category><description>Not ours</description></item>
<item><title>Amelu: DPA</title><link>l</link><guid>ordnary-changelog-58</guid><pubDate>Fri, 09 Oct 2026 12:00:00 GMT</pubDate><category>Amelu</category><description>One paragraph &quot;quoted&quot;.</description></item>
</channel></rss>`
	got, err := parseChangelog([]byte(feed))
	if err != nil {
		t.Fatal(err)
	}
	want := []changelogEntry{
		{ID: "ordnary-changelog-60", Title: "Sidebar stays in place", Date: "2026-10-11", Link: "https://ordnary.com/changelog#change-60",
			Notes: []string{"On a long page only the content scrolls", "The menus have the same width, so the page no longer shifts side-ways"}},
		{ID: "ordnary-changelog-58", Title: "DPA", Date: "2026-10-09", Link: "l", Notes: []string{`One paragraph "quoted".`}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %+v\nwant %+v", got, want)
	}
}
