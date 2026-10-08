#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance } from 'axios';
import { parseCustomHeaders } from "./headers.js";
import path from 'path';
import { fileURLToPath } from 'url';
import { logger, extractSafeErrorMeta } from './logger.js';
import { HierarchicalAuthResolver, IAuthenticationResolver } from './auth.js';
import { createConnectionPoolAgents } from './client.js';
import { formatToolError, ToolValidationError, ToolExecutionError } from './errors.js';
import { getToolDefinitions, READ_ONLY_TOOLS } from './schemas.js';

export { logger };

interface BitbucketActivity {
  action: string;
  [key: string]: unknown;
}

interface BitbucketConfig {
  baseUrl: string;
  token?: string;
  username?: string;
  password?: string;
  defaultProject?: string;
  maxLinesPerFile?: number;
  readOnly?: boolean;
  customHeaders?: Record<string, string>;
  requireAuth?: boolean;
}

interface RepositoryParams {
  project?: string;
  repository?: string;
}

interface PullRequestParams extends RepositoryParams {
  prId?: number;
}

interface MergeOptions {
  message?: string;
  strategy?: 'merge-commit' | 'squash' | 'fast-forward';
}

interface CommentOptions {
  text: string;
  parentId?: number;
  state?: 'OPEN' | 'PENDING';
  severity?: 'NORMAL' | 'BLOCKER';
}

interface InlineCommentOptions extends CommentOptions {
  filePath: string;
  line: number;
  lineType: 'ADDED' | 'REMOVED';
}

interface PullRequestInput extends RepositoryParams {
  title: string;
  description: string;
  sourceBranch: string;
  targetBranch: string;
  reviewers?: string[];
  sourceProject?: string;
  sourceRepository?: string;
  includeDefaultReviewers?: boolean;
}

interface UpdatePullRequestInput extends RepositoryParams {
  prId: number;
  title?: string;
  description?: string;
  reviewers?: string[];
}

interface EditCommentOptions {
  commentId: number;
  text: string;
  version: number;
  severity?: 'NORMAL' | 'BLOCKER';
}

interface DashboardPullRequestsOptions extends ListOptions {
  state?: 'OPEN' | 'MERGED' | 'DECLINED' | 'ALL';
  role?: 'AUTHOR' | 'REVIEWER' | 'PARTICIPANT';
  participantStatus?: 'APPROVED' | 'UNAPPROVED' | 'NEEDS_WORK';
  order?: 'OLDEST' | 'NEWEST';
  closedSince?: number;
}

interface DeleteCommentOptions {
  commentId: number;
  version: number;
}

interface PublishReviewOptions {
  commentText?: string;
  participantStatus?: 'APPROVED' | 'NEEDS_WORK' | null;
}

interface ListOptions {
  limit?: number;
  start?: number;
}

interface ActivitiesPaginationOptions {
  start?: number;
  limit?: number;
  fetchAll?: boolean;
}

interface ListRepositoriesOptions extends ListOptions {
  project?: string;
}

interface SearchOptions extends ListOptions {
  project?: string;
  repository?: string;
  query: string;
  type?: 'code' | 'file';
}

interface SearchResultItem {
  repository: string;
  file: string;
  hitCount?: number;
  pathMatches?: string[];
  hitContexts?: string[];
}

interface FileContentOptions extends ListOptions {
  project?: string;
  repository?: string;
  filePath: string;
  branch?: string;
}

interface BranchListOptions extends ListOptions {
  project?: string;
  repository?: string;
  filterText?: string;
}

interface CommitListOptions extends ListOptions {
  project?: string;
  repository?: string;
  branch?: string;
  author?: string;
}

interface PullRequestListOptions extends ListOptions {
  project?: string;
  repository?: string;
  state?: 'OPEN' | 'MERGED' | 'DECLINED' | 'ALL';
  author?: string;
  direction?: 'INCOMING' | 'OUTGOING';
}

export interface BitbucketServerOptions {
  baseUrl?: string;
  token?: string;
  username?: string;
  password?: string;
  defaultProject?: string;
  maxLinesPerFile?: number;
  readOnly?: boolean;
  customHeaders?: Record<string, string>;
  authResolver?: IAuthenticationResolver;
  requireAuth?: boolean;
}

export class BitbucketServer {
  private readonly server: Server;
  private readonly api: AxiosInstance;
  private readonly config: BitbucketConfig;
  private readonly authResolver: IAuthenticationResolver;

