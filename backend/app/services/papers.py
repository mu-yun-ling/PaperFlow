from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from ..errors import APIError
from ..extensions import db
from ..models import Paper, Tag, utc_now
from ..serializers import paper_dict
from .validation import MAX_RESOURCE_ID, STATUSES, doi_value, normalized_key, query_integer, text_field, url_value, year_value

PAPER_FIELDS = {"title", "authors", "year", "venue", "doi", "url", "abstract", "research_topic",
                "reading_status", "is_favorite", "tag_ids"}


def get_resource(model, resource_id, name):
    # 超范围 ID 不可能对应已有记录，避免传给 SQLite 后变成 500 错误。
    if not 1 <= resource_id <= MAX_RESOURCE_ID:
        raise APIError(f"{name}不存在", 404, "NOT_FOUND")
    item = db.session.get(model, resource_id)
    if item is None:
        raise APIError(f"{name}不存在", 404, "NOT_FOUND")
    return item


def resolve_tags(ids):
    if not isinstance(ids, list) or any(type(item) is not int or not 1 <= item <= MAX_RESOURCE_ID for item in ids):
        raise APIError(f"tag_ids 必须是 1 至 {MAX_RESOURCE_ID} 范围内的整数数组")
    if len(ids) > 100:
        raise APIError("单篇文献最多关联 100 个标签")
    unique = set(ids)
    tags = db.session.scalars(select(Tag).where(Tag.id.in_(unique)).order_by(Tag.id)).all() if unique else []
    missing = unique - {tag.id for tag in tags}
    if missing:
        raise APIError("部分标签不存在", 404, "NOT_FOUND", {"tag_ids": sorted(missing)})
    return tags


def save_paper(body, paper=None):
    creating = paper is None
    if creating:
        for field, label in (("title", "标题"), ("authors", "作者")):
            if field not in body:
                raise APIError(f"{label}不能为空")
    values = {}
    specifications = {"title": ("标题", 500, True), "authors": ("作者", 1000, True),
                      "venue": ("期刊/会议", 500, False), "abstract": ("摘要", 50000, False),
                      "research_topic": ("研究主题", 200, False)}
    for field, (label, maximum, required) in specifications.items():
        if field in body:
            values[field] = text_field(body[field], label, maximum, required)
    if "title" in values:
        values["title_key"] = normalized_key(values["title"])
    if "year" in body:
        values["year"] = year_value(body["year"])
    if "doi" in body:
        values["doi"] = doi_value(body["doi"])
    if "url" in body:
        values["url"] = url_value(body["url"])
    if "reading_status" in body:
        if body["reading_status"] not in STATUSES:
            raise APIError("阅读状态必须是 not_started、reading 或 completed")
        values["reading_status"] = body["reading_status"]
    if "is_favorite" in body:
        if type(body["is_favorite"]) is not bool:
            raise APIError("是否收藏必须是布尔值")
        values["is_favorite"] = body["is_favorite"]

    # 所有字段和标签校验通过后才修改 ORM 对象，避免半完成更新。
    tags = resolve_tags(body["tag_ids"]) if "tag_ids" in body else None
    for field, label in (("title_key", "标题"), ("doi", "DOI")):
        if values.get(field):
            query = select(Paper.id).where(getattr(Paper, field) == values[field])
            if not creating:
                query = query.where(Paper.id != paper.id)
            if db.session.scalar(query) is not None:
                raise APIError(f"已存在相同{label}的文献", 409, "DUPLICATE_PAPER", {"field": "title" if field == "title_key" else field})
    if creating:
        paper = Paper()
        db.session.add(paper)
    for key, value in values.items():
        setattr(paper, key, value)
    if tags is not None:
        paper.tags = tags
    if not creating:
        paper.updated_at = utc_now()
    db.session.commit()
    return paper


def list_papers(args):
    supported = {"q", "title", "author", "tag_id", "year", "reading_status", "research_topic",
                 "is_favorite", "sort_by", "sort_order", "page", "page_size"}
    if set(args) - supported:
        raise APIError("包含不支持的筛选参数", details={"fields": sorted(set(args) - supported)})
    page = query_integer(args, "page", 1)
    page_size = query_integer(args, "page_size", 20, maximum=100)
    conditions = []
    # autoescape 防止搜索词中的 %、_ 被当成 SQL 通配符。
    for name, column in (("title", Paper.title), ("author", Paper.authors)):
        if args.get(name, "").strip():
            conditions.append(column.contains(args[name].strip(), autoescape=True))
    if args.get("q", "").strip():
        keyword = args["q"].strip()
        conditions.append(or_(Paper.title.contains(keyword, autoescape=True), Paper.authors.contains(keyword, autoescape=True)))
    if "year" in args:
        conditions.append(Paper.year == year_value(query_integer(args, "year")))
    if "tag_id" in args:
        conditions.append(Paper.tags.any(Tag.id == query_integer(args, "tag_id")))
    if "reading_status" in args:
        if args["reading_status"] not in STATUSES:
            raise APIError("阅读状态筛选值不正确")
        conditions.append(Paper.reading_status == args["reading_status"])
    if "research_topic" in args:
        conditions.append(Paper.research_topic == args["research_topic"].strip())
    if "is_favorite" in args:
        if args["is_favorite"] not in ("true", "false"):
            raise APIError("is_favorite 必须是 true 或 false")
        conditions.append(Paper.is_favorite == (args["is_favorite"] == "true"))
    sort_by = args.get("sort_by", "created_at")
    sort_order = args.get("sort_order", "desc")
    if sort_by not in ("created_at", "updated_at", "title", "year") or sort_order not in ("asc", "desc"):
        raise APIError("排序字段或排序方向不正确")
    column = getattr(Paper, sort_by)
    order = column.asc() if sort_order == "asc" else column.desc()
    tie_breaker = Paper.id.asc() if sort_order == "asc" else Paper.id.desc()
    total = db.session.scalar(select(func.count(Paper.id)).where(*conditions))
    query = select(Paper).where(*conditions).options(selectinload(Paper.tags))
    items = db.session.scalars(query.order_by(column.is_(None), order, tie_breaker)
                               .offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [paper_dict(item) for item in items], "total": total, "page": page,
            "page_size": page_size, "pages": (total + page_size - 1) // page_size}
