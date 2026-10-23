# PaperFlow
本项目为南开大学软件学院 **企业级ai** 结课大作业项目。  
个人文献阅读与笔记管理系统，面向大学生与科研初学者。采用 React + Vite + TypeScript + Ant Design + ECharts、Flask + SQLAlchemy、SQLite，前后端通过 REST API 通信。

## 当前进度

**第五阶段：Dashboard 和统计可视化已完成验收。** 新增“阅读概览”入口、四项统计卡片、ECharts 阅读状态环形图与年份柱状图，数据来自真实数据库。沿用现有统计 API，未修改后端业务代码或数据库结构。

- 文献 CRUD、标题与 DOI 去重、阅读状态、收藏。
- 标签创建、列表、删除及文献多标签关联。
- 文献笔记新增、编辑、删除及非空校验。
- 前端支持标题 / 作者搜索，标签、年份、阅读状态、研究主题组合筛选，以及年份 / 创建时间 / 更新时间升降序排序和分页。
- 来自数据库的 Dashboard 状态、年份和标签聚合。
- 统一 JSON 错误、事务回滚、SQLite 外键与级联删除。
- AIService 占位，无真实 AI 调用。
- 前端文献列表与分页、录入编辑、完整详情、阅读状态与收藏切换。
- 标签管理、多标签选择、阅读笔记增删改，以及加载、空状态、错误重试和删除确认。

Dashboard 页面展示文献总数、已读完、阅读中和未开始数量，以及阅读状态和年份分布。新增、删除或修改文献后返回概览会自动更新，也支持切回窗口刷新与手动重试。收藏筛选参数仍仅由后端 API 提供，真实 AI 调用尚未开发。正式数据库不自动插入演示数据，浏览器验收使用独立测试库。

[数据库表、REST API 与开发顺序](docs/design.md) · [第一阶段验收记录](docs/phase-1-verification.md) · [第二阶段验收记录](docs/phase-2-verification.md) · [第三阶段验收记录](docs/phase-3-verification.md) · [第四阶段验收记录](docs/phase-4-verification.md) · [第五阶段验收记录](docs/phase-5-verification.md)

## 开发阶段

阶段划分以各阶段实际提示词为准，当前已完成第五阶段。

| 阶段 | 开发内容 | 状态 |
| --- | --- | --- |
| 第一阶段：项目基础 | 项目骨架、SQLite 数据模型、Flask 基础 API、前端应用壳、安装与启动脚本 | 已完成 |
| 第二阶段：核心业务 CRUD | 文献、标签、笔记及关联操作验收，边界校验修复，真实 HTTP 测试 | 已完成 |
| 第三阶段：前端核心页面 | 文献列表、新增、编辑、详情、标签管理、阅读笔记；状态、收藏、分页及加载 / 空 / 错误提示 | 已完成 |
| 第四阶段：搜索、筛选和排序 | 六种搜索 / 筛选条件组合查询，三种字段升降序、自动刷新、分页联动、清空筛选及无结果提示 | 已完成 |
| 第五阶段：Dashboard 和统计可视化 | 统计卡片、阅读状态环形图、年份柱状图、返回页面自动同步及加载 / 空 / 错误状态 | 已完成 |
| 后续阶段 | 具体范围待后续要求确定 | 未开始 |

第五阶段完成后停止开发；AI 当前仅有服务占位，未接入真实调用。

## Windows 本地运行

需要 Python 3.10+（本次使用 3.12）和 Node.js 22.12+（本次使用 24.11）。请在项目根目录打开 PowerShell。当前机器已安装依赖并初始化数据库，可以直接执行第 2 步。

### 1. 首次安装

```powershell
.\scripts\setup.ps1
```

默认 `python` 版本过旧时，指定较新解释器的真实路径：

```powershell
.\scripts\setup.ps1 -PythonExecutable 'C:\你的Python目录\python.exe'
```

