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
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FW = join(ROOT, "firmware");

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

let cmd;
let cmdArgs;
if (process.platform === "win32") {
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
      `cd /d "${FW}"`,
      `idf.py ${args.join(" ")}`,
      "",
    ].filter((l) => l !== "").join("\r\n"),
    "utf8",
  );
  cmd = "cmd";
  cmdArgs = ["/c", bat];
} else {
  cmd = "bash";
  cmdArgs = ["-lc", `source "${join(idf, "export.sh")}" && cd "${FW}" && idf.py ${args.join(" ")}`];
}

console.log(`固件${action}：${FW}`);
const r = spawnSync(cmd, cmdArgs, { stdio: "inherit" });
if (r.status !== 0) {
  console.error(`固件${action}失败（退出码 ${r.status}）`);
  process.exit(r.status ?? 1);
}
