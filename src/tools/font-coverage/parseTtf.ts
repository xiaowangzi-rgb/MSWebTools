/**
 * 极简 TTF/OTF cmap 解析：从 ArrayBuffer 读出一个字体实际映射的 Unicode 码点集合，
 * 转成 [start, end] 区间数组（与 scripts/sync-font-coverage.py 输出的结构一致）。
 *
 * 支持：TTF (0x00010000 / 'true')、OTF (OTTO)、TTC 集合（取第一个字体）。
 * 只处理 cmap format 4（BMP 分段映射）和 format 12（全 Unicode 分段映射）—— 99% 的
 * 现代字体都有其中之一，优先选 format 12 以覆盖补充平面。
 *
 * 不做空字形过滤（与 py 脚本不同）：浏览器端为了实现简单略过，最终覆盖可能会比
 * 真正可渲染的略宽一点点。对交互式调试够用。
 */

export type Ranges = [number, number][];

const TAG_TTF1 = 0x00010000;
const TAG_TRUE = 0x74727565; // 'true'
const TAG_OTTO = 0x4f54544f; // 'OTTO'
const TAG_TTC = 0x74746366; // 'ttcf'
const TAG_CMAP = 0x636d6170; // 'cmap'

export function parseTtfRanges(buf: ArrayBuffer): { codepoints: number; ranges: Ranges } {
  const dv = new DataView(buf);
  const tag = dv.getUint32(0);

  let offset: number;
  if (tag === TAG_TTC) {
    const numFonts = dv.getUint32(8);
    if (numFonts === 0) throw new Error('字体集合为空 (TTC empty)');
    offset = dv.getUint32(12);
  } else if (tag === TAG_TTF1 || tag === TAG_TRUE || tag === TAG_OTTO) {
    offset = 0;
  } else {
    throw new Error('不是有效的 TTF/OTF 文件 (unrecognized header)');
  }

  const cpSet = readCmap(dv, offset);
  return { codepoints: cpSet.size, ranges: toRanges(cpSet) };
}

function readCmap(dv: DataView, fontOffset: number): Set<number> {
  const numTables = dv.getUint16(fontOffset + 4);
  let cmapOffset = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = fontOffset + 12 + i * 16;
    if (dv.getUint32(rec) === TAG_CMAP) {
      cmapOffset = dv.getUint32(rec + 8);
      break;
    }
  }
  if (cmapOffset < 0) throw new Error('字体缺少 cmap 表');

  const numSubtables = dv.getUint16(cmapOffset + 2);
  let bestOffset = -1;
  let bestFormat = -1;
  for (let i = 0; i < numSubtables; i++) {
    const rec = cmapOffset + 4 + i * 8;
    const platformID = dv.getUint16(rec);
    const encodingID = dv.getUint16(rec + 2);
    const subOffset = cmapOffset + dv.getUint32(rec + 4);
    const isUnicode =
      platformID === 0 ||
      (platformID === 3 && (encodingID === 1 || encodingID === 10));
    if (!isUnicode) continue;
    const format = dv.getUint16(subOffset);
    if (format === 12) {
      bestOffset = subOffset;
      bestFormat = 12;
      break; // format 12 是最理想的，找到就停
    }
    if (format === 4 && bestFormat !== 12) {
      bestOffset = subOffset;
      bestFormat = 4;
    }
  }

  if (bestFormat === 12) return parseFormat12(dv, bestOffset);
  if (bestFormat === 4) return parseFormat4(dv, bestOffset);
  throw new Error('字体没有 format 4 或 12 的 Unicode cmap 子表');
}

function parseFormat4(dv: DataView, off: number): Set<number> {
  const segCountX2 = dv.getUint16(off + 6);
  const segCount = segCountX2 / 2;
  const endOff = off + 14;
  const startOff = endOff + segCountX2 + 2;
  const out = new Set<number>();
  for (let i = 0; i < segCount; i++) {
    const end = dv.getUint16(endOff + i * 2);
    const start = dv.getUint16(startOff + i * 2);
    if (start === 0xffff && end === 0xffff) continue;
    for (let cp = start; cp <= end; cp++) out.add(cp);
  }
  return out;
}

function parseFormat12(dv: DataView, off: number): Set<number> {
  const numGroups = dv.getUint32(off + 12);
  const out = new Set<number>();
  for (let i = 0; i < numGroups; i++) {
    const g = off + 16 + i * 12;
    const start = dv.getUint32(g);
    const end = dv.getUint32(g + 4);
    for (let cp = start; cp <= end; cp++) out.add(cp);
  }
  return out;
}

function toRanges(cps: Set<number>): Ranges {
  if (cps.size === 0) return [];
  const sorted = [...cps].sort((a, b) => a - b);
  const ranges: Ranges = [];
  let start = sorted[0];
  let prev = start;
  for (let i = 1; i < sorted.length; i++) {
    const cp = sorted[i];
    if (cp === prev + 1) {
      prev = cp;
      continue;
    }
    ranges.push([start, prev]);
    start = cp;
    prev = cp;
  }
  ranges.push([start, prev]);
  return ranges;
}

export async function parseTtfFile(file: File): Promise<{
  codepoints: number;
  ranges: Ranges;
}> {
  const buf = await file.arrayBuffer();
  return parseTtfRanges(buf);
}