  constructor(options?: BitbucketServerOptions) {
    this.server = new Server(
      {
        name: 'bitbucket-server-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Configuration initiale à partir des variables d'environnement
    const rawBaseUrl = (options?.baseUrl ?? process.env.BITBUCKET_URL ?? '').trim().replace(/\/+$/, '');
    const cleanBaseUrl = rawBaseUrl.replace(/\/rest\/api\/1\.0$/, '');

    const rawToken = options?.token ?? process.env.BITBUCKET_TOKEN;
    const cleanToken = rawToken ? rawToken.trim().replace(/^Bearer\s+/i, '') : undefined;
    const username = options?.username ?? process.env.BITBUCKET_USERNAME;
    const password = options?.password ?? process.env.BITBUCKET_PASSWORD;
    const requireAuth = options?.requireAuth ?? (process.env.BITBUCKET_REQUIRE_AUTH !== 'false');

    this.authResolver = options?.authResolver ?? new HierarchicalAuthResolver(
      cleanToken,
      username,
      password
    );

    this.config = {
      baseUrl: cleanBaseUrl,
      token: cleanToken,
      username,
      password,
      defaultProject: options?.defaultProject ?? process.env.BITBUCKET_DEFAULT_PROJECT,
      maxLinesPerFile: process.env.BITBUCKET_DIFF_MAX_LINES_PER_FILE 
        ? parseInt(process.env.BITBUCKET_DIFF_MAX_LINES_PER_FILE, 10) 
        : undefined,
      readOnly: options?.readOnly ?? process.env.BITBUCKET_READ_ONLY === 'true',
      customHeaders: options?.customHeaders ?? parseCustomHeaders(process.env.BITBUCKET_CUSTOM_HEADERS),
      requireAuth,
    };

    if (this.config.defaultProject) {
      logger.warn(
        '[DEPRECATION] BITBUCKET_DEFAULT_PROJECT is deprecated and will be removed in a future release. Please supply the "project" parameter explicitly in tool calls.'
      );
    }

    if (!this.config.baseUrl) {
      throw new Error('BITBUCKET_URL is required');
    }

    if (this.config.requireAuth && !this.config.token && !(this.config.username && this.config.password)) {
      throw new Error('Either BITBUCKET_TOKEN or BITBUCKET_USERNAME/PASSWORD is required');
    }

    const { httpAgent, httpsAgent } = createConnectionPoolAgents();

    // Configuration de l'instance Axios
    this.api = axios.create({
      baseURL: `${this.config.baseUrl}/rest/api/1.0`,
      httpAgent,
      httpsAgent,
      headers: {
        ...(this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {}),
        ...this.config.customHeaders,
      },
      auth: this.config.username && this.config.password
        ? { username: this.config.username, password: this.config.password }
        : undefined,
    });

    if (this.api.interceptors?.request?.use) {
      this.api.interceptors.request.use((reqConfig) => {
        const creds = this.authResolver.resolve();
        if (creds.type === 'bearer' && creds.token) {
          if (!reqConfig.headers) {
            reqConfig.headers = new axios.AxiosHeaders();
          }
          if (typeof reqConfig.headers.set === 'function') {
            reqConfig.headers.set('Authorization', `Bearer ${creds.token}`);
          } else {
            (reqConfig.headers as Record<string, string>)['Authorization'] = `Bearer ${creds.token}`;
          }
        } else if (creds.type === 'basic' && creds.username && creds.password) {
          reqConfig.auth = { username: creds.username, password: creds.password };
        }
        return reqConfig;
      });
    }

    this.setupToolHandlers();
    
    this.server.onerror = (error) => logger.error('[MCP Error]', error);
  }

  async connect(transport: Transport): Promise<void> {
    await this.server.connect(transport);
  }

  private isPullRequestInput(args: unknown): args is PullRequestInput {
    const input = args as Partial<PullRequestInput>;
    return typeof args === 'object' &&
      args !== null &&
      (input.project === undefined || typeof input.project === 'string') &&
      typeof input.repository === 'string' &&
      typeof input.title === 'string' &&
      typeof input.sourceBranch === 'string' &&
      typeof input.targetBranch === 'string' &&
      (input.description === undefined || typeof input.description === 'string') &&
      (input.reviewers === undefined || Array.isArray(input.reviewers));
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: getToolDefinitions(this.config.defaultProject).filter(
        (tool) => !this.config.readOnly || READ_ONLY_TOOLS.includes(tool.name)
      ),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        logger.info(`Called tool: ${request.params.name}`, { arguments: request.params.arguments });
        const args = request.params.arguments ?? {};

        // Check if tool is allowed in read-only mode
        if (this.config.readOnly && !READ_ONLY_TOOLS.includes(request.params.name)) {
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Tool ${request.params.name} is not available in read-only mode`
          );
        }

        // Helper function to get project with fallback to default
        const getProject = (providedProject?: string): string => {
          const project = providedProject || this.config.defaultProject;
          if (!project) {
            throw new ToolValidationError(
              "Missing required parameter 'project'. Project must be provided either as a parameter or through BITBUCKET_DEFAULT_PROJECT environment variable (use 'list_projects' to discover available projects)."
            );
          }
          return project;
        };

        switch (request.params.name) {
          case 'list_projects': {
            return await this.listProjects({
              limit: args.limit as number,
              start: args.start as number
            });
          }

          case 'list_repositories': {
            return await this.listRepositories({
              project: args.project as string,
              limit: args.limit as number,
              start: args.start as number
            });
          }

          case 'create_pull_request': {
            if (!this.isPullRequestInput(args)) {
              throw new ToolValidationError(
                'Invalid pull request input parameters'
              );
            }
            const createArgs = {
              ...args,
              project: getProject(args.project),
              sourceProject: args.sourceProject as string | undefined,
              sourceRepository: args.sourceRepository as string | undefined,
              includeDefaultReviewers: args.includeDefaultReviewers !== false
            };
            return await this.createPullRequest(createArgs);
          }

          case 'get_pull_request': {
            const getPrParams: PullRequestParams = {
              project: getProject(args.project as string),
              repository: args.repository as string,
              prId: args.prId as number
            };
            return await this.getPullRequest(getPrParams);
          }

          case 'update_pull_request': {
            return await this.updatePullRequest({
              project: getProject(args.project as string),
              repository: args.repository as string,
              prId: args.prId as number,
              title: args.title as string | undefined,
              description: args.description as string | undefined,
              reviewers: args.reviewers as string[] | undefined
            });
          }

          case 'merge_pull_request': {
            const mergePrParams: PullRequestParams = {
              project: getProject(args.project as string),
              repository: args.repository as string,
              prId: args.prId as number
            };
            return await this.mergePullRequest(mergePrParams, {
              message: args.message as string,
              strategy: args.strategy as 'merge-commit' | 'squash' | 'fast-forward'
            });
          }

          case 'decline_pull_request': {
            const declinePrParams: PullRequestParams = {
              project: getProject(args.project as string),
              repository: args.repository as string,
              prId: args.prId as number
            };
            return await this.declinePullRequest(declinePrParams, args.message as string);
          }

          case 'add_comment': {
            const commentPrParams: PullRequestParams = {
              project: getProject(args.project as string),
              repository: args.repository as string,
              prId: args.prId as number
            };
            return await this.addComment(commentPrParams, {
              text: args.text as string,
              parentId: args.parentId as number,
              state: args.state as 'OPEN' | 'PENDING' | undefined,
              severity: args.severity as 'NORMAL' | 'BLOCKER' | undefined
            });
          }

          case 'add_comment_inline': {
            const commentPrParams: PullRequestParams = {
              project: getProject(args.project as string),
              repository: args.repository as string,
              prId: args.prId as number
            };
            return await this.addCommentInline(commentPrParams, {
              text: args.text as string,
              parentId: args.parentId as number,
              filePath: args.filePath as string,
              line: args.line as number,
              lineType: args.lineType as 'ADDED' | 'REMOVED',
              state: args.state as 'OPEN' | 'PENDING' | undefined,
              severity: args.severity as 'NORMAL' | 'BLOCKER' | undefined
            });
          }

          case 'get_diff': {
            const diffPrParams: PullRequestParams = {
              project: getProject(args.project as string),
              repository: args.repository as string,
              prId: args.prId as number
            };
            return await this.getDiff(
              diffPrParams, 
              args.contextLines as number, 
              args.maxLinesPerFile as number
            );
          }

          case 'get_reviews': {
            const reviewsPrParams: PullRequestParams = {
              project: getProject(args.project as string),
              repository: args.repository as string,
              prId: args.prId as number
            };
            return await this.getReviews(reviewsPrParams, {
              start: args.start as number | undefined,
              limit: args.limit as number | undefined,
              fetchAll: args.fetchAll as boolean | undefined
            });
          }

          case 'get_activities': {
            const activitiesPrParams: PullRequestParams = {
              project: getProject(args.project as string),
              repository: args.repository as string,
              prId: args.prId as number
            };
            return await this.getActivities(activitiesPrParams, {
              start: args.start as number | undefined,
              limit: args.limit as number | undefined,
              fetchAll: args.fetchAll as boolean | undefined
            });
          }

          case 'get_comments': {
            const commentsPrParams: PullRequestParams = {
              project: getProject(args.project as string),
              repository: args.repository as string,
              prId: args.prId as number
            };
            return await this.getComments(commentsPrParams, {
              start: args.start as number | undefined,
              limit: args.limit as number | undefined,
              fetchAll: args.fetchAll as boolean | undefined
            });
          }

          case 'search': {
            return await this.search({
              query: args.query as string,
              project: args.project as string,
              repository: args.repository as string,
              type: args.type as 'code' | 'file',
              limit: args.limit as number,
              start: args.start as number
            });
          }

          case 'get_file_content': {
            return await this.getFileContent({
              project: getProject(args.project as string),
              repository: args.repository as string,
              filePath: args.filePath as string,
              branch: args.branch as string,
              limit: args.limit as number,
              start: args.start as number
            });
          }

          case 'browse_repository': {
            return await this.browseRepository({
              project: getProject(args.project as string),
              repository: args.repository as string,
              path: args.path as string,
              branch: args.branch as string,
              limit: args.limit as number
            });
          }

          case 'list_pull_requests': {
            return await this.listPullRequests({
              project: getProject(args.project as string),
              repository: args.repository as string,
              state: args.state as 'OPEN' | 'MERGED' | 'DECLINED' | 'ALL',
              author: args.author as string,
              direction: args.direction as 'INCOMING' | 'OUTGOING',
              limit: args.limit as number,
              start: args.start as number
            });
          }

          case 'list_branches': {
            return await this.listBranches({
              project: getProject(args.project as string),
              repository: args.repository as string,
              filterText: args.filterText as string,
              limit: args.limit as number,
              start: args.start as number
            });
          }

          case 'list_commits': {
            return await this.listCommits({
              project: getProject(args.project as string),
              repository: args.repository as string,
              branch: args.branch as string,
              author: args.author as string,
              limit: args.limit as number,
              start: args.start as number
            });
          }

          case 'delete_branch': {
            return await this.deleteBranch(
              getProject(args.project as string),
              args.repository as string,
              args.branch as string
            );
          }

          case 'approve_pull_request': {
            const approvePrParams: PullRequestParams = {
              project: getProject(args.project as string),
              repository: args.repository as string,
              prId: args.prId as number
            };
            return await this.approvePullRequest(approvePrParams);
          }

          case 'unapprove_pull_request': {
            const unapprovePrParams: PullRequestParams = {
              project: getProject(args.project as string),
              repository: args.repository as string,
              prId: args.prId as number
            };
            return await this.unapprovePullRequest(unapprovePrParams);
          }

          case 'edit_comment': {
            const editPrParams: PullRequestParams = {
              project: getProject(args.project as string),
              repository: args.repository as string,
              prId: args.prId as number
            };
            return await this.editComment(editPrParams, {
              commentId: args.commentId as number,
              text: args.text as string,
              version: args.version as number,
              severity: args.severity as 'NORMAL' | 'BLOCKER' | undefined
            });
          }

          case 'delete_comment': {
            const deletePrParams: PullRequestParams = {
              project: getProject(args.project as string),
              repository: args.repository as string,
              prId: args.prId as number
            };
            return await this.deleteComment(deletePrParams, {
              commentId: args.commentId as number,
              version: args.version as number
            });
          }

          case 'publish_review': {
            const reviewPrParams: PullRequestParams = {
              project: getProject(args.project as string),
              repository: args.repository as string,
              prId: args.prId as number
            };
            return await this.publishReview(reviewPrParams, {
              commentText: args.commentText as string | undefined,
              participantStatus: args.participantStatus as 'APPROVED' | 'NEEDS_WORK' | undefined
            });
          }

          case 'get_code_insights': {
            const insightsPrParams: PullRequestParams = {
              project: getProject(args.project as string),
              repository: args.repository as string,
              prId: args.prId as number
            };
            return await this.getCodeInsights(insightsPrParams);
          }

          case 'get_dashboard_pull_requests': {
            return await this.getDashboardPullRequests({
              state: args.state as DashboardPullRequestsOptions['state'],
              role: args.role as DashboardPullRequestsOptions['role'],
              participantStatus: args.participantStatus as DashboardPullRequestsOptions['participantStatus'],
              order: args.order as DashboardPullRequestsOptions['order'],
              closedSince: args.closedSince as number | undefined,
              limit: args.limit as number | undefined,
              start: args.start as number | undefined
            });
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError && error.code === ErrorCode.MethodNotFound) {
          throw error;
        }
        logger.error('Tool execution error', extractSafeErrorMeta(error));
        return formatToolError(error);
      }
    });
  }

  private async listProjects(options: ListOptions = {}) {
    const { limit = 25, start = 0 } = options;
    const response = await this.api.get('/projects', {
      params: { limit, start }
    });

    const projects = response.data.values || [];
    const summary = {
      total: response.data.size || projects.length,
      showing: projects.length,
      projects: projects.map((project: { key: string; name: string; description?: string; public: boolean; type: string }) => ({
        key: project.key,
        name: project.name,
        description: project.description,
        public: project.public,
        type: project.type
      }))
    };

    return {
      content: [{ 
        type: 'text', 
        text: JSON.stringify(summary, null, 2) 
      }]
    };
  }

  private async listRepositories(options: ListRepositoriesOptions = {}) {
    const { project, limit = 25, start = 0 } = options;
    
    let endpoint: string;
    const params = { limit, start };

    if (project || this.config.defaultProject) {
      // List repositories for a specific project
      const projectKey = project || this.config.defaultProject;
      endpoint = `/projects/${projectKey}/repos`;
    } else {
      // List all accessible repositories
      endpoint = '/repos';
    }

    const response = await this.api.get(endpoint, { params });

    const repositories = response.data.values || [];
    const summary = {
      project: project || this.config.defaultProject || 'all',
      total: response.data.size || repositories.length,
      showing: repositories.length,
      repositories: repositories.map((repo: { 
        slug: string; 
        name: string; 
        description?: string; 
        project?: { key: string }; 
        public: boolean; 
        links?: { clone?: { name: string; href: string }[] }; 
        state: string 
      }) => ({
        slug: repo.slug,
        name: repo.name,
        description: repo.description,
        project: repo.project?.key,
        public: repo.public,
        cloneUrl: repo.links?.clone?.find((link: { name: string; href: string }) => link.name === 'http')?.href,
        state: repo.state
      }))
    };

    return {
      content: [{ 
        type: 'text', 
        text: JSON.stringify(summary, null, 2) 
      }]
    };
  }

  private async createPullRequest(input: PullRequestInput) {
    const sourceProject = input.sourceProject ?? input.project;
    const sourceRepo = input.sourceRepository ?? input.repository;

    const reviewers = input.reviewers?.map(username => ({ user: { name: username } })) ?? [];

    if (input.includeDefaultReviewers !== false) {
      try {
        const targetRepoResponse = await this.api.get(
          `/projects/${input.project}/repos/${input.repository}`
        );
        const targetRepoId = targetRepoResponse.data.id;

        const sourceRepoId = sourceProject === input.project && sourceRepo === input.repository
          ? targetRepoId
          : (await this.api.get(`/projects/${sourceProject}/repos/${sourceRepo}`)).data.id;

        const defaultReviewersResponse = await this.api.get(
          `/projects/${input.project}/repos/${input.repository}/reviewers`,
          {
            baseURL: `${this.config.baseUrl}/rest/default-reviewers/1.0`,
            params: {
              sourceRepoId,
              targetRepoId,
              sourceRefId: input.sourceBranch,
              targetRefId: input.targetBranch
            }
          }
        );

        const defaultReviewers = (defaultReviewersResponse.data ?? [])
          .map((user: { name: string }) => ({ user: { name: user.name } }));

        const existingNames = new Set(reviewers.map(r => r.user.name));
        for (const dr of defaultReviewers) {
          if (!existingNames.has(dr.user.name)) {
            reviewers.push(dr);
          }
        }
      } catch {
        logger.warn('Could not fetch default reviewers, proceeding without them');
      }
    }

    const response = await this.api.post(
      `/projects/${input.project}/repos/${input.repository}/pull-requests`,
      {
        title: input.title,
        description: input.description,
        fromRef: {
          id: `refs/heads/${input.sourceBranch}`,
          repository: {
            slug: sourceRepo,
            project: { key: sourceProject }
          }
        },
        toRef: {
          id: `refs/heads/${input.targetBranch}`,
          repository: {
            slug: input.repository,
            project: { key: input.project }
          }
        },
        reviewers: reviewers.length > 0 ? reviewers : undefined
      }
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
    };
  }

  private async updatePullRequest(input: UpdatePullRequestInput) {
    const { project, repository, prId } = input;

    if (!project || !repository || !prId) {
      throw new ToolValidationError(
        'Project, repository, and prId are required'
      );
    }

    const current = await this.api.get(
      `/projects/${project}/repos/${repository}/pull-requests/${prId}`
    );

    const updated = {
      ...current.data,
      title: input.title ?? current.data.title,
      description: input.description ?? current.data.description,
      reviewers: input.reviewers
        ? input.reviewers.map(username => ({ user: { name: username } }))
        : current.data.reviewers
    };

    const response = await this.api.put(
      `/projects/${project}/repos/${repository}/pull-requests/${prId}`,
      updated
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
    };
  }

  private async getPullRequest(params: PullRequestParams) {
    const { project, repository, prId } = params;

    if (!project || !repository || !prId) {
      throw new ToolValidationError(
        'Project, repository, and prId are required'
      );
    }
    
    const response = await this.api.get(
      `/projects/${project}/repos/${repository}/pull-requests/${prId}`
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
    };
  }

  private async mergePullRequest(params: PullRequestParams, options: MergeOptions = {}) {
    const { project, repository, prId } = params;

    if (!project || !repository || !prId) {
      throw new ToolValidationError(
        'Project, repository, and prId are required'
      );
    }

    const { message, strategy = 'merge-commit' } = options;

    // Fetch current PR version for optimistic locking (required by Bitbucket Server API)
    const prResponse = await this.api.get(
      `/projects/${project}/repos/${repository}/pull-requests/${prId}`
    );
    const version = prResponse.data.version;

    const response = await this.api.post(
      `/projects/${project}/repos/${repository}/pull-requests/${prId}/merge`,
      {
        version,
        message,
        strategy
      }
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
    };
  }

  private async declinePullRequest(params: PullRequestParams, message?: string) {
    const { project, repository, prId } = params;

    if (!project || !repository || !prId) {
      throw new ToolValidationError(
        'Project, repository, and prId are required'
      );
    }

    // Fetch current PR version for optimistic locking (required by Bitbucket Server API)
    const prResponse = await this.api.get(
      `/projects/${project}/repos/${repository}/pull-requests/${prId}`
    );
    const version = prResponse.data.version;

    const response = await this.api.post(
      `/projects/${project}/repos/${repository}/pull-requests/${prId}/decline`,
      {
        version,
        message
      }
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
    };
  }

  private async addComment(params: PullRequestParams, options: CommentOptions) {
    const { project, repository, prId } = params;

    if (!project || !repository || !prId) {
      throw new ToolValidationError(
        'Project, repository, and prId are required'
      );
    }

    const { text, parentId, state, severity } = options;

    const response = await this.api.post(
      `/projects/${project}/repos/${repository}/pull-requests/${prId}/comments`,
      {
        text,
        parent: parentId ? { id: parentId } : undefined,
        ...(state && { state }),
        ...(severity && { severity })
      }
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
    };
  }

  private async addCommentInline(params: PullRequestParams, options: InlineCommentOptions) {
    const { project, repository, prId } = params;

    if (!project || !repository || !prId || !options.filePath || !options.line || !options.lineType) {
      throw new ToolValidationError(
        'Project, repository, prId, filePath, line, and lineType are required'
      );
    }

    const { text, parentId, state, severity } = options;

    const response = await this.api.post(
      `/projects/${project}/repos/${repository}/pull-requests/${prId}/comments`,
      {
        text,
        parent: parentId ? { id: parentId } : undefined,
        ...(state && { state }),
        ...(severity && { severity }),
        anchor: {
          path: options.filePath,
          lineType: options.lineType,
          line: options.line,
          diffType: 'EFFECTIVE',
          fileType: 'TO',
        }
      }
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
    };
  }

  private async editComment(params: PullRequestParams, options: EditCommentOptions) {
    const { project, repository, prId } = params;

    if (!project || !repository || !prId) {
      throw new ToolValidationError(
        'Project, repository, and prId are required'
      );
    }

    const response = await this.api.put(
      `/projects/${project}/repos/${repository}/pull-requests/${prId}/comments/${options.commentId}`,
      {
        text: options.text,
        version: options.version,
        ...(options.severity && { severity: options.severity })
      }
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
    };
  }

  private async deleteComment(params: PullRequestParams, options: DeleteCommentOptions) {
    const { project, repository, prId } = params;

    if (!project || !repository || !prId) {
      throw new ToolValidationError(
        'Project, repository, and prId are required'
      );
    }

    await this.api.delete(
      `/projects/${project}/repos/${repository}/pull-requests/${prId}/comments/${options.commentId}`,
      { params: { version: options.version } }
    );

    return {
      content: [{ type: 'text', text: JSON.stringify({ deleted: true, commentId: options.commentId }, null, 2) }]
    };
  }

  private async publishReview(params: PullRequestParams, options: PublishReviewOptions) {
    const { project, repository, prId } = params;

    if (!project || !repository || !prId) {
      throw new ToolValidationError(
        'Project, repository, and prId are required'
      );
    }

    const response = await this.api.put(
      `/projects/${project}/repos/${repository}/pull-requests/${prId}/review`,
      {
        commentText: options.commentText ?? null,
        ...(options.participantStatus && { participantStatus: options.participantStatus })
      }
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(response.data ?? { published: true }, null, 2) }]
    };
  }

  private async getCodeInsights(params: PullRequestParams) {
    const { project, repository, prId } = params;

    if (!project || !repository || !prId) {
      throw new ToolValidationError(
        'Project, repository, and prId are required'
      );
    }

    const reportsResponse = await this.api.get(
      `/projects/${project}/repos/${repository}/pull-requests/${prId}/reports`,
      { baseURL: `${this.config.baseUrl}/rest/insights/latest` }
    );

    const reports = reportsResponse.data.values ?? [];
    const result: { reports: unknown[]; annotations: Record<string, unknown[]> } = {
      reports,
      annotations: {}
    };

    for (const report of reports) {
      const reportKey = (report as { key: string }).key;
      try {
        const annotationsResponse = await this.api.get(
          `/projects/${project}/repos/${repository}/pull-requests/${prId}/reports/${reportKey}/annotations`,
          { baseURL: `${this.config.baseUrl}/rest/insights/latest` }
        );
        result.annotations[reportKey] = annotationsResponse.data.values ?? [];
      } catch {
        result.annotations[reportKey] = [];
      }
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }

  private async getDashboardPullRequests(options: DashboardPullRequestsOptions = {}) {
    const { limit = 25, start = 0, state, role, participantStatus, order, closedSince } = options;

    const params: Record<string, unknown> = { limit, start };
    if (state) params.state = state;
    if (role) params.role = role;
    if (participantStatus) params.participantStatus = participantStatus;
    if (order) params.order = order;
    if (closedSince) params.closedSince = closedSince;

    const response = await this.api.get('/dashboard/pull-requests', { params });

    return {
      content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
    };
  }

  private truncateDiff(diffContent: string, maxLinesPerFile: number): string {
    if (!maxLinesPerFile || maxLinesPerFile <= 0) {
      return diffContent;
    }

    const lines = diffContent.split('\n');
    const result: string[] = [];
    let currentFileLines: string[] = [];
    let currentFileName = '';
    let inFileContent = false;

    for (const line of lines) {
      // Detect file headers (diff --git, index, +++, ---)
      if (line.startsWith('diff --git ')) {
        // Process previous file if any
        if (currentFileLines.length > 0) {
          result.push(...this.truncateFileSection(currentFileLines, currentFileName, maxLinesPerFile));
          currentFileLines = [];
        }
        
        // Extract filename for context
        const match = line.match(/diff --git a\/(.+) b\/(.+)/);
        currentFileName = match ? match[2] : 'unknown';
        inFileContent = false;
        
        // Always include file headers
        result.push(line);
      } else if (line.startsWith('index ') || line.startsWith('+++') || line.startsWith('---')) {
        // Always include file metadata
        result.push(line);
      } else if (line.startsWith('@@')) {
        // Hunk header - marks start of actual file content
        inFileContent = true;
        currentFileLines.push(line);
      } else if (inFileContent) {
        // Collect file content lines for potential truncation
        currentFileLines.push(line);
      } else {
        // Other lines (empty lines between files, etc.)
        result.push(line);
      }
    }

    // Process the last file
    if (currentFileLines.length > 0) {
      result.push(...this.truncateFileSection(currentFileLines, currentFileName, maxLinesPerFile));
    }

    return result.join('\n');
  }

  private truncateFileSection(fileLines: string[], fileName: string, maxLines: number): string[] {
    if (fileLines.length <= maxLines) {
      return fileLines;
    }

    // Count actual content lines (excluding hunk headers)
    const contentLines = fileLines.filter(line => !line.startsWith('@@'));
    const hunkHeaders = fileLines.filter(line => line.startsWith('@@'));

    if (contentLines.length <= maxLines) {
      return fileLines; // No need to truncate if content is within limit
    }

    // Smart truncation: show beginning and end
    const showAtStart = Math.floor(maxLines * 0.6); // 60% at start
    const showAtEnd = Math.floor(maxLines * 0.4);   // 40% at end
    const truncatedCount = contentLines.length - showAtStart - showAtEnd;

    const result: string[] = [];
    
    // Add hunk headers first
    result.push(...hunkHeaders);
    
    // Add first portion
    result.push(...contentLines.slice(0, showAtStart));
    
    // Add truncation message
    result.push('');
    result.push(`[*** FILE TRUNCATED: ${truncatedCount} lines hidden from ${fileName} ***]`);
    result.push(`[*** File had ${contentLines.length} total lines, showing first ${showAtStart} and last ${showAtEnd} ***]`);
    result.push(`[*** Use maxLinesPerFile=0 to see complete diff ***]`);
    result.push('');
    
    // Add last portion
    result.push(...contentLines.slice(-showAtEnd));

    return result;
  }

  private async getDiff(params: PullRequestParams, contextLines: number = 10, maxLinesPerFile?: number) {
    const { project, repository, prId } = params;
    
    if (!project || !repository || !prId) {
      throw new ToolValidationError(
        'Project, repository, and prId are required'
      );
    }
    
    const response = await this.api.get(
      `/projects/${project}/repos/${repository}/pull-requests/${prId}/diff`,
      {
        params: { contextLines },
        headers: { Accept: 'text/plain' }
      }
    );

    // Determine max lines per file: parameter > env var > no limit
    const effectiveMaxLines = maxLinesPerFile !== undefined 
      ? maxLinesPerFile 
      : this.config.maxLinesPerFile;

    const diffContent = effectiveMaxLines 
      ? this.truncateDiff(response.data, effectiveMaxLines)
      : response.data;

    return {
      content: [{ type: 'text', text: diffContent }]
    };
  }

  private async fetchAllActivityValues(
    project: string,
    repository: string,
    prId: number
  ): Promise<BitbucketActivity[]> {
    const allValues: BitbucketActivity[] = [];
    let nextStart = 0;
    let isLastPage = false;

    while (!isLastPage) {
      const response = await this.api.get(
        `/projects/${project}/repos/${repository}/pull-requests/${prId}/activities`,
        { params: { start: nextStart, limit: 100 } }
      );
      allValues.push(...(response.data.values as BitbucketActivity[]));
      isLastPage = response.data.isLastPage as boolean;
      nextStart = (response.data.nextPageStart as number) ?? 0;
    }

    return allValues;
  }

  private async getReviews(params: PullRequestParams, pagination: ActivitiesPaginationOptions = {}) {
    const { project, repository, prId } = params;

    if (!project || !repository || !prId) {
      throw new ToolValidationError(
        'Project, repository, and prId are required'
      );
    }

    const { start, limit, fetchAll } = pagination;

    if (fetchAll) {
      const allValues = await this.fetchAllActivityValues(project, repository, prId);
      const reviews = allValues.filter(
        (activity) => activity.action === 'APPROVED' || activity.action === 'REVIEWED'
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(reviews, null, 2) }]
      };
    }

    const apiParams: Record<string, number> = {};

    if (start !== undefined) {
      apiParams.start = start;
    }

    if (limit !== undefined) {
      apiParams.limit = limit;
    }

    const response = await this.api.get(
      `/projects/${project}/repos/${repository}/pull-requests/${prId}/activities`,
      { params: apiParams }
    );

    const reviews = (response.data.values as BitbucketActivity[]).filter(
      (activity) => activity.action === 'APPROVED' || activity.action === 'REVIEWED'
    );

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          values: reviews,
          isLastPage: response.data.isLastPage,
          nextPageStart: response.data.nextPageStart
        }, null, 2)
      }]
    };
  }

  private async getActivities(params: PullRequestParams, pagination: ActivitiesPaginationOptions = {}) {
    const { project, repository, prId } = params;

    if (!project || !repository || !prId) {
      throw new ToolValidationError(
        'Project, repository, and prId are required'
      );
    }

    const { start, limit, fetchAll } = pagination;

    if (fetchAll) {
      const allValues = await this.fetchAllActivityValues(project, repository, prId);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ values: allValues, isLastPage: true, size: allValues.length }, null, 2)
        }]
      };
    }

    const apiParams: Record<string, number> = {};

    if (start !== undefined) {
      apiParams.start = start;
    }

    if (limit !== undefined) {
      apiParams.limit = limit;
    }

    const response = await this.api.get(
      `/projects/${project}/repos/${repository}/pull-requests/${prId}/activities`,
      { params: apiParams }
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
    };
  }

  private async getComments(params: PullRequestParams, pagination: ActivitiesPaginationOptions = {}) {
    const { project, repository, prId } = params;

    if (!project || !repository || !prId) {
      throw new ToolValidationError(
        'Project, repository, and prId are required'
      );
    }

    const { start, limit, fetchAll } = pagination;

    if (fetchAll) {
      const allValues = await this.fetchAllActivityValues(project, repository, prId);
      const comments = allValues.filter((activity) => activity.action === 'COMMENTED');
      return {
        content: [{ type: 'text', text: JSON.stringify(comments, null, 2) }]
      };
    }

    const apiParams: Record<string, number> = {};

    if (start !== undefined) {
      apiParams.start = start;
    }

    if (limit !== undefined) {
      apiParams.limit = limit;
    }

    const response = await this.api.get(
      `/projects/${project}/repos/${repository}/pull-requests/${prId}/activities`,
      { params: apiParams }
    );

    const comments = (response.data.values as BitbucketActivity[]).filter(
      (activity) => activity.action === 'COMMENTED'
    );

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          values: comments,
          isLastPage: response.data.isLastPage,
          nextPageStart: response.data.nextPageStart
        }, null, 2)
      }]
    };
  }

  private async search(options: SearchOptions) {
    const { query, project, repository, type, limit = 25, start = 0 } = options;
    
    if (!query) {
      throw new ToolValidationError(
        'Query parameter is required'
      );
    }

    // Build the search query with filters
    let searchQuery = query;
    
    // Add project filter if specified
    if (project) {
      searchQuery = `${searchQuery} project:${project}`;
    }
    
    // Add repository filter if specified (requires project)
    if (repository && project) {
      searchQuery = `${searchQuery} repo:${project}/${repository}`;
    }
    
    // Add file extension filter if type is specified
    if (type === 'file') {
      // For file searches, wrap query in quotes for exact filename matching
      if (!query.includes('ext:') && !query.startsWith('"')) {
        searchQuery = `"${query}"`;
        if (project) searchQuery += ` project:${project}`;
        if (repository && project) searchQuery += ` repo:${project}/${repository}`;
      }
    } else if (type === 'code' && !query.includes('ext:')) {
      // For code searches, add common extension filters if not specified
      // This can be enhanced based on user needs
    }

    const requestBody = {
      query: searchQuery,
      entities: {
        code: {
          start,
          limit: Math.min(limit, 100)
        }
      }
    };

    try {
      // Use full URL for search API since it uses different base path
      const searchUrl = `${this.config.baseUrl}/rest/search/latest/search`;
      const response = await axios.post(searchUrl, requestBody, {
        headers: this.config.token
          ? { 
              Authorization: `Bearer ${this.config.token}`,
              'Content-Type': 'application/json'
            }
          : { 'Content-Type': 'application/json' },
        auth: this.config.username && this.config.password
          ? { username: this.config.username, password: this.config.password }
          : undefined,
      });
      
      const codeResults = response.data.code || {};
      const searchResults = {
        query: searchQuery,
        originalQuery: query,
        project: project || 'global',
        repository: repository || 'all',
        type: type || 'code',
        scope: response.data.scope || {},
        total: codeResults.count || 0,
        showing: codeResults.values?.length || 0,
        isLastPage: codeResults.isLastPage || true,
        nextStart: codeResults.nextStart || null,
        results: codeResults.values?.map((result: SearchResultItem) => ({
          repository: result.repository,
          file: result.file,
          hitCount: result.hitCount || 0,
          pathMatches: result.pathMatches || [],
          hitContexts: result.hitContexts || []
        })) || []
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(searchResults, null, 2) }]
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          throw new ToolExecutionError(
            'Search API endpoint not available on this Bitbucket instance'
          );
        }
        // Handle specific search API errors
        const errorData = error.response?.data as { errors?: Array<{ message?: string }> } | undefined;
        if (errorData?.errors && errorData.errors.length > 0) {
          const firstError = errorData.errors[0];
          throw new ToolValidationError(
            `Search error: ${firstError?.message || 'Invalid search query'}`
          );
        }
      }
      throw error;
    }
  }

  private async getFileContent(options: FileContentOptions) {
    const { project, repository, filePath, branch, limit = 100, start = 0 } = options;
    
    if (!project || !repository || !filePath) {
      throw new ToolValidationError(
        'Project, repository, and filePath are required'
      );
    }

    const params: Record<string, string | number> = {
      limit: Math.min(limit, 1000),
      start
    };

    if (branch) {
      params.at = branch;
    }

    const response = await this.api.get(
      `/projects/${project}/repos/${repository}/browse/${filePath}`,
      { params }
    );

    const fileContent = {
      project,
      repository,
      filePath,
      branch: branch || 'default',
      isLastPage: response.data.isLastPage,
      size: response.data.size,
      showing: response.data.lines?.length || 0,
      startLine: start,
      lines: response.data.lines?.map((line: { text: string }) => line.text) || []
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(fileContent, null, 2) }]
    };
  }

  private async browseRepository(options: { project: string; repository: string; path?: string; branch?: string; limit?: number }) {
    const { project, repository, path = '', branch, limit = 50 } = options;
    
    if (!project || !repository) {
      throw new ToolValidationError(
        'Project and repository are required'
      );
    }

    const params: Record<string, string | number> = {
      limit
    };

    if (branch) {
      params.at = branch;
    }

    const browsePath = path ? `/${path}` : '';
    const response = await this.api.get(
      `/projects/${project}/repos/${repository}/browse${browsePath}`,
      { params }
    );

    const children = response.data.children || {};
    const browseResults = {
      project,
      repository,
      path: path || 'root',
      branch: branch || response.data.revision || 'default',
      isLastPage: children.isLastPage || false,
      size: children.size || 0,
      showing: children.values?.length || 0,
      items: children.values?.map((item: { 
        path: { name: string; toString: string }; 
        type: string; 
        size?: number 
      }) => ({
        name: item.path.name,
        path: item.path.toString,
        type: item.type,
        size: item.size
      })) || []
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(browseResults, null, 2) }]
    };
  }

  private async listPullRequests(options: PullRequestListOptions) {
    const { project, repository, state = 'OPEN', author, direction, limit = 25, start = 0 } = options;

    if (!project || !repository) {
      throw new ToolValidationError(
        'Project and repository are required'
      );
    }

    const params: Record<string, string | number> = { limit, start };
    if (state) {
      params.state = state;
    }
    if (direction) {
      params.direction = direction;
    }

    const response = await this.api.get(
      `/projects/${project}/repos/${repository}/pull-requests`,
      { params }
    );

    let pullRequests = response.data.values || [];

    // Client-side author filter (matches against name, slug, or displayName)
    if (author) {
      const authorLower = author.toLowerCase();
      pullRequests = pullRequests.filter((pr: { author: { user: { name: string; slug: string; displayName: string } } }) => {
        const nameMatch = pr.author?.user?.name?.toLowerCase() === authorLower;
        const slugMatch = pr.author?.user?.slug?.toLowerCase() === authorLower;
        const displayMatch = pr.author?.user?.displayName?.toLowerCase().includes(authorLower);
        return nameMatch || slugMatch || displayMatch;
      });
    }

    const summary = {
      project,
      repository,
      state: state || 'OPEN',
      authorFilter: author || null,
      total: response.data.size || response.data.values?.length || 0,
      showing: pullRequests.length,
      isLastPage: response.data.isLastPage,
      nextPageStart: response.data.nextPageStart,
      pullRequests: pullRequests.map((pr: {
        id: number;
        title: string;
        state: string;
        createdDate: number;
        updatedDate: number;
        author: { user: { name: string; displayName: string } };
        fromRef: { displayId: string };
        toRef: { displayId: string };
        reviewers: { user: { name: string }; status: string }[];
      }) => ({
        id: pr.id,
        title: pr.title,
        state: pr.state,
        author: pr.author?.user?.displayName || pr.author?.user?.name,
        sourceBranch: pr.fromRef?.displayId,
        targetBranch: pr.toRef?.displayId,
        createdDate: pr.createdDate,
        updatedDate: pr.updatedDate,
        reviewers: pr.reviewers?.map((r: { user: { name: string }; status: string }) => ({
          name: r.user?.name,
          status: r.status
        })) || []
      }))
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }]
    };
  }

  private async listBranches(options: BranchListOptions) {
    const { project, repository, filterText, limit = 25, start = 0 } = options;

    if (!project || !repository) {
      throw new ToolValidationError(
        'Project and repository are required'
      );
    }

    const params: Record<string, string | number> = { limit, start };
    if (filterText) {
      params.filterText = filterText;
    }

    // Fetch branches and default branch in parallel
    const [branchesResponse, defaultBranchResponse] = await Promise.all([
      this.api.get(`/projects/${project}/repos/${repository}/branches`, { params }),
      this.api.get(`/projects/${project}/repos/${repository}/default-branch`).catch(() => null)
    ]);

    const defaultBranchId = defaultBranchResponse?.data?.id;
    const branches = branchesResponse.data.values || [];

    const summary = {
      project,
      repository,
      defaultBranch: defaultBranchResponse?.data?.displayId || null,
      total: branchesResponse.data.size || branches.length,
      showing: branches.length,
      isLastPage: branchesResponse.data.isLastPage,
      nextPageStart: branchesResponse.data.nextPageStart,
      branches: branches.map((branch: { displayId: string; id: string; latestCommit: string }) => ({
        name: branch.displayId,
        id: branch.id,
        latestCommit: branch.latestCommit,
        isDefault: branch.id === defaultBranchId
      }))
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }]
    };
  }

  private async listCommits(options: CommitListOptions) {
    const { project, repository, branch, author, limit = 25, start = 0 } = options;

    if (!project || !repository) {
      throw new ToolValidationError(
        'Project and repository are required'
      );
    }

    const params: Record<string, string | number> = { limit, start };
    if (branch) {
      params.until = `refs/heads/${branch}`;
    }

    const response = await this.api.get(
      `/projects/${project}/repos/${repository}/commits`,
      { params }
    );

    let commits = response.data.values || [];

    // Client-side author filter (API doesn't support server-side author filtering)
    if (author) {
      const authorLower = author.toLowerCase();
      commits = commits.filter((commit: { author: { name: string; emailAddress?: string } }) => {
        const nameMatch = commit.author?.name?.toLowerCase().includes(authorLower);
        const emailMatch = commit.author?.emailAddress?.toLowerCase().includes(authorLower);
        return nameMatch || emailMatch;
      });
    }

    const summary = {
      project,
      repository,
      branch: branch || 'default',
      authorFilter: author || null,
      total: response.data.size || response.data.values?.length || 0,
      showing: commits.length,
      isLastPage: response.data.isLastPage,
      nextPageStart: response.data.nextPageStart,
      commits: commits.map((commit: { id: string; displayId: string; message: string; author: { name: string; emailAddress?: string }; authorTimestamp: number; parents?: { id: string }[] }) => ({
        id: commit.id,
        displayId: commit.displayId,
        message: commit.message,
        author: commit.author,
        authorTimestamp: commit.authorTimestamp,
        parents: commit.parents?.map((p: { id: string }) => p.id) || []
      }))
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }]
    };
  }

  private async deleteBranch(project: string, repository: string, branch: string) {
    if (!project || !repository || !branch) {
      throw new ToolValidationError(
        'Project, repository, and branch are required'
      );
    }

    // Pre-check: prevent deletion of default branch
    try {
      const defaultBranchResponse = await this.api.get(
        `/projects/${project}/repos/${repository}/default-branch`
      );
      if (defaultBranchResponse.data?.displayId === branch) {
        throw new ToolValidationError(
          `Cannot delete the default branch "${branch}". Change the default branch first.`
        );
      }
    } catch (error) {
      // Re-throw validation errors
      if (error instanceof ToolValidationError || error instanceof McpError) throw error;
      // Ignore other errors (e.g., 404 on empty repos) and proceed
    }

    // branch-utils API uses a different base path than /rest/api/1.0
    const url = `${this.config.baseUrl}/rest/branch-utils/1.0/projects/${project}/repos/${repository}/branches`;

    await axios.delete(url, {
      data: { name: `refs/heads/${branch}` },
      headers: this.config.token
        ? {
            Authorization: `Bearer ${this.config.token}`,
            'Content-Type': 'application/json'
          }
        : { 'Content-Type': 'application/json' },
      auth: this.config.username && this.config.password
        ? { username: this.config.username, password: this.config.password }
        : undefined,
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: `Branch "${branch}" deleted from ${project}/${repository}`
        }, null, 2)
      }]
    };
  }

  private async approvePullRequest(params: PullRequestParams) {
    const { project, repository, prId } = params;

    if (!project || !repository || !prId) {
      throw new ToolValidationError(
        'Project, repository, and prId are required'
      );
    }

    const response = await this.api.post(
      `/projects/${project}/repos/${repository}/pull-requests/${prId}/approve`,
      {},
      { headers: { 'Content-Type': 'application/json' } }
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
    };
  }

  private async unapprovePullRequest(params: PullRequestParams) {
    const { project, repository, prId } = params;

    if (!project || !repository || !prId) {
      throw new ToolValidationError(
        'Project, repository, and prId are required'
      );
    }

    const response = await this.api.delete(
      `/projects/${project}/repos/${repository}/pull-requests/${prId}/approve`,
      { headers: { 'Content-Type': 'application/json' } }
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Bitbucket MCP server running on stdio');
  }
}

// Entry point — only runs when this module is executed directly, not when imported.
if (
  process.argv[1] && 
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  const getCliArg = (flag: string): string | undefined => {
    const prefix = `--${flag}=`;
    for (let i = 2; i < process.argv.length; i++) {
      const arg = process.argv[i];
      if (arg.startsWith(prefix)) {
        return arg.substring(prefix.length);
      }
      if (arg === `--${flag}` && i + 1 < process.argv.length) {
        return process.argv[i + 1];
      }
    }
    return undefined;
  };

  const transport = getCliArg('transport') || process.env.MCP_TRANSPORT || 'stdio';
  const portStr = getCliArg('port') || process.env.PORT || '3000';
  const port = parseInt(portStr, 10);
  const host = getCliArg('host') || process.env.HOST || '0.0.0.0';

  if (transport === 'http') {
    import('./http.js')
      .then(({ startHttpServer }) => startHttpServer(port, host))
      .catch((error) => {
        logger.error('HTTP server error', error);
        console.error('HTTP server error:', error);
        process.exit(1);
      });
  } else {
    const server = new BitbucketServer();
    server.run().catch((error) => {
      logger.error('Server error', error);
      process.exit(1);
    });
  }
}