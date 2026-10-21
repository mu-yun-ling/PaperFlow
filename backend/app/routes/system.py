from flask import jsonify
from sqlalchemy import select, func

from . import api
from ..extensions import db
from ..models import Paper
from ..services.dashboard import dashboard_data


@api.get("/health")
def health():
    # 查询实际业务表；未初始化数据库时不能误报为正常。
    db.session.scalar(select(func.count(Paper.id)))
    return jsonify(data={"status": "ok", "database": "ok", "service": "PaperFlow"})


@api.get("/dashboard")
def dashboard():
    return jsonify(data=dashboard_data())
