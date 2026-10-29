from sqlalchemy import func, select

from ..errors import APIError
from ..extensions import db
from ..models import Note, Paper, Tag, paper_tags, utc_now
from ..serializers import tag_dict
from .validation import normalized_key, text_field


def create_tag(body):
    name = text_field(body.get("name"), "标签名", 50, required=True)
    key = normalized_key(name)
    if db.session.scalar(select(Tag.id).where(Tag.name_key == key)) is not None:
        raise APIError("标签已存在", 409, "DUPLICATE_TAG")
    tag = Tag(name=name, name_key=key)
    db.session.add(tag)
    db.session.commit()
    return tag


def list_tags():
    rows = db.session.execute(select(Tag, func.count(paper_tags.c.paper_id))
                              .outerjoin(paper_tags, Tag.id == paper_tags.c.tag_id)
                              .group_by(Tag.id).order_by(Tag.name_key, Tag.id)).all()
    return [dict(tag_dict(tag), paper_count=count) for tag, count in rows]


def set_paper_tag(paper, tag, attached):
    # 关联操作保持幂等：重复添加或移除不会增加关系记录，也不会误改其他文献。
    if attached and tag not in paper.tags:
        if len(paper.tags) >= 100:
            raise APIError("单篇文献最多关联 100 个标签")
        paper.tags.append(tag)
        paper.updated_at = utc_now()
    elif not attached and tag in paper.tags:
        paper.tags.remove(tag)
        paper.updated_at = utc_now()
    db.session.commit()


def save_note(body, paper=None, note=None):
    # 创建时由路由查出所属文献，更新时只接受正文；不能通过编辑笔记转移归属。
    # 非空和长度校验先于赋值，空笔记既不能新建，也不能覆盖已有内容。
    content = text_field(body.get("content"), "笔记内容", 50000, required=True)
    if note is None:
        note = Note(paper=paper, content=content)
        db.session.add(note)
    else:
        note.content = content
        note.updated_at = utc_now()
    db.session.commit()
    return note


def delete_resource(resource):
    db.session.delete(resource)
    db.session.commit()
