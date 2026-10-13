# Amelu Webmail

The mail client on webmail.amelu.org for the people who use a mailbox. See
docs/WEBMAIL.md for the architecture and the API it talks to.

    pnpm dev:webmail      # serves on :4300, proxies /api to the Go API on :8081
    pnpm deploy:webmail   # builds and uploads the Worker amelu-webmail
