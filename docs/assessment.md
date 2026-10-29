# PaperFlow 功能验收说明

PaperFlow 对应“文献阅读与笔记管理系统”选题。本文说明核心功能、数据闭环、异常处理及测试结果。

## 核心功能

| 必做项目 | 页面操作与预期 | 主要实现 | 对应验证 |
| --- | --- | --- | --- |
| 文献信息录入 | 新增文献，填写标题和可选元信息，保存后进入详情；可上传 PDF 预填 | [PaperForm](../frontend/src/components/PaperForm.tsx)、[文献接口](../backend/app/routes/papers.py)、[保存服务](../backend/app/services/papers.py) | [完整流程与字段校验](../backend/tests/test_api.py)、[元信息和文件](../backend/tests/test_stage6_files.py) |
| 文献编辑和删除 | 修改后刷新回读；删除后列表与详情均不能再访问该文献 | [编辑页](../frontend/src/pages/PaperFormPage.tsx)、[删除入口](../frontend/src/components/DeletePaperButton.tsx)、[文献接口](../backend/app/routes/papers.py) | [真实 HTTP CRUD](../backend/tests/test_http_crud.py)、[删除及文件闭环](../backend/tests/test_stage6_files.py) |
| 标签管理 | 创建／删除标签，为文献添加／移除标签，多篇文献可共享 | [标签页](../frontend/src/pages/TagsPage.tsx)、[标签接口](../backend/app/routes/tags.py)、[关联服务](../backend/app/services/library.py) | [多对多与归属隔离](../backend/tests/test_stage2_crud.py) |
| 阅读笔记管理 | 在具体文献内新增、修改、删除笔记；刷新回读，另一篇文献看不到该笔记 | [NotesPanel](../frontend/src/components/NotesPanel.tsx)、[笔记接口](../backend/app/routes/notes.py)、[笔记服务](../backend/app/services/library.py) | [笔记隔离与编辑原子性](../backend/tests/test_stage2_crud.py)、[前端请求约定](../frontend/tests/client.test.mjs) |
| 标题／作者／标签检索 | 独立输入标题或作者，或选择标签，返回对应真实数据；多个条件取交集 | [筛选栏](../frontend/src/components/PaperFilterBar.tsx)、[数据库查询](../backend/app/services/papers.py) | [单项与组合搜索](../backend/tests/test_stage4_search.py)、[筛选请求](../frontend/tests/filters.test.mjs) |
| 筛选或排序 | 按年份、状态、主题、收藏筛选；按年份／创建／更新时间等排序，清空后恢复 | [文献库](../frontend/src/pages/PaperListPage.tsx)、[查询服务](../backend/app/services/papers.py) | [排序及分页](../backend/tests/test_stage4_search.py)、[地址与条件恢复](../frontend/tests/libraryState.test.mjs) |
| 统计可视化 | 首页显示文献数量、阅读状态、年份与标签分布，增删改后重新进入首页更新 | [概览页](../frontend/src/pages/OverviewPage.tsx)、[ECharts 图表](../frontend/src/components/DashboardCharts.tsx)、[聚合服务](../backend/app/services/dashboard.py) | [统计一致性](../backend/tests/test_stage5_dashboard.py)、[前端统计映射](../frontend/tests/dashboard.test.mjs) |

### 核心字段与归属规则

