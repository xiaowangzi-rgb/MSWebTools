import { unzipSync, strFromU8 } from 'fflate';

/**
 * 提取 .xlsx / .xlsm / .xltx 中所有可见文本（共享字符串 + 单元格内联字符串 + 批注）。
 * xlsx 本质是 ZIP，内部是一组 XML；文本分布在：
 *  - xl/sharedStrings.xml    — 绝大多数字符串在这里
 *  - xl/worksheets/sheetN.xml — 内联字符串、富文本
 *  - xl/comments*.xml         — 批注
 * 全部通过收集 <t> 元素的 textContent 得到。
 */

const XLSX_EXT = /\.(xlsx|xlsm|xltx)$/i;

const KNOWN_BINARY_EXTENSIONS = [
  // 旧 Office 格式（二进制，不是 ZIP）
  '.xls', '.doc', '.ppt',
  // 其他 OOXML（暂不原生支持，但后续可沿用同一思路扩展）
  '.docx', '.pptx',
  // 文档 / 归档 / 媒体 / 可执行 / 字体
  '.pdf',
  '.zip', '.tar', '.gz', '.tgz', '.7z', '.rar', '.bz2',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.ico', '.bmp', '.tiff',
  '.mp3', '.mp4', '.wav', '.ogg', '.mov', '.avi', '.mkv',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.woff', '.woff2', '.ttf', '.otf',
];

export type FileKind = 'xlsx' | 'text' | 'unsupported';

export function getFileKind(name: string): FileKind {
  const lower = name.toLowerCase();
  if (XLSX_EXT.test(lower)) return 'xlsx';
  if (KNOWN_BINARY_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'unsupported';
  return 'text';
}

export function getUnsupportedReason(name: string): string {
  const ext = /\.[^.]+$/.exec(name)?.[0]?.toLowerCase() ?? '';
  const pretty = ext || '（无扩展名）';
  return `不支持的二进制格式 ${pretty} —— 请改用纯文本文件（.txt / .csv / .json），或直接粘贴文本。`;
}

export async function extractXlsxText(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());

  // 快速 sniff：xlsx 必然以 ZIP 头 "PK\x03\x04" 开头
  if (!(buf[0] === 0x50 && buf[1] === 0x4b)) {
    throw new Error('.xlsx 文件头无效（不是 ZIP 容器，可能已损坏）');
  }

  let zip: Record<string, Uint8Array>;
  try {
    zip = unzipSync(buf);
  } catch (e) {
    throw new Error(`.xlsx 解压失败：${e instanceof Error ? e.message : String(e)}`);
  }

  const parts: string[] = [];

  // 1) sharedStrings.xml —— 绝大多数单元格文本在这里
  if (zip['xl/sharedStrings.xml']) {
    parts.push(extractTElements(strFromU8(zip['xl/sharedStrings.xml'])));
  }

  // 2) worksheets/sheet*.xml —— 内联字符串 <is><t>...</t></is>
  const sheetPaths = Object.keys(zip)
    .filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(p))
    .sort();
  for (const p of sheetPaths) {
    parts.push(extractTElements(strFromU8(zip[p])));
  }

  // 3) comments*.xml —— 批注文本
  const commentPaths = Object.keys(zip)
    .filter((p) => /^xl\/comments\d+\.xml$/i.test(p))
    .sort();
  for (const p of commentPaths) {
    parts.push(extractTElements(strFromU8(zip[p])));
  }

  const text = parts.filter(Boolean).join('\n');
  if (!text) {
    throw new Error('.xlsx 中未提取到任何文本（工作表可能为空，或使用了不受支持的结构）');
  }
  return text;
}

/** 收集 XML 中所有 <t>...</t> 节点的文本内容。优先用 DOMParser，失败回退正则。 */
function extractTElements(xml: string): string {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    // DOMParser 对非法 XML 会生成 <parsererror> 元素
    if (doc.getElementsByTagName('parsererror').length > 0) {
      throw new Error('XML parse error');
    }
    const out: string[] = [];
    const walk = (node: Node) => {
      for (let i = 0; i < node.childNodes.length; i++) {
        const c = node.childNodes[i];
        if (c.nodeType === 1) {
          const el = c as Element;
          // 用 localName 以容错可能的命名空间前缀
          if (el.localName === 't') {
            const txt = el.textContent;
            if (txt) out.push(txt);
          } else {
            walk(el);
          }
        }
      }
    };
    walk(doc);
    return out.join('\n');
  } catch {
    // 回退：best-effort 正则。textContent 会被 DOMParser 自动反转义，
    // 正则分支需要手工处理常见实体。
    const texts: string[] = [];
    const re = /<(?:[a-z]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-z]+:)?t>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      texts.push(decodeEntities(m[1]));
    }
    return texts.join('\n');
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
