import pytest

from app import create_app
from app.extensions import db


@pytest.fixture()
def app(tmp_path):
    application = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///" + (tmp_path / "test.db").as_posix(),
                              "UPLOAD_FOLDER": str(tmp_path / "uploads")})
    with application.app_context():
        db.create_all()
    yield application
    with application.app_context():
        db.session.remove()
        db.engine.dispose()


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def make_paper(client):
    def create(**overrides):
        payload = {"title": "注意力机制研究", "authors": "张三; 李四", "year": 2024}
        payload.update(overrides)
        result = client.post("/api/papers", json=payload)
        assert result.status_code == 201, result.json
        return result.json["data"]
    return create
