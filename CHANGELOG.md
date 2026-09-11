# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-09-11

### Added
- **Streamable HTTP Transport**: Added support for remote hosting via MCP Streamable HTTP transport (`--transport=http` or `MCP_TRANSPORT=http`), enabling multi-client connections over LAN/WAN.
- **Dynamic Authorization**: Support for per-request Bearer token authentication (`Authorization: Bearer <token>`) passed from HTTP headers.
- **Custom HTTP Headers**: Support for passing custom headers (e.g. Zero Trust tokens, Cloudflare Access headers) via `BITBUCKET_CUSTOM_HEADERS`.
- **Health Check Endpoint**: Added `GET /health` endpoint for uptime monitoring and container orchestration.
- **Docker Compose**: Added `docker-compose.yml` with built-in health checking and configurable port and transport mode.
- **Automated CI/CD**: Added GitHub Actions workflows for multi-version Node.js builds and automated GitHub Container Registry (GHCR) package releases.
- **Comprehensive Unit Tests**: Added Vitest test suites for HTTP transport and custom header parsing.

### Changed
- Rebranded project under `@yashkolte3/bitbucket-server-mcp`.
- Upgraded MCP TypeScript SDK dependencies.
- Updated documentation with full client configuration guides (Claude Desktop, Claude Code, Antigravity, Cursor, Windsurf).

---

## [1.0.0] - Earlier

### Added
- Initial release with standard `stdio` transport.
- Pull request management (create, update, merge, decline, comments).
- Repository browsing and file content reading.
- Code search across repositories.
- Branch management and commit history.
- Code insights and review approvals.