脚本在项目内创建 `.venv`，按锁文件安装后端依赖，执行 `npm ci`，创建缺失的数据表。它不会清空已有数据库。此机器默认 `python` 是 3.8，`py` 列出的 3.14 路径已失效；本次使用本机提供的 Python 3.12 建立了虚拟环境，日常运行请使用脚本或 `.venv\Scripts\python.exe`。

如 PowerShell 执行策略阻止本项目脚本，可仅为本次进程放行，例如 `powershell -ExecutionPolicy Bypass -File .\scripts\start-backend.ps1`，无须更改系统策略。

### 2. 启动后端

```powershell
.\scripts\start-backend.ps1
```

后端地址：<http://127.0.0.1:5000>，健康检查：<http://127.0.0.1:5000/api/health>。

### 3. 新开一个 PowerShell 启动前端

```powershell
.\scripts\start-frontend.ps1
```

打开 <http://127.0.0.1:5173>。Vite 将 `/api` 代理至后端端口 5000，开发时无须额外配置 CORS。两个终端都保持运行；按 `Ctrl+C` 停止对应服务。如果端口被占用，先停止之前启动的同一服务。

## 页面使用

1. 在“标签管理”中创建标签，也可以先录入文献、稍后补充标签。
2. 在“文献库”点击“新增文献”，填写标题和作者；年份、期刊 / 会议、DOI、原文链接、摘要、研究主题等可选。
3. 保存后进入详情；通过“编辑文献”修改信息和多标签关联，也可直接切换阅读状态和收藏。
4. 在详情下方“阅读笔记”新增、编辑或删除笔记。支持多行纯文本，内容不能为空。
5. 删除标签仅移除关联；删除文献会同时删除其笔记，操作前均有确认提示。

| 页面 | 地址 |
| --- | --- |
| 文献列表 | `/#/papers`（首页默认） |
| 新增文献 | `/#/papers/new` |
| 文献详情及阅读笔记 | `/#/papers/{id}` |
| 编辑文献 | `/#/papers/{id}/edit` |
| 标签管理 | `/#/tags` |
| 阅读概览 | `/#/dashboard` |

使用 Hash 路由，详情与编辑链接可直接打开或刷新。列表每页 20 条，窄屏可横向滚动查看右侧列。

### 阅读概览

- 点击导航“阅读概览”，查看整个文献库的统计，不受文献列表筛选和分页影响。
- 状态环形图展示三种阅读状态，悬停查看数量与占比；年份柱状图按年份升序展示，空年份单独归入“未填写”。
- 新增、删除或修改阅读状态后，重新进入概览自动查询最新数据；窗口恢复焦点或页面重新可见时也会查询，可随时点击“刷新统计”。当前没有后台轮询或服务端推送。
- 加载时显示提示，空库显示四项零值和新增入口，接口失败显示错误及“重试”。

### 搜索、筛选和排序

- 在列表上方填写标题或作者关键词，进行字面子串搜索；`%`、`_`、`&` 等按普通字符处理。
- 标签和阅读状态从下拉框选择；年份填写整数；研究主题填写完整主题名称，按精确匹配查询。
- 多个条件同时满足才会出现在结果中。停止输入约 300 毫秒后自动查询，并回到第一页；翻页保留当前条件和排序。
- 可按年份、创建时间、更新时间升序或降序排列；默认创建时间降序。年份为空的文献在年份排序中始终置后。
- “清空筛选”会清除全部条件、恢复默认排序并回到第一页。无结果时可调整条件或清空筛选。
- 非法年份会显示校验提示，列表保留上次有效结果；修正年份后恢复自动查询。条件仅保存在当前列表页面，离开页面或刷新浏览器后恢复默认值。

## 配置和数据

