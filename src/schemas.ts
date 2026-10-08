import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * List of read-only tools that do not modify state or create mutations.
 */
export const READ_ONLY_TOOLS: readonly string[] = [
  'list_projects',
  'list_repositories',
  'get_pull_request',
  'list_pull_requests',
  'get_diff',
  'get_reviews',
  'get_activities',
  'get_comments',
  'search',
  'get_file_content',
  'browse_repository',
  'list_branches',
  'list_commits',
  'get_code_insights',
  'get_dashboard_pull_requests',
] as const;

/**
 * Factory generating tool definitions with dynamic project schemas based on configuration.
 * When `defaultProject` is unset (standard multi-project deployment), `project` is strictly required in repository/PR tools.
 * When `defaultProject` is set, `project` remains optional and documents the fallback.
 */
export function getToolDefinitions(defaultProject?: string): Tool[] {
  const projectDesc = defaultProject
    ? `Bitbucket project key. Defaults to "${defaultProject}" if omitted.`
    : 'Bitbucket project key (e.g. "PROJ"). Required to identify the repository. Use list_projects to discover available projects.';

  const withProject = (fields: string[]): string[] => {
    return defaultProject ? fields : ['project', ...fields];
  };

  return [
    {
      name: 'list_projects',
      description: 'Discover and list all Bitbucket projects you have access to. Use this first to explore available projects, find project keys, or when you need to work with a specific project but don\'t know its exact key. Returns project keys, names, descriptions and visibility settings.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of projects to return (default: 25, max: 1000)' },
          start: { type: 'number', description: 'Start index for pagination (default: 0)' }
        }
      }
    },
    {
      name: 'list_repositories',
      description: 'Browse and discover repositories within a specific project or across all accessible projects. Use this to find repository slugs, explore codebases, or understand the repository structure. Returns repository names, slugs, clone URLs, and project associations.',
      inputSchema: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
            description: defaultProject
              ? `Bitbucket project key to list repositories from. Defaults to "${defaultProject}" if omitted, or lists all accessible repositories across projects.`
              : 'Bitbucket project key to list repositories from. If omitted, lists all accessible repositories across projects.'
          },
          limit: { type: 'number', description: 'Number of repositories to return (default: 25, max: 1000)' },
          start: { type: 'number', description: 'Start index for pagination (default: 0)' }
        }
      }
    },
    {
      name: 'create_pull_request',
      description: 'Create a new pull request to propose code changes, request reviews, or merge feature branches. Use this when you want to submit code for review, merge a feature branch, or contribute changes to a repository. Automatically sets up branch references and can assign reviewers.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: projectDesc },
          repository: { type: 'string', description: 'Repository slug where the pull request will be created. Use list_repositories to find available repositories.' },
          title: { type: 'string', description: 'Clear, descriptive title for the pull request that summarizes the changes.' },
          description: { type: 'string', description: 'Detailed description of changes, context, and any relevant information for reviewers. Supports Markdown formatting.' },
          sourceBranch: { type: 'string', description: 'Source branch name containing the changes to be merged (e.g., "feature/new-login", "bugfix/security-patch").' },
          targetBranch: { type: 'string', description: 'Target branch where changes will be merged (e.g., "main", "develop", "release/v1.2").' },
          reviewers: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of Bitbucket usernames to assign as reviewers for this pull request.'
          },
          sourceProject: { type: 'string', description: 'Project key of the source repository when creating a cross-repo PR from a fork. If omitted, defaults to the same project as the target.' },
          sourceRepository: { type: 'string', description: 'Slug of the source repository when creating a cross-repo PR from a fork. If omitted, defaults to the same repository as the target.' },
          includeDefaultReviewers: { type: 'boolean', description: 'Automatically fetch and include default reviewers configured for the target branch. Defaults to true.' }
        },
        required: withProject(['repository', 'title', 'sourceBranch', 'targetBranch'])
      }
    },
    {
      name: 'update_pull_request',
      description: 'Update an existing pull request title, description, or reviewers. Safely preserves all fields not explicitly changed (uses read-modify-write to avoid losing reviewers or other metadata).',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: projectDesc },
          repository: { type: 'string', description: 'Repository slug containing the pull request.' },
          prId: { type: 'number', description: 'Pull request ID to update.' },
          title: { type: 'string', description: 'New title for the pull request.' },
          description: { type: 'string', description: 'New description for the pull request. Supports Markdown.' },
          reviewers: {
            type: 'array',
            items: { type: 'string' },
            description: 'Replace the reviewers list with these usernames. If omitted, existing reviewers are preserved.'
          }
        },
        required: withProject(['repository', 'prId'])
      }
    },
    {
      name: 'get_pull_request',
      description: 'Retrieve comprehensive details about a specific pull request including status, reviewers, commits, and metadata. Use this to check PR status, review progress, understand changes, or gather information before performing actions like merging or commenting.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: projectDesc },
          repository: { type: 'string', description: 'Repository slug containing the pull request.' },
          prId: { type: 'number', description: 'Unique pull request ID number (e.g., 123, 456).' }
        },
        required: withProject(['repository', 'prId'])
      }
    },
    {
      name: 'merge_pull_request',
      description: 'Merge an approved pull request into the target branch. Use this when a PR has been reviewed, approved, and is ready to be integrated. Choose the appropriate merge strategy based on your team\'s workflow and repository history preferences.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: projectDesc },
          repository: { type: 'string', description: 'Repository slug containing the pull request.' },
          prId: { type: 'number', description: 'Pull request ID to merge.' },
          message: { type: 'string', description: 'Custom merge commit message. If not provided, uses default merge message format.' },
          strategy: {
            type: 'string',
            enum: ['merge-commit', 'squash', 'fast-forward'],
            description: 'Merge strategy: "merge-commit" creates a merge commit preserving branch history, "squash" combines all commits into one, "fast-forward" moves the branch pointer without creating a merge commit.'
          }
        },
        required: withProject(['repository', 'prId'])
      }
    },
    {
      name: 'decline_pull_request',
      description: 'Decline or reject a pull request that should not be merged. Use this when changes are not acceptable, conflicts with project direction, or when the PR needs significant rework. This closes the PR without merging.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: projectDesc },
          repository: { type: 'string', description: 'Repository slug containing the pull request.' },
          prId: { type: 'number', description: 'Pull request ID to decline.' },
          message: { type: 'string', description: 'Reason for declining the pull request. Helps the author understand why it was rejected.' }
        },
        required: withProject(['repository', 'prId'])
      }
    },
    {
      name: 'add_comment',
      description: 'Add a comment to a pull request for code review, feedback, questions, or discussion. Use this to provide review feedback, ask questions about specific changes, suggest improvements, or participate in code review discussions. Supports threaded conversations.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: projectDesc },
          repository: { type: 'string', description: 'Repository slug containing the pull request.' },
          prId: { type: 'number', description: 'Pull request ID to comment on.' },
          text: { type: 'string', description: 'Comment text content. Supports Markdown formatting for code blocks, links, and emphasis.' },
          parentId: { type: 'number', description: 'ID of parent comment to reply to. Omit for top-level comments.' },
          state: { type: 'string', enum: ['OPEN', 'PENDING'], description: 'Comment state. Use PENDING to create a draft comment visible only to you until you publish the review. Defaults to OPEN.' },
          severity: { type: 'string', enum: ['NORMAL', 'BLOCKER'], description: 'Comment severity. Use BLOCKER to create a task instead of a regular comment. Defaults to NORMAL.' }
        },
        required: withProject(['repository', 'prId', 'text'])
      }
    },
    {
      name: 'add_comment_inline',
      description: 'Add an inline comment (to specific lines) to the diff of a pull request for code review, feedback, questions, or discussion. Use this to provide review feedback, ask questions about specific changes, suggest improvements, or participate in code review discussions. Supports threaded conversations.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: projectDesc },
          repository: { type: 'string', description: 'Repository slug containing the pull request.' },
          prId: { type: 'number', description: 'Pull request ID to comment on.' },
          text: { type: 'string', description: 'Comment text content. Supports Markdown formatting for code blocks, links, and emphasis.' },
          parentId: { type: 'number', description: 'ID of parent comment to reply to. Omit for top-level comments.' },
          filePath: { type: 'string', description: 'Path to the file in the repository where the comment should be added (e.g., "src/main.py", "README.md").' },
          line: { type: 'number', description: 'Line number in the file to attach the comment to (1-based).' },
          lineType: { type: 'string', enum: ['ADDED', 'REMOVED'], description: 'Type of change the comment is associated with: ADDED for additions, REMOVED for deletions.' },
          state: { type: 'string', enum: ['OPEN', 'PENDING'], description: 'Comment state. Use PENDING to create a draft comment visible only to you until you publish the review. Defaults to OPEN.' },
          severity: { type: 'string', enum: ['NORMAL', 'BLOCKER'], description: 'Comment severity. Use BLOCKER to create a task instead of a regular comment. Defaults to NORMAL.' }
        },
        required: withProject(['repository', 'prId', 'text', 'filePath', 'line', 'lineType'])
      }
    },
    {
      name: 'get_diff',
      description: 'Retrieve the code differences (diff) for a pull request showing what lines were added, removed, or modified. Use this to understand the scope of changes, review specific code modifications, or analyze the impact of proposed changes before merging.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: projectDesc },
          repository: { type: 'string', description: 'Repository slug containing the pull request.' },
          prId: { type: 'number', description: 'Pull request ID to get diff for.' },
          contextLines: { type: 'number', description: 'Number of context lines to show around changes (default: 10). Higher values provide more surrounding code context.' },
          maxLinesPerFile: { type: 'number', description: 'Maximum number of lines to show per file (default: uses BITBUCKET_DIFF_MAX_LINES_PER_FILE env var). Set to 0 for no limit. Prevents large files from overwhelming the diff output.' }
        },
        required: withProject(['repository', 'prId'])
      }
    },
    {
      name: 'get_reviews',
      description: 'Fetch the review history and approval status of a pull request. Use this to check who has reviewed the PR, see approval status, understand review feedback, or determine if the PR is ready for merging based on review requirements.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: projectDesc },
          repository: { type: 'string', description: 'Repository slug containing the pull request.' },
          prId: { type: 'number', description: 'Pull request ID to get reviews for.' },
          start: { type: 'number', description: 'Page offset (0-based). Use nextPageStart from a previous response to fetch the next page.' },
          limit: { type: 'number', description: 'Maximum number of activities to return per page (default: 25, max: 100).' },
          fetchAll: { type: 'boolean', description: 'When true, fetches all pages and returns the complete review history. Recommended when thorough analysis is needed.' }
        },
        required: withProject(['repository', 'prId'])
      }
    },
    {
      name: 'get_activities',
      description: 'Retrieve all activities for a pull request including comments, reviews, commits, and other timeline events. Use this to get the complete activity history and timeline of the pull request.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: projectDesc },
          repository: { type: 'string', description: 'Repository slug containing the pull request.' },
          prId: { type: 'number', description: 'Pull request ID to get activities for.' },
          start: { type: 'number', description: 'Page offset (0-based). Use nextPageStart from a previous response to fetch the next page.' },
          limit: { type: 'number', description: 'Maximum number of activities to return per page (default: 25, max: 100).' },
          fetchAll: { type: 'boolean', description: 'When true, fetches all pages and returns the complete activity history. Recommended when thorough analysis is needed.' }
        },
        required: withProject(['repository', 'prId'])
      }
    },
    {
      name: 'get_comments',
      description: 'Retrieve only the comments from a pull request. Use this when you specifically want to read the discussion and feedback comments without other activities like reviews or commits.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: projectDesc },
          repository: { type: 'string', description: 'Repository slug containing the pull request.' },
          prId: { type: 'number', description: 'Pull request ID to get comments for.' },
          start: { type: 'number', description: 'Page offset (0-based). Use nextPageStart from a previous response to fetch the next page.' },
          limit: { type: 'number', description: 'Maximum number of activities to return per page (default: 25, max: 100).' },
          fetchAll: { type: 'boolean', description: 'When true, fetches all pages and returns the complete comment history. Recommended for PRs with many comments.' }
        },
        required: withProject(['repository', 'prId'])
      }
    },
    {
      name: 'search',
      description: 'Search for code or files across repositories. Use this to find specific code patterns, file names, or content within projects and repositories. Searches both file contents and filenames. Supports filtering by project, repository, and query optimization.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query string to look for in code or file names.' },
          project: {
            type: 'string',
            description: defaultProject
              ? `Bitbucket project key to limit search scope. Defaults to "${defaultProject}" if omitted, or searches across accessible projects if not specified.`
              : 'Bitbucket project key to limit search scope. If omitted, searches across accessible projects.'
          },
          repository: { type: 'string', description: 'Repository slug to limit search to a specific repository within the project.' },
          type: {
            type: 'string',
            enum: ['code', 'file'],
            description: 'Query optimization: "file" wraps query in quotes for exact filename matching, "code" uses default search behavior. Both search file contents and filenames.'
          },
          limit: { type: 'number', description: 'Number of results to return (default: 25, max: 100)' },
          start: { type: 'number', description: 'Start index for pagination (default: 0)' }
        },
        required: ['query']
      }
    },
    {
      name: 'get_file_content',
      description: 'Retrieve the content of a specific file from a Bitbucket repository with pagination support. Use this to read source code, configuration files, documentation, or any text-based files. For large files, use start parameter to paginate through content.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: projectDesc },
          repository: { type: 'string', description: 'Repository slug containing the file.' },
          filePath: { type: 'string', description: 'Path to the file in the repository (e.g., "src/main.py", "README.md", "config/settings.json").' },
          branch: { type: 'string', description: 'Branch or commit hash to read from (defaults to main/master branch if not specified).' },
          limit: { type: 'number', description: 'Maximum number of lines to return per request (default: 100, max: 1000).' },
          start: { type: 'number', description: 'Starting line number for pagination (0-based, default: 0).' }
        },
        required: withProject(['repository', 'filePath'])
      }
    },
    {
      name: 'browse_repository',
      description: 'Browse and list files and directories in a Bitbucket repository. Use this to explore repository structure, find files, or navigate directories.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: projectDesc },
          repository: { type: 'string', description: 'Repository slug to browse.' },
          path: { type: 'string', description: 'Directory path to browse (empty or "/" for root directory).' },
          branch: { type: 'string', description: 'Branch or commit hash to browse (defaults to main/master branch if not specified).' },
          limit: { type: 'number', description: 'Maximum number of items to return (default: 50).' }
        },
        required: withProject(['repository'])
      }
    },
    {
      name: 'list_pull_requests',
      description: 'List pull requests in a Bitbucket repository filtered by state, author, or direction. Use this to find open PRs, see your pending reviews, discover PRs awaiting merge, or get an overview of PR activity in a repository.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: projectDesc },
          repository: { type: 'string', description: 'Repository slug to list pull requests from.' },
          state: {
            type: 'string',
            enum: ['OPEN', 'MERGED', 'DECLINED', 'ALL'],
            description: 'Filter by PR state (default: "OPEN"). Use "ALL" to see pull requests in any state.'
          },
          author: { type: 'string', description: 'Filter by author username (exact match). Only returns PRs created by this user.' },
          direction: {
            type: 'string',
            enum: ['INCOMING', 'OUTGOING'],
            description: 'Filter by direction: "INCOMING" for PRs targeting this repo (default), "OUTGOING" for PRs from this repo to other repos.'
          },
          limit: { type: 'number', description: 'Number of pull requests to return (default: 25, max: 1000).' },
          start: { type: 'number', description: 'Start index for pagination (default: 0)' }
        },
        required: withProject(['repository'])
      }
    },
    {
      name: 'list_branches',
      description: 'List branches in a Bitbucket repository. Shows branch names, latest commits, and identifies the default branch. Use this to explore available branches, find branch names for checkout or PR creation, or verify branch existence before operations.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: projectDesc },
          repository: { type: 'string', description: 'Repository slug to list branches from.' },
          filterText: { type: 'string', description: 'Filter branches by name (case-insensitive partial match).' },
          limit: { type: 'number', description: 'Number of branches to return (default: 25, max: 1000).' },
          start: { type: 'number', description: 'Start index for pagination (default: 0)' }
        },
        required: withProject(['repository'])
      }
    },
    {
      name: 'list_commits',
      description: 'List commits in a Bitbucket repository, optionally filtered by branch and/or author. Use this to review commit history, find specific changes, track contributions, or understand the evolution of a branch.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: projectDesc },
          repository: { type: 'string', description: 'Repository slug to list commits from.' },
          branch: { type: 'string', description: 'Branch name to list commits from (e.g., "main", "develop", "feature/xyz"). If omitted, lists commits from the default branch.' },
          author: { type: 'string', description: 'Filter commits by author name or email (case-insensitive partial match, applied client-side).' },
          limit: { type: 'number', description: 'Number of commits to return (default: 25, max: 1000).' },
          start: { type: 'number', description: 'Start index for pagination (default: 0)' }
        },
        required: withProject(['repository'])
      }
    },
    {
      name: 'delete_branch',
      description: 'Delete a branch from a Bitbucket repository. Cannot delete the default branch. Use this for cleanup after merging pull requests or removing stale feature branches.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: projectDesc },
          repository: { type: 'string', description: 'Repository slug containing the branch.' },
          branch: { type: 'string', description: 'Branch name to delete (e.g., "feature/old-feature", "bugfix/resolved-issue").' }
        },
        required: withProject(['repository', 'branch'])
      }
    },
    {
      name: 'approve_pull_request',
      description: 'Approve a pull request as the current user. Use this to signal that you have reviewed the changes and they are ready to be merged. The approval is recorded with your user identity.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: projectDesc },
          repository: { type: 'string', description: 'Repository slug containing the pull request.' },
          prId: { type: 'number', description: 'Pull request ID to approve.' }
        },
        required: withProject(['repository', 'prId'])
      }
    },
    {
      name: 'unapprove_pull_request',
      description: 'Remove your approval from a pull request. Use this to retract a previous approval if you discover issues after approving or if the PR has changed since your review.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: projectDesc },
          repository: { type: 'string', description: 'Repository slug containing the pull request.' },
          prId: { type: 'number', description: 'Pull request ID to remove approval from.' }
        },
        required: withProject(['repository', 'prId'])
      }
    },
    {
      name: 'edit_comment',
      description: 'Edit an existing comment on a pull request. Use this to fix typos, update information, or reformat comments. Requires the comment version for optimistic locking.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: projectDesc },
          repository: { type: 'string', description: 'Repository slug containing the pull request.' },
          prId: { type: 'number', description: 'Pull request ID the comment belongs to.' },
          commentId: { type: 'number', description: 'ID of the comment to edit.' },
          text: { type: 'string', description: 'New text content for the comment. Supports Markdown.' },
          version: { type: 'number', description: 'Current version of the comment (for optimistic locking). Obtain from get_comments or add_comment response.' },
          severity: { type: 'string', enum: ['NORMAL', 'BLOCKER'], description: 'Comment severity. Use BLOCKER to convert to a task, NORMAL to convert back to a comment.' }
        },
        required: withProject(['repository', 'prId', 'commentId', 'text', 'version'])
      }
    },
    {
      name: 'delete_comment',
      description: 'Delete a comment from a pull request. Requires the comment version for optimistic locking.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: projectDesc },
          repository: { type: 'string', description: 'Repository slug containing the pull request.' },
          prId: { type: 'number', description: 'Pull request ID the comment belongs to.' },
          commentId: { type: 'number', description: 'ID of the comment to delete.' },
          version: { type: 'number', description: 'Current version of the comment (for optimistic locking). Obtain from get_comments or add_comment response.' }
        },
        required: withProject(['repository', 'prId', 'commentId', 'version'])
      }
    },
    {
      name: 'publish_review',
      description: 'Publish all pending (draft) review comments on a pull request at once. Optionally set your review status to APPROVED or NEEDS_WORK, and add an overview comment. This is the batch operation that transitions all PENDING comments to published.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: projectDesc },
          repository: { type: 'string', description: 'Repository slug containing the pull request.' },
          prId: { type: 'number', description: 'Pull request ID to publish the review on.' },
          commentText: { type: 'string', description: 'Optional overview comment to include with the review.' },
          participantStatus: { type: 'string', enum: ['APPROVED', 'NEEDS_WORK'], description: 'Optional review status. APPROVED marks the PR as ready to merge. NEEDS_WORK indicates changes are required. Omit for general feedback without changing status.' }
        },
        required: withProject(['repository', 'prId'])
      }
    },
    {
      name: 'get_code_insights',
      description: 'Retrieve Code Insights reports (SonarQube, security scans, etc.) and their annotations for a pull request. Use this to check quality gates, code coverage, security findings, and other CI/CD analysis results.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: projectDesc },
          repository: { type: 'string', description: 'Repository slug containing the pull request.' },
          prId: { type: 'number', description: 'Pull request ID to get insights for.' }
        },
        required: withProject(['repository', 'prId'])
      }
    },
    {
      name: 'get_dashboard_pull_requests',
      description: 'List pull requests across all repositories for the authenticated user. Use this to see PRs you need to review, PRs you authored, or PRs you are participating in. Returns PRs from all projects and repositories without needing to specify each one.',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', enum: ['OPEN', 'MERGED', 'DECLINED', 'ALL'], description: 'Filter by PR state (default: OPEN).' },
          role: { type: 'string', enum: ['AUTHOR', 'REVIEWER', 'PARTICIPANT'], description: 'Filter by your role in the PR.' },
          participantStatus: { type: 'string', enum: ['APPROVED', 'UNAPPROVED', 'NEEDS_WORK'], description: 'Filter by your review status on the PR.' },
          order: { type: 'string', enum: ['OLDEST', 'NEWEST'], description: 'Sort order (default: NEWEST).' },
          closedSince: { type: 'number', description: 'Only include closed PRs updated after this timestamp (epoch ms). Useful for finding recently merged or declined PRs.' },
          limit: { type: 'number', description: 'Number of PRs to return (default: 25).' },
          start: { type: 'number', description: 'Start index for pagination (default: 0).' }
        }
      }
    }
  ];
}

