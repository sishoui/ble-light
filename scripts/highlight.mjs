/**
 * 极简语法高亮：单趟扫描，不回头。
 *
 * 为什么必须单趟：任何「先替换再替换」的写法都会把自己插入的标签
 * 当成下一次匹配的输入，产出 `class="c-str">` 这种字面量。
 * 单趟扫描保证每个字符只被分类一次。
 *
 * 输出是 HTML 片段，调用方负责放进 v-html。
 */

const KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for", "while",
  "class", "import", "export", "from", "await", "async", "new", "typeof",
  "interface", "type", "enum", "struct", "static", "void", "int", "uint8_t",
  "uint16_t", "uint32_t", "bool", "true", "false", "null", "undefined", "this",
  "switch", "case", "break", "continue", "default", "do", "try", "catch",
  "throw", "extends", "implements", "public", "private", "readonly", "as",
  "of", "in", "sizeof", "elif", "def", "fn", "match", "use",
]);

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function esc(ch) {
  return ESC[ch] ?? ch;
}

/** 逐字符扫描，返回已转义并打上 span 的 HTML。 */
export function highlightLine(line) {
  let out = "";
  let i = 0;
  const n = line.length;

  const push = (cls, text) => {
    const safe = text.replace(/[&<>"']/g, esc);
    out += cls ? `<span class="${cls}">${safe}</span>` : safe;
  };

  while (i < n) {
    const ch = line[i];
    const two = line.slice(i, i + 2);

    // 行注释：// 或 # （但不吃 #include / #define）
    if (two === "//") {
      push("c-comment", line.slice(i));
      break;
    }
    if (ch === "#" && !/^#\s*[a-z_]+/i.test(line.slice(i))) {
      push("c-comment", line.slice(i));
      break;
    }
    // 块注释起止（单行内）
    if (two === "/*") {
      const end = line.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      push("c-comment", line.slice(i, stop));
      i = stop;
      continue;
    }
    // 字符串 / 模板串
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < n) {
        if (line[j] === "\\") { j += 2; continue; }
        if (line[j] === ch) { j++; break; }
        j++;
      }
      push("c-str", line.slice(i, j));
      i = j;
      continue;
    }
    // 数字
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < n && /[0-9a-fA-FxX._]/.test(line[j])) j++;
      push("c-num", line.slice(i, j));
      i = j;
      continue;
    }
    // 标识符 / 关键字
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(line[j])) j++;
      const word = line.slice(i, j);
      push(KEYWORDS.has(word) ? "c-kw" : null, word);
      i = j;
      continue;
    }
    // 其他字符
    push(null, ch);
    i++;
  }

  return out || " ";
}

/** 整段文本 → 带行号的数据。 */
export function highlightText(text) {
  return text.split("\n").map((line, idx) => ({ n: idx + 1, html: highlightLine(line) }));
}
