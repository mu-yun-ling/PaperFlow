from flask import jsonify, request, send_file
from sqlalchemy import case, func, update
from sqlalchemy.dialects.sqlite import insert

from . import api
from ..errors import APIError
from ..extensions import db
from ..models import Attachment, Paper, ReadingProgress, utc_now
from ..serializers import attachment_dict, progress_dict
from ..services.files import file_transaction, read_upload, storage_path
from ..services.papers import get_resource
from ..services.pdf_metadata import parse_pdf_safely
from ..services.validation import json_body


@api.put("/files/<int:file_id>/reading-progress")
def save_reading_progress(file_id):
    item = get_resource(Attachment, file_id, "附件")
    if item.kind != "paper" or item.mime_type != "application/pdf":
        raise APIError("只有论文 PDF 可以记录阅读进度")
    if not storage_path(item.path).is_file():
        raise APIError("论文文件不存在，请重新上传", 404, "FILE_NOT_FOUND")
    body = json_body({"total_pages", "current_page", "read"})
    total, current, read = body.get("total_pages"), body.get("current_page"), body.get("read")
    if type(total) is not int or not 1 <= total <= 100000 or type(current) is not int or not 1 <= current <= total or type(read) is not bool:
        raise APIError("页数与当前页必须是有效整数，read 必须是布尔值")
    # 原子 upsert：多标签页回看不能覆盖更远的历史进度；同一文件页数不能漂移。
    statement = insert(ReadingProgress).values(attachment_id=file_id, total_pages=total,
        current_page=current, max_page=current if read else 0, last_read_at=utc_now() if read else None)
    statement = statement.on_conflict_do_update(index_elements=[ReadingProgress.attachment_id], set_={
        "current_page": current,
        "max_page": func.max(ReadingProgress.max_page, current if read else 0),
        "last_read_at": utc_now() if read else ReadingProgress.last_read_at,
    }, where=ReadingProgress.total_pages == total)
    result = db.session.execute(statement)
    if not result.rowcount:
        raise APIError("PDF 页数与已记录数据不一致，请重新打开文件", 409, "PAGE_COUNT_MISMATCH")
    db.session.expire_all()
    progress = db.session.get(ReadingProgress, file_id)
    status = "completed" if progress.max_page == total else "reading" if progress.max_page else "not_started"
    db.session.execute(update(Paper).where(Paper.id == item.paper_id).values(
        reading_status=case((Paper.reading_status == "completed", "completed"), else_=status)))
    db.session.commit()
    return jsonify(data=progress_dict(progress))


@api.post("/papers/parse-pdf")
def parse_pdf():
    upload = read_upload("paper")
    return jsonify(data=parse_pdf_safely(upload["data"]))


@api.post("/papers/<int:paper_id>/note-attachments")
def attach_note(paper_id):
    paper = get_resource(Paper, paper_id, "文献")
    upload = read_upload("note")
    with file_transaction() as changes:
        item = changes.attach(paper, upload, "note")
    return jsonify(data=attachment_dict(item)), 201


@api.get("/files/<int:file_id>")
def file_content(file_id):
    item = get_resource(Attachment, file_id, "附件")
    path = storage_path(item.path)
    if not path.is_file():
        raise APIError("文件不存在，可能已被移动或删除，请重新上传", 404, "FILE_NOT_FOUND")
    try:
        # DOCX 交给本地阅读器打开；MD/TXT 强制纯文本，避免执行上传内容。
        response = send_file(path, mimetype=item.mime_type, download_name=item.filename,
                             as_attachment=request.args.get("download") == "1" or item.filename.lower().endswith(".docx"))
    except OSError as error:
        raise APIError("无法读取文件，请检查文件权限后重试", 500, "FILE_ERROR") from error
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Content-Security-Policy"] = "sandbox"
    response.headers["Cache-Control"] = "no-store"
    return response


@api.delete("/files/<int:file_id>")
def delete_file(file_id):
    item = get_resource(Attachment, file_id, "附件")
    paper = get_resource(Paper, item.paper_id, "文献")
    with file_transaction() as changes:
        changes.retire(item)
        db.session.delete(item)
        paper.updated_at = utc_now()
    return "", 204
