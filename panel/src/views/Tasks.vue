<script setup lang="ts">
/** 任务：GitHub issue 的依赖图。显示前沿（可开工）、阻塞中、已完成。 */
import { computed, ref } from "vue";
import { fmtDateTime, type MapData, type Task } from "../store";

const props = defineProps<{ data: MapData }>();

const filter = ref<"all" | "ready" | "blocked" | "closed">("all");

const tasks = computed(() => props.data.tasks?.tasks ?? []);
const stats = computed(() => props.data.tasks?.stats ?? null);
const unavailable = computed(() => !props.data.tasks?.ok);

const groups = computed(() => {
  const all = tasks.value;
  const ready = all.filter((t) => t.ready && !t.isParent);
  const blocked = all.filter((t) => t.state !== "CLOSED" && !t.ready && !t.isParent);
  const parents = all.filter((t) => t.isParent);
  const closed = all.filter((t) => t.state === "CLOSED" && !t.isParent);

  if (filter.value === "ready") return [{ key: "ready", label: "可开工（前沿）", items: ready }];
  if (filter.value === "blocked") return [{ key: "blocked", label: "阻塞中", items: blocked }];
  if (filter.value === "closed") return [{ key: "closed", label: "已完成", items: closed }];

  return [
    { key: "parents", label: "规格", items: parents },
    { key: "ready", label: "可开工（前沿）", items: ready },
    { key: "blocked", label: "阻塞中", items: blocked },
    { key: "closed", label: "已完成", items: closed },
  ].filter((g) => g.items.length > 0);
});

function tone(t: Task) {
  if (t.state === "CLOSED") return "done";
  if (t.ready) return "ready";
  return "blocked";
}

function label(t: Task) {
  if (t.state === "CLOSED") return "已完成";
  if (t.isParent) return `${t.children.completed}/${t.children.total}`;
  if (t.ready) return "可开工";
  return `等 ${t.openBlockers} 项`;
}
</script>

<template>
  <div class="page">
    <header class="head">
      <div>
        <h1>任务</h1>
        <p class="lede">
          从 GitHub Issues 拉取的依赖图。前沿 = 没有未关闭阻塞的票，可以立即开工。
        </p>
      </div>
      <div v-if="stats" class="chip">{{ stats.closed }} / {{ stats.total }} 完成</div>
    </header>

    <div v-if="unavailable" class="card empty">
      <div class="etitle">任务图不可用</div>
      <p class="edesc">{{ data.tasks?.error ?? "未知原因" }}</p>
      <p class="edesc faint">需要 <code>gh</code> 已登录，且能访问仓库的 Issues。</p>
    </div>

    <template v-else>
      <section v-if="stats" class="summary">
        <div class="sbox card">
          <span class="sl">进度</span>
          <div class="sbar"><div class="bar"><i :style="{ width: `${stats.progress}%` }" /></div></div>
          <span class="sv num">{{ stats.progress }}%</span>
        </div>
        <div class="sbox card">
          <span class="sl">可开工</span>
          <span class="sv num ready-tone">{{ stats.ready }}</span>
        </div>
        <div class="sbox card">
          <span class="sl">进行中 / 阻塞</span>
          <span class="sv num">{{ stats.open - stats.ready }}</span>
        </div>
        <div class="sbox card">
          <span class="sl">已完成</span>
          <span class="sv num done-tone">{{ stats.closed }}</span>
        </div>
      </section>

      <div class="seg">
        <button :class="['segbtn', { on: filter === 'all' }]" @click="filter = 'all'">全部</button>
        <button :class="['segbtn', { on: filter === 'ready' }]" @click="filter = 'ready'">
          可开工 <span class="num">{{ stats?.ready ?? 0 }}</span>
        </button>
        <button :class="['segbtn', { on: filter === 'blocked' }]" @click="filter = 'blocked'">阻塞中</button>
        <button :class="['segbtn', { on: filter === 'closed' }]" @click="filter = 'closed'">已完成</button>
      </div>

      <section v-for="g in groups" :key="g.key" class="group">
        <div class="ghead">
          <h2>{{ g.label }}</h2>
          <span class="faint">{{ g.items.length }}</span>
        </div>
        <div class="card">
          <a
            v-for="t in g.items"
            :key="t.number"
            :href="t.url"
            target="_blank"
            rel="noopener noreferrer"
            :class="['task', tone(t)]"
          >
            <span class="tnum mono">#{{ t.number }}</span>
            <span class="tbody">
              <span class="ttitle">{{ t.title }}</span>
              <span v-if="t.blockedBy.length" class="tmeta">
                阻塞于
                <span v-for="b in t.blockedBy" :key="b.number" :class="['tref', { closed: b.state === 'CLOSED' }]">
                  #{{ b.number }}
                </span>
              </span>
            </span>
            <span :class="['tstate', tone(t)]">{{ label(t) }}</span>
          </a>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.page { display: grid; gap: 18px; }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
