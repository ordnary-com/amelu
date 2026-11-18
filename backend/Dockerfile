FROM golang:1.26-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

# Alpine instead of distroless: the entrypoint needs a shell and cloudflared
# for the tunnel to Postgres (see entrypoint.sh).
FROM alpine:3.22
ARG CLOUDFLARED_VERSION=2026.7.3
RUN apk add --no-cache ca-certificates \
 && wget -qO /usr/local/bin/cloudflared \
      "https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-amd64" \
 && chmod +x /usr/local/bin/cloudflared \
 && adduser -D -H -u 65532 nonroot
COPY --from=build /out/api /api
COPY entrypoint.sh /entrypoint.sh
USER nonroot
EXPOSE 8081
ENTRYPOINT ["/entrypoint.sh"]
CMD ["/api"]
