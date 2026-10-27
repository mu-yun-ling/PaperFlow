from flask import current_app, jsonify, request
from ipaddress import ip_address
from urllib.parse import urlsplit

from . import api
from ..errors import APIError
from ..extensions import db
from ..models import Paper, Tag, Attachment, utc_now
from ..serializers import paper_dict
from ..services.ai_context import build_context
from ..services.papers import get_resource
from ..services.validation import json_body, normalized_key, text_field
from ..services.ai_settings import INPUT_FIELDS
from ..services.ai_service import AIService


def local_settings_access():
    # 当前产品没有账号系统，仅允许本机设置；自定义头阻断跨站表单/简单请求。
    try:
        local = ip_address(request.remote_addr).is_loopback
    except ValueError:
        local = False
    origin = request.headers.get("Origin")
    try:
        local_origin = not origin or urlsplit(origin).hostname in ("localhost", "127.0.0.1", "::1")
    except ValueError:
        local_origin = False
    if not local or not local_origin or request.headers.get("Sec-Fetch-Site") == "cross-site":
        raise APIError("AI 设置仅允许通过本机页面访问。", 403, "AI_SETTINGS_FORBIDDEN")
    if request.method != "GET" and request.headers.get("X-PaperFlow-Settings") != "1":
        raise APIError("请通过 AI 设置页面提交配置。", 403, "AI_SETTINGS_FORBIDDEN")


@api.route("/ai/settings", methods=["GET", "PUT"])
def ai_settings():
    local_settings_access()
    store = current_app.extensions["ai_settings"]
    data = store.public() if request.method == "GET" else store.save(json_body(INPUT_FIELDS))
    response = jsonify(data=data)
    response.headers["Cache-Control"] = "no-store"
    return response


@api.post("/ai/settings/test")
def ai_test_settings():
    local_settings_access()
    values = current_app.extensions["ai_settings"].candidate(json_body(INPUT_FIELDS))
    values["AI_ENABLED"] = True
    return jsonify(data=AIService(values).test_connection())


@api.get("/ai/status")
def ai_status():
    return jsonify(data=current_app.extensions["ai_service"].status())


@api.post("/papers/<int:paper_id>/ai/<action>")
def ai_generate(paper_id, action):
    methods = {"analysis": "summarize_paper", "keywords": "extract_keywords", "reading-summary": "summarize_reading"}
    if action not in methods:
        raise APIError("AI 操作不存在", 404, "NOT_FOUND")
    paper = get_resource(Paper, paper_id, "文献")
    service = current_app.extensions["ai_service"]
    service.settings()  # 未启用时不解析文件、不请求模型。
    context, source = build_context(paper, include_notes=action == "reading-summary")
    # 网络等待期间释放数据库读取事务。
    db.session.rollback()
    result = getattr(service, methods[action])(context)
    return jsonify(data={**result, "source": source})


@api.post("/papers/<int:paper_id>/ai/explain")
def ai_explain(paper_id):
    paper = get_resource(Paper, paper_id, "文献")
    body = json_body({"file_id", "page", "text"})
    file_id, page = body.get("file_id"), body.get("page")
    if type(file_id) is not int or not 1 <= file_id <= 2**63 - 1 or type(page) is not int or not 1 <= page <= 100000:
        raise APIError("请选择有效的 PDF 片段与页码")
    file = get_resource(Attachment, file_id, "附件")
    if file.paper_id != paper.id or file.kind != "paper":
        raise APIError("所选片段不属于这篇文献的原文")
    text = text_field(body.get("text"), "所选片段", 8000, required=True)
    if file.reading_progress and page > file.reading_progress.total_pages:
        raise APIError("页码超出 PDF 范围")
    context = {"title": paper.title, "selected_text": text, "page": page}
    service = current_app.extensions["ai_service"]
    service.settings()
    db.session.rollback()
    return jsonify(data=service.explain_excerpt(context))


@api.post("/papers/<int:paper_id>/ai/keywords/apply")
def ai_apply_keywords(paper_id):
    """仅用户确认后调用；在单个事务中合并标签，重复调用不会重复添加。"""
    paper = get_resource(Paper, paper_id, "文献")
    body = json_body({"keywords"})
    words = body.get("keywords")
    if not isinstance(words, list) or not 1 <= len(words) <= 8:
        raise APIError("请选择 1～8 个关键词")
    names = {}
    for word in words:
        name = text_field(word, "关键词", 50, required=True)
        names.setdefault(normalized_key(name), name)
    existing_keys = {tag.name_key for tag in paper.tags}
    if len(existing_keys | names.keys()) > 100:
        raise APIError("单篇文献最多关联 100 个标签")
    for key, name in names.items():
        if key in existing_keys:
            continue
        tag = db.session.scalar(db.select(Tag).where(Tag.name_key == key))
        if tag is None:
            tag = Tag(name=name, name_key=key)
            db.session.add(tag)
        paper.tags.append(tag)
        paper.updated_at = utc_now()
    db.session.commit()
    return jsonify(data=paper_dict(paper, detail=True))
