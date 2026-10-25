"""本地启发式识别；结果仅供表单预填，不调用网络、AI 或 OCR。"""
import re
import json
import subprocess
import sys
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader


def parse_pdf_safely(data):
    """独立进程限时解析，异常 PDF 不长期阻塞请求或影响文件保存。"""
    try:
        process = subprocess.run([sys.executable, '-m', 'app.services.pdf_metadata'], input=data,
                                 capture_output=True, timeout=12, check=True,
                                 cwd=Path(__file__).resolve().parents[2],
                                 creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        return json.loads(process.stdout)
    except (OSError, subprocess.SubprocessError, ValueError):
        return result({"title": "", "authors": "", "year": None, "doi": "", "abstract": ""},
                      "PDF 解析超时或失败，请手动填写。原文件仍可保存。")


def extract_metadata(data):
    fields = {"title": "", "authors": "", "year": None, "doi": "", "abstract": ""}
    warning = ""
    try:
        reader = PdfReader(BytesIO(data), strict=False)
        if reader.is_encrypted:
            return result(fields, "PDF 已加密，无法自动解析；仍可保存原文件并手动填写。")
        metadata = reader.metadata or {}
        for key, source, limit in (("title", "/Title", 500), ("authors", "/Author", 1000)):
            value = metadata.get(source)
            if isinstance(value, str):
                value = " ".join(value.split())
                if value.lower() not in ("untitled", "unknown", "anonymous", "无标题") and len(value) <= limit:
                    fields[key] = value
        # 只读取前两页，避免整篇论文解析带来的等待。
        text = "\n".join(reader.pages[index].extract_text()[:60000] for index in range(min(2, len(reader.pages))))
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        if not fields["title"]:
            for line in lines[:12]:
                if (8 <= len(line) <= 500 and not re.search(r"doi|https?://|arxiv|issn|copyright|©|^\d|journal|proceedings", line, re.I)
                        and not re.match(r"abstract|摘要|keywords|关键词", line, re.I)):
                    fields["title"] = line
                    break
        if not fields["authors"]:
            match = re.search(r"(?im)^\s*(?:authors?|作者)\s*[:：]\s*(.{1,1000})$", text)
            if match:
                fields["authors"] = match[1].strip()
        match = re.search(r"10\.\d{4,9}/[^\s<>\"{}]+", text, re.I)
        if match:
            doi = match[0].rstrip(".,;:，。；")
            if len(doi) <= 255:
                fields["doi"] = doi.lower()
        years = re.findall(r"\b(?:19|20)\d{2}\b", text[:12000])
        fields["year"] = next((int(year) for year in years if int(year) <= datetime.now(timezone.utc).year + 1), None)
        # 创建日期不是出版年份，因此不拿 PDF CreationDate 填充年份。
        match = re.search(r"(?:^|\n)\s*(?:abstract|摘\s*要)\s*[:：.\-—]?\s*(.+?)(?=\n\s*(?:key\s*words|关键词|关\s*键\s*词|(?:1[.、]?\s*)?introduction|(?:1[.、]?\s*)?引言)\b|\Z)", text, re.I | re.S)
        if match:
            fields["abstract"] = match[1].strip()[:50000]
    except Exception:
        warning = "无法完整读取 PDF 文本；已保留可识别信息，请手动补充。原文件仍可保存。"
    return result(fields, warning)


def result(fields, warning):
    recognized = [key for key, value in fields.items() if value]
    return {"fields": fields, "recognized": recognized,
            "missing": [key for key in fields if key not in recognized], "warning": warning}


if __name__ == '__main__':
    sys.stdout.buffer.write(json.dumps(extract_metadata(sys.stdin.buffer.read()), ensure_ascii=False).encode('utf-8'))
