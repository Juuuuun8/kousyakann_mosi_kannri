"""Stream PDF text geometry as parser input JSON without creating an intermediate file."""

from __future__ import annotations

import json
import sys

import pdfplumber


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: pdf-text-stream.py PDF_PATH", file=sys.stderr)
        return 2
    pages = []
    with pdfplumber.open(sys.argv[1]) as pdf:
        for number, page in enumerate(pdf.pages, 1):
            words = page.extract_words(
                keep_blank_chars=False,
                use_text_flow=False,
                extra_attrs=["size"],
            )
            items = [
                {
                    "text": word["text"],
                    "x": word["x0"],
                    "y": word["top"],
                    "width": word["x1"] - word["x0"],
                    "height": word["bottom"] - word["top"],
                }
                for word in words
            ]
            pages.append(
                {
                    "pageNumber": number,
                    "text": page.extract_text() or "",
                    "items": items,
                }
            )
    json.dump({"pageCount": len(pages), "pages": pages}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
