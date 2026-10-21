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
    if detail:
        result["notes"] = [note_dict(note) for note in paper.notes]
    return result