- 默认 SQLite 文件：`backend/instance/paperflow.db`，首次运行后端脚本时创建。
- 可将 `backend/.env.example` 复制为 `backend/.env`，配置 `DATABASE_URL` 与 `AI_API_KEY`；环境变量优先于 `.env`。
- `sqlite:///paperflow.db` 是相对于 Flask instance 目录的路径。Windows 绝对路径示例：`sqlite:///D:/data/paperflow.db`，其父目录需要已存在。
- `.env`、数据库与虚拟环境均已加入 `.gitignore`。
- 备份：停止后端服务后复制数据库文件；恢复时在后端停止状态下替换该文件。
- `init-db` 只创建缺失表，不负责修改旧表结构；后续更改表结构时应新增迁移方案，不能通过删除数据库升级。
- 当前面向本机个人使用，默认监听 `127.0.0.1`，无用户系统。
- 独立联调时可在启动 Vite 前设置 `PAPERFLOW_API_TARGET`，例如 `http://127.0.0.1:5001`；未设置时仍代理至 5000。该变量只配置开发代理。

## 运行检查

```powershell
Push-Location backend
..\.venv\Scripts\python.exe -m pytest -q
Pop-Location

Push-Location frontend
npm.cmd test
npm.cmd run build
Pop-Location
```

第五阶段验收：后端 **115 项**测试通过（本阶段新增 4 项真实 SQLite 统计验收），前端 **22 项**测试通过（新增 2 项并补充路由断言），TypeScript 类型检查与生产构建通过。后端测试使用独立临时 SQLite 文件，不操作个人文献库；前端使用 Node 内置测试工具，无新增依赖。浏览器实测覆盖空库、新增后返回刷新、状态修改、删除后年份分类移除、手动刷新、异常重试和窄屏布局，详见[第五阶段验收记录](docs/phase-5-verification.md)。构建有图表页面分块超过 500 kB 的非阻断提醒；该页面按路由懒加载。

仅运行本阶段新增数据库测试：在 `backend` 目录执行 `..\.venv\Scripts\python.exe -m pytest tests/test_stage5_dashboard.py -q`。

## API 操作示例

以下命令在后端启动后执行，会创建示例文献与笔记；再次执行同一标题会返回 409 重复提示。

```powershell
$apiBase = 'http://127.0.0.1:5000/api'
$paperBody = @{
    title = '我的第一篇文献'
    authors = '张三; 李四'
    year = 2024
    research_topic = '自然语言处理'
    reading_status = 'reading'
} | ConvertTo-Json
$paperResult = Invoke-RestMethod -Uri "$apiBase/papers" -Method Post `
    -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($paperBody))
$paperId = $paperResult.data.id

$noteBody = @{ content = '阅读后记录：研究问题、方法、结论和局限。' } | ConvertTo-Json
Invoke-RestMethod -Uri "$apiBase/papers/$paperId/notes" -Method Post `
    -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($noteBody))

Invoke-RestMethod -Uri "$apiBase/papers/$paperId"
Invoke-RestMethod -Uri "$apiBase/dashboard"
```

完整字段、过滤参数与接口列表见 [设计文档](docs/design.md)。API 的阅读状态值为 `not_started`（未开始）、`reading`（阅读中）、`completed`（已读完）。

## 目录

```text
backend/
  app/
    models/             文献、标签、笔记和关联模型
    routes/             REST 路由
    services/           校验、事务、搜索、统计和 AI 扩展
    serializers.py      响应序列化
    errors.py           统一异常处理
    extensions.py       数据库与 SQLite 连接设置
  tests/                独立 SQLite 集成测试
  requirements.txt      直接依赖范围
  requirements-lock.txt 已验证的精确依赖
frontend/
  src/
    api/                API 请求封装
    components/         公共组件
    hooks/              请求加载、取消与重试
    pages/              列表、表单、详情、标签与页面路由
    types/              TypeScript 接口
    utils/              状态、日期与外链处理
    routing.ts          Hash 路由
  tests/                API 客户端、路由与筛选条件测试
scripts/                Windows 安装与启动脚本
docs/                   设计与阶段验收记录
```

第五阶段到此停止。后续开发范围以新的阶段要求为准。
