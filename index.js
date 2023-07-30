require('dotenv').config();

const { Octokit } = require("@octokit/rest");
const fs = require("fs");
const { mkdir, writeFile } = require("fs").promises;

const GITHUB_PAT = process.env.GITHUB_PAT;
const GITHUB_ORGANIZATION = process.env.GITHUB_ORG || "nodejs";
const EXCLUDED_REPOS = process.env.EXCLUDED_REPOS ? process.env.EXCLUDED_REPOS.split(",") : [];

if (!GITHUB_PAT) throw new Error("GitHub PAT is required");


const octokit = new Octokit({
  auth: GITHUB_PAT
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handleRateLimit(func, ...args) {
  let response;
  while (true) {
    try {
      response = await func(...args);
      break;
    } catch (error) {
      if (error.status === 403) {
        console.log("Rate limit exceeded, waiting for 1 minute... 💤");
        await sleep(60000);
      } else {
        throw error;
      }
    }
  }
  return response;
}

(async () => {
  const startTime = Date.now();
  let repositories = await handleRateLimit(
    octokit.paginate,
    octokit.repos.listForOrg,
    {
      org: GITHUB_ORGANIZATION,
      type: "all",
    }
  );

  console.log(`📦 Found ${repositories.length} total repos for ${GITHUB_ORGANIZATION}`);
  console.log(`🚫 Excluding ${EXCLUDED_REPOS.length} repos`);
  console.log("\n");
  repositories = repositories.filter(repo => !EXCLUDED_REPOS.includes(repo.name))
  repositories.forEach((repo) => console.log(`- ${repo.name}`))

  const testMode = process.argv[2] === "test";
  if (testMode)
    console.log(
      "Running in TEST mode! 🧪 Only the first repository will be processed."
    );

  for (let i = 0; i < repositories.length; i++) {
    const repo = repositories[i];

    await mkdir(`./output/${repo.name}`, { recursive: true });
    await mkdir(`./output/${repo.name}/pulls`, { recursive: true });

    const pullRequests = await handleRateLimit(
      octokit.paginate,
      octokit.pulls.list,
      {
        owner: GITHUB_ORGANIZATION,
        repo: repo.name,
      }
    );

    console.log(
      `Processing repository ${i + 1}/${repositories.length} - ${repo.name} 🚀`
    );
    console.log(
      `Total PRs: ${pullRequests.length} 📊`
    );

    for (let i = 0; i < pullRequests.length; i++) {
      const pr = pullRequests[i];

      // just checking on first entry to keep it simple
      const hasFilledFolder = fs.existsSync(`./output/${repo.name}/pulls/pr_${pr.number}.json`);

      if (hasFilledFolder) {
        console.log(`${repo.name} pulls folder is not empty, skipping...`)
        break;
      }

      const pr_data = await handleRateLimit(
        octokit.paginate,
        octokit.pulls.get,
        {
          owner: GITHUB_ORGANIZATION,
          repo: repo.name,
          pull_number: pr.number
        }
      );
      await writeFile(
        `./output/${repo.name}/pulls/pr_${pr.number}.json`,
        JSON.stringify(pr_data, null, 2)
      );

      const pull_review_comments_data = await handleRateLimit(
        octokit.paginate,
        octokit.pulls.listReviewComments,
        {
          owner: GITHUB_ORGANIZATION,
          repo: repo.name,
          pull_number: pr.number,
          per_page: 100 // 100 is max, no pagination for now
        }
      );
      await writeFile(
        `./output/${repo.name}/pulls/pr_${pr.number}_review_comments.json`,
        JSON.stringify(pull_review_comments_data, null, 2)
      );

      const pull_comments_data = await handleRateLimit(
        octokit.paginate,
        octokit.pulls.listReviewComments,
        {
          owner: GITHUB_ORGANIZATION,
          repo: repo.name,
          pull_number: pr.number,
          per_page: 100 // 100 is max, no pagination for now
        }
      );
      await writeFile(
        `./output/${repo.name}/pulls/pr_${pr.number}_comments.json`,
        JSON.stringify(pull_comments_data, null, 2)
      );

      const pull_review_commits_data = await handleRateLimit(
        octokit.paginate,
        octokit.pulls.listCommits,
        {
          owner: GITHUB_ORGANIZATION,
          repo: repo.name,
          pull_number: pr.number,
          per_page: 100 // 100 is max, no pagination for now
        }
      );
      await writeFile(
        `./output/${repo.name}/pulls/pr_${pr.number}_commits.json`,
        JSON.stringify(pull_review_commits_data, null, 2)
      );


      console.log(
        `💾 Saved PR ${i + 1}/${pullRequests.length} (${pr.number}) for repo ${
          repo.name
        }`
      );
    }

    if (testMode) break;
  }

  const endTime = Date.now();
  const durationSeconds = (endTime - startTime) / 1000;
  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  const seconds = Math.floor(durationSeconds % 60);
  console.log(
    `Total duration: ${hours} hours, ${minutes} minutes, and ${seconds} seconds ⏱️`
  );
})();
