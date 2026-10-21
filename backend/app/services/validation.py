import re
import unicodedata
from datetime import datetime, timezone
from urllib.parse import urlsplit

from flask import request

from ..errors import APIError

STATUSES = ("not_started", "reading", "completed")
# SQLite INTEGER 主键使用有符号 64 位整数。
MAX_RESOURCE_ID = 2**63 - 1


def normalized_key(value):
    return " ".join(unicodedata.normalize("NFKC", value).split()).casefold()


def json_body(allowed):
    body = request.get_json()
    if not isinstance(body, dict):
        raise APIError("请求体必须是 JSON 对象")
    unknown = set(body) - set(allowed)
    if unknown:
        raise APIError("包含不支持的字段", details={"fields": sorted(unknown)})
    if not body:
        raise APIError("请至少提交一个字段")
    return body


def text_field(value, name, maximum, required=False, nullable=False):
    if value is None and nullable:
        return None
    if not isinstance(value, str):
        raise APIError(f"{name}必须是字符串")
    value = value.strip()
    if required and not value:
        raise APIError(f"{name}不能为空")
    if len(value) > maximum:
        raise APIError(f"{name}不能超过 {maximum} 个字符")
    return value or (None if nullable else "")


def year_value(value):
    maximum = datetime.now(timezone.utc).year + 1
    if value is not None and (type(value) is not int or not 1000 <= value <= maximum):
        raise APIError(f"年份必须是 1000 至 {maximum} 之间的整数或 null")
    return value


def doi_value(value):
    value = text_field(value, "DOI", 255, nullable=True)
    if not value:
        return None
    value = re.sub(r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)", "", value, flags=re.I).lower()
    if not re.fullmatch(r"10\.\d{4,9}/\S+", value):
        raise APIError("DOI 格式不正确，例如 10.1000/example")
    return value


def url_value(value):
    value = text_field(value, "原文链接", 2048, nullable=True)
    if not value:
        return None
    try:
        parts = urlsplit(value)
        valid = parts.scheme.lower() in ("http", "https") and bool(parts.hostname)
        # 读取 port 也会校验端口格式。
        parts.port
    except ValueError:
        valid = False
    if not valid or any(char.isspace() or ord(char) < 32 for char in value):
        raise APIError("原文链接必须是有效的 HTTP 或 HTTPS 地址")
    return value


def query_integer(args, name, default=None, minimum=1, maximum=None):
    raw = args.get(name)
    if raw is None:
        return default
    if not re.fullmatch(r"[0-9]{1,9}", raw):
        raise APIError(f"{name} 必须是正整数")
    value = int(raw)
    if value < minimum or (maximum is not None and value > maximum):
        raise APIError(f"{name} 超出允许范围")
    return value
