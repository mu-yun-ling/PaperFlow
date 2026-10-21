import pytest
from sqlalchemy import delete, func, select, text

from app.extensions import db
from app.models import Note, Paper, Tag, paper_tags


def add_tag(client, name):
    response = client.post("/api/tags", json={"name": name})
    assert response.status_code == 201, response.json
    return response.json["data"]["id"]


def add_note(client, paper_id, content):
    response = client.post(f"/api/papers/{paper_id}/notes", json={"content": content})
    assert response.status_code == 201, response.json
    return response.json["data"]["id"]


@pytest.mark.parametrize("method,path,body", [
    ("get", "/api/papers/{id}", None),
    ("patch", "/api/papers/{id}", {"title": "新标题"}),
    ("delete", "/api/papers/{id}", None),
    ("get", "/api/papers/{id}/notes", None),
    ("post", "/api/papers/{id}/notes", {"content": "笔记"}),
    ("delete", "/api/tags/{id}", None),
    ("patch", "/api/notes/{id}", {"content": "笔记"}),
    ("delete", "/api/notes/{id}", None),
])
def test_out_of_range_resource_id_is_not_found(client, method, path, body):
    # SQLite 的 INTEGER 主键只有 64 位，超范围 ID 也应按不存在的资源处理。
    response = getattr(client, method)(path.format(id=2**63), json=body)
    assert response.status_code == 404
    assert response.json["error"]["code"] == "NOT_FOUND"


@pytest.mark.parametrize("tag_id", [2**63, 10**100])
@pytest.mark.parametrize("operation", ["create", "update"])
def test_out_of_range_tag_id_is_rejected(client, make_paper, tag_id, operation):
    paper = make_paper()
    if operation == "create":
        response = client.post("/api/papers", json={"title": "第二篇文献", "authors": "作者", "tag_ids": [tag_id]})
    else:
        response = client.patch(f"/api/papers/{paper['id']}", json={"title": "不应保存", "tag_ids": [tag_id]})
    assert response.status_code == 400
    assert response.json["error"]["code"] == "VALIDATION_ERROR"
    assert client.get("/api/papers").json["data"]["total"] == 1
    assert client.get(f"/api/papers/{paper['id']}").json["data"]["title"] == paper["title"]


@pytest.mark.parametrize("method", ["put", "delete"])
def test_out_of_range_tag_link(client, make_paper, method):
    paper = make_paper()
    response = getattr(client, method)(f"/api/papers/{paper['id']}/tags/{2**63}")
    assert response.status_code == 404


@pytest.mark.parametrize("change", [
    {"title": " \t\n"}, {"authors": ""}, {"year": 999}, {"year": "2024"},
    {"year": False}, {"doi": "invalid"}, {"tag_ids": [True]},
])
def test_invalid_edit_preserves_all_fields(client, make_paper, change):
    tag_id = add_tag(client, "保留标签")
    paper = make_paper(tag_ids=[tag_id], doi="10.1000/original")
    response = client.patch(f"/api/papers/{paper['id']}", json={"venue": "不应保存的期刊", **change})
    assert response.status_code == 400
    assert client.get(f"/api/papers/{paper['id']}").json["data"] == paper


@pytest.mark.parametrize("duplicate", [
    {"title": "ＰＡＰＥＲ   One"}, {"doi": "HTTPS://DOI.ORG/10.1000/ONE"},
])
def test_duplicate_edit_preserves_tags_and_metadata(client, make_paper, duplicate):
    first_tag = add_tag(client, "原标签")
    other_tag = add_tag(client, "新标签")
    make_paper(title="Paper One", doi="10.1000/one")
    paper = make_paper(title="Paper Two", doi="10.1000/two", tag_ids=[first_tag])
    response = client.patch(f"/api/papers/{paper['id']}", json={**duplicate, "tag_ids": [other_tag], "authors": "不应保存"})
    assert response.status_code == 409
    assert response.json["error"]["code"] == "DUPLICATE_PAPER"
    assert client.get(f"/api/papers/{paper['id']}").json["data"] == paper


