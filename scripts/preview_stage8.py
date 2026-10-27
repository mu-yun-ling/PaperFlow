"""Run an isolated UI fixture at localhost:5001; never opens the user's database."""
import json
import argparse
import sys
from io import BytesIO
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from app import create_app
from app.extensions import db
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject


def sample_pdf(companion=False):
    writer = PdfWriter()
    font = DictionaryObject({NameObject('/Type'): NameObject('/Font'), NameObject('/Subtype'): NameObject('/Type1'), NameObject('/BaseFont'): NameObject('/Times-Roman')})
    bold = DictionaryObject({NameObject('/Type'): NameObject('/Font'), NameObject('/Subtype'): NameObject('/Type1'), NameObject('/BaseFont'): NameObject('/Times-Bold')})
    fonts = DictionaryObject({NameObject('/F1'): writer._add_object(font), NameObject('/F2'): writer._add_object(bold)})
    for index in range(8):
        page = writer.add_blank_page(width=600, height=800)
        page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): fonts})
        commands = []
        def line(text, x, y, size=11, face='F1'):
            escaped = text.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
            commands.append(f'BT /{face} {size} Tf 1 0 0 1 {x} {y} Tm ({escaped}) Tj ET')
        line('PAPERFLOW  /  READING LAB', 52, 755, 10, 'F2')
        commands.append('0.40 0.56 0.45 RG 52 741 m 548 741 l S 0 0 0 rg')
        line('A Companion to Thoughtful Reading' if companion else 'Attention and Knowledge:', 95 if companion else 165, 701, 19, 'F2')
        line('Notes, questions, and connections' if companion else 'Building a Personal Reading Practice', 146, 674, 16, 'F2')
        line('PaperFlow Design Lab  /  Sample document for interface verification', 117, 642, 10)
        line('UI FIXTURE - NOT A PUBLISHED RESEARCH PAPER', 160, 622, 9)
        line('Abstract' if index == 0 else f'{index + 1}. Reading, reflection, and retrieval', 52, 580, 14, 'F2')
        abstract = ['Reading connects new evidence with what we already know. A personal reading', 'space should keep the source visible while making room for questions, excerpts,', 'and interpretation. This sample document is used to check page navigation, text', 'selection, mathematical notes, and the relationship between a paper and its notes.']
        for row, text in enumerate(abstract):
            line(text, 52, 557 - row * 16)
        line('1  Introduction', 52, 462, 13, 'F2')
        line('2  From reading to understanding', 310, 462, 13, 'F2')
        left = ['A useful reading process begins with a question.', 'The reader identifies the problem, observes the', 'method, and examines the evidence. Notes are', 'most helpful when they preserve both a source', 'passage and the reader\'s own interpretation.', '', 'Keeping these two layers connected makes it', 'possible to return to the evidence later. A page', 'reference can be a small but powerful bridge', 'between a new idea and its original context.', '', 'This workspace is designed for long reading', 'sessions. The document remains the primary', 'surface, while supporting tools stay nearby.', 'The layout can change with the task at hand.']
        right = ['An excerpt is a starting point for reflection.', 'It can capture a definition, an assumption, or', 'a result that deserves a closer look. Adding', 'a short explanation helps turn a saved passage', 'into a useful piece of personal knowledge.', '', 'We distinguish three practical reading modes:', 'a focused original, a document comparison,', 'and a note-centered view. Each mode changes', 'the available space without losing position.', '', 'The reader can revisit a source page directly', 'from a note. Persistent highlights provide a', 'second visual cue when returning to a passage.', 'These connections support careful rereading.']
        for x, lines in [(52, left), (310, right)]:
            for row, text in enumerate(lines):
                line(text, x, 438 - row * 16, 10.5)
        line('3  Questions for the next reading', 52, 170, 13, 'F2')
        line('What is the main claim? What evidence supports it? Which assumptions need checking?', 52, 146, 11)
        line('Use the excerpt action to attach a question to this page, then return through the note.', 52, 127, 11)
        line(str(index + 1), 295, 42, 10)
        stream = DecodedStreamObject(); stream.set_data('\n'.join(commands).encode('ascii'))
        page[NameObject('/Contents')] = writer._add_object(stream)
    output = BytesIO(); writer.write(output)
    return output.getvalue()


