import { Octokit } from "octokit";

export const KINDS = {
  mvp: "mvp",
  style: "styles",
  ost: "osts",
  command: "commands",
  emote: "emotes",
  commentator: "commentators",
  goaleffect: "goaleffects",
  title: "titles",
  nowl: "nowl"
};

const decode = (content) => JSON.parse(Buffer.from(content, "base64").toString("utf8"));
const encode = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`).toString("base64");

export class GitHubWhitelistStore {
  constructor({ token, owner, repo, branch = "main" }) {
    this.api = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
  }

  async read(path) {
    const response = await this.api.rest.repos.getContent({
      owner: this.owner, repo: this.repo, path, ref: this.branch
    });
    if (Array.isArray(response.data) || !response.data.content) throw new Error(`${path} is not a file`);
    return { data: decode(response.data.content), sha: response.data.sha };
  }

  async write(path, value, sha, message) {
    await this.api.rest.repos.createOrUpdateFileContents({
      owner: this.owner,
      repo: this.repo,
      path,
      branch: this.branch,
      sha,
      message,
      content: encode(value)
    });
  }

  async mutate(action, { robloxId, kind, item, actor, expiresAt = null }) {
    const section = KINDS[kind];
    if (!section) throw new Error("Unknown whitelist kind");

    // Retry once if two operators update GitHub at nearly the same time.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const [mainFile, auditFile] = await Promise.all([this.read("main.json"), this.read("audit.json")]);
      const main = mainFile.data;
      const audit = auditFile.data;
      main[section] ??= {};
      main[section][item] ??= [];
      const list = main[section][item];
      const numericId = Number(robloxId);
      const key = `${robloxId}:${kind}:${item}`;
      const now = new Date().toISOString();
      const exists = list.includes(numericId);

      if (action === "add" && exists) return { changed: false, reason: "already whitelisted" };
      if (action === "remove" && !exists) return { changed: false, reason: "not whitelisted" };

      if (action === "add") {
        list.push(numericId);
        list.sort((a, b) => a - b);
        audit[key] = {
          addedBy: actor,
          addedAt: now,
          removedBy: null,
          removedAt: null,
          active: true,
          kind,
          expiresAt
        };
      } else {
        main[section][item] = list.filter((id) => id !== numericId);
        const previous = audit[key] ?? {};
        audit[key] = {
          ...previous,
          removedBy: actor,
          removedAt: now,
          active: false,
          kind
        };
      }

      try {
        await this.write("main.json", main, mainFile.sha, `${action === "add" ? "whitelist" : "unwhitelist"}: ${robloxId} ${kind}/${item}`);
        // Re-read audit so its SHA is current after the main.json commit.
        const currentAudit = await this.read("audit.json");
        const mergedAudit = currentAudit.data;
        mergedAudit[key] = audit[key];
        await this.write("audit.json", mergedAudit, currentAudit.sha, `audit: ${action} ${robloxId} ${kind}/${item}`);
        return { changed: true };
      } catch (error) {
        if (attempt === 1 || error.status !== 409) throw error;
      }
    }
  }

  async check({ robloxId, kind, item }) {
    const { data } = await this.read("main.json");
    return Boolean(data[KINDS[kind]]?.[item]?.includes(Number(robloxId)));
  }
}
