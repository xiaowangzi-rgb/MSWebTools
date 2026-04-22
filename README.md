# MSWebTools

一个项目网页工具集合站点。每个工具是一个独立模块，首页自动发现并展示。

## 开发

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 生产构建到 dist/
npm run preview  # 本地预览构建产物
```

## 新增一个工具（零配置）

1. 在 `src/tools/` 下新建一个文件夹，例如 `src/tools/json-formatter/`
2. 在该文件夹下创建 `index.tsx`，默认导出一个 React 组件，并命名导出 `meta`：

```tsx
// src/tools/json-formatter/index.tsx
import type { ToolMeta } from '@/tools/types';
import { Braces } from 'lucide-react';

export const meta: ToolMeta = {
  slug: 'json-formatter',        // URL 路径 /tools/json-formatter
  name: 'JSON 格式化',
  description: '格式化、压缩、校验 JSON',
  category: '开发',               // 用于分类筛选
  tags: ['json', 'format'],       // 用于搜索
  icon: Braces,                   // lucide-react 图标
  accent: 'from-sky-500 to-indigo-500', // 卡片渐变色（可选）
};

export default function Tool() {
  return <div>你的工具 UI</div>;
}
```

保存后刷新首页即可看到新卡片，无需修改注册表或路由。

## 项目结构

```
src/
├── main.tsx              # 入口
├── App.tsx               # 路由 + 全局布局
├── index.css             # Tailwind + 基础样式
├── tools/
│   ├── types.ts          # ToolMeta 类型定义
│   ├── registry.ts       # 自动发现所有工具
│   └── <tool-slug>/
│       └── index.tsx     # 工具实现 + meta
├── components/           # 通用 UI 组件
├── pages/                # Home / ToolPage / NotFound
└── hooks/                # useTheme 等
```

## 技术栈

- Vite + React 18 + TypeScript
- TailwindCSS（含深色模式）
- React Router v6
- lucide-react 图标
