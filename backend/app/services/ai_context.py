"""将业务数据转换为有界的 AI 输入；不改变论文或笔记。"""
import re

from ..errors import APIError
from .files import storage_path
from .pdf_metadata import parse_pdf_safely


def build_context(paper, include_notes=False):
    warnings = []
    pdf = next((item for item in paper.attachments if item.kind == "paper"), None)
    extracted = {"text": "", "pages": [], "total_pages": 0, "truncated": False}
    if pdf:
        try:
            with storage_path(pdf.path).open("rb") as stream:
                data = stream.read(25 * 1024 * 1024 + 1)
            if len(data) > 25 * 1024 * 1024:
                raise OSError()
            extracted = parse_pdf_safely(data, full_text=True)
            if extracted.get("warning"):
                warnings.append(extracted["warning"])
        except OSError:
            warnings.append("论文文件无法读取。")
    if not extracted["text"]:
        if not paper.abstract.strip():
            raise APIError("没有可分析的论文文本，请上传可提取文字的 PDF 或补充摘要。", 422, "AI_NO_CONTENT")
        warnings.append("未取得 PDF 正文，本次仅依据论文信息和摘要，无法保证覆盖全文。")
    if extracted["truncated"]:
        warnings.append("论文正文已按页抽样或截取，结果仅依据所提供片段。")
    context = {"paper": {"title": paper.title, "authors": paper.authors, "year": paper.year,
                         "venue": paper.venue, "doi": paper.doi, "research_topic": paper.research_topic,
                         "abstract": paper.abstract[:6000]}, "paper_text": extracted["text"]}
    if len(paper.abstract) > 6000:
        warnings.append("原始摘要超过 6000 字符，已截取。")
    notes_used = 0
    if include_notes:
        # 最新 20 条在线笔记共享 8000 字符；每条都有机会进入输入。
        notes = paper.notes[:20]
        per_note = 8000 // max(1, len(notes))
        # Reading cards keep versioned metadata in Markdown comments. Exclude
        # these duplicated fields/coordinates from the model's text budget.
        note_texts = [re.sub(r'^(?:<!-- paperflow-(?:source|reading):\{[^\n]*\} -->\r?\n)+', '', note.content) for note in notes]
        context["user_notes"] = [{"id": note.id, "content": text[:per_note]} for note, text in zip(notes, note_texts)]
        notes_used = len(notes)
        if len(paper.notes) > 20 or any(len(text) > per_note for text in note_texts):
            warnings.append("在线笔记已截取：最多使用最新 20 条，共 8000 字符。")
        if not notes:
            warnings.append("尚无在线阅读笔记，本次总结无法体现个人阅读关注点。")
        if any(item.kind == "note" for item in paper.attachments):
            warnings.append("本次使用在线笔记，未解析笔记附件。")
    context["limitations"] = warnings
    source = {"kind": "pdf" if extracted["text"] else "abstract", "pages": extracted["pages"],
              "total_pages": extracted["total_pages"], "text_chars": len(extracted["text"]),
              "notes_used": notes_used, "warnings": warnings}
    return context, source
