import subprocess

from app.services.pdf_metadata import parse_pdf_safely


def test_parser_timeout_returns_empty_candidates(monkeypatch):
    def timeout(*args, **kwargs):
        assert kwargs['timeout'] == 12
        raise subprocess.TimeoutExpired('pdf', 12)
    monkeypatch.setattr(subprocess, 'run', timeout)
    result = parse_pdf_safely(b'%PDF-')
    assert result['recognized'] == []
    assert len(result['missing']) == 5
    assert '超时' in result['warning']
