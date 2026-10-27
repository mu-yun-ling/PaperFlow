"""Isolated final UI verification; never opens the production database or AI settings."""
import argparse
from preview_stage8 import ROOT, create_app, db, seed

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port', type=int, default=5003)
parser.add_argument('--mock-ai', action='store_true')
args = parser.parse_args()
app = create_app({'SQLALCHEMY_DATABASE_URI': 'sqlite:///final-ui.db', 'UPLOAD_FOLDER': str(ROOT / 'backend/instance/final-ui-uploads'), 'AI_SETTINGS_PATH': str(ROOT / 'backend/instance/final-ui-settings.json'), 'AI_ENABLED': False})
with app.app_context():
    db.create_all()
seed(app)
if args.mock_ai:
    app.config.update(AI_ENABLED=True, AI_API_KEY='local-fixture', AI_MODEL='local-fixture')
    app.extensions['ai_service']._complete = lambda instruction, context: '### 本地联调示例\n\n这段解释用于验证追加理解流程。请结合原文核对。公式：$x^2$。'
app.run(host='127.0.0.1', port=args.port, debug=False)
