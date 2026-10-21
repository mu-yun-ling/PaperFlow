from flask import jsonify

from . import api
from ..models import Note, Paper
from ..serializers import note_dict
from ..services.library import delete_resource, save_note
from ..services.papers import get_resource
from ..services.validation import json_body


@api.get("/papers/<int:paper_id>/notes")
def note_index(paper_id):
    paper = get_resource(Paper, paper_id, "文献")
    return jsonify(data=[note_dict(note) for note in paper.notes])


@api.post("/papers/<int:paper_id>/notes")
def note_create(paper_id):
    paper = get_resource(Paper, paper_id, "文献")
    return jsonify(data=note_dict(save_note(json_body({"content"}), paper=paper))), 201


@api.patch("/notes/<int:note_id>")
def note_update(note_id):
    note = get_resource(Note, note_id, "笔记")
    return jsonify(data=note_dict(save_note(json_body({"content"}), note=note)))


@api.delete("/notes/<int:note_id>")
def note_delete(note_id):
    delete_resource(get_resource(Note, note_id, "笔记"))
    return "", 204