def test_edit_all_fields_and_clear_optional_values(client, make_paper):
    tag_id = add_tag(client, "新标签")
    paper = make_paper()
    url = f"/api/papers/{paper['id']}"
    changes = {"title": "修改标题", "authors": "王五", "year": 2020, "venue": "期刊",
               "doi": "10.1000/edited", "url": "https://example.org/paper", "abstract": "摘要",
               "research_topic": "机器学习", "reading_status": "reading", "is_favorite": True,
               "tag_ids": [tag_id]}
    response = client.patch(url, json=changes)
    assert response.status_code == 200
    updated = response.json["data"]
    for key, value in changes.items():
        if key != "tag_ids":
            assert updated[key] == value
    assert [tag["id"] for tag in updated["tags"]] == [tag_id]
    assert updated["created_at"] == paper["created_at"]
    assert updated["updated_at"] > paper["updated_at"]
    response = client.patch(url, json={"year": None, "doi": "", "url": None, "tag_ids": []})
    assert response.status_code == 200
    result = response.json["data"]
    assert result["year"] is result["doi"] is result["url"] is None
    assert result["tags"] == []
    assert result["title"] == "修改标题"


def test_many_to_many_and_note_isolation(client, make_paper, app):
    shared = add_tag(client, "公共标签")
    exclusive = add_tag(client, "专属标签")
    first = make_paper(title="文献甲", tag_ids=[shared, exclusive])
    second = make_paper(title="文献乙", tag_ids=[shared])
    first_id, second_id = first["id"], second["id"]
    add_note(client, first_id, "甲的笔记一")
    add_note(client, first_id, "甲的笔记二")
    second_note = add_note(client, second_id, "乙的笔记")
    assert len(client.get(f"/api/papers/{first_id}/notes").json["data"]) == 2
    assert [note["id"] for note in client.get(f"/api/papers/{second_id}/notes").json["data"]] == [second_note]
    tag_counts = {tag["id"]: tag["paper_count"] for tag in client.get("/api/tags").json["data"]}
    assert tag_counts == {shared: 2, exclusive: 1}
    assert client.delete(f"/api/papers/{first_id}").status_code == 204
    remaining = client.get(f"/api/papers/{second_id}").json["data"]
    assert [tag["id"] for tag in remaining["tags"]] == [shared]
    assert [note["id"] for note in remaining["notes"]] == [second_note]
    tag_counts = {tag["id"]: tag["paper_count"] for tag in client.get("/api/tags").json["data"]}
    assert tag_counts == {shared: 1, exclusive: 0}
    assert client.delete(f"/api/tags/{shared}").status_code == 204
    remaining = client.get(f"/api/papers/{second_id}").json["data"]
    assert remaining["tags"] == [] and len(remaining["notes"]) == 1
    with app.app_context():
        assert db.session.execute(text("PRAGMA foreign_key_check")).all() == []
        assert db.session.scalar(select(func.count(Note.id))) == 1
        assert db.session.scalar(select(func.count()).select_from(paper_tags)) == 0


def test_database_cascade_without_orm_relationship_cleanup(client, make_paper, app):
    tag_id = add_tag(client, "数据库级联")
    paper = make_paper(tag_ids=[tag_id])
    add_note(client, paper["id"], "应被级联删除")
    with app.app_context():
        # 直接 DELETE 不触发 ORM 关系清理，确认真正由数据库外键兜底。
        db.session.execute(delete(Paper).where(Paper.id == paper["id"]))
        db.session.commit()
        assert db.session.scalar(select(func.count(Note.id))) == 0
        assert db.session.scalar(select(func.count()).select_from(paper_tags)) == 0
        assert db.session.get(Tag, tag_id) is not None
        assert db.session.execute(text("PRAGMA foreign_key_check")).all() == []


def test_missing_tag_link_does_not_change_paper(client, make_paper):
    paper = make_paper()
    for method in (client.put, client.delete):
        assert method(f"/api/papers/{paper['id']}/tags/999").status_code == 404
    assert client.get(f"/api/papers/{paper['id']}").json["data"] == paper
