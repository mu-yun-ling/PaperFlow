# 开发与验收记录

项目按阶段保留设计、实现范围、测试结果和截图。当前功能、启动与使用方法以 [README](../README.md) 为准；历史记录反映当时的实现。

| 记录 | 内容 |
| --- | --- |
| [系统设计](design.md) | 数据模型、接口与项目结构 |
| [功能验收说明](assessment.md) | 核心功能、数据闭环、业务规则与测试结果 |
| [AI 辅助开发记录](ai-development.md) | 按开发顺序整理的阶段提示词、功能调整和问题修复过程 |
| [第一阶段](phase-1-verification.md) | 基础框架 |
| [第二阶段](phase-2-verification.md) | 核心业务与接口 |
| [第三阶段](phase-3-verification.md) | 文献、标签和笔记页面 |
| [第四阶段](phase-4-verification.md) | 搜索、筛选和排序 |
| [第五阶段](phase-5-verification.md) | 概览与统计图表 |
| [第六阶段](phase-6-verification.md) | 附件、PDF、Markdown 与阅读进度 |
| [第七阶段](phase-7-verification.md) | AI 辅助与服务配置 |
| [第八阶段](phase-8-verification.md) | 阅读工作台、连续阅读、书签和 PDF 标记 |
| [最终阶段](phase-9-verification.md) | 笔记与批注交互完善、界面打磨及文档收敛 |

## 阅读历史记录时的规则变化

第一、二阶段采用“标题、作者必填”。第六阶段提示词明确调整为“标题必填，作者及其余元信息选填”，以支持 PDF 识别不完整时先建档；当前实现和测试遵循后者。第一阶段 AIService 为占位，第七阶段接入可配置服务。历史记录中的测试数量、页面范围和限制属于当时状态，当前测试结果见[功能验收说明](assessment.md#测试结果)。
