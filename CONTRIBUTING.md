# Contributing to Bitbucket Server MCP

Thank you for your interest in contributing to **Bitbucket Server MCP**! We welcome contributions of all kinds: bug fixes, new features, documentation improvements, and feedback.

---

## 🛠️ Development Setup

### Prerequisites
- **Node.js**: >= 18.0.0
- **npm**: >= 9.0.0
- A Bitbucket Server / Data Center instance (or test mock)

### Getting Started

1. **Fork and Clone**:
   ```bash
   git clone https://github.com/yashkolte3/bitbucket-server-mcp.git
   cd bitbucket-server-mcp
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Local Environment**:
   Copy `.env.example` to `.env` and configure your credentials:
   ```bash
   cp .env.example .env
   ```

4. **Build the Project**:
   ```bash
   npm run build
   ```

5. **Run in Development Mode**:
   ```bash
   # Watch mode for TypeScript compiler
   npm run dev

   # Test local stdio transport with MCP Inspector
   npm run inspector

   # Test HTTP transport locally
   npm run start:http
   ```

---

## 🧪 Testing

We use [Vitest](https://vitest.dev/) for unit and integration testing.

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test -- --coverage
```

Before submitting a PR, ensure all tests pass and your code is linted:
```bash
npm run lint
```

---

## 📦 Pull Request Guidelines

1. **Create a Topic Branch**:
   ```bash
   git checkout -b feature/my-feature
   # or
   git checkout -b bugfix/issue-description
   ```
2. **Commit Conventions**:
   Write clear, concise commit messages. If fixing an issue, reference it (e.g. `Fixes #12`).
3. **Keep Changes Focused**:
   Avoid bundling unrelated changes into a single PR.
4. **Update Documentation**:
   If introducing a new tool, configuration parameter, or transport behavior, update `README.md` and `CHANGELOG.md`.
5. **Ensure CI Passes**:
   GitHub Actions will automatically run linter, test matrix, and build verification on all pull requests.

---

## 📜 Licensing

By contributing to Bitbucket Server MCP, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).

