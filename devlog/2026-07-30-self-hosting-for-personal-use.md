# Self-hosting is allowed now, and I'm fixing how I write these

**Date:** 2026-07-30
**Time spent:** ~1h
**Touched:** `LICENSE.md`, `README.md`, `CONTRIBUTING.md`, `devlog/`

Got a batch of reviews back on Amelu this week. The infrastructure feedback
was kind, which is nice, but two things came up that were fair hits and that
I could actually do something about today. So today was not a feature day.

## The license

Someone wrote:

> Really disappointed in the restriction of self-hosting Amelu, even for your
> own purpose. Because really, you're just the frontend for Stalwart setup.

The second sentence stung a bit, and it is also not wrong. Amelu is a
management layer. Stalwart does the hard part, the actual mail. What I built
is the thing that means you never have to open a config file to add a mailbox
or work out which TXT record DKIM wants. I think that layer is worth paying
for. I don't think it's worth *forbidding* someone from running it on their
own box for their own three mailboxes.

The old license blocked that outright. Section 3 said you may not run your
own instance "whether privately, internally, or self-hosted", which meant a
person who wanted Amelu for their own domain had exactly one option: pay me.
That was never really the point. The point was to stop someone spinning up
amelu-but-cheaper.eu and reselling it.

So the license is now 1.1, and it has a Personal Use carve-out. You can run
your own instance, free, for as long as you want, for your own mailboxes and
domains and your household's. You can modify it. You can keep a public fork
as long as the license stays intact.

What still needs a separate license is the commercial half:

- running it inside a company or a team, even a tiny one, even internally
- charging anyone for access, in money or otherwise
- offering it as a service to people outside your household
- building a competing product on top of it

The line I landed on is "am I the only one benefiting from this instance",
not "is money involved". Running free mailboxes for a community is still
someone else's mail on your Amelu, and that's the thing I want to keep on the
commercial side.

One thing I made loud in both the README and the license: self-hosting is
genuinely unsupported. You are running your own Stalwart, your own Postgres,
your own deliverability. Amelu will not save you from a bad SPF record, and I
am not going to debug your MX at 2am. `docs/cloudflare/` is the closest thing
to a deployment guide and it was written for my setup, not yours.

## The devlogs

The other consistent piece of feedback, from several people:

> Not many devlogs and the overall quality of them are extremely poor, long
> paragraphs that aren't as effective.

> ur devlogs are weak for what u built. 3 total, and the 3 hour one is
> completely generic

Also correct. "Cleaned up backend flows, simplified some api surface, loading
states empty states forms" is a sentence I wrote about a real afternoon of
work and it describes nothing. And one of them just stops mid word, "which
broke checkou", which has apparently been sitting there in public for weeks.

Part of the problem was that the devlogs lived somewhere outside the repo, so
writing one was a separate chore I did days later from memory. They live in
`devlog/` now, next to the code, and there's a `devlog/README.md` with the
rules I'm holding myself to: same day, specific enough to name the actual
error string, one screen long, screenshots for anything visible, proofread.

That last one about screenshots is the gap I still have to close. Multiple
people asked for pictures of the dashboard, in the devlogs and in the README,
and there are currently zero. Slightly absurd for a project whose best review
was about the UI.

## Still open

- Screenshots. Dashboard, domain setup flow, mailbox list. Both for
  `devlog/images/` and for the README.
- A security section. One reviewer asked straight out how user data is
  protected and could not find an answer. `docs/cloudflare/SECURITY.md`
  exists but nothing in the README points at it, and it doesn't cover
  password hashing or session handling.
- Backfill the three old devlogs into this folder, and fix the sentence that
  stops mid word instead of leaving it there.
