# Cloudflare Terraform Templates - NOT APPLIED

These are **templates only**. Nothing here has been run with `terraform
apply`, `terraform plan` against a real backend, or any other command that
would touch a real Cloudflare account. Per this migration's safety rules,
no automation in this repository applies Terraform, changes production DNS,
deploys anything, or rotates secrets.

Use these as a starting point for an operator to review, fill in real
values (never commit them - see `../../docs/cloudflare/SECRETS.md`), and
run manually and deliberately, with `terraform plan` reviewed before any
`apply`.

## Files

- `dns.tf.example` - the DNS record set from
  `../../docs/cloudflare/DNS_AND_MAIL.md`, as Terraform resources, with the
  same proxied-vs-DNS-only distinction encoded explicitly per record.
- `waf.tf.example` - a starting WAF/rate-limiting rule set for
  `api.amelu.org` and `app.amelu.org`.
- `variables.tf.example` - placeholder variable declarations
  (`cloudflare_account_id`, `zone_id`, mail IPs/hostnames) with no defaults
  for anything sensitive.

## To actually use these (outside the scope of this migration)

1. Copy each `.tf.example` to `.tf`, review every value.
2. Set up a real Terraform state backend (not included here - e.g.
   Cloudflare's own Terraform Cloud integration, or an R2/S3 backend with
   state locking).
3. Populate `terraform.tfvars` (gitignored, never committed) with real
   values.
4. `terraform plan` and have a second engineer review the plan output
   before ever running `terraform apply` - especially for `dns.tf`, given
   `DNS_AND_MAIL.md`'s warnings about mail record safety.

Reference: https://developers.cloudflare.com/terraform/
