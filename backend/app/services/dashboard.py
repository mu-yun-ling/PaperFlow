from sqlalchemy import func, select

from ..extensions import db
from ..models import Paper, Tag, Attachment, ReadingProgress, paper_tags
from ..serializers import paper_dict
from .validation import STATUSES


def dashboard_data():
    # 每次从数据库聚合，空库也返回完整的状态分类，便于图表直接使用。
    counts = dict(db.session.execute(select(Paper.reading_status, func.count(Paper.id))
                                     .group_by(Paper.reading_status)).all())
    statuses = [{"status": status, "count": counts.get(status, 0)} for status in STATUSES]
    years = db.session.execute(select(Paper.year, func.count(Paper.id)).group_by(Paper.year)
                               .order_by(Paper.year.is_(None), Paper.year)).all()
    tags = db.session.execute(select(Tag.id, Tag.name, func.count(paper_tags.c.paper_id))
                              .outerjoin(paper_tags, Tag.id == paper_tags.c.tag_id)
                              .group_by(Tag.id, Tag.name).order_by(func.count(paper_tags.c.paper_id).desc(), Tag.id)).all()
    return {
        "total": sum(counts.values()),
        "not_started": counts.get("not_started", 0),
        "reading": counts.get("reading", 0),
        "completed": counts.get("completed", 0),
        "favorites": db.session.scalar(select(func.count(Paper.id)).where(Paper.is_favorite.is_(True))),
        "by_status": statuses,
        "by_year": [{"year": year, "count": count} for year, count in years],
        "by_tag": [{"id": tag_id, "name": name, "count": count} for tag_id, name, count in tags],
        "recent_papers": [paper_dict(paper) for paper in db.session.scalars(
            select(Paper).join(Attachment, Attachment.paper_id == Paper.id)
            .join(ReadingProgress, ReadingProgress.attachment_id == Attachment.id)
            .where(Attachment.kind == "paper", ReadingProgress.last_read_at.is_not(None))
            .order_by(ReadingProgress.last_read_at.desc(), Paper.id.desc()).limit(4))],
    }
