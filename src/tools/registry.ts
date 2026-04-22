import { lazy } from 'react';
import type { ComponentType } from 'react';
import type { ToolEntry, ToolMeta } from './types';

/**
 * 自动发现 src/tools/ 下所有工具。
 * 约定：每个工具是一个文件夹，里面的 index.tsx 默认导出组件，并命名导出 meta。
 * 新增工具无需修改此文件。
 */

// 懒加载组件（代码分割）
const componentModules = import.meta.glob<{ default: ComponentType }>(
  './*/index.tsx',
);

// 同步加载 meta —— 首页不用等每个工具 chunk 下载完
const metaModules = import.meta.glob<ToolMeta>('./*/index.tsx', {
  eager: true,
  import: 'meta',
});

const entries: ToolEntry[] = [];
const seenSlugs = new Set<string>();

for (const [path, meta] of Object.entries(metaModules)) {
  if (!meta || !meta.slug) {
    console.warn(`[tool-registry] ${path} 缺少有效的 meta 导出，已跳过`);
    continue;
  }
  if (seenSlugs.has(meta.slug)) {
    console.error(
      `[tool-registry] 发现重复 slug: ${meta.slug}。请确保每个工具的 slug 唯一。`,
    );
    continue;
  }
  const loader = componentModules[path];
  if (!loader) continue;
  seenSlugs.add(meta.slug);
  entries.push({ meta, Component: lazy(loader) });
}

export const tools: ToolEntry[] = entries.sort((a, b) =>
  a.meta.name.localeCompare(b.meta.name, 'zh-CN'),
);

export const visibleTools: ToolEntry[] = tools.filter((t) => !t.meta.hidden);

export function getToolBySlug(slug: string): ToolEntry | undefined {
  return tools.find((t) => t.meta.slug === slug);
}

export function getCategories(): string[] {
  const set = new Set<string>();
  for (const t of visibleTools) {
    set.add(t.meta.category || '未分类');
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN'));
}
