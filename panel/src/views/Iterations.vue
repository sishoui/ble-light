<script setup lang="ts">
/** 迭代：按时间倒序列出每次合并，可展开看提交列表与逐文件增删。 */
import { computed, ref } from "vue";
import { fmtDate, fmtNum, type Iteration, type MapData } from "../store";

const props = defineProps<{ data: MapData }>();
const open = ref<Set<string>>(new Set());

const items = computed(() => [...props.data.iterations].reverse());

function toggle(id: string) {
  const next = new Set(open.value);
  next.has(id) ? next.delete(id) : next.add(id);
  open.value = next;
}

function tone(add: number, del: number) {
  if (add + del === 0) return "idle";
  return add >= del ? "ok" : "err";
}

function fileBadge(path: string) {
  if (path.startsWith("docs/")) return { label: "文档", cls: "acc" };
  if (/tests?\//.test(path) || /\.test\./.test(path)) return { label: "测试", cls: "warn" };
  if (path.startsWith("firmware/")) return { label: "固件", cls: "" };
  if (path.startsWith("miniprogram/")) return { label: "小程序", cls: "" };
  return { label: "其他", cls: "" };
}
</script>

<template>
  <div class="page">
    <header class="head">
      <div>
        <h1>迭代</h1>
        <p class="lede">
          每次合并进 main 的改动。数据来自 git 历史，不手写。
          <template v-if="data.iterationNote">（{{ data.iterationNote }}）</template>
        </p>
      </div>
      <div class="chip">{{ data.iterations.length }} 次</div>
    </header>

    <div v-if="!items.length" class="empty card">
      还没有合并提交。第一次 `Merge pull request` 之后这里会自动出现一条。
    </div>

    <div class="timeline">
      <article v-for="it in items" :key="it.id" class="item">
        <div class="gutter">
          <div class="node">{{ it.index }}</div>
          <div class="rail" />
        </div>

        <div class="card body">
          <button class="row" @click="toggle(it.id)">
            <div class="left">
              <div class="titleline">
                <span class="title">{{ it.title }}</span>
                <span v-if="it.pr" class="chip acc">PR #{{ it.pr }}</span>
                <span v-if="it.branch" class="chip mono">{{ it.branch }}</span>
              </div>
              <div class="meta faint">
                {{ fmtDate(it.date) }}
                · <span class="mono">{{ it.short ?? it.sha?.slice(0, 7) }}</span>
                · {{ it.commits }} 提交
                <template v-if="it.fileCount != null"> · {{ it.fileCount }} 文件</template>
                <template v-if="it.additions != null">
                  · <span class="add">+{{ fmtNum(it.additions) }}</span>
                  <span class="del">−{{ fmtNum(it.deletions) }}</span>
                </template>
              </div>
            </div>
            <span class="chev" :class="{ on: open.has(it.id) }">›</span>
          </button>

          <div v-if="open.has(it.id)" class="detail">
            <div v-if="it.body" class="body-text">{{ it.body }}</div>

            <div v-if="it.commitList?.length" class="sect">
              <div class="sect-h">提交</div>
              <ul class="commits">
                <li v-for="c in it.commitList" :key="c.short">
                  <span class="mono faint">{{ c.short }}</span>
                  <span>{{ c.subject }}</span>
                </li>
              </ul>
            </div>

            <div v-if="it.files?.length" class="sect">
              <div class="sect-h">改动文件 <span class="faint">(前 40)</span></div>
              <table>
                <thead><tr><th style="width:90px">类型</th><th>路径</th><th style="width:70px" class="r">+</th><th style="width:70px" class="r">−</th></tr></thead>
                <tbody>
                  <tr v-for="f in it.files" :key="f.path">
                    <td><span :class="['chip', fileBadge(f.path).cls]">{{ fileBadge(f.path).label }}</span></td>
                    <td class="mono path">{{ f.path }}</td>
                    <td class="num r add">{{ f.add || "" }}</td>
                    <td class="num r del">{{ f.del || "" }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-else class="sect faint">初始提交，无差异明细。</div>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.page { display: grid; gap: 18px; }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
.lede { color: var(--ink-2); font-size: 13px; margin-top: 2px; }

.empty { padding: 40px; text-align: center; color: var(--ink-3); font-size: 13px; }

.timeline { display: grid; gap: 0; }
.item { display: grid; grid-template-columns: 44px 1fr; gap: 12px; }
.gutter { display: flex; flex-direction: column; align-items: center; padding-top: 15px; }
.node {
  width: 24px; height: 24px; border-radius: 50%;
  border: 1px solid var(--line); background: var(--surface);
  display: grid; place-items: center;
  font-size: 10.5px; font-family: var(--mono); color: var(--ink-2); flex: none;
}
.rail { flex: 1; width: 1px; background: var(--line-soft); margin-top: 6px; }
.item:last-child .rail { background: transparent; }

.body { margin-bottom: 10px; overflow: hidden; }
.row {
  width: 100%; display: flex; align-items: center; gap: 14px;
  padding: 13px 16px; text-align: left;
}
.row:hover { background: var(--surface-2); }
.left { flex: 1; min-width: 0; }
.titleline { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.title { font-size: 13.5px; font-weight: 500; }
.meta { font-size: 11.5px; margin-top: 3px; }
.add { color: var(--ok); }
.del { color: var(--err); }
.chev {
  color: var(--ink-3); font-size: 18px; line-height: 1;
  transition: transform 160ms; transform: rotate(0deg);
}
.chev.on { transform: rotate(90deg); }

.detail { border-top: 1px solid var(--line-soft); padding: 14px 16px 16px; display: grid; gap: 16px; }
.body-text { font-size: 12.5px; color: var(--ink-2); white-space: pre-wrap; line-height: 1.65; }
.sect-h {
  font-size: 10.5px; letter-spacing: 0.05em; text-transform: uppercase;
  color: var(--ink-3); margin-bottom: 8px;
}
.commits { list-style: none; display: grid; gap: 4px; }
.commits li { display: flex; gap: 10px; font-size: 12px; color: var(--ink-2); }
.path { font-size: 11.5px; word-break: break-all; }
.r { text-align: right; }
</style>
