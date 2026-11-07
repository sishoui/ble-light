#!/usr/bin/env node
/**
 * 固件宿主机测试：用系统 C 编译器把 firmware/main 的纯逻辑和 firmware/test 编成一个
 * 可执行文件跑掉。不需要 ESP-IDF、不需要真机。
 *
 *   node scripts/test-firmware.mjs           # 跑测试
 *   node scripts/test-firmware.mjs --cov     # 跑测试并打印 reducer 分支覆盖
 *
 * 只编「不依赖实时操作系统与硬件」的模块。BLE / NVS / RMT 的封装不在这里。
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAIN = join(ROOT, "firmware", "main");
const TEST = join(ROOT, "firmware", "test");
const OUT = join(ROOT, ".sim-out");
const COV = process.argv.includes("--cov");

/** 宿主机可编的模块。新增纯逻辑模块时加到这里。 */
const HOST_SOURCES = [
  "protocol.c",
  "chunk_reasm.c",
  "command.c",
  "state_blob.c",
  "layout_store.c",
  "scene_store.c",
  "save_scheduler.c",
  "device_core.c",
  "gamma.c",
  "effects.c",
  "led_render.c",
  "scene_compose.c",
];

const CC = process.env.CC || (process.platform === "win32" ? "gcc" : "cc");

function cFiles() {
  const tests = readdirSync(TEST).filter(
    (f) => f.endsWith(".c") && (f.startsWith("test_") || f === "test_harness.c"),
  );
  const mains = readdirSync(TEST).filter((f) => f === "main.c");
  if (mains.length === 0) throw new Error("firmware/test/main.c 不存在");
  return { tests: tests.map((f) => join(TEST, f)), main: join(TEST, "main.c") };
}

function main() {
  mkdirSync(OUT, { recursive: true });
  const { tests, main: testMain } = cFiles();
  const sources = [
    ...HOST_SOURCES.map((f) => join(MAIN, f)).filter((p) => existsSync(p)),
    ...tests,
    testMain,
  ];
  if (sources.filter((p) => p.includes(`${MAIN}`)).length === 0) {
    console.error("firmware/main 下没有任何可编模块");
    process.exit(2);
  }

  const exe = join(OUT, process.platform === "win32" ? "host-tests.exe" : "host-tests");
  const flags = [
    "-std=c11", "-Wall", "-Wextra", "-Werror", "-O0", "-g",
    `-I${MAIN}`, `-I${TEST}`,
  ];
  if (COV) flags.push("-fprofile-instr-generate", "-fcoverage-mapping");

  const env = { ...process.env };
  const compile = spawnSync(CC, [...flags, ...sources, "-o", exe], { stdio: "inherit", env });
  if (compile.status !== 0) {
    console.error("编译失败");
    process.exit(compile.status ?? 1);
  }

  const profraw = join(OUT, "coverage.profraw");
  if (COV) {
    rmSync(profraw, { force: true });
    env.LLVM_PROFILE_FILE = profraw;
  }
  const run = spawnSync(exe, [], { stdio: "inherit", env });
  if (run.status !== 0) {
    console.error(`固件宿主机测试失败（退出码 ${run.status}）`);
    process.exit(run.status ?? 1);
  }

  if (COV) reportCoverage();
}

/** 只报 reducer 的分支覆盖——它是唯一设门槛的接缝。 */
function reportCoverage() {
  const profraw = join(OUT, "coverage.profraw");
  if (!existsSync(profraw)) {
    console.error("没有 coverage 数据，先跑一次 --cov");
    process.exit(2);
  }
  const profdata = join(OUT, "coverage.profdata");
  const exe = join(OUT, process.platform === "win32" ? "host-tests.exe" : "host-tests");
  try {
    execFileSync("llvm-profdata", ["merge", "-sparse", profraw, "-o", profdata], { stdio: "pipe" });
  } catch (e) {
    console.error(`llvm-profdata 不可用：${e.message}`);
    return;
  }
  try {
    execFileSync("llvm-cov", ["report", exe, `-instr-profile=${profdata}`, join(MAIN, "command.c")],
      { stdio: "inherit" });
  } catch {
    console.error("llvm-cov 报告失败");
  }
}

main();