def seed(app):
    client = app.test_client()
    if client.get('/api/papers').json['data']['total']:
        return
    tags = {name: client.post('/api/tags', json={'name': name}).json['data']['id'] for name in ['Reasoning', 'LLM', 'Reinforcement Learning', 'Attention', 'Optimization', 'Reading']}
    examples = [
        ('Attention and Knowledge: Building a Personal Reading Practice', 'PaperFlow Design Lab', 2025, ['Attention', 'Reading'], 'A reading workspace that connects original passages, personal interpretations, and the questions worth returning to.', 6),
        ('Learning to Reason with Structured Feedback', 'Chen et al. · 示例文献', 2024, ['LLM', 'Reasoning'], 'Exploring the relationship between structured feedback and the reasoning process in language models.', 2),
        ('Policy Optimization through Adaptive Sampling', 'Lin et al. · 示例文献', 2024, ['Reinforcement Learning', 'Optimization'], 'A sample study of adaptive sampling and policy updates, with a focus on stable learning behavior.', 3),
        ('A Survey of Language Model Evaluation', 'Zhao et al. · 示例文献', 2023, ['LLM', 'Reading'], 'An overview of evaluation methods, open questions, and practical considerations for language models.', 0),
        ('Connecting Ideas through Reflective Notes', 'PaperFlow Design Lab', 2023, ['Reading', 'Reasoning'], 'From an isolated highlight to a connected understanding: notes as an active part of the reading process.', 5),
        ('Understanding Attention in Sequence Models', 'Wang et al. · 示例文献', 2022, ['Attention', 'LLM'], 'A sample document for examining queries, keys, values, and their relationship to contextual representations.', 8),
    ]
    for index, (title, authors, year, labels, abstract, progress) in enumerate(examples):
        body = dict(title=title, authors=authors, year=year, abstract=abstract, tag_ids=[tags[label] for label in labels], is_favorite=index in (0, 5), research_topic='阅读工作台示例')
        response = client.post('/api/papers', data={'data': json.dumps(body), 'file': (BytesIO(sample_pdf()), 'reading-study.pdf')})
        assert response.status_code == 201, response.json
        paper = response.json['data']; file_id = paper['paper_file']['id']
        if progress:
            client.put(f'/api/files/{file_id}/reading-progress', json={'total_pages': 8, 'current_page': progress, 'read': True})
        if index == 0:
            for page, quote, thought in [(3, 'An excerpt is a starting point for reflection.', '摘录只是起点。需要补上自己的解释，并记下尚未理解的假设。'), (6, 'A page reference can be a small but powerful bridge.', '页码把笔记和证据连接起来；重新打开时，可以直接回到产生这个想法的位置。')]:
                source = json.dumps({'fileId': file_id, 'page': page, 'kind': 'excerpt'})
                content = f'<!-- paperflow-source:{source} -->\n> {quote}\n\n## 我的理解\n\n{thought}\n\n## 标签\n\n#Reading  #Reasoning'
                client.post(f"/api/papers/{paper['id']}/notes", json={'content': content})
            client.post(f"/api/papers/{paper['id']}/note-attachments", data={'file': (BytesIO(sample_pdf(True)), 'reading-companion.pdf')})
            client.put(f'/api/files/{file_id}/reading-progress', json={'total_pages': 8, 'current_page': 1, 'read': True})


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=5001)
    parser.add_argument('--mock-ai', action='store_true', help='Local deterministic AI response for UI verification; never contacts a provider')
    args = parser.parse_args()
    app = create_app({'SQLALCHEMY_DATABASE_URI': 'sqlite:///phase8-ui.db', 'UPLOAD_FOLDER': str(ROOT / 'backend/instance/phase8-ui-uploads'), 'AI_SETTINGS_PATH': str(ROOT / 'backend/instance/phase8-ui-settings.json'), 'AI_ENABLED': False})
    with app.app_context():
        db.create_all()
    seed(app)
    if args.mock_ai:
        # This opt-in fixture exercises the actual route/service/client flow,
        # while keeping all requests local and all production settings intact.
        app.config.update(AI_ENABLED=True, AI_API_KEY='local-fixture', AI_MODEL='local-fixture')
        app.extensions['ai_service']._complete = lambda instruction, context: '### 本地联调示例\n\n这个解释来自测试替身，用于验证一键加入理解和保存流程。\n\n保留自己的分析，再核对原文中的假设。示例公式：$x^2$。'
    app.run(host='127.0.0.1', port=args.port, debug=False)
