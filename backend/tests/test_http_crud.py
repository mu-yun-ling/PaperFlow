"""通过真实 HTTP 连接验收 CRUD，数据保存在 pytest 临时数据库中。"""

import json
from threading import Thread
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener

import pytest
from sqlalchemy import text
from werkzeug.serving import make_server

from app.extensions import db


@pytest.fixture()
def http_api(app):
    # 使用系统分配的空闲端口，不占用日常运行的 5000，也不写入个人文献库。
    server = make_server("127.0.0.1", 0, app)
    worker = Thread(target=server.serve_forever, daemon=True)
    worker.start()
    opener = build_opener(ProxyHandler({}))

    def request(method, path, expected, body=None):
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
        req = Request(f"http://127.0.0.1:{server.server_port}/api{path}", data=payload,
                      headers={"Content-Type": "application/json; charset=utf-8"}, method=method)
        try:
            response = opener.open(req, timeout=5)
        except HTTPError as error:
            response = error
        with response:
            raw = response.read()
            assert response.status == expected, raw.decode("utf-8")
            if expected == 204:
                assert raw == b""
                return None
            assert response.headers.get_content_type() == "application/json"
            result = json.loads(raw)
            if expected >= 400:
                assert set(result) == {"error"}
                assert set(result["error"]) == {"code", "message", "details"}
                return result["error"]
            assert set(result) == {"data"}
            return result["data"]

    try:
        yield request
    finally:
        server.shutdown()
        worker.join(timeout=5)
        server.server_close()


def test_http_paper_tag_note_crud(http_api, app):
    call = http_api
    assert call("GET", "/health", 200)["database"] == "ok"
    tag = call("POST", "/tags", 201, {"name": "HTTP 验收标签"})
    tag_id = tag["id"]
    assert call("GET", "/tags", 200)[0]["id"] == tag_id
    paper = call("POST", "/papers", 201, {"title": "真实 HTTP 文献", "authors": "张三", "year": 2024})
    paper_id = paper["id"]
    path = f"/papers/{paper_id}"
    assert call("GET", "/papers", 200)["total"] == 1
    assert call("GET", path, 200)["title"] == "真实 HTTP 文献"
    assert call("PATCH", path, 200, {"title": "已编辑文献", "doi": "10.1000/http"})["title"] == "已编辑文献"
    link = f"{path}/tags/{tag_id}"
    assert call("PUT", link, 200)["tags"][0]["id"] == tag_id
    assert len(call("PUT", link, 200)["tags"]) == 1
    call("DELETE", link, 204)
    assert call("GET", path, 200)["tags"] == []
    call("PATCH", path, 200, {"tag_ids": [tag_id]})
    note = call("POST", f"{path}/notes", 201, {"content": "第一条阅读笔记"})
    note_path = f"/notes/{note['id']}"
    assert note["paper_id"] == paper_id
    assert call("PATCH", note_path, 200, {"content": "修订后的阅读笔记"})["content"] == "修订后的阅读笔记"
    assert call("GET", f"{path}/notes", 200)[0]["content"] == "修订后的阅读笔记"
    call("DELETE", note_path, 204)
    assert call("GET", f"{path}/notes", 200) == []
    call("POST", f"{path}/notes", 201, {"content": "随文献一起删除的笔记"})
    call("DELETE", path, 204)
    call("GET", path, 404)
    assert call("GET", "/tags", 200)[0]["paper_count"] == 0
    call("DELETE", f"/tags/{tag_id}", 204)
    assert call("GET", "/tags", 200) == []
    assert call("GET", "/papers", 200)["total"] == 0
    with app.app_context():
        assert db.session.execute(text("PRAGMA foreign_key_check")).all() == []
        for table in ("papers", "tags", "notes", "paper_tags"):
            assert db.session.scalar(text(f"SELECT COUNT(*) FROM {table}")) == 0


def test_http_invalid_and_duplicate_data(http_api):
    call = http_api
    paper = call("POST", "/papers", 201, {"title": "验收文献", "authors": "作者", "doi": "10.1000/test"})
    path = f"/papers/{paper['id']}"
    for change in ({"title": " "}, {"authors": "\n"}, {"year": "2024"}, {"year": 999}, {"tag_ids": [2**63]}):
        call("POST", "/papers", 400, {"title": "新文献", "authors": "作者", **change})
        call("PATCH", path, 400, change)
    assert call("POST", "/papers", 409, {"title": " 验收文献 ", "authors": "作者"})["details"]["field"] == "title"
    assert call("POST", "/papers", 409, {"title": "不同标题", "authors": "作者", "doi": "https://doi.org/10.1000/TEST"})["details"]["field"] == "doi"
    other = call("POST", "/papers", 201, {"title": "另一个标题", "authors": "作者"})
    call("PATCH", f"/papers/{other['id']}", 409, {"doi": "10.1000/test"})
    call("POST", "/tags", 201, {"name": "NLP"})
    call("POST", "/tags", 409, {"name": "nlp"})
    call("POST", "/tags", 400, {"name": " "})
    call("POST", f"{path}/notes", 400, {"content": " \n"})
    note = call("POST", f"{path}/notes", 201, {"content": "保留内容"})
    call("PATCH", f"/notes/{note['id']}", 400, {"content": " "})
    call("POST", "/papers/999/notes", 404, {"content": "孤立笔记"})
    call("GET", f"/papers/{2**63}", 404)
    assert call("GET", path, 200)["title"] == paper["title"]
    assert call("GET", f"{path}/notes", 200)[0]["content"] == "保留内容"
    assert call("GET", "/papers", 200)["total"] == 2
