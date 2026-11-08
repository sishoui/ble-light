#!/usr/bin/env node
/**
 * 固件交叉编译：调 ESP-IDF 的 idf.py 编 ESP32-C3 目标。
 *
 *   node scripts/build-firmware.mjs
 *
 * 需要 IDF_PATH 与已安装的 RISC-V 工具链。不在 CI 里跑——宿主机测试已经覆盖
 * 纯逻辑，这里验的是「能不能真的出固件」。
 *
 * Windows 上必须绕开 Git Bash 的 MSYSTEM 环境变量，否则 export.bat 拒绝执行；
 * 所以这里生成一个临时 .bat 来跑，而不是直接 spawn idf.py。
 *
 * 两条 Windows 专属的坑：
 *  1. cmd.exe 按系统代码页（GBK）读 .bat，用 UTF-8 写进去中文路径会变成乱码。
 *  2. 路径里只要有非 ASCII 字符，GCC 读 picolibc specs 时会把路径截断
 *     （Desktop\项目 → Desktop/\x0a），报 sdkconfig.h not found。
 * 所以构建在纯 ASCII 的镜像目录里做：源码拷过去、产物拷回来。
 */
import { spawnSync } from "node:child_process";
import { cpSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FW = join(ROOT, "firmware");

const IS_WIN = process.platform === "win32";
const NON_ASCII = /[^\x20-\x7e]/;

/** Windows + 非 ASCII 路径时，把源码镜像到临时 ASCII 目录再编。 */
function asciiMirror() {
  if (!IS_WIN || !NON_ASCII.test(FW)) return null;
  const dir = mkdtempSync(join(tmpdir(), "ble-light-fw-"));
  const mirror = join(dir, "firmware");
  cpSync(FW, mirror, {
    recursive: true,
    filter: (src) => !NON_ASCII.test(src.replace(FW, "")) && basename(src) !== "build",
  });
  return { dir, mirror };
}

/** 逐文件递归拷贝。cpSync 在目标已存在时会静默拷成空目录，不能用于这一步。 */
function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = join(from, entry.name);
    const dst = join(to, entry.name);
    if (entry.isDirectory()) copyTree(src, dst);
    else copyFileSync(src, dst);
  }
}

function findIdf() {
  const candidates = [
    process.env.IDF_PATH,
    join(process.env.HOME ?? "", "esp", "esp-idf", "esp-idf"),
    join(process.env.USERPROFILE ?? "", "esp", "esp-idf", "esp-idf"),
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(join(c, "tools", "idf.py"))) return c;
  }
  return null;
}

function findPythonEnv(idf) {
  const tools = process.env.IDF_TOOLS_PATH || join(process.env.USERPROFILE ?? "", ".espressif");
  const candidates = [
    process.env.IDF_PYTHON_ENV_PATH,
    join(tools, "python_env", "idf6.1_py3.11_env"),
    join(tools, "python_env", "idf6.1_py3.12_env"),
    join("C:\\Espressif", "python_env", "idf6.1_py3.11_env"),
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(join(c, "Scripts", "python.exe"))) return c;
  }
  return null;
}

const idf = findIdf();
if (!idf) {
  console.error("找不到 ESP-IDF。设 IDF_PATH 指向 esp-idf 目录。");
  process.exit(2);
}

const args = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["build"];
const action = args[0];

const mirror = asciiMirror();
const buildDir = mirror ? mirror.mirror : FW;
if (mirror) console.log(`路径含非 ASCII，镜像到 ${mirror.mirror}`);

let cmd;
let cmdArgs;
if (IS_WIN) {
  const pyEnv = findPythonEnv(idf);
  const bat = join(mkdtempSync(join(tmpdir(), "ble-light-idf-")), "idf.bat");
  writeFileSync(
    bat,
    [
      "@echo off",
      "set MSYSTEM=",
      "set MSYSCON=",
      pyEnv ? `set IDF_PYTHON_ENV_PATH=${pyEnv}` : "",
      `call "${join(idf, "export.bat")}"`,
      `cd /d "${buildDir}"`,
      `idf.py ${args.join(" ")}`,
      "",
    ].filter((l) => l !== "").join("\r\n"),
    "utf8",
  );
  cmd = "cmd";
  cmdArgs = ["/c", bat];
} else {
  cmd = "bash";
  cmdArgs = ["-lc", `source "${join(idf, "export.sh")}" && cd "${buildDir}" && idf.py ${args.join(" ")}`];
}

console.log(`固件${action}：${buildDir}`);
const r = spawnSync(cmd, cmdArgs, { stdio: "inherit" });

if (mirror) {
  /* 产物拷回来，这样 flash / monitor 仍从仓库内的 firmware/build 取。
   *
   * 不能用 cpSync(src, dst, {recursive:true})：dst 已存在时它会把内容拷成空目录
   * （在 Windows + 非 ASCII 路径上实测如此）。这里逐文件拷，行为可预期。 */
  try {
    const from = join(mirror.mirror, "build");
    if (existsSync(from)) {
      const to = join(FW, "build");
      rmSync(to, { recursive: true, force: true });
      copyTree(from, to);
    }
  } catch (e) {
    console.error(`产物回拷失败：${e.message}`);
  }
  rmSync(mirror.dir, { recursive: true, force: true });
}

if (r.status !== 0) {
  console.error(`固件${action}失败（退出码 ${r.status}）`);
  process.exit(r.status ?? 1);
}
