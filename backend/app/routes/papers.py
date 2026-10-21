from flask import jsonify, request

from . import api
from ..models import Paper, Tag
from ..serializers import paper_dict
from ..services.library import delete_resource, set_paper_tag
from ..services.papers import PAPER_FIELDS, get_resource, list_papers, save_paper
from ..services.validation import json_body


@api.get("/papers")
def paper_index():
    return jsonify(data=list_papers(request.args))


@api.post("/papers")
def paper_create():
    paper = save_paper(json_body(PAPER_FIELDS))
    return jsonify(data=paper_dict(paper, detail=True)), 201, {"Location": f"/api/papers/{paper.id}"}


@api.get("/papers/<int:paper_id>")
def paper_show(paper_id):
    return jsonify(data=paper_dict(get_resource(Paper, paper_id, "文献"), detail=True))


@api.patch("/papers/<int:paper_id>")
def paper_update(paper_id):
    paper = get_resource(Paper, paper_id, "文献")
    return jsonify(data=paper_dict(save_paper(json_body(PAPER_FIELDS), paper), detail=True))


@api.delete("/papers/<int:paper_id>")
def paper_delete(paper_id):
    delete_resource(get_resource(Paper, paper_id, "文献"))
    return "", 204


@api.route("/papers/<int:paper_id>/tags/<int:tag_id>", methods=["PUT", "DELETE"])
def tag_link(paper_id, tag_id):
    paper = get_resource(Paper, paper_id, "文献")
    tag = get_resource(Tag, tag_id, "标签")
    set_paper_tag(paper, tag, attached=request.method == "PUT")
    if request.method == "DELETE":
        return "", 204
    return jsonify(data=paper_dict(paper))
