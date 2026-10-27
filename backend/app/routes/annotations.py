import math
from flask import jsonify
from . import api
from ..extensions import db
from ..errors import APIError
from ..models import Attachment, PdfAnnotation
from ..services.papers import get_resource
from ..services.validation import json_body


def pdf_file(file_id):
    item = get_resource(Attachment, file_id, "附件")
    if item.mime_type != "application/pdf":
        raise APIError("只有 PDF 支持标记")
    return item


def annotation_dict(item):
    return {"id": item.id, "page": item.page, "kind": item.kind, "color": item.color,
            "geometry": item.geometry, "text": item.text}


def valid_number(value):
    return type(value) in (int, float) and math.isfinite(value) and 0 <= value <= 1


def validate(body, item):
    page, kind, color = body.get("page"), body.get("kind"), body.get("color")
    geometry, text = body.get("geometry"), body.get("text", "")
    if type(page) is not int or not 1 <= page <= 100000 or (item.reading_progress and page > item.reading_progress.total_pages):
        raise APIError("标记页码无效")
    if kind not in ("pen", "highlight", "text") or color not in ("#cf654f", "#e8b931", "#4d8063", "#527eb0"):
        raise APIError("标记类型或颜色无效")
    if not isinstance(text, str) or len(text) > 2000 or (kind == "text" and not text.strip()):
        raise APIError("文字批注需填写 1～2000 个字符")
    if not isinstance(geometry, dict):
        raise APIError("标记坐标无效")
    if kind == "pen":
        points = geometry.get("points")
        if not isinstance(points, list) or not 2 <= len(points) <= 2000 or any(not isinstance(p, list) or len(p) != 2 or not all(valid_number(n) for n in p) for p in points):
            raise APIError("画笔轨迹无效或过长")
        geometry = {"points": points}
    elif kind == "highlight":
        rects = geometry.get("rects")
        if not isinstance(rects, list) or not 1 <= len(rects) <= 200 or any(not isinstance(r, dict) or not all(valid_number(r.get(k)) for k in ("x", "y", "width", "height")) or r["x"] + r["width"] > 1.001 or r["y"] + r["height"] > 1.001 for r in rects):
            raise APIError("高亮选区无效")
        geometry = {"rects": [{k: r[k] for k in ("x", "y", "width", "height")} for r in rects]}
    else:
        if not all(valid_number(geometry.get(k)) for k in ("x", "y")):
            raise APIError("文字坐标无效")
        geometry = {"x": geometry["x"], "y": geometry["y"]}
        for key, minimum, maximum in (("width", .03, 1), ("height", .02, 1), ("fontSize", .008, .08)):
            if key in body["geometry"]:
                value = body["geometry"][key]
                if type(value) not in (int, float) or not math.isfinite(value) or not minimum <= value <= maximum:
                    raise APIError("文字批注尺寸无效")
                geometry[key] = value
        if geometry["x"] + geometry.get("width", 0) > 1.001 or geometry["y"] + geometry.get("height", 0) > 1.001:
            raise APIError("文字批注超出页面边界")
    return dict(page=page, kind=kind, color=color, geometry=geometry, text=text.strip())


@api.get('/files/<int:file_id>/annotations')
def list_annotations(file_id):
    pdf_file(file_id)
    items = db.session.scalars(db.select(PdfAnnotation).where(PdfAnnotation.attachment_id == file_id).order_by(PdfAnnotation.id)).all()
    return jsonify(data=[annotation_dict(item) for item in items])


@api.post('/files/<int:file_id>/annotations')
def create_annotation(file_id):
    item = pdf_file(file_id)
    values = validate(json_body({"page", "kind", "color", "geometry", "text"}), item)
    annotation = PdfAnnotation(attachment_id=file_id, **values)
    db.session.add(annotation)
    db.session.commit()
    return jsonify(data=annotation_dict(annotation)), 201


@api.put('/files/<int:file_id>/annotations/<int:annotation_id>')
def update_annotation(file_id, annotation_id):
    item = pdf_file(file_id)
    annotation = get_resource(PdfAnnotation, annotation_id, "标记")
    if annotation.attachment_id != file_id:
        raise APIError("标记不属于此附件", 404)
    for key, value in validate(json_body({"page", "kind", "color", "geometry", "text"}), item).items():
        setattr(annotation, key, value)
    db.session.commit()
    return jsonify(data=annotation_dict(annotation))


@api.delete('/files/<int:file_id>/annotations/<int:annotation_id>')
def delete_annotation(file_id, annotation_id):
    pdf_file(file_id)
    annotation = get_resource(PdfAnnotation, annotation_id, "标记")
    if annotation.attachment_id != file_id:
        raise APIError("标记不属于此附件", 404)
    db.session.delete(annotation)
    db.session.commit()
    return '', 204
