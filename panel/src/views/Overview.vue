<script setup lang="ts">
/** 总览：KPI、任务进度、分层、验收进度、五个接缝、健康检查、最近迭代。 */
import { computed } from "vue";
import { fmtNum, fmtDateTime, type MapData } from "../store";

const props = defineProps<{ data: MapData }>();
const emit = defineEmits<{ go: [tab: "iterations" | "tasks" | "docs" | "tests" | "files"] }>();

const acc = computed(() => props.data.acceptanceStats);
const accPct = computed(() => (acc.value.total ? Math.round((acc.value.done / acc.value.total) * 100) : 0));

const taskStats = computed(() => props.data.tasks?.stats ?? null);
const readyTasks = computed(() =>
  (props.data.tasks?.tasks ?? []).filter((t) => t.ready && !t.isParent),
);

const seamLabels = computed(() => {
  const labels: Record<string, string> = {
    protocol: "协议编解码", reducer: "命令 reducer", render: "渲染合成",
    session: "会话层", page: "页面处理器", tooling: "工具",
  };
  return Object.entries(props.data.testStats.bySeam).map(([k, v]) => ({ key: k, label: labels[k] ?? k, count: v }));
});

const lastIteration = computed(() => props.data.iterations.at(-1) ?? null);
const layerStats = computed(() =>
  props.data.layers.map((l) => {
    const mods = props.data.modules.filter((m) => m.layer === l.id);
    return {
      ...l,
      modules: mods.length,
      files: mods.reduce((n, m) => n + m.fileCount, 0),
      lines: mods.reduce((n, m) => n + m.lines, 0),
      missing: mods.filter((m) => !m.exists).length,
    };
  }),
);

const healthTone = computed(() => (props.data.health.ok ? "ok" : "err"));
</script>

