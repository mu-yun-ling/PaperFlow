def timestamp(value):
    return value.isoformat(timespec="microseconds") + "Z"


def tag_dict(tag):
    return {"id": tag.id, "name": tag.name, "created_at": timestamp(tag.created_at)}


def note_dict(note):
    return {"id": note.id, "paper_id": note.paper_id, "content": note.content,
            "created_at": timestamp(note.created_at), "updated_at": timestamp(note.updated_at)}


def paper_dict(paper, detail=False):
    fields = ("id", "title", "authors", "year", "venue", "doi", "url", "abstract",
              "research_topic", "reading_status", "is_favorite")
    result = {field: getattr(paper, field) for field in fields}
    result.update(created_at=timestamp(paper.created_at), updated_at=timestamp(paper.updated_at),
                  tags=[tag_dict(tag) for tag in paper.tags])
    source = next((item for item in paper.attachments if item.kind == "paper"), None)
    result["reading_progress"] = progress_dict(source.reading_progress) if source else None
    if detail:
        result["notes"] = [note_dict(note) for note in paper.notes]
        result["paper_file"] = next((attachment_dict(item) for item in paper.attachments if item.kind == "paper"), None)
        result["note_attachments"] = [attachment_dict(item) for item in paper.attachments if item.kind == "note"]
    return result


def attachment_dict(item):
    return {"id": item.id, "paper_id": item.paper_id, "kind": item.kind, "filename": item.filename,
            "mime_type": item.mime_type, "size": item.size, "created_at": timestamp(item.created_at),
            "reading_progress": progress_dict(item.reading_progress)}


def progress_dict(progress):
    if progress is None:
        return None
    percent = 0 if not progress.max_page else (100 if progress.max_page == progress.total_pages else max(1, min(99, progress.max_page * 100 // progress.total_pages)))
    return {"total_pages": progress.total_pages, "current_page": progress.current_page,
            "max_page": progress.max_page, "percent": percent,
            "last_read_at": timestamp(progress.last_read_at) if progress.last_read_at else None}
