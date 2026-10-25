import os
from pathlib import Path

import click
from dotenv import load_dotenv
from flask import Flask

from .errors import register_error_handlers
from .extensions import db


def create_app(test_config=None):
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_mapping(
        SQLALCHEMY_DATABASE_URI=os.getenv("DATABASE_URL", "sqlite:///paperflow.db"),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        MAX_CONTENT_LENGTH=26 * 1024 * 1024,
        MAX_FILE_SIZE=25 * 1024 * 1024,
        UPLOAD_FOLDER=str(Path(app.instance_path) / "uploads"),
    )
    if test_config:
        app.config.update(test_config)
    Path(app.instance_path).mkdir(parents=True, exist_ok=True)
    app.json.ensure_ascii = False
    db.init_app(app)

    from . import models  # 注册模型后，初始化命令才能创建完整表结构。
    from .routes import api

    app.register_blueprint(api, url_prefix="/api")
    register_error_handlers(app)

    @app.before_request
    def limit_json_body():
        from flask import request
        from werkzeug.exceptions import RequestEntityTooLarge
        if request.is_json and request.content_length and request.content_length > 1024 * 1024:
            raise RequestEntityTooLarge()

    @app.cli.command("init-db")
    def init_db():
        """创建缺失的数据表，保留已有数据。"""
        from .migrations import upgrade_database
        upgrade_database()
        from .services.files import recover_storage
        recover_storage()
        click.echo("PaperFlow 数据库已初始化（已有数据保持不变）。")

    return app