<template>
  <div class="page">
    <header class="head">
      <div>
        <h1>总览</h1>
        <p class="lede">{{ data.project.tagline }}</p>
      </div>
      <div :class="['chip', healthTone]">
        <span class="dot" :class="healthTone" />
        {{ data.health.ok ? "健康" : `${data.health.errors} 个错误` }}
        <template v-if="data.health.warnings">· {{ data.health.warnings }} 警告</template>
      </div>
    </header>

    <section class="kpis">
      <button class="kpi card" @click="emit('tasks')">
        <div class="klabel">任务</div>
        <div class="kval num">
          {{ taskStats ? `${taskStats.closed}/${taskStats.total}` : "—" }}
        </div>
        <div class="kfoot">
          <template v-if="taskStats && taskStats.ready > 0">
            <span class="ready-dot" />{{ taskStats.ready }} 项可开工
          </template>
          <template v-else-if="taskStats">无待办</template>
          <template v-else>任务图不可用</template>
        </div>
      </button>
      <button class="kpi card" @click="emit('iterations')">
        <div class="klabel">迭代</div>
        <div class="kval num">{{ data.iterations.length }}</div>
        <div class="kfoot">
          <template v-if="lastIteration">最近 {{ fmtDateTime(lastIteration.date) }}</template>
          <template v-else>尚无合并</template>
        </div>
      </button>
      <button class="kpi card" @click="emit('docs')">
        <div class="klabel">文档</div>
        <div class="kval num">{{ data.docStats.count }}</div>
        <div class="kfoot">{{ fmtNum(data.docStats.lines) }} 行 · {{ data.docStats.adrCount }} 份 ADR</div>
      </button>
      <button class="kpi card" @click="emit('tests')">
        <div class="klabel">测试</div>
        <div class="kval num">{{ data.testStats.files }}</div>
        <div class="kfoot">{{ fmtNum(data.testStats.cases) }} 用例 · {{ fmtNum(data.testStats.asserts) }} 断言</div>
      </button>
      <button class="kpi card" @click="emit('files')">
        <div class="klabel">文件</div>
        <div class="kval num">{{ data.files.total }}</div>
        <div class="kfoot">{{ fmtNum(data.files.lines) }} 行 · {{ data.files.binary }} 个二进制</div>
      </button>
    </section>

    <section v-if="readyTasks.length" class="card block funnel">
      <div class="bhead">
        <h2>前沿：可以立即开工</h2>
        <button class="link" @click="emit('tasks')">全部任务 →</button>
      </div>
      <a
        v-for="t in readyTasks"
        :key="t.number"
        :href="t.url"
        target="_blank"
        rel="noopener noreferrer"
        class="frow"
      >
        <span class="mono fnum">#{{ t.number }}</span>
        <span class="ftitle">{{ t.title }}</span>
        <span class="chip ok">可开工</span>
      </a>
    </section>

    <div class="cols">
      <section class="card block">
        <div class="bhead">
          <h2>分层</h2>
          <span class="faint">每层有哪些模块、多少代码</span>
        </div>
        <div class="layers">
          <div v-for="l in layerStats" :key="l.id" class="layer">
            <div class="lhead">
              <span class="lname">{{ l.name }}</span>
              <span class="mono faint">{{ l.modules }} 模块</span>
            </div>
            <div class="lblurb">{{ l.blurb }}</div>
            <div class="lmeta">
              <span class="num">{{ l.files }}</span> 文件
              <span class="sep">·</span>
              <span class="num">{{ fmtNum(l.lines) }}</span> 行
              <span v-if="l.missing" class="chip warn" style="margin-left:8px">{{ l.missing }} 未建</span>
            </div>
          </div>
        </div>
      </section>

      <section class="card block">
        <div class="bhead">
          <h2>验收</h2>
          <span class="faint">{{ acc.done }} / {{ acc.total }}</span>
        </div>
        <div class="accwrap">
          <div class="accbar">
            <div class="bar"><i :style="{ width: `${accPct}%` }" /></div>
            <div class="accpct num">{{ accPct }}%</div>
          </div>
          <div class="acclist">
            <div class="accitem"><span class="dot ok" />通过 <span class="num">{{ acc.done }}</span></div>
            <div class="accitem"><span class="dot warn" />部分 <span class="num">{{ acc.partial }}</span></div>
            <div class="accitem"><span class="dot err" />阻塞 <span class="num">{{ acc.blocked }}</span></div>
            <div class="accitem"><span class="dot idle" />未验 <span class="num">{{ acc.todo }}</span></div>
          </div>
        </div>
      </section>
    </div>

    <section class="card block">
      <div class="bhead">
        <h2>五个接缝</h2>
        <span class="faint">测试只挂在这里</span>
      </div>
      <div class="seams">
        <div v-for="s in seamLabels" :key="s.key" class="seam">
          <div class="sname">{{ s.label }}</div>
          <div class="scount num" :class="{ zero: s.count === 0 }">{{ s.count }}</div>
          <div class="slabel">个测试文件</div>
        </div>
        <div v-if="data.testStats.unseamed" class="seam">
          <div class="sname">未归类</div>
          <div class="scount num warn">{{ data.testStats.unseamed }}</div>
          <div class="slabel">需要归位</div>
        </div>
      </div>
    </section>

    <section class="card block">
      <div class="bhead">
        <h2>健康检查</h2>
        <span class="faint">{{ data.health.issues.length }} 条</span>
      </div>
      <div v-if="!data.health.issues.length" class="clean">没有任何问题。</div>
      <table v-else>
        <thead>
          <tr><th style="width:80px">级别</th><th style="width:180px">类型</th><th>说明</th><th style="width:34%">位置</th></tr>
        </thead>
        <tbody>
          <tr v-for="(i, idx) in data.health.issues" :key="idx">
            <td><span :class="['chip', i.level === 'error' ? 'err' : i.level === 'warn' ? 'warn' : '']">{{ i.level }}</span></td>
            <td class="mono">{{ i.kind }}</td>
            <td>{{ i.message }}</td>
            <td class="mono faint">{{ i.path ?? "—" }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="card block">
      <div class="bhead">
        <h2>最近一次迭代</h2>
        <button class="link" @click="emit('iterations')">全部迭代 →</button>
      </div>
      <div v-if="!lastIteration" class="clean">还没有合并记录。</div>
      <div v-else class="last">
        <div class="lrow">
          <span class="chip acc">#{{ lastIteration.index }}</span>
          <span class="ltitle">{{ lastIteration.title }}</span>
          <span class="faint mono">{{ lastIteration.short ?? lastIteration.sha?.slice(0, 7) }}</span>
        </div>
        <div class="lmeta2 faint">
          {{ fmtDateTime(lastIteration.date) }}
          <template v-if="lastIteration.pr"> · PR #{{ lastIteration.pr }}</template>
          <template v-if="lastIteration.branch"> · {{ lastIteration.branch }}</template>
          · {{ lastIteration.commits }} 提交
          <template v-if="lastIteration.fileCount != null"> · {{ lastIteration.fileCount }} 文件</template>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page { display: grid; gap: 18px; }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 4px; }
