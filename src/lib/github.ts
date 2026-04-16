interface GitHubFileResponse {
  sha?: string;
}

/**
 * Create or update a file in a GitHub repository via the Contents API.
 */
export async function pushToGitHub(
  filePath: string,
  content: string,
  commitMessage: string
): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";

  if (!token) throw new Error("GITHUB_TOKEN environment variable is required");
  if (!repo) throw new Error("GITHUB_REPO environment variable is required");

  const base64Content = Buffer.from(content, "utf-8").toString("base64");
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
    "User-Agent": "multi-agent-content-marketing-system",
  };

  // GET existing file to obtain sha (required for updates)
  let sha: string | undefined;
  const getRes = await fetch(`${apiUrl}?ref=${branch}`, { headers });
  if (getRes.ok) {
    const existing = (await getRes.json()) as GitHubFileResponse;
    sha = existing.sha;
  }

  const body: Record<string, unknown> = {
    message: commitMessage,
    content: base64Content,
    branch,
  };
  if (sha) body.sha = sha;

  const putRes = await fetch(apiUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });

  if (!putRes.ok) {
    const errorBody = await putRes.text();
    throw new Error(
      `GitHub API error ${putRes.status} for ${filePath}: ${errorBody}`
    );
  }
}
