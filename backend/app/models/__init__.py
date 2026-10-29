from datetime import datetime, timezone

from ..extensions import db


def utc_now():
    # SQLite 保存无时区 UTC 时间，序列化时统一添加时区标记。
    return datetime.now(timezone.utc).replace(tzinfo=None)


# 复合主键保证同一标签只关联一次；两侧外键删除只清理关系，不删除共享实体。
paper_tags = db.Table(
    "paper_tags",
    db.Column("paper_id", db.Integer, db.ForeignKey("papers.id", ondelete="CASCADE"), primary_key=True),
    db.Column("tag_id", db.Integer, db.ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
    db.Index("ix_paper_tags_tag_id", "tag_id"),
)


class Paper(db.Model):
    __tablename__ = "papers"
    __table_args__ = (
        db.CheckConstraint("length(trim(title)) > 0", name="ck_paper_title"),
        db.CheckConstraint("year IS NULL OR year BETWEEN 1000 AND 9999", name="ck_paper_year"),
        db.CheckConstraint("reading_status IN ('not_started', 'reading', 'completed')", name="ck_paper_status"),
    )

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(500), nullable=False)
    title_key = db.Column(db.String(500), nullable=False, unique=True)
    authors = db.Column(db.String(1000), nullable=False, default="")
    year = db.Column(db.Integer, index=True)
    venue = db.Column(db.String(500), nullable=False, default="")
    doi = db.Column(db.String(255), unique=True)
    url = db.Column(db.String(2048))
    abstract = db.Column(db.Text, nullable=False, default="")
    research_topic = db.Column(db.String(200), nullable=False, default="", index=True)
    reading_status = db.Column(db.String(20), nullable=False, default="not_started", index=True)
    is_favorite = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=utc_now, onupdate=utc_now)
    tags = db.relationship("Tag", secondary=paper_tags, back_populates="papers", order_by="Tag.id")
    notes = db.relationship("Note", back_populates="paper", cascade="all, delete-orphan", passive_deletes=True,
                            order_by="(Note.updated_at.desc(), Note.id.desc())")
    attachments = db.relationship("Attachment", cascade="all, delete-orphan", passive_deletes=True,
                                  order_by="Attachment.id.desc()")


class Tag(db.Model):
    __tablename__ = "tags"
    __table_args__ = (db.CheckConstraint("length(trim(name)) > 0", name="ck_tag_name"),)

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    name_key = db.Column(db.String(100), nullable=False, unique=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    papers = db.relationship("Paper", secondary=paper_tags, back_populates="tags")


class Note(db.Model):
    # 笔记必须绑定现存文献；外键级联使直接数据库删除也不会留下孤立笔记。
    __tablename__ = "notes"
    __table_args__ = (db.CheckConstraint("length(trim(content)) > 0", name="ck_note_content"),)

    id = db.Column(db.Integer, primary_key=True)
    paper_id = db.Column(db.Integer, db.ForeignKey("papers.id", ondelete="CASCADE"), nullable=False, index=True)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    updated_at = db.Column(db.DateTime, nullable=False, default=utc_now, onupdate=utc_now)
    paper = db.relationship("Paper", back_populates="notes")


class Attachment(db.Model):
    __tablename__ = "attachments"
    __table_args__ = (
        db.CheckConstraint("kind IN ('paper', 'note')", name="ck_attachment_kind"),
        db.Index("uq_paper_pdf", "paper_id", unique=True, sqlite_where=db.text("kind = 'paper'")),
        {"sqlite_autoincrement": True},
    )

    id = db.Column(db.Integer, primary_key=True)
    paper_id = db.Column(db.Integer, db.ForeignKey("papers.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = db.Column(db.String(10), nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    path = db.Column(db.String(100), nullable=False, unique=True)
    mime_type = db.Column(db.String(100), nullable=False)
    size = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    reading_progress = db.relationship("ReadingProgress", uselist=False, cascade="all, delete-orphan", passive_deletes=True)


class ReadingProgress(db.Model):
    __tablename__ = "reading_progress"
    __table_args__ = (
        db.CheckConstraint("total_pages > 0 AND current_page BETWEEN 1 AND total_pages AND max_page BETWEEN 0 AND total_pages", name="ck_reading_pages"),
    )
    attachment_id = db.Column(db.Integer, db.ForeignKey("attachments.id", ondelete="CASCADE"), primary_key=True)
    total_pages = db.Column(db.Integer, nullable=False)
    current_page = db.Column(db.Integer, nullable=False, default=1)
    max_page = db.Column(db.Integer, nullable=False, default=0)
    last_read_at = db.Column(db.DateTime)


class PdfAnnotation(db.Model):
    __tablename__ = "pdf_annotations"
    id = db.Column(db.Integer, primary_key=True)
    attachment_id = db.Column(db.Integer, db.ForeignKey("attachments.id", ondelete="CASCADE"), nullable=False, index=True)
    page = db.Column(db.Integer, nullable=False)
    kind = db.Column(db.String(16), nullable=False)
    color = db.Column(db.String(7), nullable=False)
    geometry = db.Column(db.JSON, nullable=False)
    text = db.Column(db.Text, nullable=False, default="")
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
