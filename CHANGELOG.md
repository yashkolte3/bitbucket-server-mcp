# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-10-08

### Added
- **SEP-1303 Input Validation & Tool Execution Error Handling**: Aligned error reporting with the official [SEP-1303 specification](https://modelcontextprotocol.io/seps/1303-input-validation-errors-as-tool-execution-errors). Input validation failures and Bitbucket API errors (400, 401, 403, 404, 500) now return as tool results with `isError: true` instead of protocol-level `McpError` exceptions. This prevents client harnesses from halting execution and allows LLM agents to inspect error messages, self-correct arguments, and retry successfully.
- **Dynamic & Mandatory Project Key Tool Schemas**: Centralized tool schema definitions in `src/schemas.ts`. In central/multi-project deployments (when `BITBUCKET_DEFAULT_PROJECT` is unset), the `project` key is now marked strictly `required` across all 23 repository and pull request tools so AI agents always supply the target project key.
- **Deprecation Warning for `BITBUCKET_DEFAULT_PROJECT`**: Added a clear deprecation log notice when `BITBUCKET_DEFAULT_PROJECT` is set. Schemas dynamically maintain 100% backward compatibility when configured by keeping `project` optional and documenting the default fallback.
- **Dedicated Test Suites (`schemas.test.ts` & `errors.test.ts`)**: Added 17 new tests verifying dynamic schema generation and SEP-1303 error formatting across network, validation, and domain error scenarios.

### Changed
- Refactored `setupToolHandlers()` in `src/index.ts` to consume external schema factory (`src/schemas.ts`), removing >430 lines of boilerplate schema definitions and adhering to the Single Responsibility Principle.
- Decoupled error classification and formatting into `src/errors.ts` (`ToolValidationError`, `ToolExecutionError`, `formatToolError`).

## [1.2.0] - 2026-10-07

### Added
- **Stateless Request Isolation (`IRequestContextScope`)**: Implemented per-request async context scoping using Node.js `AsyncLocalStorage` (`node:async_hooks`), guaranteeing zero token cross-talk across concurrent HTTP requests.
- **Hierarchical Authentication Strategy (`HierarchicalAuthResolver`)**: Implemented strict credential resolution strategy prioritizing per-call client tokens over session and server defaults.
- **Connection-Pooled HTTP/HTTPS Transport (`BitbucketHttpClient`)**: Configured dedicated `https.Agent` keep-alive connection pooling (`maxSockets: 100`, `keepAlive: true`) to prevent socket starvation under heavy enterprise load.
- **Defense-in-Depth Recursive Log Sanitization**: Added cycle-safe Winston formatting with `WeakSet` traversal to eliminate token leakage (`Bearer ...`, `BBDC-...`, headers, passwords) and prevent circular-reference crashes.
- **Centralized Deployment Support**: Added `BITBUCKET_REQUIRE_AUTH` configuration enabling zero-credential server hosting for multi-tenant gateways with client-supplied authentication.
- **Concurrency Test Suite**: Added 19 comprehensive unit and concurrency stress tests simulating 50+ simultaneous interleaved requests.

### Changed
- Refactored `BitbucketServer` to conform strictly to SOLID principles with decoupled authentication and client abstractions.
- Sanitized error handling in tool handlers to strip raw Axios headers before logging.

---

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

