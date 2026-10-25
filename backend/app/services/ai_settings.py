"""本地单用户 AI 设置：后端持久化、原子替换，公开响应不包含密钥。"""
import json
import os
import tempfile
from pathlib import Path
from threading import RLock
from urllib.parse import urlsplit

from ..errors import APIError
from .validation import text_field

FIELDS = {
    "enabled": "AI_ENABLED", "base_url": "AI_BASE_URL", "model": "AI_MODEL",
    "api_key": "AI_API_KEY", "timeout_seconds": "AI_TIMEOUT_SECONDS",
    "max_output_tokens": "AI_MAX_OUTPUT_TOKENS", "token_parameter": "AI_TOKEN_PARAMETER",
}
INPUT_FIELDS = set(FIELDS) | {"clear_api_key"}


class AISettingsStore:
    def __init__(self, config):
        self.config = config
        self.path = Path(config["AI_SETTINGS_PATH"])
        self.lock = RLock()

    def effective(self):
        try:
            saved = json.loads(self.path.read_text(encoding="utf-8"))
            if not isinstance(saved, dict) or set(saved) != set(FIELDS):
                raise ValueError()
        except FileNotFoundError:
            saved = {}
        except (OSError, ValueError):
            raise APIError("无法读取 AI 设置，请检查后端设置文件和目录权限。", 503, "AI_SETTINGS_ERROR") from None
        return {**self.config, **{FIELDS[key]: value for key, value in saved.items()}}

    def public(self, config=None):
        values = config if config is not None else self.effective()
        return {"enabled": str(values["AI_ENABLED"]).lower() in ("true", "1", "yes"),
                "base_url": values["AI_BASE_URL"], "model": values["AI_MODEL"],
                "has_api_key": bool(values["AI_API_KEY"]), "timeout_seconds": values["AI_TIMEOUT_SECONDS"],
                "max_output_tokens": values["AI_MAX_OUTPUT_TOKENS"], "token_parameter": values["AI_TOKEN_PARAMETER"],
                "source": "saved" if self.path.exists() else "environment"}

    def candidate(self, body):
        current = self.effective()
        values = dict(current)
        for field in ("enabled", "clear_api_key"):
            if field in body and type(body[field]) is not bool:
                raise APIError("启用和清除密钥选项必须为布尔值")
        for field, maximum in (("base_url", 2048), ("model", 200), ("api_key", 4096), ("token_parameter", 30)):
            if field in body:
                value = text_field(body[field], field, maximum)
                if field != "api_key" or value:
                    values[FIELDS[field]] = value
        if body.get("clear_api_key"):
            if body.get("api_key", "").strip():
                raise APIError("不能同时填写新密钥并清除密钥")
            values["AI_API_KEY"] = ""
        if "enabled" in body:
            values["AI_ENABLED"] = body["enabled"]
        for field, minimum, maximum in (("timeout_seconds", 1, 60), ("max_output_tokens", 256, 8000)):
            if field in body:
                value = body[field]
                if type(value) is not int or not minimum <= value <= maximum:
                    raise APIError(f"{field} 必须是 {minimum}～{maximum} 的整数")
                values[FIELDS[field]] = value
        base = values["AI_BASE_URL"].rstrip("/")
        try:
            url = urlsplit(base)
            if (url.scheme not in ("http", "https") or not url.hostname or url.username or url.password
                    or url.query or url.fragment or any(char.isspace() for char in base)):
                raise ValueError()
            url.port
            if url.scheme == "http" and url.hostname not in ("localhost", "127.0.0.1", "::1"):
                raise ValueError()
        except ValueError:
            raise APIError("请填写 HTTPS 服务基础地址；本机服务可使用 HTTP。") from None
        if base.endswith("/chat/completions"):
            raise APIError("请填写基础地址，去掉末尾的 /chat/completions")
        if (base != str(current["AI_BASE_URL"]).rstrip("/") and current["AI_API_KEY"]
                and not body.get("api_key", "").strip() and not body.get("clear_api_key")):
            raise APIError("更换服务地址时请重新填写该服务的密钥，或清除原密钥。")
        values["AI_BASE_URL"] = base
        if values["AI_TOKEN_PARAMETER"] not in ("max_tokens", "max_completion_tokens"):
            raise APIError("输出长度参数不支持")
        if any(ord(char) < 33 or ord(char) > 126 for char in values["AI_API_KEY"]):
            raise APIError("API Key 只能包含可见 ASCII 字符，不能含空白")
        if str(values["AI_ENABLED"]).lower() in ("true", "1", "yes"):
            from .ai_service import AIService
            AIService(values).settings()
        return values

    def save(self, body):
        with self.lock:
            values = self.candidate(body)
            saved = {field: values[key] for field, key in FIELDS.items()}
            temporary = None
            try:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=self.path.parent,
                                                 prefix=".ai-settings-", suffix=".tmp", delete=False) as stream:
                    temporary = stream.name
                    json.dump(saved, stream, ensure_ascii=False)
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(temporary, self.path)
            except OSError:
                raise APIError("AI 设置保存失败，请检查后端目录权限和磁盘空间。原配置保持不变。", 503, "AI_SETTINGS_ERROR") from None
            finally:
                if temporary and os.path.exists(temporary):
                    try:
                        os.unlink(temporary)
                    except OSError:
                        pass
            return self.public(values)
