import * as core from '@actions/core';
import * as github from '@actions/github';
import { PullsUpdateParams, IssuesCreateCommentParams } from '@octokit/rest';

import {
  addComment,
  addLabels,
  getHugePrComment,
  getJIRAClient,
  getJIRAIssueKeys,
  getPRDescription,
  getPRTitleComment,
  isHumongousPR,
  shouldSkipBranchLint,
  shouldUpdatePRDescription,
  updatePrDetails,
  // isIssueStatusValid,
  // getInvalidIssueStatusComment,
  addAssignees,
} from './utils';
import { PullRequestParams, JIRADetails, JIRALintActionInputs } from './types';
import { DEFAULT_PR_ADDITIONS_THRESHOLD } from './constants';

const getInputs = (): JIRALintActionInputs => {
  const JIRA_TOKEN: string = core.getInput('jira-token', { required: true });
  const JIRA_BASE_URL: string = core.getInput('jira-base-url', { required: true });
  const GITHUB_TOKEN: string = core.getInput('github-token', { required: true });
  const BRANCH_IGNORE_PATTERN: string = core.getInput('skip-branches', { required: false }) || '';
  const SKIP_COMMENTS: boolean = core.getInput('skip-comments', { required: false }) === 'true';
  const PR_THRESHOLD = parseInt(core.getInput('pr-threshold', { required: false }), 10);
  const VALIDATE_ISSUE_STATUS: boolean = core.getInput('validate_issue_status', { required: false }) === 'true';
  const ALLOWED_ISSUE_STATUSES: string = core.getInput('allowed_issue_statuses');

  return {
    JIRA_TOKEN,
    GITHUB_TOKEN,
    BRANCH_IGNORE_PATTERN,
    SKIP_COMMENTS,
    PR_THRESHOLD: isNaN(PR_THRESHOLD) ? DEFAULT_PR_ADDITIONS_THRESHOLD : PR_THRESHOLD,
    JIRA_BASE_URL: JIRA_BASE_URL.endsWith('/') ? JIRA_BASE_URL.replace(/\/$/, '') : JIRA_BASE_URL,
    VALIDATE_ISSUE_STATUS,
    ALLOWED_ISSUE_STATUSES,
  };
};

