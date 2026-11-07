<script setup lang="ts">
/** 面板外壳：左侧导航（五个视图）+ 右侧内容区；读取 map.generated.json 并分发视图。 */
import { onMounted, ref } from "vue";
import { loadMap, useMap, fmtDateTime } from "./store";
import Overview from "./views/Overview.vue";
import Iterations from "./views/Iterations.vue";
import Docs from "./views/Docs.vue";
import Tests from "./views/Tests.vue";
import Files from "./views/Files.vue";

const { data, error, loading } = useMap();
const tab = ref<"overview" | "iterations" | "docs" | "tests" | "files">("overview");

const tabs = [
  { id: "overview", label: "总览", hint: "项目现状与健康" },
  { id: "iterations", label: "迭代", hint: "每次改了什么" },
  { id: "docs", label: "文档", hint: "每份文档管什么" },
  { id: "tests", label: "测试", hint: "测什么、属于哪个接缝" },
  { id: "files", label: "文件", hint: "仓库全貌" },
] as const;

onMounted(loadMap);
</script>

<template>
  <div class="shell">
    <aside class="side">
      <div class="brand">
        <div class="mark">BL</div>
        <div>
          <div class="bname">{{ data?.project.name ?? "ble-light" }}</div>
          <div class="btag">{{ data?.project.repo ?? "—" }}</div>
        </div>
      </div>

      <nav class="nav">
        <button
          v-for="t in tabs"
          :key="t.id"
          :class="['navitem', { on: tab === t.id }]"
          @click="tab = t.id"
        >
          <span class="nlabel">{{ t.label }}</span>
          <span class="nhint">{{ t.hint }}</span>
          <span v-if="t.id === 'docs' && data" class="ncount">{{ data.docStats.count }}</span>
          <span v-else-if="t.id === 'tests' && data" class="ncount">{{ data.testStats.files }}</span>
          <span v-else-if="t.id === 'files' && data" class="ncount">{{ data.files.total }}</span>
          <span v-else-if="t.id === 'iterations' && data" class="ncount">{{ data.iterations.length }}</span>
        </button>
      </nav>

      <div class="foot">
        <div v-if="data?.head" class="commit">
          <div class="row">
            <span class="dot ok" />
            <span class="mono">{{ data.head.sha }}</span>
            <span class="faint">· {{ data.head.branch }}</span>
          </div>
          <div class="subj">{{ data.head.subject }}</div>
        </div>
        <div v-if="data" class="gen">
          生成于 {{ fmtDateTime(data.generatedAt) }}
          <button class="refresh" @click="loadMap" :disabled="loading">
            {{ loading ? "刷新中" : "重新读取" }}
          </button>
        </div>
      </div>
    </aside>

    <main class="main">
      <div v-if="error" class="state err">
        <div class="state-title">读不到 docs/map.generated.json</div>
        <div class="mono">{{ error }}</div>
        <div class="hint">在仓库根目录跑 <code>npm run map</code> 生成它。</div>
      </div>

      <div v-else-if="!data" class="state">读取中…</div>

      <template v-else>
        <Overview v-if="tab === 'overview'" :data="data" @go="tab = $event" />
        <Iterations v-else-if="tab === 'iterations'" :data="data" />
        <Docs v-else-if="tab === 'docs'" :data="data" />
        <Tests v-else-if="tab === 'tests'" :data="data" />
        <Files v-else-if="tab === 'files'" :data="data" />
      </template>
    </main>
  </div>
</template>

<style scoped>
.shell { display: grid; grid-template-columns: 244px 1fr; height: 100%; }

.side {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--line);
  background: #0a0c0f;
  padding: 20px 14px;
  gap: 22px;
}

.brand { display: flex; align-items: center; gap: 10px; padding: 0 6px; }
.mark {
  width: 30px; height: 30px; border-radius: 7px;
  background: linear-gradient(145deg, #2a3a49, #161d24);
  border: 1px solid #33414f;
  display: grid; place-items: center;
  font-size: 11px; font-weight: 700; letter-spacing: 0.04em; color: var(--accent-soft);
}
.bname { font-size: 13.5px; font-weight: 600; letter-spacing: 0.01em; }
.btag { font-size: 11px; color: var(--ink-3); font-family: var(--mono); }

.nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.navitem {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas: "label count" "hint count";
  gap: 0 8px;
  text-align: left;
  padding: 9px 10px;
  border-radius: var(--r-sm);
  border: 1px solid transparent;
  transition: background 120ms, border-color 120ms;
}
.navitem:hover { background: var(--surface); }
.navitem.on { background: var(--surface); border-color: var(--line); }
.nlabel { grid-area: label; font-size: 13px; }
.navitem.on .nlabel { color: var(--ink); font-weight: 500; }
.nhint { grid-area: hint; font-size: 10.5px; color: var(--ink-3); line-height: 1.4; }
.ncount {
  grid-area: count; align-self: center;
  font-family: var(--mono); font-size: 11px; color: var(--ink-3);
}
.navitem.on .ncount { color: var(--accent-soft); }

.foot { border-top: 1px solid var(--line-soft); padding-top: 14px; display: grid; gap: 10px; }
.commit .row { display: flex; align-items: center; gap: 6px; font-size: 11.5px; }
.subj {
  font-size: 11px; color: var(--ink-3); line-height: 1.45;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.gen { font-size: 10.5px; color: var(--ink-3); line-height: 1.5; }
.refresh {
  display: block; margin-top: 4px; font-size: 10.5px;
  color: var(--accent-soft); text-decoration: underline; text-underline-offset: 2px;
}
.refresh:disabled { color: var(--ink-3); text-decoration: none; }

.main { overflow-y: auto; padding: 32px 40px 80px; max-width: 1500px; }

.state { padding: 60px 0; color: var(--ink-2); }
.state.err { color: var(--err); }
.state-title { font-size: 16px; margin-bottom: 10px; }
.hint { margin-top: 12px; color: var(--ink-3); font-size: 12.5px; }
code { font-family: var(--mono); background: var(--surface-2); padding: 1px 5px; border-radius: 4px; }

@media (max-width: 900px) {
  .shell { grid-template-columns: 1fr; }
  .side { border-right: none; border-bottom: 1px solid var(--line); }
  .main { padding: 24px 18px 60px; }
}
</style>
