import { AxiosInstance } from 'axios';

export interface PullRequestParams {
  number: number;
  html_url?: string;
  body?: string;
  base: {
    ref: string;
  };
  head: {
    ref: string;
  };
  changed_files?: number;
  additions?: number;
  title?: string;
  assignees: {
    login: string;
  }[];
  requested_reviewers: {
    login: string;
  }[];
  [key: string]: unknown;
}

export enum StoryType {
  Feature = 'feature',
  Bug = 'bug',
  Chore = 'chore',
  Release = 'release',
}

export interface Label {
  name: string;
}

export const enum StoryState {
  Accepted = 'accepted',
  Delivered = 'delivered',
  Finished = 'finished',
  Planned = 'planned',
  Rejected = 'rejected',
  Started = 'started',
  Unscheduled = 'unscheduled',
  Unstarted = 'unstarted',
}

export namespace JIRA {
  export interface IssueStatus {
    self: string;
    description: string;
    iconUrl: string;
    name: string;
    id: string;
    statusCategory: {
      self: string;
      id: number;
      key: string;
      colorName: string;
      name: string;
    };
  }

  export interface IssuePriority {
    self: string;
    iconUrl: string;
    name: string;
    id: string;
  }

  export interface IssueType {
    self: string;
    id: string;
    description: string;
    iconUrl: string;
    name: string;
    subtask: boolean;
    avatarId: number;
  }

  export interface IssueProject {
    self: string;
    key: string;
    name: string;
  }

  export interface Issue {
    id: string;
    key: string;
    self: string;
    status: string;
    fields: {
      summary: string;
      status: IssueStatus;
      priority: IssuePriority;
      issuetype: IssueType;
      project: IssueProject;
      labels: string[];
      [k: string]: unknown;
    };
  }
}

export interface JIRADetails {
  key: string;
  summary: string;
  url: string;
  status: string;
  statusId: string;
  type: {
    name: string;
    icon: string;
  };
  project: {
    name: string;
    url: string;
    key: string;
  };
  estimate: string | number;
  labels: readonly { name: string; url: string }[];
}

export interface JIRALintActionInputs {
  JIRA_TOKEN: string;
  JIRA_BASE_URL: string;
  GITHUB_TOKEN: string;
  BRANCH_IGNORE_PATTERN: string;
  SKIP_COMMENTS: boolean;
  PR_THRESHOLD: number;
  VALIDATE_ISSUE_STATUS: boolean;
  ALLOWED_ISSUE_STATUSES: string;
  IS_MERGE: boolean;
}

export interface JIRAClient {
  client: AxiosInstance;
  /** Get complete JIRA Issue details. */
  getIssue: (key: string) => Promise<JIRA.Issue>;
  /** transition issue */
  transitionIssue: (key: string, transitonId: string) => Promise<void>
  /** Get required details to display in PR. */
  getTicketDetails: (key: string) => Promise<JIRADetails>;
}
