import json
from datetime import datetime, timezone

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError, OperationalError

from app import create_app
from app.extensions import db
from app.models import Note, Paper, paper_tags
from app.services.ai_service import AIService


def test_empty_database(client):
    assert client.get("/api/health").json["data"]["database"] == "ok"
    stats = client.get("/api/dashboard").json["data"]
    assert stats["total"] == stats["completed"] == stats["reading"] == stats["not_started"] == 0
    assert len(stats["by_status"]) == 3
    assert stats["by_year"] == stats["by_tag"] == []
    assert client.get("/api/papers").json["data"]["total"] == 0


def test_complete_reading_workflow(client, make_paper, app):
    tag = client.post("/api/tags", json={"name": "深度学习"}).json["data"]
    paper = make_paper(tag_ids=[tag["id"], tag["id"]], doi="https://doi.org/10.1000/EXAMPLE", research_topic="自然语言处理")
    pid = paper["id"]
    assert paper["doi"] == "10.1000/example"
    assert len(paper["tags"]) == 1
    assert paper["created_at"].endswith("Z")
    note_response = client.post(f"/api/papers/{pid}/notes", json={"content": "自注意力能建模长距离依赖。"})
    assert note_response.status_code == 201
    note = note_response.json["data"]
    assert note["paper_id"] == pid
    assert client.patch(f"/api/notes/{note['id']}", json={"content": "复现时注意掩码。"}).status_code == 200
    assert client.get(f"/api/papers/{pid}/notes").json["data"][0]["content"] == "复现时注意掩码。"
    before = client.get("/api/dashboard").json["data"]
    assert before["not_started"] == 1 and before["by_tag"][0]["count"] == 1
    updated = client.patch(f"/api/papers/{pid}", json={"reading_status": "completed", "is_favorite": True})
    assert updated.status_code == 200
    stats = client.get("/api/dashboard").json["data"]
    assert stats["completed"] == stats["total"] == stats["favorites"] == 1
    assert stats["not_started"] == 0
    query = {"q": "注意力", "author": "张三", "tag_id": tag["id"], "year": 2024,
             "reading_status": "completed", "research_topic": "自然语言处理", "is_favorite": "true"}
    found = client.get("/api/papers", query_string=query).json["data"]
    assert found["total"] == 1 and found["items"][0]["id"] == pid
    detail = client.get(f"/api/papers/{pid}").json["data"]
    assert detail["notes"][0]["content"] == "复现时注意掩码。"
    assert client.delete(f"/api/papers/{pid}").status_code == 204
    assert client.get(f"/api/papers/{pid}").status_code == 404
    assert client.patch(f"/api/notes/{note['id']}", json={"content": "x"}).status_code == 404
    with app.app_context():
        assert db.session.scalar(select(func.count(Note.id))) == 0
        assert db.session.scalar(select(func.count()).select_from(paper_tags)) == 0
    assert client.get("/api/tags").json["data"][0]["paper_count"] == 0
    assert client.get("/api/dashboard").json["data"]["total"] == 0


@pytest.mark.parametrize("override", [
    {"title": " \n "}, {"authors": ""}, {"title": None}, {"authors": []},
    {"title": "a" * 501}, {"year": "2024"}, {"year": True}, {"year": 2024.5}, {"year": 999},
    {"year": datetime.now(timezone.utc).year + 2}, {"reading_status": "done"},
    {"reading_status": []}, {"is_favorite": 1}, {"doi": "bad-doi"}, {"doi": "10.1000/a b"},
    {"url": "javascript:alert(1)"}, {"url": "https://"}, {"url": "http://[bad"},
    {"url": "https://example.org:bad"}, {"url": "https://example.org/a b"},
    {"tag_ids": "1"}, {"tag_ids": [True]}, {"tag_ids": [-1]}, {"tag_ids": list(range(1, 102))},
    {"unexpected": "field"}, {"abstract": None},
])
def test_invalid_paper(client, override):
    payload = {"title": "有效标题", "authors": "有效作者", **override}
    response = client.post("/api/papers", json=payload)
    assert response.status_code == 400, response.json
    assert "error" in response.json
    assert client.get("/api/dashboard").json["data"]["total"] == 0


@pytest.mark.parametrize("payload", [{"title": "x"}, {"authors": "x"}, {}, [], None, "text"])
def test_missing_fields_and_invalid_json_shape(client, payload):
    response = client.post("/api/papers", data=json.dumps(payload), content_type="application/json")
    assert response.status_code == 400


