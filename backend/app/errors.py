from flask import current_app, jsonify
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from werkzeug.exceptions import HTTPException

from .extensions import db


class APIError(Exception):
    def __init__(self, message, status=400, code="VALIDATION_ERROR", details=None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code
        self.details = details or {}


def register_error_handlers(app):
    def response(code, message, status, details=None):
        return jsonify(error={"code": code, "message": message, "details": details or {}}), status

    @app.errorhandler(APIError)
    def handle_api_error(error):
        db.session.rollback()
        return response(error.code, error.message, error.status, error.details)

    @app.errorhandler(IntegrityError)
    def handle_integrity_error(error):
        # 先检查重复可以给出友好提示，数据库约束负责防止并发写入冲突。
        db.session.rollback()
        current_app.logger.warning("数据库约束冲突：%s", type(error).__name__)
        return response("CONFLICT", "数据重复或关联约束冲突，请刷新后重试", 409)

    @app.errorhandler(SQLAlchemyError)
    def handle_database_error(error):
        db.session.rollback()
        current_app.logger.exception("数据库操作失败")
        return response("DATABASE_ERROR", "数据库暂时无法完成操作，请稍后重试", 500)

    @app.errorhandler(HTTPException)
    def handle_http_error(error):
        messages = {400: "请求格式不正确", 404: "接口不存在", 405: "请求方法不支持",
                    413: "请求内容过大", 415: "请使用 application/json 提交数据"}
        # 保留 Allow 等协议响应头，避免统一 JSON 错误破坏 HTTP 语义。
        result = error.get_response()
        result.set_data(app.json.dumps({"error": {"code": f"HTTP_{error.code}",
                        "message": messages.get(error.code, "请求无法处理"), "details": {}}}))
        result.content_type = "application/json"
        return result

    @app.errorhandler(Exception)
    def handle_unexpected_error(error):
        db.session.rollback()
        current_app.logger.exception("未预期的服务异常")
        return response("INTERNAL_ERROR", "服务暂时无法完成操作", 500)