.lede { color: var(--ink-2); font-size: 13px; margin-top: 2px; max-width: 620px; }

.empty { padding: 28px 30px; }
.etitle { font-size: 15px; margin-bottom: 8px; color: var(--warn); }
.edesc { font-size: 13px; color: var(--ink-2); line-height: 1.7; }
.edesc code { font-family: var(--mono); font-size: 12px; background: var(--surface-2); padding: 1px 5px; border-radius: 4px; }

.summary { display: grid; grid-template-columns: 1.6fr 1fr 1fr 1fr; gap: 10px; }
.sbox { padding: 13px 16px; display: grid; gap: 6px; align-content: center; }
.sl { font-size: 11px; color: var(--ink-3); }
.sv { font-size: 21px; font-weight: 300; line-height: 1.2; }
.sbar { display: flex; align-items: center; }
.sbar .bar { flex: 1; }
.ready-tone { color: var(--ok); }
.done-tone { color: var(--accent-soft); }

.seg { display: flex; gap: 2px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-sm); padding: 2px; width: fit-content; }
.segbtn { padding: 5px 12px; border-radius: 4px; font-size: 12px; color: var(--ink-3); }
.segbtn:hover { color: var(--ink-2); }
.segbtn.on { background: var(--surface-2); color: var(--ink); }
.segbtn .num { font-size: 10.5px; margin-left: 3px; }

.group { display: grid; gap: 7px; }
.ghead { display: flex; align-items: baseline; justify-content: space-between; }
.ghead h2 { font-size: 12.5px; font-weight: 600; color: var(--ink-2); }
.ghead .faint { font-size: 11px; }

.task {
  display: grid; grid-template-columns: 52px 1fr auto;
  align-items: center; gap: 12px;
  padding: 11px 16px;
  border-bottom: 1px solid var(--line-soft);
  transition: background 120ms;
}
.task:last-child { border-bottom: none; }
.task:hover { background: var(--surface-2); }
.tnum { font-size: 11.5px; color: var(--ink-3); }
.tbody { display: grid; gap: 2px; min-width: 0; }
.ttitle { font-size: 13px; line-height: 1.45; }
.task.done .ttitle { color: var(--ink-3); text-decoration: line-through; text-decoration-color: #3a4450; }
.task.ready .ttitle { color: var(--ink); }
.task.blocked .ttitle { color: var(--ink-2); }
.tmeta { font-size: 10.5px; color: var(--ink-3); }
.tref { color: var(--warn); margin-left: 3px; }
.tref.closed { color: var(--ink-3); text-decoration: line-through; }
.tstate {
  font-size: 10.5px; padding: 2px 8px; border-radius: 20px; white-space: nowrap;
  border: 1px solid var(--line); color: var(--ink-3);
}
.tstate.ready { color: var(--ok); border-color: #2b4a3a; background: #16241c; }
.tstate.blocked { color: var(--warn); border-color: #4a3a22; background: #241d13; }
.tstate.done { color: var(--ink-3); border-color: var(--line-soft); }

@media (max-width: 1000px) {
  .summary { grid-template-columns: 1fr 1fr; }
}
</style>