def test_duplicates_and_normalization(client, make_paper):
    paper = make_paper(title="  Attention   Is All  ", doi="doi:10.1000/ABC")
    duplicate_title = client.post("/api/papers", json={"title": "ＡＴＴＥＮＴＩＯＮ is all", "authors": "Other"})
    assert duplicate_title.status_code == 409
    assert duplicate_title.json["error"]["details"]["field"] == "title"
    duplicate_doi = client.post("/api/papers", json={"title": "Different", "authors": "Other", "doi": "https://dx.doi.org/10.1000/abc"})
    assert duplicate_doi.status_code == 409
    assert duplicate_doi.json["error"]["details"]["field"] == "doi"
    assert client.patch(f"/api/papers/{paper['id']}", json={"title": "Attention Is All", "doi": "10.1000/abc"}).status_code == 200
    make_paper(title="没有 DOI 一", doi="")
    make_paper(title="没有 DOI 二", doi=None)
    assert client.post("/api/tags", json={"name": " ＡＩ "}).status_code == 201
    assert client.post("/api/tags", json={"name": "ai"}).status_code == 409


def test_failed_update_is_atomic(client, make_paper):
    paper = make_paper()
    pid = paper["id"]
    response = client.patch(f"/api/papers/{pid}", json={"title": "不应保存", "tag_ids": [999]})
    assert response.status_code == 404
    assert client.get(f"/api/papers/{pid}").json["data"]["title"] == paper["title"]
    other = make_paper(title="已有标题", doi="10.1000/existing")
    assert client.patch(f"/api/papers/{pid}", json={"title": other["title"], "reading_status": "completed"}).status_code == 409
    assert client.get(f"/api/papers/{pid}").json["data"]["reading_status"] == "not_started"
    assert client.post("/api/papers", json={"title": "新标题", "authors": "作者", "tag_ids": [999]}).status_code == 404
    assert client.get("/api/dashboard").json["data"]["total"] == 2


def test_tag_association_and_deletion(client, make_paper):
    paper = make_paper()
    tag = client.post("/api/tags", json={"name": "方法"}).json["data"]
    link = f"/api/papers/{paper['id']}/tags/{tag['id']}"
    assert client.put(link).status_code == 200
    assert len(client.put(link).json["data"]["tags"]) == 1
    assert client.delete(link).status_code == 204
    assert client.delete(link).status_code == 204
    assert client.get(f"/api/papers/{paper['id']}").json["data"]["tags"] == []
    assert client.patch(f"/api/papers/{paper['id']}", json={"tag_ids": [tag["id"]]}).status_code == 200
    assert client.delete(f"/api/tags/{tag['id']}").status_code == 204
    assert client.get(f"/api/papers/{paper['id']}").json["data"]["tags"] == []
    assert client.get("/api/dashboard").json["data"]["total"] == 1


def test_notes_and_tags_validation(client, make_paper):
    paper = make_paper()
    path = f"/api/papers/{paper['id']}/notes"
    for value in ("", " \n\t", None, 123, "a" * 50001):
        assert client.post(path, json={"content": value}).status_code == 400
    for value in ("", " \n", None, 123, "a" * 51):
        assert client.post("/api/tags", json={"name": value}).status_code == 400
    note = client.post(path, json={"content": "第一条笔记"}).json["data"]
    assert client.patch(f"/api/notes/{note['id']}", json={"paper_id": 999}).status_code == 400
    assert client.patch(f"/api/notes/{note['id']}", json={"content": " "}).status_code == 400
    assert client.get(path).json["data"][0]["content"] == "第一条笔记"
    assert client.delete(f"/api/notes/{note['id']}").status_code == 204
    assert client.get(path).json["data"] == []


def test_pagination_sort_and_literal_search(client, make_paper):
    make_paper(title="100%_准确", authors="Alice", year=2020)
    make_paper(title="普通标题", authors="Bob", year=2023, reading_status="reading")
    make_paper(title="未知年份", authors="Alice", year=None)
    result = client.get("/api/papers?sort_by=year&sort_order=desc&page_size=1&page=2").json["data"]
    assert result["total"] == 3 and result["pages"] == 3 and result["items"][0]["year"] == 2020
    assert client.get("/api/papers?sort_by=year&sort_order=asc").json["data"]["items"][-1]["year"] is None
    for param in ("title", "q"):
        assert client.get("/api/papers", query_string={param: "%_"}).json["data"]["total"] == 1
    assert client.get("/api/papers?author=Alice").json["data"]["total"] == 2
    assert client.get("/api/papers?q=Bob").json["data"]["total"] == 1
    assert client.get("/api/papers?reading_status=reading").json["data"]["total"] == 1
    assert client.get("/api/papers?page=100").json["data"]["items"] == []
    stats = client.get("/api/dashboard").json["data"]
    assert stats["reading"] == 1
    assert stats["by_year"][-1] == {"year": None, "count": 1}


