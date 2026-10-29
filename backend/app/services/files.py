import json
import zipfile
from contextlib import contextmanager
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from flask import current_app, request

from ..errors import APIError
from ..extensions import db
from ..models import Attachment, utc_now

MIME_TYPES = {
    ".pdf": {"application/pdf"},
    ".docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
    ".md": {"text/markdown", "text/plain", "application/octet-stream"},
    ".txt": {"text/plain"},
}
CANONICAL_MIME = {".pdf": "application/pdf", ".docx": next(iter(MIME_TYPES[".docx"])),
                  ".md": "text/plain", ".txt": "text/plain"}


def read_upload(kind):
    if set(request.files) != {"file"} or len(request.files.getlist("file")) != 1:
        raise APIError("请选择一个文件上传")
    upload = request.files["file"]
    filename = (upload.filename or "").replace("\\", "/").split("/")[-1]
    suffix = Path(filename).suffix.lower()
    allowed = {".pdf"} if kind == "paper" else set(MIME_TYPES)
    if suffix not in allowed or upload.mimetype not in MIME_TYPES.get(suffix, set()):
        raise APIError("文件扩展名或 MIME 类型不支持；论文仅支持 PDF，笔记支持 PDF、DOCX、MD、TXT", code="INVALID_FILE_TYPE")
    if len(filename) > 255 or any(ord(char) < 32 for char in filename):
        raise APIError("文件名过长或包含非法字符")
    data = upload.read(current_app.config["MAX_FILE_SIZE"] + 1)
    if len(data) > current_app.config["MAX_FILE_SIZE"]:
        raise APIError("文件不能超过 25 MB", 413, "FILE_TOO_LARGE")
    if not data:
        raise APIError("不能上传空文件")
    if suffix == ".pdf" and not data.startswith(b"%PDF-"):
        raise APIError("文件内容不是 PDF", code="INVALID_FILE_TYPE")
    if suffix == ".docx":
        try:
            with zipfile.ZipFile(BytesIO(data)) as archive:
                names = set(archive.namelist())
                if not {"[Content_Types].xml", "word/document.xml"} <= names:
                    raise ValueError()
        except (zipfile.BadZipFile, ValueError):
            raise APIError("文件内容不是 DOCX", code="INVALID_FILE_TYPE") from None
    if suffix in (".md", ".txt"):
        try:
            if "\x00" in data.decode("utf-8-sig"):
                raise ValueError()
        except (UnicodeError, ValueError):
            raise APIError("文本笔记请使用 UTF-8 编码的 MD / TXT 文件") from None
    return {"filename": filename, "suffix": suffix, "mime_type": CANONICAL_MIME[suffix], "data": data}


def paper_body(allowed):
    from .validation import json_body
    if request.mimetype != "multipart/form-data":
        return json_body(allowed), None
    if set(request.form) != {"data"}:
        raise APIError("请在 data 字段提交文献信息")
    try:
        body = json.loads(request.form["data"])
    except (ValueError, TypeError):
        raise APIError("文献信息必须是有效 JSON") from None
    if not isinstance(body, dict) or not body or set(body) - allowed:
        raise APIError("文献信息为空或包含不支持的字段")
    return body, read_upload("paper")


def storage_path(relative):
    root = Path(current_app.config["UPLOAD_FOLDER"]).resolve()
    path = (root / relative).resolve()
    if path == root or root not in path.parents:
        raise APIError("文件存储路径无效", 500, "FILE_ERROR")
    return path


class FileChanges:
    def __init__(self):
        self.created = []
        self.moved = []

    def retire(self, item):
        original = storage_path(item.path)
        # 文件已丢失时仍允许删除记录、替换文件或删除文献。
        if original.exists():
            trash = storage_path(".trash/" + original.name)
            trash.parent.mkdir(parents=True, exist_ok=True)
            original.replace(trash)
            self.moved.append((original, trash))

    def attach(self, paper, upload, kind):
        if kind == "paper":
            for old in list(paper.attachments):
                if old.kind == "paper":
                    self.retire(old)
                    db.session.delete(old)
            db.session.flush()
        relative = uuid4().hex + upload["suffix"]
        path = storage_path(relative)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("xb") as stream:
            self.created.append(path)
            stream.write(upload["data"])
        item = Attachment(paper_id=paper.id, kind=kind, filename=upload["filename"], path=relative,
                          mime_type=upload["mime_type"], size=len(upload["data"]))
        db.session.add(item)
        if kind == "paper" and paper.reading_status != "completed":
            paper.reading_status = "not_started"
        paper.updated_at = utc_now()
        return item


@contextmanager
def file_transaction():
    # 数据库回滚不能撤销磁盘操作：旧文件先隔离，提交成功才清理，失败则恢复。
    # 同时追踪新文件，避免重复文献或数据库故障留下无引用附件。
    changes = FileChanges()
    try:
        yield changes
        db.session.commit()
    except Exception as error:
        db.session.rollback()
        recovery_failed = False
        for path in changes.created:
            try:
                path.unlink(missing_ok=True)
            except OSError:
                recovery_failed = True
                current_app.logger.exception("未能清理失败上传，等待启动恢复")
        for original, trash in reversed(changes.moved):
            try:
                trash.replace(original)
            except OSError:
                recovery_failed = True
                current_app.logger.exception("未能恢复隔离文件，等待启动恢复")
        if recovery_failed:
            raise APIError("保存未完成，数据库已回滚；部分文件等待恢复，请解除文件占用后重启后端", 500, "FILE_ERROR") from error
        if isinstance(error, OSError):
            raise APIError("文件操作失败，请检查文件占用、磁盘空间和目录权限后重试", 500, "FILE_ERROR") from error
        raise
    else:
        for _, trash in changes.moved:
            try:
                trash.unlink(missing_ok=True)
            except OSError:
                # 记录已提交，隔离文件不再可访问；下一次 init-db 会重试清理。
                current_app.logger.warning("待清理的隔离文件：%s", trash.name)


def recover_storage():
    """服务启动前恢复中断的文件操作；勿在仍有写请求时手动执行 init-db。"""
    root = Path(current_app.config["UPLOAD_FOLDER"])
    live = {item.path for item in db.session.scalars(db.select(Attachment))}
    trash = root / ".trash"
    if trash.exists():
        for path in trash.iterdir():
            if path.name in live:
                path.replace(storage_path(path.name))
            else:
                path.unlink(missing_ok=True)
    # UUID 文件在写入和提交之间若进程中断，启动时回收无数据库引用的文件。
    if root.exists():
        import re
        for path in root.iterdir():
            if re.fullmatch(r"[0-9a-f]{32}\.(pdf|docx|md|txt)", path.name) and path.name not in live:
                path.unlink(missing_ok=True)
