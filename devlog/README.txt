DEVLOG

One file per working session, newest at the top of the index at the bottom.
Plain text, no markdown, so an entry can be pasted straight into a devlog box
somewhere without turning into a mess of hashes and asterisks. Written for a
person reading it cold, not for a changelog generator.


HOW TO WRITE ONE

Write it the same day. A devlog written a week later turns into "cleaned up
some backend flows", which is the kind of sentence that could describe any
project ever built. Write it while you still remember what actually annoyed
you.

Be specific or don't bother. "Fixed a bug in the DNS page" says nothing.
"Stalwart returned primaryKeyViolation when the domain already existed, so
adopting it instead of failing" says what happened. Name the endpoint, the
table, the error string.

Keep it short. Aim for one screen. Two or three tight paragraphs and a short
list beats one long wall of text that nobody finishes. If a session produced
five unrelated things, five short sections is fine, but resist padding.

Screenshot anything visible. Amelu is a dashboard. If a session changed
something you can see, there should be a picture of it. Drop images in
devlog/images/ and mention the filename in the text.

Say what went wrong. The interesting part is almost never the feature, it is
the thing that broke on the way there and why it broke. Dead ends count.

Read it back before committing. At least one earlier entry has a sentence
that stops mid word. Two minutes of proofreading is cheaper than someone
pointing that out in a review.


FORMAT

Filename: YYYY-MM-DD-short-slug.txt

Start with a title line that says what changed, then the date and rough time
spent, then which parts of the repo you touched. Blank line, then the body.
Section headers in CAPS on their own line if the entry needs them. If
anything is still open, end with a STILL OPEN section so the next session has
a starting point.


ENTRIES

2026-07-30  Self-hosting is allowed now
            2026-07-30-self-hosting-for-personal-use.txt
