# PaperFlow

本项目为南开大学软件学院企业级ai结课大作业项目。  
PaperFlow是个人文献阅读与笔记管理系统，面向大学生与科研初学者。采用 React + Vite + TypeScript + Ant Design + ECharts、Flask + SQLAlchemy、SQLite，前后端通过 REST API 通信。

## 当前进度

**第一阶段：项目骨架 + 数据库 + 后端基础 API 已实现。**

- 文献 CRUD、标题与 DOI 去重、阅读状态、收藏。
- 标签创建、列表、删除及文献多标签关联。
- 文献笔记新增、编辑、删除及非空校验。
- 标题/作者搜索，标签、年份、状态、主题、收藏筛选，排序与分页。
- 来自数据库的 Dashboard 状态、年份和标签聚合。
- 统一 JSON 错误、事务回滚、SQLite 外键与级联删除。
- AIService 占位，无真实 AI 调用。
- 前端应用壳、后端连通性检测、真实文献数量概览及加载/错误状态。

当前网页**还没有文献录入、详情、标签、笔记操作界面及 ECharts 图表**，可先通过 API 操作。ECharts 已安装，后续图表阶段再启用。第一阶段保留空数据库，不自动插入演示数据。

[数据库表、REST API 与开发顺序](docs/design.md) · [第一阶段验收记录](docs/phase-1-verification.md)

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

## 配置和数据

- 默认 SQLite 文件：`backend/instance/paperflow.db`，首次运行后端脚本时创建。
- 可将 `backend/.env.example` 复制为 `backend/.env`，配置 `DATABASE_URL` 与 `AI_API_KEY`；环境变量优先于 `.env`。
- `sqlite:///paperflow.db` 是相对于 Flask instance 目录的路径。Windows 绝对路径示例：`sqlite:///D:/data/paperflow.db`，其父目录需要已存在。
- `.env`、数据库与虚拟环境均已加入 `.gitignore`。
- 备份：停止后端服务后复制数据库文件；恢复时在后端停止状态下替换该文件。
- `init-db` 只创建缺失表，不负责修改旧表结构；后续更改表结构时应新增迁移方案，不能通过删除数据库升级。
- 当前面向本机个人使用，默认监听 `127.0.0.1`，无用户系统。

## 运行检查

```powershell
Push-Location backend
..\.venv\Scripts\python.exe -m pytest -q
Pop-Location

Push-Location frontend
npm.cmd run build
Pop-Location
```

后端测试使用独立临时 SQLite 文件，不操作个人文献库。前端 `build` 包含 TypeScript 类型检查。

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
    pages/              页面
    types/              TypeScript 接口
scripts/                Windows 安装与启动脚本
docs/                   设计与阶段验收记录
```

下一阶段按设计文档实现文献列表、录入编辑和详情页，再完成标签笔记界面与 ECharts Dashboard。