@pytest.mark.parametrize("query", ["page=0", "page=x", "page_size=101", "page_size=-1", "year=0", "year=2024.0",
    "reading_status=bad", "sort_by=id;DROP", "sort_order=bad", "is_favorite=1", "tag_id=x", "foo=x"])
def test_invalid_filters(client, query):
    assert client.get(f"/api/papers?{query}").status_code == 400


@pytest.mark.parametrize("method,path,body", [
    ("get", "/api/papers/999", None), ("patch", "/api/papers/999", {"title": "x"}),
    ("delete", "/api/papers/999", None), ("delete", "/api/tags/999", None),
    ("get", "/api/papers/999/notes", None), ("post", "/api/papers/999/notes", {"content": "x"}),
    ("patch", "/api/notes/999", {"content": "x"}), ("delete", "/api/notes/999", None),
    ("put", "/api/papers/999/tags/999", None), ("get", "/api/missing", None),
])
def test_not_found(client, method, path, body):
    result = getattr(client, method)(path, json=body)
    assert result.status_code == 404 and "error" in result.json


def test_http_errors_are_json(client):
    assert client.post("/api/papers", data="{", content_type="application/json").status_code == 400
    assert client.post("/api/papers", data="plain").status_code == 415
    response = client.put("/api/papers")
    assert response.status_code == 405 and "Allow" in response.headers and "error" in response.json
    response = client.post("/api/papers", json={"title": "x" * 1100000})
    assert response.status_code == 413 and "error" in response.json


def test_database_exception_rolls_back(client, make_paper, monkeypatch):
    paper = make_paper()
    with monkeypatch.context() as patch:
        patch.setattr(db.session, "commit", lambda: (_ for _ in ()).throw(OperationalError("statement", {}, Exception("secret database path"))))
        result = client.patch(f"/api/papers/{paper['id']}", json={"title": "不应保存"})
        assert result.status_code == 500
        assert result.json["error"]["code"] == "DATABASE_ERROR"
        assert "secret" not in result.get_data(as_text=True)
    assert client.get(f"/api/papers/{paper['id']}").json["data"]["title"] == paper["title"]
    with monkeypatch.context() as patch:
        patch.setattr(db.session, "commit", lambda: (_ for _ in ()).throw(IntegrityError("statement", {}, Exception("duplicate"))))
        assert client.patch(f"/api/papers/{paper['id']}", json={"title": "冲突"}).status_code == 409


def test_database_constraints(app, make_paper):
    make_paper()
    with app.app_context():
        assert db.session.scalar(text("PRAGMA foreign_keys")) == 1
        db.session.add(Note(paper_id=999, content="孤立笔记"))
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()
        original = db.session.scalar(select(Paper))
        db.session.add(Paper(title="重复", title_key=original.title_key, authors="作者"))
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()


def test_init_command_and_persistence(tmp_path):
    config = {"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///" + (tmp_path / "persistent.db").as_posix()}
    first = create_app(config)
    assert first.test_client().get("/api/health").status_code == 500
    assert first.test_cli_runner().invoke(args=["init-db"]).exit_code == 0
    assert first.test_client().post("/api/papers", json={"title": "持久化测试", "authors": "作者"}).status_code == 201
    assert first.test_cli_runner().invoke(args=["init-db"]).exit_code == 0
    with first.app_context():
        db.session.remove()
        db.engine.dispose()
    second = create_app(config)
    assert second.test_client().get("/api/papers").json["data"]["items"][0]["title"] == "持久化测试"
    with second.app_context():
        db.session.remove()
        db.engine.dispose()


def test_ai_placeholder(monkeypatch):
    monkeypatch.setenv("AI_API_KEY", "test-only")
    service = AIService()
    for method, args in ((service.summarize_paper, ({},)), (service.extract_keywords, ({},)),
                         (service.summarize_reading, ({}, []))):
        with pytest.raises(NotImplementedError):
            method(*args)
