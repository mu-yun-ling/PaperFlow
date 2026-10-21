import os


class AIService:
    """保留未来 AI 调用入口，第一阶段不接入模型或发送网络请求。"""

    def __init__(self):
        self._api_key = os.getenv("AI_API_KEY")

    def summarize_paper(self, paper):
        raise NotImplementedError("AI 论文摘要尚未启用")

    def extract_keywords(self, paper):
        raise NotImplementedError("AI 关键词提取尚未启用")

    def summarize_reading(self, paper, notes):
        raise NotImplementedError("AI 阅读总结尚未启用")