h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
.lede { color: var(--ink-2); font-size: 13px; margin-top: 2px; }

.kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
.kpi { padding: 16px 18px; text-align: left; transition: border-color 140ms, transform 140ms; }
.kpi:hover { border-color: #34404d; transform: translateY(-1px); }
.klabel { font-size: 11.5px; color: var(--ink-3); letter-spacing: 0.03em; }
.kval { font-size: 30px; font-weight: 300; line-height: 1.15; margin: 6px 0 4px; letter-spacing: -0.02em; }
.kfoot { font-size: 11.5px; color: var(--ink-3); }

.cols { display: grid; grid-template-columns: 1.35fr 1fr; gap: 12px; }

.block { padding: 16px 18px 18px; }
.bhead { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.bhead h2 { font-size: 13px; font-weight: 600; letter-spacing: 0.01em; }
.bhead .faint { font-size: 11.5px; }
.link { font-size: 11.5px; color: var(--accent-soft); }
.link:hover { text-decoration: underline; text-underline-offset: 2px; }

.layers { display: grid; gap: 10px; }
.layer { padding: 11px 13px; background: var(--surface-2); border-radius: var(--r-sm); border: 1px solid var(--line-soft); }
.lhead { display: flex; justify-content: space-between; align-items: baseline; }
.lname { font-size: 13px; font-weight: 500; }
.lblurb { font-size: 11.5px; color: var(--ink-3); margin: 2px 0 6px; }
.lmeta { font-size: 11.5px; color: var(--ink-2); }
.sep { color: var(--ink-3); margin: 0 5px; }

.accwrap { display: grid; gap: 14px; }
.accbar { display: flex; align-items: center; gap: 10px; }
.accbar .bar { flex: 1; height: 6px; }
.accpct { font-size: 13px; color: var(--ink-2); }
.acclist { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 12px; }
.accitem { display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--ink-2); }
.accitem .num { margin-left: auto; color: var(--ink); }

.seams { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
.seam { padding: 13px; background: var(--surface-2); border-radius: var(--r-sm); border: 1px solid var(--line-soft); }
.sname { font-size: 12px; color: var(--ink-2); }
.scount { font-size: 22px; font-weight: 300; line-height: 1.2; margin-top: 4px; }
.scount.zero { color: var(--ink-3); }
.scount.warn { color: var(--warn); }
.slabel { font-size: 10.5px; color: var(--ink-3); }

.clean { color: var(--ink-3); font-size: 12.5px; padding: 8px 0; }

.last { display: grid; gap: 5px; }
.lrow { display: flex; align-items: center; gap: 10px; }
.ltitle { font-size: 13.5px; }
.lmeta2 { font-size: 11.5px; }

.ready-dot {
  display: inline-block; width: 5px; height: 5px; border-radius: 50%;
  background: var(--ok); margin-right: 5px; vertical-align: middle;
}

.funnel .bhead { margin-bottom: 10px; }
.frow {
  display: grid; grid-template-columns: 54px 1fr auto;
  align-items: center; gap: 12px;
  padding: 9px 4px; border-bottom: 1px solid var(--line-soft);
  transition: background 120ms;
}
.frow:last-child { border-bottom: none; }
.frow:hover { background: var(--surface-2); }
.fnum { font-size: 11.5px; color: var(--ink-3); }
.ftitle { font-size: 13px; }

@media (max-width: 1100px) {
  .kpis { grid-template-columns: 1fr 1fr; }
  .cols { grid-template-columns: 1fr; }
  .seams { grid-template-columns: repeat(2, 1fr); }
}
</style>
