# PaperFlow 设计与开发计划

> 当前进度（2026-10-23）：第一至第五阶段均已完成。实际阶段划分以各阶段提示词为准，与 [README 开发阶段](../README.md#开发阶段) 保持一致；当前停在第五阶段，后续范围待用户指定。

## 当前实现范围

已完成项目骨架、SQLite 数据库、后端 REST API、核心 CRUD 验收、自动化测试及 Windows 启动说明。前端已具备文献列表、新增、编辑、详情、标签管理和阅读笔记操作，支持多标签、阅读状态、收藏与分页。第四阶段新增标题 / 作者搜索、标签 / 年份 / 阅读状态 / 研究主题组合筛选，以及年份 / 创建时间 / 更新时间升降序排序，全部通过既有 API 查询数据库。第五阶段完成 Dashboard 四项统计和 ECharts 阅读状态、年份分布图表；真实 AI 调用尚未开发。

## 数据库

时间统一保存为 UTC，接口以 ISO 8601（Z 后缀）返回；文献年份可不填，填写时必须为 1000 至当前年份加 1 的整数。作者第一版作为文本存储，便于录入多位作者。

| 表 | 字段 | 约束与用途 |
| --- | --- | --- |
| papers | id | 整数主键 |
| papers | title, title_key | 标题必填，最长 500 字符；title_key 为标准化标题，唯一索引 |
| papers | authors | 必填，最长 1000 字符 |
| papers | year | 可空；数据库限制 1000–9999，服务层限制不晚于明年 |
| papers | venue | 期刊或会议，最长 500 字符 |
| papers | doi | 可空，最长 255 字符，唯一索引；移除 doi.org 前缀并转小写 |
| papers | url | 可空，仅接受 HTTP/HTTPS，最长 2048 字符 |
| papers | abstract | 摘要，最长 50000 字符 |
| papers | research_topic | 研究主题，最长 200 字符，有索引 |
| papers | reading_status | not_started / reading / completed，默认 not_started，有检查约束及索引 |
| papers | is_favorite | 布尔值，默认 false |
| papers | created_at, updated_at | 创建与修改时间 |
| tags | id, name, name_key, created_at | 标签名必填，最长 50 字符；标准化 name_key 唯一 |
| paper_tags | paper_id, tag_id | 复合主键，两侧外键均 ON DELETE CASCADE，避免重复关联 |
| notes | id, paper_id, content, created_at, updated_at | 文献外键必填且有索引；内容非空，最长 50000 字符；ON DELETE CASCADE |

文献与标签为多对多，文献与笔记为一对多。删除文献同时删除其笔记和标签关联，不删除标签；删除标签只删除标签及关联，保留文献。SQLite 每次连接均启用外键。标题和标签按 Unicode NFKC、合并连续空白、casefold 标准化，原显示文本保留；不同大小写的同名内容视为重复。未填写 DOI 用 NULL 保存，允许多条文献没有 DOI。

```mermaid
erDiagram
    papers ||--o{ notes : contains
    papers ||--o{ paper_tags : categorized
    tags ||--o{ paper_tags : labels
```

## REST API

前缀 `/api`。成功返回 `{ "data": ... }`，错误返回 `{ "error": { "code": "...", "message": "...", "details": {} } }`。创建返回 201，更新和查询返回 200，删除返回 204（无响应体）。校验错误 400、资源不存在 404、重复冲突 409、请求体过大 413、数据库异常 500。所有修改请求使用 JSON 对象，未知字段会拒绝。

| 方法 | 路径 | 功能 |
| --- | --- | --- |
| GET | /health | 实际执行数据库查询，检查服务与数据库连接 |
| GET | /papers | 分页搜索、筛选、排序；返回 items、total、page、page_size、pages |
| POST | /papers | 新增文献，可提交 tag_ids |
| GET | /papers/{id} | 文献详情，含标签与笔记 |
| PATCH | /papers/{id} | 部分更新；tag_ids 用于整体替换标签 |
| DELETE | /papers/{id} | 删除文献及其笔记和标签关联 |
| PUT | /papers/{id}/tags/{tag_id} | 幂等添加标签 |
| DELETE | /papers/{id}/tags/{tag_id} | 幂等移除标签；两侧资源必须存在 |
| GET | /tags | 标签列表，含关联文献数量 |
| POST | /tags | 创建标签，body 为 name |
| DELETE | /tags/{id} | 删除标签 |
| GET | /papers/{id}/notes | 按修改时间倒序返回笔记 |
| POST | /papers/{id}/notes | 新建笔记，body 为 content |
| PATCH | /notes/{id} | 编辑笔记内容，不允许更改归属文献 |
| DELETE | /notes/{id} | 删除笔记 |
| GET | /dashboard | 文献总数、收藏数、状态分布、年份分布和标签分布，全部查询数据库 |

文献列表参数：`q`（标题或作者）、`title`、`author`、`tag_id`、`year`、`reading_status`、`research_topic`、`is_favorite=true/false`、`sort_by=created_at/updated_at/title/year`、`sort_order=asc/desc`、`page`（默认 1）、`page_size`（默认 20，上限 100）。多个筛选条件按 AND 组合；关键词采用字面子串匹配（% 和 _ 不作为通配符），主题精确匹配。默认按创建时间倒序，同值按 id 排序，空年份始终排在后面。SQLite 的 LIKE 对 ASCII 大小写不敏感，中文按字面匹配，暂不提供全文检索或拼音检索。

新增示例：

```json
{
  "title": "Attention Is All You Need",
  "authors": "Ashish Vaswani et al.",
  "year": 2017,
  "venue": "NeurIPS",
  "doi": "10.48550/arXiv.1706.03762",
  "url": "https://arxiv.org/abs/1706.03762",
  "abstract": "本文提出 Transformer 架构。",
  "research_topic": "自然语言处理",
  "reading_status": "reading",
  "is_favorite": true,
  "tag_ids": []
}
```

并发情况下依靠数据库唯一约束兜底；业务错误不泄漏数据库连接信息。修改文献及关联标签在一次事务中提交，失败回滚。统计不缓存；第五阶段概览页在挂载、窗口恢复焦点、页面重新可见或手动刷新时重新拉取，旧请求沿用取消机制。第一版只供本机个人使用，无登录和权限，服务默认绑定 127.0.0.1。

第二阶段补充：资源 ID 使用 1 至 9223372036854775807 范围内的整数。路径中的 0 或超范围 ID 返回 404；JSON `tag_ids` 中非法类型或超范围值返回 400；范围内但不存在的标签返回 404。校验失败不改变文献及其关联数据。

## 开发顺序与验收

| 阶段 | 实际范围 | 状态与验收 |
| --- | --- | --- |
| 第一阶段：项目基础 | 应用工厂、数据模型、初始化命令、基础 API、统一异常、AIService 占位、前端应用壳 | [已完成](phase-1-verification.md) |
| 第二阶段：核心业务 CRUD | 文献 / 标签 / 笔记及关联操作验收，超范围 ID 校验修复，真实 HTTP 测试 | [已完成](phase-2-verification.md) |
| 第三阶段：前端核心页面 | 文献列表 / 新增 / 编辑 / 详情、标签管理、阅读笔记，状态与收藏更新，分页及加载 / 空 / 错误状态 | [已完成](phase-3-verification.md) |
| 第四阶段：搜索、筛选和排序 | 六种条件组合查询、三种字段升降序、自动刷新、分页联动、清空筛选和无结果提示 | [已完成](phase-4-verification.md) |
| 第五阶段：Dashboard 和统计可视化 | 四项统计卡片、阅读状态环形图、年份柱状图、自动刷新及加载 / 空 / 错误状态 | [已完成](phase-5-verification.md) |
| 后续阶段 | 具体范围待后续要求确定 | 未开始 |

第三阶段建立 Hash 路由、统一 API 客户端、共享表单与笔记组件。第四阶段在现有列表中加入独立筛选栏，用 URLSearchParams 编码条件，连续输入合并为 300 毫秒后查询，条件与页码一起更新；旧请求沿用取消机制。标题 / 作者为字面子串匹配，主题精确匹配，多条件按 AND 组合；清空恢复创建时间降序与第一页。非法年份不发起新查询，并提示当前展示上次有效结果。未改动后端接口和表结构。

第五阶段启用 `/#/dashboard`，继续以文献库作为默认首页。使用现有 `GET /api/dashboard` 返回的 `total`、`completed`、`reading`、`not_started`、`by_status` 和 `by_year`；不从分页列表推算总数，不在页面写死统计。年份按升序、空年份最后展示，图表更新整体替换数据以移除已消失的分类。ECharts 使用按需模块、SVG 渲染、ResizeObserver 自适应及卸载销毁。没有新增 API、数据库迁移或依赖，也没有开发 AI。完成第五阶段后停止。

每阶段运行检查并记录结果。第一版不接入 AI、不做用户系统、RAG、向量数据库、Redis 或微服务。AIService 只定义未来接口，密钥仅从环境变量读取，不发送外部请求。

## 技术参考

- [Flask 安装及虚拟环境](https://flask.palletsprojects.com/en/stable/installation/)
- [Flask-SQLAlchemy 应用工厂与 SQLAlchemy 2 查询](https://flask-sqlalchemy.palletsprojects.com/en/stable/quickstart/)
- [Vite 启动与构建](https://vite.dev/guide/)
- [ECharts 图表容器、自适应与销毁](https://echarts.apache.org/handbook/en/concepts/chart-size/)
