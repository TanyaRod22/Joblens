import io

from fastapi import HTTPException, UploadFile
from pypdf import PdfReader


def extract_text_from_upload(file: UploadFile, content: bytes) -> str:
    filename = (file.filename or "").lower()
    content_type = (file.content_type or "").lower()

    if filename.endswith(".txt") or content_type == "text/plain":
        return content.decode("utf-8", errors="replace").strip()

    if filename.endswith(".pdf") or content_type == "application/pdf":
        return _extract_pdf_text(content)

    if filename.endswith(".docx") or content_type in (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ):
        return _extract_docx_text(content)

    raise HTTPException(
        status_code=400,
        detail="Unsupported file type. Upload a PDF, DOCX, or TXT resume.",
    )


def _extract_pdf_text(content: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(content))
        pages = [page.extract_text() or "" for page in reader.pages]
        text = "\n".join(pages).strip()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not read PDF file.") from exc

    if len(text) < 20:
        raise HTTPException(
            status_code=400,
            detail="Could not extract enough text from the PDF. Try a text-based PDF or paste manually.",
        )
    return text


def _extract_docx_text(content: bytes) -> str:
    try:
        from docx import Document
    except ImportError as exc:
        raise HTTPException(
            status_code=400,
            detail="DOCX support is unavailable on the server. Upload PDF or TXT instead.",
        ) from exc

    try:
        document = Document(io.BytesIO(content))
        paragraphs = [paragraph.text.strip() for paragraph in document.paragraphs if paragraph.text.strip()]
        text = "\n".join(paragraphs).strip()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not read DOCX file.") from exc

    if len(text) < 20:
        raise HTTPException(
            status_code=400,
            detail="Could not extract enough text from the DOCX file.",
        )
    return text
