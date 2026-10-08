import { describe, it, expect } from 'vitest';
import { getToolDefinitions, READ_ONLY_TOOLS } from '../schemas.js';

describe('Tool Schemas (Dynamic Project Requirements)', () => {
  const REPO_PR_TOOL_NAMES = [
    'create_pull_request',
    'update_pull_request',
    'get_pull_request',
    'merge_pull_request',
    'decline_pull_request',
    'add_comment',
    'add_comment_inline',
    'get_diff',
    'get_reviews',
    'get_activities',
    'get_comments',
    'get_file_content',
    'browse_repository',
    'list_pull_requests',
    'list_branches',
    'list_commits',
    'delete_branch',
    'approve_pull_request',
    'unapprove_pull_request',
    'edit_comment',
    'delete_comment',
    'publish_review',
    'get_code_insights',
  ];

  describe('When defaultProject is unset (Central Multi-Project Deployment)', () => {
    const tools = getToolDefinitions(undefined);
    const toolMap = new Map(tools.map((t) => [t.name, t]));

    it('should generate all 27 tools', () => {
      expect(tools.length).toBe(27);
    });

    it('should make "project" mandatory in required array for all repository/PR tools', () => {
      for (const toolName of REPO_PR_TOOL_NAMES) {
        const tool = toolMap.get(toolName);
        expect(tool, `Tool ${toolName} should exist`).toBeDefined();
        const required = tool?.inputSchema.required ?? [];
        expect(
          required,
          `Tool ${toolName} must have 'project' in required array when defaultProject is unset`
        ).toContain('project');

        const projectProp = (tool?.inputSchema.properties as Record<string, { description?: string }>)?.[
          'project'
        ];
        expect(projectProp?.description).toContain('Required to identify the repository');
      }
    });

    it('should keep "project" optional for cross-project tools (list_repositories, search)', () => {
      const listRepos = toolMap.get('list_repositories');
      expect(listRepos?.inputSchema.required ?? []).not.toContain('project');

      const search = toolMap.get('search');
      expect(search?.inputSchema.required ?? []).not.toContain('project');
      expect(search?.inputSchema.required).toContain('query');
    });

    it('should not define "project" parameter on global tools', () => {
      const listProjects = toolMap.get('list_projects');
      expect((listProjects?.inputSchema.properties as Record<string, unknown>)?.[
        'project'
      ]).toBeUndefined();

      const dashboard = toolMap.get('get_dashboard_pull_requests');
      expect((dashboard?.inputSchema.properties as Record<string, unknown>)?.[
        'project'
      ]).toBeUndefined();
    });
  });

  describe('When defaultProject is set (Legacy Single-Project Deployment)', () => {
    const defaultProject = 'MYPROJ';
    const tools = getToolDefinitions(defaultProject);
    const toolMap = new Map(tools.map((t) => [t.name, t]));

    it('should NOT require "project" in required array for repository/PR tools', () => {
      for (const toolName of REPO_PR_TOOL_NAMES) {
        const tool = toolMap.get(toolName);
        expect(tool, `Tool ${toolName} should exist`).toBeDefined();
        const required = tool?.inputSchema.required ?? [];
        expect(
          required,
          `Tool ${toolName} should NOT require 'project' when defaultProject is set`
        ).not.toContain('project');

        const projectProp = (tool?.inputSchema.properties as Record<string, { description?: string }>)?.[
          'project'
        ];
        expect(projectProp?.description).toContain(`Defaults to "${defaultProject}" if omitted`);
      }
    });

    it('should still require other mandatory fields (e.g. repository, prId)', () => {
      const getPr = toolMap.get('get_pull_request');
      expect(getPr?.inputSchema.required).toEqual(['repository', 'prId']);

      const createPr = toolMap.get('create_pull_request');
      expect(createPr?.inputSchema.required).toEqual([
        'repository',
        'title',
        'sourceBranch',
        'targetBranch',
      ]);
    });
  });

  describe('READ_ONLY_TOOLS list', () => {
    it('should match the exact list of 15 non-mutating tools', () => {
      expect(READ_ONLY_TOOLS.length).toBe(15);
      expect(READ_ONLY_TOOLS).toContain('list_projects');
      expect(READ_ONLY_TOOLS).toContain('list_repositories');
      expect(READ_ONLY_TOOLS).toContain('get_pull_request');
      expect(READ_ONLY_TOOLS).not.toContain('create_pull_request');
      expect(READ_ONLY_TOOLS).not.toContain('delete_branch');
      expect(READ_ONLY_TOOLS).not.toContain('merge_pull_request');
    });
  });
});

