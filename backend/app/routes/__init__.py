from flask import Blueprint

api = Blueprint("api", __name__)

from . import papers, tags, notes, system, files, ai, annotations  # noqa: E402,F401