async function run(): Promise<void> {
  try {
    const {
      JIRA_TOKEN,
      JIRA_BASE_URL,
      GITHUB_TOKEN,
      BRANCH_IGNORE_PATTERN,
      SKIP_COMMENTS,
      PR_THRESHOLD,
      // VALIDATE_ISSUE_STATUS,
      // ALLOWED_ISSUE_STATUSES,
    } = getInputs();

    const defaultAdditionsCount = 800;
    const prThreshold: number = PR_THRESHOLD ? Number(PR_THRESHOLD) : defaultAdditionsCount;

    const {
      payload: {
        repository,
        organization: { login: owner },
        pull_request: pullRequest,
      },
    } = github.context;

    if (typeof repository === 'undefined') {
      throw new Error(`Missing 'repository' from github action context.`);
    }

    const { name: repo } = repository;

    const {
      base: { ref: baseBranch },
      head: { ref: headBranch },
      number: prNumber = 0,
      body: prBody = '',
      additions = 0,
      title = '',
      requested_reviewers: reviewers,
    } = Object.assign(
      {},
      ...Object.entries(pullRequest!)
        .filter(([k, v]) => v != null)
        .map(([k, v]) => ({ [k]: v }))
    ) as PullRequestParams;

    // common fields for both issue and comment
    const commonPayload = {
      owner,
      repo,
      // eslint-disable-next-line @typescript-eslint/camelcase
      issue_number: prNumber,
    };

    // github client with given token
    const client: github.GitHub = new github.GitHub(GITHUB_TOKEN);

    if (!headBranch && !baseBranch) {
      const commentBody = 'jira-lint is unable to determine the head and base branch';
      const comment: IssuesCreateCommentParams = {
        ...commonPayload,
        body: commentBody,
      };
      await addComment(client, comment);

      core.setFailed('Unable to get the head and base branch');
      process.exit(1);
    }

    console.log('Base branch -> ', baseBranch);
    console.log('Head branch -> ', headBranch);

    const labels = ['develop', 'testing', 'uat', 'staging', 'production'].filter((branch) => branch === baseBranch);
    if (labels.length) {
      await addLabels(client, {
        ...commonPayload,
        labels,
      });
    }

    const newAssignees: string[] = [];
    if (reviewers && reviewers.length) {
      newAssignees.push(...reviewers.map((reviewer) => reviewer.login));
    }
    if (['testing', 'uat', 'staging', 'production'].includes(baseBranch)) {
      newAssignees.push('vipanhira');
    }
    if (newAssignees.length) {
      addAssignees(client, {
        ...commonPayload,
        assignees: newAssignees,
      });
    }

    if (shouldSkipBranchLint(headBranch, BRANCH_IGNORE_PATTERN)) {
      process.exit(0);
    }

    const issueKeys = getJIRAIssueKeys(headBranch);
    /*if (!issueKeys.length) {
      const comment: IssuesCreateCommentParams = {
        ...commonPayload,
        body: getNoIdComment(headBranch),
      };
      await addComment(client, comment);

      core.setFailed('JIRA issue id is missing in your branch.');
      process.exit(1);
    }*/

    // use the last match (end of the branch name)
    const issueKey = issueKeys[issueKeys.length - 1];
    console.log(`JIRA key -> ${issueKey}`);

    const { getTicketDetails, transitionIssue } = getJIRAClient(JIRA_BASE_URL, JIRA_TOKEN);
    const details: JIRADetails = issueKey ? await getTicketDetails(issueKey) : ({} as JIRADetails);
    if (details.key) {
      // if (!isIssueStatusValid(VALIDATE_ISSUE_STATUS, ALLOWED_ISSUE_STATUSES.split(','), details)) {
      //   const invalidIssueStatusComment: IssuesCreateCommentParams = {
      //     ...commonPayload,
      //     body: getInvalidIssueStatusComment(details.status, ALLOWED_ISSUE_STATUSES),
      //   };
      //   console.log('Adding comment for invalid issue status');
      //   await addComment(client, invalidIssueStatusComment);

      //   core.setFailed('The found jira issue does is not in acceptable statuses');
      //   process.exit(1);
      // }

      // if issue is in progress, move it to code review
      if (details.statusId === "10600") {
        transitionIssue(issueKey, "41");
      }

      if (shouldUpdatePRDescription(prBody)) {
        const prData: PullsUpdateParams = {
          owner,
          repo,
          // eslint-disable-next-line @typescript-eslint/camelcase
          pull_number: prNumber,
          body: getPRDescription(prBody, details),
        };
        await updatePrDetails(client, prData);

        // add comment for PR title
        if (!SKIP_COMMENTS) {
          const prTitleComment: IssuesCreateCommentParams = {
            ...commonPayload,
            body: getPRTitleComment(details.summary, title),
          };
          console.log('Adding comment for the PR title');
          addComment(client, prTitleComment);

          // add a comment if the PR is huge
          if (isHumongousPR(additions, prThreshold)) {
            const hugePrComment: IssuesCreateCommentParams = {
              ...commonPayload,
              body: getHugePrComment(additions, prThreshold),
            };
            console.log('Adding comment for huge PR');
            addComment(client, hugePrComment);
          }
        }
      }
    } else {
      /*const comment: IssuesCreateCommentParams = {
        ...commonPayload,
        body: getNoIdComment(headBranch),
      };
      await addComment(client, comment);

      core.setFailed('Invalid JIRA key. Please create a branch with a valid JIRA issue key.');
      process.exit(1);*/
    }
  } catch (error) {
    console.log({ error });
    core.setFailed(error.message);
    process.exit(1);
  }
}

run();
