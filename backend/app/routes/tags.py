from flask import jsonify

from . import api
from ..models import Tag
from ..serializers import tag_dict
from ..services.library import create_tag, delete_resource, list_tags
from ..services.papers import get_resource
from ..services.validation import json_body


@api.get("/tags")
def tag_index():
    return jsonify(data=list_tags())


@api.post("/tags")
def tag_create():
    return jsonify(data=tag_dict(create_tag(json_body({"name"})))), 201


@api.delete("/tags/<int:tag_id>")
def tag_delete(tag_id):
    delete_resource(get_resource(Tag, tag_id, "标签"))
    return "", 204