**标题必填，作者和其他元信息选填**。第六阶段调整了作者字段要求，允许 PDF 信息不完整时先建档，后续补充。前后端均执行该规则，需求调整见[AI 辅助开发记录](ai-development.md#6-文件导入与字段调整)。

每条正式笔记通过非空 `paper_id` 外键关联现存文献；创建接口从路径指定文献，编辑接口仅允许正文。前端阅读卡片中的页码、摘录等来源信息保存在笔记正文中，与笔记所属文献的数据库关联共同构成可追溯关系。

## 完整业务闭环

1. 新建文献 A、B，关联同一个标签，在 A 中新增并修改笔记。
2. 刷新详情及重启后端，文献、标签和正式笔记仍可读取；B 中不会出现 A 的笔记。
3. 通过标题、作者、标签组合检索，再修改年份与阅读状态，首页统计随之更新。
4. 删除 A 后，其笔记、附件及标签关系清理，原详情地址返回不存在；B 与共享标签保留，统计同步减少。

自动化依据：`test_api.py::test_complete_reading_workflow`、`test_api.py::test_init_command_and_persistence`、`test_stage2_crud.py::test_many_to_many_and_note_isolation`、`test_stage5_dashboard.py::test_statistics_follow_create_status_year_and_delete`。真实 HTTP CRUD 另由 `test_http_crud.py` 启动独立临时服务验证。

## 业务规则与异常场景

| 场景 | 规则与预期结果 | 核验依据 |
| --- | --- | --- |
| 缺失或全空白标题 | 拒绝保存；后端返回 400，已有记录不变 | [校验服务](../backend/app/services/validation.py)、[API 校验测试](../backend/tests/test_api.py) |
| 非法年份／状态／收藏类型 | 年份为整数且在 1000 至当前 UTC 年+1，或留空；状态限定三种，收藏为布尔值 | [字段与请求测试](../backend/tests/test_api.py) |
| 重复标题或 DOI | 标题按 Unicode、空白、大小写标准化；DOI 去前缀与大小写差异；重复返回 409 | `test_api.py::test_duplicates_and_normalization` |
| 重复或空标签 | 空标签拒绝；标准化同名标签返回 409；重复关联保持幂等 | [标签服务](../backend/app/services/library.py)、[关联测试](../backend/tests/test_api.py) |
| 空笔记或错误归属 | 空正文拒绝；缺失文献返回 404；不能通过更新转移文献归属 | [笔记路由](../backend/app/routes/notes.py)、[笔记隔离测试](../backend/tests/test_stage2_crud.py) |
| 删除关联内容 | 从属记录清理，共享标签及其他文献保留；已删除资源访问返回 404 | [模型外键](../backend/app/models/__init__.py)、[文件生命周期测试](../backend/tests/test_stage6_files.py) |
| 编辑校验失败或重复冲突 | 标题、标签、元信息不出现部分更新 | `test_stage2_crud.py::test_invalid_edit_preserves_all_fields`、`test_duplicate_edit_preserves_tags_and_metadata` |
| 超范围资源 ID | 查询前拦截，返回 404；非法标签 ID 返回 400，避免 SQLite 整数溢出 | [第二阶段修复记录](phase-2-verification.md#实际发现与修复) |
| 错误、空、过大或丢失文件 | 类型／MIME／基本内容校验，单文件 25 MB；过大返回 413，丢失返回明确错误 | [上传服务](../backend/app/services/files.py)、[文件异常测试](../backend/tests/test_stage6_files.py) |
| 数据库或文件操作失败 | 数据库回滚；隔离旧文件恢复，失败新文件清理 | `test_api.py::test_database_exception_rolls_back`、`test_stage6_files.py::test_database_failure_restores_files` |
| 搜索无结果、特殊字符及错误分页 | 空结果可恢复；`%` 和 `_` 按字面查询；错误条件有校验 | [检索测试](../backend/tests/test_stage4_search.py)、[通配符测试](../backend/tests/test_api.py) |
| AI 未配置或上游失败 | 明确提示，基础 CRUD 可继续；失败不覆盖原摘要或笔记 | [AI 异常与写入测试](../backend/tests/test_stage7_ai.py) |

## 扩展与设计

PDF 连续阅读、跨页摘录、来源定位、草稿恢复和批注的验证见[最终阶段记录](phase-9-verification.md)。论文分析、关键词和阅读总结的输入范围、确认保存与异常处理见[AI 阶段记录](phase-7-verification.md)。模块分层、数据约束和事务设计见[系统设计](design.md)，开发过程见[人机协作记录](ai-development.md)。

## 测试结果

验证日期：2026 年 10 月 29 日。

| 检查 | 执行位置与命令 | 实际结果 |
| --- | --- | --- |
| 后端完整测试 | `backend`：`..\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider --basetemp=instance/submission-review-tests --tb=short` | 253 passed，48.30 秒 |
| 前端完整测试 | `frontend`：`npm.cmd test` | 58 passed，0 failed，0 skipped |
| TypeScript 与生产构建 | `frontend`：`npm.cmd run build`，包含 `tsc --noEmit` | 类型检查通过，Vite 构建成功，36.39 秒；保留原有大于 500 kB 的首页图表分包提示 |

测试数据库、附件和设置由独立夹具或临时服务创建，不修改个人文献库。AI 自动测试使用本地模拟服务验证协议、错误与显式保存行为，不等同于真实模型输出质量测试。

浏览器操作结果见[最终阶段记录](phase-9-verification.md#浏览器验收)，本次未重复浏览器验收。当前边界包括：原文下载不包含站内批注，扫描件不做 OCR，DOCX 附件下载后本地打开。
