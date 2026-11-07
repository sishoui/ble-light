/**
 * 从 GitHub 拉任务图，供面板显示「任务做到哪了」。
 *
 * 为什么单独一个模块：gh 调用可能失败（没网、没登录、限流），
 * 面板不能因此完全打不开。失败时返回 null，任务视图显示「不可用」，
 * 其余视图照常。
 */
import { execFileSync } from "node:child_process";

const FIELDS = [
  "number", "title", "state", "labels", "parent",
  "blockedBy", "blocking", "subIssuesSummary", "closedAt", "updatedAt",
].join(",");

function gh(args) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout: 30000,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** 是否具备拉取条件（不实际发请求）。 */
export function ghAvailable() {
  try {
    execFileSync("gh", ["auth", "status"], { stdio: "ignore", timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * @returns {{ ok: true, tasks: object[], stats: object } | { ok: false, error: string }}
 */
export function collectTasks() {
  let raw;
  try {
    raw = gh([
      "issue", "list",
      "--state", "all",
      "--limit", "200",
      "--json", FIELDS,
    ]);
  } catch (e) {
    const msg = `${e.stderr ?? ""}${e.message ?? ""}`.trim().split("\n")[0];
    return { ok: false, error: msg || "gh issue list 失败" };
  }

  let issues;
  try {
    issues = JSON.parse(raw);
  } catch {
    return { ok: false, error: "gh 返回的不是 JSON" };
  }

  const byNumber = new Map(issues.map((i) => [i.number, i]));

  const tasks = issues
    .map((i) => {
      const blockers = (i.blockedBy?.nodes ?? []).map((b) => ({
        number: b.number,
        title: b.title,
        state: b.state,
      }));
      const blocking = (i.blocking?.nodes ?? []).map((b) => ({
        number: b.number,
        title: b.title,
        state: b.state,
      }));
      const openBlockers = blockers.filter((b) => b.state !== "CLOSED");
      const children = i.subIssuesSummary ?? { total: 0, completed: 0, percentCompleted: 0 };
      const isParent = (children.total ?? 0) > 0;

      return {
        number: i.number,
        title: i.title,
        state: i.state,
        labels: (i.labels ?? []).map((l) => l.name),
        parent: i.parent ? { number: i.parent.number, title: i.parent.title } : null,
        blockedBy: blockers,
        blocking,
        openBlockers: openBlockers.length,
        // 前沿 = 开着、没有未关闭的阻塞、且自己不是父票
        ready: i.state !== "CLOSED" && openBlockers.length === 0 && !isParent,
        isParent,
        children,
        closedAt: i.closedAt ?? null,
        updatedAt: i.updatedAt ?? null,
        url: `https://github.com/sishoui/ble-light/issues/${i.number}`,
      };
    })
    .sort((a, b) => a.number - b.number);

  const open = tasks.filter((t) => t.state !== "CLOSED");
  const closed = tasks.filter((t) => t.state === "CLOSED");
  const ready = open.filter((t) => t.ready && !t.isParent);

  return {
    ok: true,
    tasks,
    stats: {
      total: tasks.length,
      open: open.length,
      closed: closed.length,
      ready: ready.length,
      readyList: ready.map((t) => t.number),
      progress: tasks.length ? Math.round((closed.length / tasks.length) * 100) : 0,
    },
  };
}
