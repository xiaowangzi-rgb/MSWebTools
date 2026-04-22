#!/usr/bin/env python3
"""Sync font coverage data from the Unity project into this web tool's static assets.

Instead of reading raw ttf cmaps, this scans the project's TMP FontAsset (.asset)
files — they are the real source of truth for "what a TMP text can render":

  * Static FontAssets  → only characters in m_CharacterTable can be drawn
                         (ttf cmap is irrelevant; unbaked chars are simply lost)
  * Dynamic FontAssets → at runtime anything in the source ttf's cmap can be added

The script resolves each Dynamic asset's m_SourceFontFileGUID to its ttf via the
sibling `.meta` files, and emits per-FontAsset ranges to the JSON. The web UI then
lets the user toggle which FontAssets participate in the coverage check, so
scenarios like "only TitanOne SDF" or "all Static + Dynamic" can be simulated.

Usage:
    python3 scripts/sync-font-coverage.py
    python3 scripts/sync-font-coverage.py --project /path/to/Merge_Match
    python3 scripts/sync-font-coverage.py --scan-root Assets/AppData/Res
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

try:
    from fontTools.ttLib import TTFont
    from fontTools.pens.recordingPen import RecordingPen
except ImportError:
    sys.exit("fontTools is required: pip install fonttools")


DEFAULT_UNITY_PROJECT = Path.home() / "Match_Story" / "Merge_Match"
DEFAULT_SCAN_ROOT = Path("Assets") / "AppData"
# Where we look for .ttf/.otf + their .meta to resolve GUID → file path.
# Project Asset paths outside this list are still scanned via rglob as a fallback.
PRIMARY_FONT_DIRS = [
    Path("Assets") / "AppData" / "Res" / "Font",
    Path("Assets") / "TextMesh Pro" / "Fonts",
]

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = REPO_ROOT / "public" / "font-coverage" / "supported.json"


# ───────────────────────────── Unity YAML parsing ─────────────────────────────

RE_MODE = re.compile(r"^\s*m_AtlasPopulationMode:\s*(\d+)\s*$", re.M)
RE_GUID = re.compile(r"^\s*m_SourceFontFileGUID:\s*([0-9a-fA-F]+)\s*$", re.M)
# An m_Unicode line always appears under m_CharacterTable in a FontAsset; it's
# not reused for glyphs or sprites, so we can just scrape every occurrence that
# appears AFTER the m_CharacterTable anchor without worrying about structure.
RE_UNICODE = re.compile(r"^\s*m_Unicode:\s*(\d+)\s*$", re.M)


@dataclass
class FontAssetInfo:
    path: Path        # absolute path to .asset
    name: str         # file stem (e.g. "JINGNANBOBOHEI-BOLD SDF")
    mode: int         # 0 static / 1 dynamic / 2 dynamic OS
    source_guid: str | None
    characters: set[int]


def parse_font_asset(path: Path) -> FontAssetInfo | None:
    """Return FontAssetInfo if the .asset is a TMP FontAsset, else None."""
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        print(f"[warn] cannot read {path}: {e}", file=sys.stderr)
        return None

    mode_m = RE_MODE.search(text)
    if not mode_m:
        return None  # sprite asset or similar — skip

    mode = int(mode_m.group(1))

    guid_m = RE_GUID.search(text)
    source_guid = guid_m.group(1) if guid_m else None

    characters: set[int] = set()
    ct_anchor = text.find("m_CharacterTable:")
    if ct_anchor != -1:
        segment = text[ct_anchor:]
        for m in RE_UNICODE.finditer(segment):
            characters.add(int(m.group(1)))

    return FontAssetInfo(
        path=path,
        name=path.stem,
        mode=mode,
        source_guid=source_guid,
        characters=characters,
    )


# ───────────────────────────── GUID → ttf resolver ─────────────────────────────

RE_GUID_META = re.compile(r"^guid:\s*([0-9a-fA-F]+)\s*$", re.M)


def build_guid_index(project_root: Path) -> dict[str, Path]:
    """Map ttf/otf GUIDs → file paths by scanning .meta files."""
    index: dict[str, Path] = {}

    def _scan(root: Path):
        for p in root.rglob("*"):
            if not p.is_file():
                continue
            suf = p.suffix.lower()
            if suf not in (".ttf", ".otf"):
                continue
            meta = p.with_suffix(p.suffix + ".meta")
            if not meta.is_file():
                continue
            try:
                t = meta.read_text(encoding="utf-8", errors="replace")
            except Exception:
                continue
            m = RE_GUID_META.search(t)
            if m:
                index[m.group(1)] = p

    # Try primary dirs first; if the GUID isn't there we fall back to a full scan.
    for sub in PRIMARY_FONT_DIRS:
        root = project_root / sub
        if root.is_dir():
            _scan(root)
    return index


def resolve_ttf(
    guid: str,
    primary_index: dict[str, Path],
    project_root: Path,
    full_scan_cache: dict[str, Path] | None,
) -> tuple[Path | None, dict[str, Path] | None]:
    """Resolve GUID to ttf path. Builds a full Assets/ scan lazily on miss."""
    if guid in primary_index:
        return primary_index[guid], full_scan_cache
    if full_scan_cache is None:
        full_scan_cache = {}
        assets_root = project_root / "Assets"
        if assets_root.is_dir():
            for p in assets_root.rglob("*"):
                if not p.is_file() or p.suffix.lower() not in (".ttf", ".otf"):
                    continue
                meta = p.with_suffix(p.suffix + ".meta")
                if not meta.is_file():
                    continue
                try:
                    t = meta.read_text(encoding="utf-8", errors="replace")
                except Exception:
                    continue
                m = RE_GUID_META.search(t)
                if m:
                    full_scan_cache[m.group(1)] = p
    return full_scan_cache.get(guid), full_scan_cache


# ───────────────────────────── ttf cmap ─────────────────────────────

# Unicode categories that are allowed to have an empty outline (whitespace, control,
# format, surrogate, unassigned). For any other codepoint, an empty glyph in the ttf
# is a "placeholder" — cmap claims coverage but nothing will actually draw.
_NO_OUTLINE_OK_CATEGORIES = frozenset({"Cc", "Cf", "Cs", "Cn", "Zs", "Zl", "Zp"})


def _outline_ok(cp: int) -> bool:
    try:
        return unicodedata.category(chr(cp)) in _NO_OUTLINE_OK_CATEGORIES
    except (ValueError, TypeError):
        return True  # non-BMP surrogates etc. — leave to the draw check


def ttf_codepoints(path: Path) -> tuple[set[int], int]:
    """Return (renderable_codepoints, placeholder_count).

    A codepoint is considered renderable when its glyph draws at least one segment
    (line / curve / composite component) to a pen. "Placeholder" glyphs — cmap has
    an entry but the glyph outline is empty — are stripped, because TMP will render
    them as a blank quad even though the font technically claims coverage.
    """
    font = TTFont(str(path), lazy=True)
    try:
        cmap = font.get("cmap")
        if not cmap:
            return set(), 0

        mapping: dict[int, str] = {}
        for sub in cmap.tables:
            if sub.isUnicode():
                for cp, glyph_name in sub.cmap.items():
                    mapping[cp] = glyph_name

        glyph_set = font.getGlyphSet()
        cps: set[int] = set()
        placeholder = 0
        for cp, glyph_name in mapping.items():
            if _outline_ok(cp):
                cps.add(cp)
                continue
            try:
                glyph = glyph_set[glyph_name]
                pen = RecordingPen()
                glyph.draw(pen)
                if not pen.value:
                    placeholder += 1
                    continue
            except Exception:
                # If we cannot inspect the glyph, err on the side of keeping it —
                # better a false positive than silently dropping a real one.
                pass
            cps.add(cp)
        return cps, placeholder
    finally:
        font.close()


def to_ranges(codepoints: set[int]) -> list[list[int]]:
    if not codepoints:
        return []
    sorted_cps = sorted(codepoints)
    ranges: list[list[int]] = []
    start = sorted_cps[0]
    prev = start
    for cp in sorted_cps[1:]:
        if cp == prev + 1:
            prev = cp
            continue
        ranges.append([start, prev])
        start = cp
        prev = cp
    ranges.append([start, prev])
    return ranges


# ───────────────────────────── main ─────────────────────────────

MODE_LABEL = {0: "static", 1: "dynamic", 2: "dynamic-os"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--project", type=Path, default=DEFAULT_UNITY_PROJECT,
                        help=f"Unity project root (default: {DEFAULT_UNITY_PROJECT})")
    parser.add_argument("--scan-root", type=Path, default=None,
                        help=f"subdirectory inside project to scan for .asset files "
                             f"(default: {DEFAULT_SCAN_ROOT})")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT,
                        help=f"output JSON path (default: {DEFAULT_OUT.relative_to(REPO_ROOT)})")
    args = parser.parse_args()

    scan_root = args.project / (args.scan_root or DEFAULT_SCAN_ROOT)
    if not scan_root.is_dir():
        print(f"Scan root not found: {scan_root}", file=sys.stderr)
        return 2

    print(f"Scanning FontAssets under {scan_root.relative_to(args.project)}")

    assets: list[FontAssetInfo] = []
    for p in sorted(scan_root.rglob("*.asset")):
        info = parse_font_asset(p)
        if info:
            assets.append(info)

    if not assets:
        print("No TMP FontAssets found (nothing with m_AtlasPopulationMode).", file=sys.stderr)
        return 2

    print(f"Found {len(assets)} FontAsset(s)")

    primary_index = build_guid_index(args.project)
    full_scan: dict[str, Path] | None = None

    entries: list[dict] = []
    for info in assets:
        mode_label = MODE_LABEL.get(info.mode, f"unknown({info.mode})")
        source_ttf: str | None = None
        placeholder = 0

        if info.mode == 0:
            # Static — only baked characters are renderable
            cps = info.characters
        else:
            # Dynamic / Dynamic OS — runtime can add anything in source ttf's cmap
            if not info.source_guid:
                print(f"  [warn] {info.name}: mode={mode_label} but no source GUID, using characterTable only")
                cps = info.characters
            else:
                ttf_path, full_scan = resolve_ttf(
                    info.source_guid, primary_index, args.project, full_scan,
                )
                if ttf_path is None:
                    print(f"  [warn] {info.name}: cannot resolve GUID {info.source_guid}, using characterTable only")
                    cps = info.characters
                    placeholder = 0
                else:
                    source_ttf = ttf_path.name
                    ttf_cps, placeholder = ttf_codepoints(ttf_path)
                    cps = ttf_cps | info.characters

        rel_path = str(info.path.relative_to(args.project))
        entry = {
            "name": info.name,
            "file": rel_path,
            "mode": mode_label,
            "sourceTtf": source_ttf,
            "codepoints": len(cps),
            "ranges": to_ranges(cps),
        }
        if info.mode != 0 and source_ttf:
            entry["placeholdersFiltered"] = placeholder  # type: ignore[assignment]
        entries.append(entry)
        tag = "S" if info.mode == 0 else "D"
        suffix = ""
        if source_ttf:
            suffix = f"  ← {source_ttf}"
            if placeholder:
                suffix += f"  (-{placeholder} placeholder)"
        print(f"  [{tag}] {info.name:40s}: {len(cps):>6,} cp{suffix}")

    data = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "project": str(args.project),
        "scanRoot": str(scan_root.relative_to(args.project)),
        "fontAssets": entries,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    # Summary
    total_union: set[int] = set()
    for e in entries:
        for a, b in e["ranges"]:
            total_union.update(range(a, b + 1))
    print(f"\nWrote {args.out.relative_to(REPO_ROOT)}")
    print(f"  FontAssets: {len(entries)}  |  union: {len(total_union):,} cp")
    return 0


if __name__ == "__main__":
    sys.exit(main())
