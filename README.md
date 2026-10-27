# PaperFlow

个人文献阅读与笔记工作台。把论文原文、摘录、自己的理解放在一起，让阅读留下可回溯的记录。

南开大学软件学院「企业级 AI」课程项目。

![阅读工作台](docs/screenshots/final-reading.jpg)

## 可以做什么

- **管理文献**：PDF 信息预填、标签与收藏、组合筛选，快速找回正在读的论文。
- **连续阅读**：缩略图、缩放、阅读进度与位置恢复，可调宽度的原文与笔记对照。
- **随读随记**：手动关联页码、跨页追加摘录、精确回到原文，支持 Markdown 与 LaTeX。
- **直接批注**：高亮、画线、可移动和调整尺寸的文字批注，以及撤销／重做。
- **保留思考**：本机草稿恢复、笔记搜索和页码筛选，支持 PDF、DOCX、Markdown、TXT 附件。
- **AI 辅助**：论文分析、关键词建议、阅读总结与片段解释，可在页面配置兼容服务。

## 本地运行

需要 **Python 3.10+**、**Node.js 22.13+**。在 Windows PowerShell 中执行：

```powershell
# 首次安装
.\scripts\setup.ps1

# 启动后端
.\scripts\start-backend.ps1
```

另开一个终端：

```powershell
.\scripts\start-frontend.ps1
```

打开 [http://127.0.0.1:5173](http://127.0.0.1:5173)。AI 功能可在侧栏「AI 设置」中配置，其余功能无需模型服务即可使用。

文献和附件保存在本机 `backend/instance/`；备份时请保留整个目录。在线笔记草稿暂存在当前浏览器，正式保存后写入数据库。下载原文得到原始 PDF，不包含站内批注。

## 技术栈

React · TypeScript · Vite · Ant Design · PDF.js · ECharts

Flask · SQLAlchemy · SQLite

## 文件结构

```text
PaperFlow/
├─ backend/                         后端服务
│  ├─ app/
│  │  ├─ __init__.py                 创建 Flask 应用、加载配置与注册接口
│  │  ├─ models/                    文献、标签、笔记、附件与批注的数据模型
│  │  ├─ routes/                    REST API：文献、文件、笔记、批注与 AI
│  │  ├─ services/                  业务逻辑、文件管理、PDF 提取与 AI 调用
│  │  ├─ migrations.py              保留原数据的数据库升级
│  │  ├─ serializers.py             将数据库对象转换为接口响应
│  │  ├─ errors.py                  统一错误响应与异常处理
│  │  └─ extensions.py              SQLAlchemy 与数据库连接设置
│  ├─ tests/                        后端接口、数据与文件处理测试
│  ├─ .env.example                  环境变量配置示例
│  ├─ requirements.txt              Python 直接依赖
│  ├─ requirements-lock.txt         已验证的 Python 依赖版本
│  └─ instance/                     本机数据库、上传附件、AI 设置与运行日志
├─ frontend/                        前端应用
│  ├─ src/
│  │  ├─ main.tsx                   浏览器入口，加载应用与样式
│  │  ├─ App.tsx                    全局主题、语言与应用外壳
│  │  ├─ routing.ts                 页面地址解析与导航
│  │  ├─ pages/                     首页、文献库、详情、录入、标签和 AI 设置
│  │  ├─ components/                PDF 阅读器、笔记编辑器与可复用界面组件
│  │  ├─ hooks/                     数据加载、共享草稿与批注状态管理
│  │  ├─ api/                       后端请求封装与错误处理
│  │  ├─ types/                     接口数据与批注的 TypeScript 类型
│  │  ├─ utils/                     笔记编解码、页码布局、筛选等工具
│  │  ├─ styles.css                 基础页面、表单与 Markdown 样式
│  │  └─ workspace.css              阅读工作台主题与响应式布局
│  ├─ tests/                        前端数据、路由与工具逻辑测试
│  ├─ scripts/pdf-assets.mjs        准备 PDF.js 字体与解析资源
│  ├─ package.json                  前端依赖与开发、测试、构建命令
│  ├─ package-lock.json             锁定前端依赖版本
│  └─ vite.config.ts                开发端口、API 代理与构建配置
├─ scripts/
│  ├─ setup.ps1                     安装依赖并初始化数据库
│  ├─ start-backend.ps1             升级数据库并启动后端
│  ├─ start-frontend.ps1            启动前端开发服务
│  └─ preview_*.py                  使用独立示例数据的界面验收环境
├─ docs/                            使用指南、系统设计与阶段验收记录
│  └─ screenshots/                  界面截图与验收图片
└─ README.md                        项目介绍与快速开始
```

`backend/instance/`、`.venv/`、`frontend/node_modules/`、`frontend/dist/` 和自动准备的 `frontend/public/pdfjs/` 为本机数据或生成内容，不提交到仓库。本地 `prompt/` 保存开发提示词与概念图，也已忽略。

## 文档

- [使用与配置](docs/user-guide.md)
- [系统设计与 API](docs/design.md)
- [开发与验收记录](docs/development.md)

## 运行检查

```powershell
cd backend
..\.venv\Scripts\python.exe -m pytest -q
cd ../frontend
npm.cmd test
npm.cmd run build
```

## 附录：开发过程与记录

各阶段的实现范围、验证步骤和截图保留在开发记录中，以下仅作索引；完整目录见[开发与验收记录](docs/development.md)。

| 阶段 | 主要内容 | 详细记录 |
| --- | --- | --- |
| 第一阶段 | 项目骨架、数据库与基础 API | [基础框架验收](docs/phase-1-verification.md) |
| 第二阶段 | 文献、标签与笔记的核心业务 | [核心业务验收](docs/phase-2-verification.md) |
| 第三阶段 | 文献管理与阅读笔记页面 | [前端页面验收](docs/phase-3-verification.md) |
| 第四阶段 | 搜索、组合筛选、排序与分页 | [检索功能验收](docs/phase-4-verification.md) |
| 第五阶段 | 阅读概览与统计图表 | [统计可视化验收](docs/phase-5-verification.md) |
| 第六阶段 | 附件、PDF 阅读、Markdown 与阅读进度 | [文件与阅读体验验收](docs/phase-6-verification.md) |
| 第七阶段 | AI 分析、关键词、总结与服务配置 | [AI 功能验收](docs/phase-7-verification.md) |
| 第八阶段 | 连续阅读、摘录联动、书签与 PDF 标记 | [阅读工作台验收](docs/phase-8-verification.md) |
| 最终阶段 | 笔记与批注交互完善、界面打磨及文档整理 | [最终验收](docs/phase-9-verification.md) |
