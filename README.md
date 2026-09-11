# Bitbucket Server MCP

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub release](https://img.shields.io/github/v/release/yashkolte3/bitbucket-server-mcp?include_prereleases&color=blue)](https://github.com/yashkolte3/bitbucket-server-mcp/releases)
[![CI Build](https://github.com/yashkolte3/bitbucket-server-mcp/actions/workflows/build.yml/badge.svg)](https://github.com/yashkolte3/bitbucket-server-mcp/actions/workflows/build.yml)

A feature-rich Model Context Protocol (MCP) server for **Bitbucket Server & Data Center**. It provides a comprehensive suite of tools to search repositories, manage pull requests, inspect code diffs, approve PRs, and collaborate directly from AI coding assistants.

### 🌟 Key Highlights
- **Dual Transport Support**: Run locally via standard `stdio` or host remotely via **MCP Streamable HTTP / SSE** (`--transport=http`).
- **Multi-Client & Dynamic Authentication**: Connect multiple AI clients over HTTP with per-client personal access tokens (via `Authorization: Bearer <token>`).
- **Complete PR Lifecycle**: List, create, review, comment (inline & general), approve, merge, or decline pull requests.
- **Advanced Code & File Search**: Search code, view file contents, and browse repository trees.
- **Zero Trust Ready**: Pass custom HTTP headers (`BITBUCKET_CUSTOM_HEADERS`) for Cloudflare Access, corporate proxies, or service tokens.
- **Docker Ready**: Pre-built Docker container and `docker-compose.yml` with health checking.

---

## Quickstart

### 1. Direct Execution via `npx` (No Install Required)
You can run this MCP server directly from GitHub without installing or cloning:
```bash
npx -y github:yashkolte3/bitbucket-server-mcp
```

### 2. Install from GitHub Packages
```bash
npm install -g @yashkolte3/bitbucket-server-mcp --registry=https://npm.pkg.github.com
```

### 3. Clone & Build Locally
```bash
git clone https://github.com/yashkolte3/bitbucket-server-mcp.git
cd bitbucket-server-mcp
npm install
npm run build
```

## Build

```bash
npm run build
```

## Features

The server provides the following tools for comprehensive Bitbucket Server integration:

### `list_projects`

**Discover and explore Bitbucket projects**: Lists all accessible projects with their details. Essential for project discovery and finding the correct project keys to use in other operations.

**Use cases:**

- Find available projects when you don't know the exact project key
- Explore project structure and permissions
- Discover new projects you have access to

Parameters:

- `limit`: Number of projects to return (default: 25, max: 1000)
- `start`: Start index for pagination (default: 0)

### `list_repositories`

**Browse and discover repositories**: Explore repositories within specific projects or across all accessible projects. Returns comprehensive repository information including clone URLs and metadata.

**Use cases:**

- Find repository slugs for other operations
- Explore codebase structure across projects
- Discover repositories you have access to
- Browse a specific project's repositories

Parameters:

- `project`: Bitbucket project key (optional, uses BITBUCKET_DEFAULT_PROJECT if not provided)
- `limit`: Number of repositories to return (default: 25, max: 1000)
- `start`: Start index for pagination (default: 0)

### `create_pull_request`

**Propose code changes for review**: Creates a new pull request to submit code changes, request reviews, or merge feature branches. Automatically handles branch references and reviewer assignments.

**Use cases:**

- Submit feature development for review
- Propose bug fixes
- Request code integration from feature branches
- Collaborate on code changes

Parameters:

- `project`: Bitbucket project key (optional, uses BITBUCKET_DEFAULT_PROJECT if not provided)
- `repository` (required): Repository slug
- `title` (required): Clear, descriptive PR title
- `description`: Detailed description with context (supports Markdown)
- `sourceBranch` (required): Source branch containing changes
- `targetBranch` (required): Target branch for merging
- `reviewers`: Array of reviewer usernames
- `sourceProject`: Project key of the source repository (for cross-repo PRs from forks)
- `sourceRepository`: Slug of the source repository (for cross-repo PRs from forks)
- `includeDefaultReviewers`: Automatically fetch and include default reviewers configured for the target branch (default: true)

### `update_pull_request`

**Safely update a pull request**: Modify the title, description, or reviewers of an existing pull request without losing any metadata. Uses a read-modify-write pattern to preserve all fields not explicitly changed.

**Use cases:**

- Fix PR title or description after creation
- Add or replace reviewers without losing existing ones
- Update PR metadata without affecting approval status

Parameters:

- `project`: Bitbucket project key (optional, uses BITBUCKET_DEFAULT_PROJECT if not provided)
- `repository` (required): Repository slug
- `prId` (required): Pull request ID to update
- `title`: New title (if omitted, current title is preserved)
- `description`: New description (if omitted, current description is preserved)
- `reviewers`: New reviewer list as array of usernames (if omitted, current reviewers are preserved)

### `get_pull_request`

**Comprehensive PR information**: Retrieves detailed pull request information including status, reviewers, commits, and all metadata. Essential for understanding PR state before taking actions.

**Use cases:**

- Check PR approval status
- Review PR details and progress
- Understand changes before merging
- Monitor PR status

Parameters:

- `project`: Bitbucket project key (optional, uses BITBUCKET_DEFAULT_PROJECT if not provided)
- `repository` (required): Repository slug
- `prId` (required): Pull request ID

### `merge_pull_request`

**Integrate approved changes**: Merges an approved pull request into the target branch. Supports different merge strategies based on your workflow preferences.

**Use cases:**

- Complete the code review process
- Integrate approved features
- Apply bug fixes to main branches
- Release code changes

Parameters:

- `project`: Bitbucket project key (optional, uses BITBUCKET_DEFAULT_PROJECT if not provided)
- `repository` (required): Repository slug
- `prId` (required): Pull request ID
- `message`: Custom merge commit message
- `strategy`: Merge strategy:
  - `merge-commit` (default): Creates merge commit preserving history
  - `squash`: Combines all commits into one
  - `fast-forward`: Moves branch pointer without merge commit

### `decline_pull_request`

**Reject unsuitable changes**: Declines a pull request that should not be merged, providing feedback to the author.

**Use cases:**

- Reject changes that don't meet standards
- Close PRs that conflict with project direction
- Request significant rework
- Prevent unwanted code integration

Parameters:

- `project`: Bitbucket project key (optional, uses BITBUCKET_DEFAULT_PROJECT if not provided)
- `repository` (required): Repository slug
- `prId` (required): Pull request ID
- `message`: Reason for declining (helpful for author feedback)

### `add_comment`

**Participate in code review**: Adds comments to pull requests for review feedback, discussions, and collaboration. Supports threaded conversations.

**Use cases:**

- Provide code review feedback
- Ask questions about specific changes
- Suggest improvements
- Participate in technical discussions
- Document review decisions

Parameters:

- `project`: Bitbucket project key (optional, uses BITBUCKET_DEFAULT_PROJECT if not provided)
- `repository` (required): Repository slug
- `prId` (required): Pull request ID
- `text` (required): Comment content (supports Markdown)
- `parentId`: Parent comment ID for threaded replies
- `state`: Comment state: `OPEN` (default, published immediately) or `PENDING` (draft, visible only to you until review is published)

### `get_diff`

**Analyze code changes**: Retrieves the code differences showing exactly what was added, removed, or modified in the pull request. Supports per-file truncation to manage large diffs effectively.

**Use cases:**

- Review specific code changes
- Understand scope of modifications
- Analyze impact before merging
- Inspect implementation details
- Code quality assessment
- Handle large files without overwhelming output

Parameters:

- `project`: Bitbucket project key (optional, uses BITBUCKET_DEFAULT_PROJECT if not provided)
- `repository` (required): Repository slug
- `prId` (required): Pull request ID
- `contextLines`: Context lines around changes (default: 10)
- `maxLinesPerFile`: Maximum lines to show per file (optional, uses BITBUCKET_DIFF_MAX_LINES_PER_FILE env var if not specified, set to 0 for no limit)

**Large File Handling:**
When a file exceeds the `maxLinesPerFile` limit, it shows:

- File headers and metadata (always preserved)
- First 60% of allowed lines from the beginning
- Truncation message with file statistics
- Last 40% of allowed lines from the end
- Clear indication of how to see the complete diff

### `get_reviews`

**Track review progress**: Fetches review history, approval status, and reviewer feedback to understand the review state.

**Use cases:**

- Check if PR is ready for merging
- See who has reviewed the changes
- Understand review feedback
- Monitor approval requirements
- Track review progress

### `get_activities`

**Retrieve pull request activities**: Gets the complete activity timeline for a pull request including comments, reviews, commits, and other events.

**Use cases:**

- Read comment discussions and feedback
- Review the complete PR timeline
- Track commits added/removed from PR
- See approval and review history
- Understand the full PR lifecycle

Parameters:

- `project`: Bitbucket project key (optional, uses BITBUCKET_DEFAULT_PROJECT if not provided)
- `repository` (required): Repository slug
- `prId` (required): Pull request ID

### `get_comments`

**Extract PR comments only**: Filters pull request activities to return only the comments, making it easier to focus on discussion content without reviews or other activities.

**Use cases:**

- Read PR discussion threads
- Extract feedback and questions
- Focus on comment content without noise
- Analyze conversation flow

Parameters:

- `project`: Bitbucket project key (optional, uses BITBUCKET_DEFAULT_PROJECT if not provided)
- `repository` (required): Repository slug
- `prId` (required): Pull request ID

### `search`

**Advanced code and file search**: Search across repositories using the Bitbucket search API with support for project/repository filtering and query optimization. Searches both file contents and filenames. **Note**: Search only works on the default branch of repositories.

**Use cases:**

- Find specific code patterns across projects
- Locate files by name or content
- Search within specific projects or repositories
- Filter by file extensions

Parameters:

- `query` (required): Search query string
- `project`: Bitbucket project key to limit search scope
- `repository`: Repository slug for repository-specific search
- `type`: Query optimization - "file" (wraps query in quotes for exact filename matching) or "code" (default search behavior)
- `limit`: Number of results to return (default: 25, max: 100)
- `start`: Start index for pagination (default: 0)

**Query syntax examples:**

- `"README.md"` - Find exact filename
- `config ext:yml` - Find config in YAML files
- `function project:MYPROJECT` - Search for "function" in specific project
- `bug fix repo:PROJ/my-repo` - Search in specific repository

### `get_file_content`

**Read file contents with pagination**: Retrieve the content of specific files from repositories with support for large files through pagination.

**Use cases:**

- Read source code files
- View configuration files
- Extract documentation content
- Inspect specific file versions

Parameters:

- `project`: Bitbucket project key (optional, uses BITBUCKET_DEFAULT_PROJECT if not provided)
- `repository` (required): Repository slug
- `filePath` (required): Path to the file in the repository
- `branch`: Branch or commit hash (optional, defaults to main/master)
- `limit`: Maximum lines per request (default: 100, max: 1000)
- `start`: Starting line number for pagination (default: 0)

### `browse_repository`

**Explore repository structure**: Browse files and directories in repositories to understand project organization and locate specific files.

**Use cases:**

- Explore repository structure
- Navigate directory trees
- Find files and folders
- Understand project organization

Parameters:

- `project`: Bitbucket project key (optional, uses BITBUCKET_DEFAULT_PROJECT if not provided)
- `repository` (required): Repository slug
- `path`: Directory path to browse (optional, defaults to root)
- `branch`: Branch or commit hash (optional, defaults to main/master)
- `limit`: Maximum items to return (default: 50)

### `list_pull_requests`

**Discover and filter pull requests**: List pull requests in a repository with filtering by state, author, and direction. Returns PR metadata including title, author, branches, reviewers, and status.

**Use cases:**

- Find open PRs in a repository
- List your own pull requests
- See PRs awaiting review
- Get an overview of merged or declined PRs
- Monitor PR activity in a project

Parameters:

- `project`: Bitbucket project key (optional, uses BITBUCKET_DEFAULT_PROJECT if not provided)
- `repository` (required): Repository slug
- `state`: Filter by PR state — `OPEN` (default), `MERGED`, `DECLINED`, or `ALL`
- `author`: Filter by author username (exact match)
- `direction`: `INCOMING` (PRs targeting this repo, default) or `OUTGOING` (PRs from this repo)
- `limit`: Number of PRs to return (default: 25, max: 1000)
- `start`: Start index for pagination (default: 0)

### `list_branches`

**Explore repository branches**: List branches in a repository with optional filtering. Identifies the default branch and shows latest commit information for each branch.

**Use cases:**

- Find branch names for PR creation or checkout
- Verify branch existence before operations
- Identify the default branch
- Search for branches by name

Parameters:

- `project`: Bitbucket project key (optional, uses BITBUCKET_DEFAULT_PROJECT if not provided)
- `repository` (required): Repository slug
- `filterText`: Filter branches by name (case-insensitive partial match)
- `limit`: Number of branches to return (default: 25, max: 1000)
- `start`: Start index for pagination (default: 0)

### `list_commits`

**Browse commit history**: List commits in a repository with optional branch and author filtering. Use this to review changes, track contributions, or understand the evolution of a branch.

**Use cases:**

- Review recent changes on a branch
- Find commits by a specific author
- Track commit history before merging
- Understand branch evolution

Parameters:

- `project`: Bitbucket project key (optional, uses BITBUCKET_DEFAULT_PROJECT if not provided)
- `repository` (required): Repository slug
- `branch`: Branch name to list commits from (defaults to the repository's default branch)
- `author`: Filter by author name or email (case-insensitive partial match, applied client-side)
- `limit`: Number of commits to return (default: 25, max: 1000)
- `start`: Start index for pagination (default: 0)

### `delete_branch`

**Clean up merged branches**: Delete a branch from a repository. Includes a safety check to prevent deletion of the default branch.

**Use cases:**

- Clean up feature branches after PR merge
- Remove stale or abandoned branches
- Repository maintenance and hygiene

Parameters:

- `project`: Bitbucket project key (optional, uses BITBUCKET_DEFAULT_PROJECT if not provided)
- `repository` (required): Repository slug
- `branch` (required): Branch name to delete

### `approve_pull_request`

**Approve code changes**: Approve a pull request as the current authenticated user. Records your approval on the PR, signaling that changes are ready to merge.

**Use cases:**

- Approve reviewed pull requests
- Signal readiness for merge
- Complete code review workflow

Parameters:

- `project`: Bitbucket project key (optional, uses BITBUCKET_DEFAULT_PROJECT if not provided)
- `repository` (required): Repository slug
- `prId` (required): Pull request ID to approve

### `unapprove_pull_request`

**Retract approval**: Remove your approval from a pull request. Use this when you need to retract a previous approval after discovering issues or when the PR has changed.

**Use cases:**

- Retract approval after discovering issues
- Remove approval when PR scope changes
- Correct accidental approvals

Parameters:

- `project`: Bitbucket project key (optional, uses BITBUCKET_DEFAULT_PROJECT if not provided)
- `repository` (required): Repository slug
- `prId` (required): Pull request ID to remove approval from

### `edit_comment`

**Edit an existing comment**: Modify the text of a comment on a pull request. Works with both published and pending (draft) comments. Requires the comment version for optimistic locking.

**Use cases:**

- Fix typos or formatting in review comments
- Update information in an existing comment
- Reformat comments (e.g., to Conventional Comments style)

Parameters:

- `project`: Bitbucket project key (optional, uses BITBUCKET_DEFAULT_PROJECT if not provided)
- `repository` (required): Repository slug
- `prId` (required): Pull request ID the comment belongs to
- `commentId` (required): ID of the comment to edit
- `text` (required): New text content (supports Markdown)
- `version` (required): Current version of the comment for optimistic locking (from `get_comments` or `add_comment` response)

### `delete_comment`

**Delete a comment**: Remove a comment from a pull request. Requires the comment version for optimistic locking.

**Use cases:**

- Remove incorrectly posted comments
- Clean up draft comments that are no longer needed

Parameters:

- `project`: Bitbucket project key (optional, uses BITBUCKET_DEFAULT_PROJECT if not provided)
- `repository` (required): Repository slug
- `prId` (required): Pull request ID the comment belongs to
- `commentId` (required): ID of the comment to delete
- `version` (required): Current version of the comment for optimistic locking

### `publish_review`

**Publish a batch review**: Publish all pending (draft) comments at once, optionally setting your review status and adding an overview comment. This is the equivalent of clicking "Finish review" in the Bitbucket UI.

**Use cases:**

- Publish all draft review comments in a single action
- Approve a PR along with review comments
- Request changes with a "needs work" status and feedback

Parameters:

- `project`: Bitbucket project key (optional, uses BITBUCKET_DEFAULT_PROJECT if not provided)
- `repository` (required): Repository slug
- `prId` (required): Pull request ID
- `commentText`: Optional overview comment for the review
- `participantStatus`: Optional review status: `APPROVED` (ready to merge) or `NEEDS_WORK` (changes required). Omit for general feedback.

### `get_code_insights`

**Retrieve CI/CD analysis results**: Fetch Code Insights reports (SonarQube, security scans, etc.) and their annotations for a pull request.

**Use cases:**

- Check SonarQube quality gate status
- Review security scan findings
- Inspect code coverage metrics
- See CI/CD analysis annotations per file

Parameters:

- `project`: Bitbucket project key (optional, uses BITBUCKET_DEFAULT_PROJECT if not provided)
- `repository` (required): Repository slug
- `prId` (required): Pull request ID

### `get_dashboard_pull_requests`

**Cross-repository PR dashboard**: List pull requests across all repositories for the authenticated user. Use this to see PRs you need to review, PRs you authored, or PRs you are participating in, without needing to specify each project and repository.

**Use cases:**

- See all PRs awaiting your review
- List your own open PRs across all projects
- Find recently merged PRs you participated in
- Get an overview of your PR workload

Parameters:

- `state`: Filter by PR state: `OPEN` (default), `MERGED`, `DECLINED`, or `ALL`
- `role`: Filter by your role: `AUTHOR`, `REVIEWER`, or `PARTICIPANT`
- `participantStatus`: Filter by your review status: `APPROVED`, `UNAPPROVED`, or `NEEDS_WORK`
- `order`: Sort order: `OLDEST` or `NEWEST` (default)
- `closedSince`: Only include closed PRs updated after this timestamp (epoch ms)
- `limit`: Number of PRs to return (default: 25)
- `start`: Start index for pagination (default: 0)

## Usage Examples

### Listing Projects and Repositories

```bash
# List all accessible projects
list_projects

# List repositories in the default project (if BITBUCKET_DEFAULT_PROJECT is set)
list_repositories

# List repositories in a specific project
list_repositories --project "MYPROJECT"

# List projects with pagination
list_projects --limit 10 --start 0
```

### Search and File Operations

```bash
# Search for README files across all projects
search --query "README" --type "file" --limit 10

# Search for specific code patterns in a project
search --query "function getUserData" --type "code" --project "MYPROJECT"

# Search with file extension filter
search --query "config ext:yml" --project "MYPROJECT"

# Browse repository structure
browse_repository --project "MYPROJECT" --repository "my-repo"

# Browse specific directory
browse_repository --project "MYPROJECT" --repository "my-repo" --path "src/components"

# Read file contents
get_file_content --project "MYPROJECT" --repository "my-repo" --filePath "package.json" --limit 20

# Read specific lines from a large file
get_file_content --project "MYPROJECT" --repository "my-repo" --filePath "docs/CHANGELOG.md" --start 100 --limit 50
```

### Working with Pull Requests

```bash
# Create a pull request (using default project)
create_pull_request --repository "my-repo" --title "Feature: New functionality" --sourceBranch "feature/new-feature" --targetBranch "main"

# Create a pull request with specific project
create_pull_request --project "MYPROJECT" --repository "my-repo" --title "Bugfix: Critical issue" --sourceBranch "bugfix/critical" --targetBranch "develop" --description "Fixes critical issue #123"

# Get pull request details
get_pull_request --repository "my-repo" --prId 123

# Get only comments from a PR (no reviews/commits)
get_comments --project "MYPROJECT" --repository "my-repo" --prId 123

# Get full PR activity timeline
get_activities --repository "my-repo" --prId 123

# Merge a pull request with squash strategy
merge_pull_request --repository "my-repo" --prId 123 --strategy "squash" --message "Feature: New functionality (#123)"
```

### Discovering Pull Requests

```bash
# List open PRs in a repository (default state: OPEN)
list_pull_requests --repository "my-repo"

# List all PRs regardless of state
list_pull_requests --repository "my-repo" --state "ALL"

# Find PRs by a specific author
list_pull_requests --repository "my-repo" --author "john.doe"

# List merged PRs with pagination
list_pull_requests --repository "my-repo" --state "MERGED" --limit 10 --start 0
```

### Branch Management

```bash
# List all branches in a repository
list_branches --repository "my-repo"

# Filter branches by name
list_branches --project "MYPROJECT" --repository "my-repo" --filterText "feature"

# Delete a merged branch
delete_branch --repository "my-repo" --branch "feature/completed-work"
```

### Commit History

```bash
# List recent commits on the default branch
list_commits --repository "my-repo"

# List commits on a specific branch
list_commits --repository "my-repo" --branch "develop" --limit 10

# Filter commits by author
list_commits --repository "my-repo" --author "john.doe"

# Combine branch and author filters
list_commits --project "MYPROJECT" --repository "my-repo" --branch "main" --author "jane"
```

### PR Approval Workflow

```bash
# Approve a pull request
approve_pull_request --repository "my-repo" --prId 123

# Remove your approval
unapprove_pull_request --repository "my-repo" --prId 123

# Full workflow: review diff, approve, merge
get_diff --repository "my-repo" --prId 123
approve_pull_request --repository "my-repo" --prId 123
merge_pull_request --repository "my-repo" --prId 123 --strategy "squash"
```

## Dependencies

- `@modelcontextprotocol/sdk` - Official TypeScript SDK for Model Context Protocol (stdio & Streamable HTTP)
- `express` - High-performance web server for Streamable HTTP / SSE transport
- `cors` - Cross-Origin Resource Sharing middleware
- `axios` - HTTP client for Bitbucket REST API requests
- `winston` - Robust structured logging framework

## Client Configuration

You can run Bitbucket Server MCP either directly via `npx` (recommended, no clone needed) or via a locally cloned repository.

### Option A: Direct execution with `npx` (Recommended)

#### Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "bitbucket": {
      "command": "npx",
      "args": ["-y", "github:yashkolte3/bitbucket-server-mcp"],
      "env": {
        "BITBUCKET_URL": "https://your-bitbucket-server.com",
        "BITBUCKET_TOKEN": "your-personal-access-token",
        "BITBUCKET_DEFAULT_PROJECT": "PROJECT_KEY"
      }
    }
  }
}
```

#### Claude Code (CLI)
```bash
claude mcp add bitbucket -e BITBUCKET_URL="https://your-bitbucket-server.com" -e BITBUCKET_TOKEN="your-token" -- npx -y github:yashkolte3/bitbucket-server-mcp
```

#### Google Antigravity (`mcp_config.json`)
```json
{
  "mcpServers": {
    "bitbucket": {
      "command": "npx",
      "args": ["-y", "github:yashkolte3/bitbucket-server-mcp"],
      "env": {
        "BITBUCKET_URL": "https://your-bitbucket-server.com",
        "BITBUCKET_TOKEN": "your-personal-access-token"
      }
    }
  }
}
```

#### VS Code / Cursor (`mcp.json`)
```json
{
  "mcpServers": {
    "bitbucket": {
      "command": "npx",
      "args": ["-y", "github:yashkolte3/bitbucket-server-mcp"],
      "env": {
        "BITBUCKET_URL": "https://your-bitbucket-server.com",
        "BITBUCKET_TOKEN": "your-personal-access-token"
      }
    }
  }
}
```

### Option B: Local Clone

If you clone and build this repository locally:

```json
{
  "mcpServers": {
    "bitbucket": {
      "command": "node",
      "args": ["/absolute/path/to/bitbucket-server-mcp/build/index.js"],
      "env": {
        "BITBUCKET_URL": "https://your-bitbucket-server.com",
        "BITBUCKET_TOKEN": "your-personal-access-token"
      }
    }
  }
}
```


### Environment Variables

- `BITBUCKET_URL` (required): Base URL of your Bitbucket Server instance
- Authentication (one of the following is required):
  - `BITBUCKET_TOKEN`: Personal access token
  - `BITBUCKET_USERNAME` and `BITBUCKET_PASSWORD`: Basic authentication credentials
- `BITBUCKET_DEFAULT_PROJECT` (optional): Default project key to use when not specified in tool calls
- `BITBUCKET_DIFF_MAX_LINES_PER_FILE` (optional): Default maximum lines to show per file in diffs. Set to prevent large files from overwhelming output. Can be overridden by the `maxLinesPerFile` parameter in `get_diff` calls.
- `BITBUCKET_LOG_PATH` (optional): Custom path for the log file (default: `~/.bitbucket-server-mcp/bitbucket.log`)
- `BITBUCKET_READ_ONLY` (optional): Set to `true` to enable read-only mode
- `BITBUCKET_CUSTOM_HEADERS` (optional): Comma-separated list of custom HTTP headers to add to all requests (format: `Header-Name=value,Another-Header=value2`). Useful for Zero Trust tokens or proxy headers

**Note**: With the new optional project support, you can now:

- Set `BITBUCKET_DEFAULT_PROJECT` to work with a specific project by default
- Use `list_projects` to discover available projects
- Use `list_repositories` to browse repositories across projects
- Override the default project by specifying the `project` parameter in any tool call

### Read-Only Mode

The server supports a read-only mode for deployments where you want to prevent any modifications to your Bitbucket repositories. When enabled, only safe, non-modifying operations are available.

**To enable read-only mode**: Set the environment variable `BITBUCKET_READ_ONLY=true`

**Available tools in read-only mode:**

- `list_projects` - Browse and list projects
- `list_repositories` - Browse and list repositories
- `get_pull_request` - View pull request details
- `list_pull_requests` - List and filter pull requests
- `get_diff` - View code changes and diffs
- `get_reviews` - View review history and status
- `get_activities` - View pull request timeline
- `get_comments` - View pull request comments
- `search` - Search code and files across repositories
- `get_file_content` - Read file contents
- `browse_repository` - Browse repository structure
- `list_branches` - List repository branches
- `list_commits` - Browse commit history
- `get_code_insights` - Retrieve CI/CD analysis reports and annotations
- `get_dashboard_pull_requests` - List PRs across all repositories for the authenticated user

**Disabled tools in read-only mode:**

- `create_pull_request` - Creating new pull requests
- `update_pull_request` - Updating pull request title, description, or reviewers
- `merge_pull_request` - Merging pull requests
- `decline_pull_request` - Declining pull requests
- `add_comment` - Adding comments to pull requests
- `add_comment_inline` - Adding inline comments to pull requests
- `edit_comment` - Editing existing comments
- `delete_comment` - Deleting comments
- `publish_review` - Publishing batch reviews
- `delete_branch` - Deleting branches
- `approve_pull_request` - Approving pull requests
- `unapprove_pull_request` - Removing PR approvals

**Behavior:**

- When `BITBUCKET_READ_ONLY` is not set or set to any value other than `true`, all tools function normally (backward compatible)
- When `BITBUCKET_READ_ONLY=true`, write operations are filtered out and will return an error if called
- This is perfect for production deployments, CI/CD integration, or any scenario where you need safe, read-only Bitbucket access

## Logging

The server logs all operations using Winston for debugging and monitoring purposes.

**Log file location** (in order of priority):

1. `BITBUCKET_LOG_PATH` environment variable — custom path
2. `~/.bitbucket-server-mcp/bitbucket.log` — default location

The log directory is created automatically if it doesn't exist.

**Example**: Set a custom log path in your MCP configuration:

```json
{
  "env": {
    "BITBUCKET_LOG_PATH": "/var/log/bitbucket-mcp/server.log"
  }
}
```

### Custom HTTP Headers

You can add custom HTTP headers to all API requests using the `BITBUCKET_CUSTOM_HEADERS` environment variable. This is useful for Zero Trust security tokens, proxy headers, or any other headers required by your infrastructure.

**Format**: Comma-separated key-value pairs where values can contain equals signs:

```
Header-Name=value,Another-Header=value2
```

**Single header example**:

```json
{
  "env": {
    "BITBUCKET_CUSTOM_HEADERS": "X-Zero-Trust-Token=your-token-here"
  }
}
```

**Multiple headers example**:

```json
{
  "env": {
    "BITBUCKET_CUSTOM_HEADERS": "X-Custom-Header=value1,X-Proxy-Auth=token123"
  }
}
```

## Remote Access via HTTP Streamable Transport

The server supports remote MCP communication via the standard **MCP Streamable HTTP Transport** (`StreamableHTTPServerTransport`), enabling centralized or multi-user deployments accessible over HTTP/SSE.

### Starting in HTTP Mode

You can start the server in HTTP mode using either CLI arguments or environment variables:

**Using npm scripts:**
```bash
npm run start:http
```

**Using CLI flags:**
```bash
node build/index.js --transport=http --port=3000 --host=0.0.0.0
```

**Using environment variables:**
```bash
MCP_TRANSPORT=http PORT=3000 node build/index.js
```

### Environment Variables & CLI Options

| Option / Variable | Flag | Default | Description |
|-------------------|------|---------|-------------|
| `MCP_TRANSPORT` | `--transport` | `stdio` | Transport mechanism: `stdio` or `http` |
| `PORT` | `--port` | `3000` | HTTP port when running in `http` mode |
| `HOST` | `--host` | `0.0.0.0` | Bind host when running in `http` mode |
| `BITBUCKET_URL` | - | *(Required)* | Base URL of the Bitbucket Server/Data Center instance |
| `BITBUCKET_TOKEN` | - | *(Optional)* | Default fallback PAT if client does not provide one |

### Authentication & Per-Client PAT

When running over HTTP, the server provides flexible authentication:

1. **Per-Client PAT (Authorization Header)**: Each client can pass their own personal Bitbucket access token via standard HTTP headers:
   ```http
   Authorization: Bearer <bitbucket_personal_access_token>
   ```
   *(Alternatively, `X-Bitbucket-Token: <token>` is also accepted).*

2. **Automatic Fallback to Default PAT**: If a client does not supply an `Authorization` header, the server automatically falls back to `BITBUCKET_TOKEN` configured in the server environment.

3. **Multi-User / Shared Server Setup**: You can run the server **without** setting `BITBUCKET_TOKEN`. In this mode, each user/client must provide their own PAT, preventing cross-user credential sharing. If no token is provided by the client or server, a `401 Unauthorized` JSON-RPC error is returned.

### Endpoints

- `POST /mcp` (or `POST /`): Handles JSON-RPC requests (e.g., `initialize`, `tools/list`, `tools/call`). For subsequent requests after initialization, pass `mcp-session-id: <session-id>`.
- `GET /mcp` (or `GET /` with `Accept: text/event-stream`): SSE event stream for server notifications.
- `DELETE /mcp`: Closes and cleans up the active session.
- `GET /health`: Returns JSON health status, active session count, and configuration metadata.

### Connecting Remote MCP Clients

#### MCP Inspector
```bash
npx @modelcontextprotocol/inspector --transport streamableHttp --url http://localhost:3000/mcp
```

#### Docker Deployment

**Using Docker Compose (Recommended):**

1. Edit `.env` with your Bitbucket URL and optional default PAT:
   ```bash
   cp .env.example .env   # (or edit the included .env directly)
   ```
2. Start the container:
   ```bash
   docker compose up -d --build
   ```
3. Check container logs:
   ```bash
   docker compose logs -f
   ```
4. Stop the container:
   ```bash
   docker compose down
   ```

**Using Standalone Docker:**
```bash
docker build -t bitbucket-server-mcp .
docker run -p 3000:3000 \
  -e MCP_TRANSPORT=http \
  -e BITBUCKET_URL=https://bitbucket.example.com \
  -e BITBUCKET_TOKEN=optional-fallback-pat \
  bitbucket-server-mcp
```

**Using Pre-built Container (GitHub Container Registry):**
```bash
docker run -p 3000:3000 \
  -e MCP_TRANSPORT=http \
  -e BITBUCKET_URL=https://bitbucket.example.com \
  -e BITBUCKET_TOKEN=optional-fallback-pat \
  ghcr.io/yashkolte3/bitbucket-server-mcp:latest
```

#### Connecting Clients to Remote HTTP Server

When hosting the server on a remote VM or container, clients supporting HTTP/SSE transport can connect directly:

```json
{
  "mcpServers": {
    "bitbucket": {
      "url": "http://your-server-host:3000/mcp",
      "headers": {
        "Authorization": "Bearer your-bitbucket-personal-access-token"
      }
    }
  }
}
```

---

## Contributing

Contributions, issues, and feature requests are welcome!
- Check out the [Contributing Guidelines](CONTRIBUTING.md).
- Open an issue on [GitHub Issues](https://github.com/yashkolte3/bitbucket-server-mcp/issues).
- Submit a pull request following our [Pull Request Guidelines](.github/PULL_REQUEST_TEMPLATE.md).

---

## License & Attribution

This project is licensed under the [Apache License 2.0](LICENSE).

### Attribution
- Originally created by [@garc33](https://github.com/garc33) in [garc33/bitbucket-server-mcp](https://github.com/garc33/bitbucket-server-mcp).
- Maintained and expanded by [Yash Kolte](https://github.com/yashkolte3) with MCP Streamable HTTP transport, multi-client bearer auth, containerization, and advanced Bitbucket Data Center tooling.
- See [NOTICE](NOTICE) for additional legal details.



