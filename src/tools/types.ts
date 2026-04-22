import type { ComponentType, LazyExoticComponent } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface ToolMeta {
  /** URL slug — 决定访问路径 /tools/:slug，必须在所有工具中唯一 */
  slug: string;
  /** 卡片与页面标题上显示的名称 */
  name: string;
  /** 一句话描述（卡片正文） */
  description: string;
  /** 分类，用于筛选；留空会归入"未分类" */
  category?: string;
  /** 搜索用的关键词 */
  tags?: string[];
  /** 卡片左上角图标（来自 lucide-react） */
  icon?: LucideIcon;
  /** 卡片装饰条渐变，写 Tailwind class，例如 'from-sky-500 to-indigo-500' */
  accent?: string;
  /** 作者或来源（可选） */
  author?: string;
  /** 是否在首页隐藏（仍可通过直达 URL 访问） */
  hidden?: boolean;
}

export interface ToolEntry {
  meta: ToolMeta;
  Component: LazyExoticComponent<ComponentType>;
}
