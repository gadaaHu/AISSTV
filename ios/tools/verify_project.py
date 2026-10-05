#!/usr/bin/env python3
"""Static checks for the AISSTV iOS project.

There is no Swift toolchain on the machine this project was authored on, so
these checks stand in for a compiler build. They cover the failure modes that
actually break an Xcode project:

  1. project.pbxproj graph integrity - every referenced object UUID is defined,
     the root object exists, the synchronized group and INFOPLIST_FILE point at
     real paths, and braces/parens balance.
  2. Info.plist and every asset-catalog Contents.json parse, and the required
     usage-description keys are present.
  3. No duplicate top-level type declarations across Swift files (a redefinition
     is a hard compile error). Nested declarations such as `CodingKeys` are
     correctly ignored.
  4. Every `APIClient.shared.<method>(...)` call exists on APIClient.
  5. Every `Theme.<x>` / `Format.<x>` / `EventType.<x>` / `LeaveType.<x>` /
     `DateParsing.<x>` / `DateDisplay.<x>` / `AppConfig.<x>` reference exists.
  6. The view types the shell navigates to all exist.
  7. Source files are non-empty and have balanced braces.
  8. Only first-party Apple modules are imported (no third-party packages).
  9. Every file with a `#Preview` that reads `AuthStore` from the environment
     also injects one, so previews do not crash at runtime.

This is a static check, not a compiler: it cannot type-check expressions or
verify SwiftUI API availability. It is a safety net, not a substitute for
building in Xcode.

Usage:  python tools/verify_project.py [--root .]
Exit code 0 when all checks pass, 1 otherwise.
"""

from __future__ import annotations

import argparse
import json
import plistlib
import re
import sys
from pathlib import Path

UUID_RE = re.compile(r"\b[0-9A-Fa-f]{24}\b")
DEFINITION_RE = re.compile(r"^\s*([0-9A-Fa-f]{24})\b[^=\n]*=\s*\{", re.MULTILINE)
STRING_RE = re.compile(r'"(?:[^"\\]|\\.)*"')

DECL_RE = re.compile(
    r"^\s*(?:@[A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\))?\s+)*"
    r"(?:public\s+|private\s+|internal\s+|fileprivate\s+|final\s+|open\s+)*"
    r"(struct|class|enum|actor|protocol)\s+([A-Za-z_][A-Za-z0-9_]*)"
)

FUNC_RE = re.compile(r"\bfunc\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\s*\(")

#: Types that the shell or the app entry point require to exist.
REQUIRED_TYPES = [
    "AISSTVApp",
    "RootView",
    "SplashView",
    "LoginView",
    "HomeShellView",
    "DashboardView",
    "CamerasView",
    "CameraFormView",
    "CameraPreviewView",
    "EmployeesView",
    "FaceEnrollmentView",
    "EventsView",
    "LeavesView",
    "IncidentsView",
    "UsersView",
    "ProfileView",
    "ServerSettingsView",
    "ServerSettings",
]

#: Static namespaces whose members are cross-checked against their definition.
NAMESPACE_SOURCES = {
    "Theme": "DesignSystem/Theme.swift",
    "Format": "DesignSystem/Components.swift",
    "EventType": "Core/Models/Event.swift",
    "LeaveType": "Core/Models/Leave.swift",
    "DateParsing": "Core/Networking/JSONCoding.swift",
    "DateDisplay": "Core/Networking/JSONCoding.swift",
    "AppConfig": "Core/Support/AppConfig.swift",
    "ServerSettings": "Core/Support/ServerSettings.swift",
    "IncidentDomain": "Core/Models/Incident.swift",
}


#: Members supplied by protocol conformances rather than written out, so the
#: source scan cannot see them.
PROTOCOL_PROVIDED_MEMBERS = {
    "allCases",
    "id",
    "rawValue",
    "hashValue",
    "description",
    "debugDescription",
    "self",
}


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.passes: list[str] = []

    def ok(self, message: str) -> None:
        self.passes.append(message)

    def error(self, message: str) -> None:
        self.errors.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def sanitize(line: str) -> str:
    """Remove string literals and trailing comments so brace counting and
    declaration matching are not confused by their contents."""
    without_strings = STRING_RE.sub('""', line)
    comment = without_strings.find("//")
    if comment != -1:
        without_strings = without_strings[:comment]
    return without_strings


def top_level_declarations(text: str) -> list[tuple[str, str]]:
    """Return (kind, name) for declarations at file scope only.

    Nested types (a `CodingKeys` enum inside every model, `AuthStore.State`)
    are legal and must not be treated as duplicate declarations.
    """
    found: list[tuple[str, str]] = []
    depth = 0
    for raw_line in text.splitlines():
        line = sanitize(raw_line)
        if depth == 0:
            match = DECL_RE.match(line)
            if match:
                found.append((match.group(1), match.group(2)))
        depth += line.count("{") - line.count("}")
        if depth < 0:
            depth = 0
    return found


# --------------------------------------------------------------------------- 1


def check_pbxproj(root: Path, report: Report) -> None:
    pbx = root / "AISSTV.xcodeproj" / "project.pbxproj"
    if not pbx.is_file():
        report.error("missing AISSTV.xcodeproj/project.pbxproj")
        return

    text = read_text(pbx)

    if text.count("{") != text.count("}"):
        report.error(
            f"project.pbxproj braces unbalanced: {text.count('{')} '{{' vs {text.count('}')} '}}'"
        )
    if text.count("(") != text.count(")"):
        report.error(
            f"project.pbxproj parentheses unbalanced: {text.count('(')} '(' vs {text.count(')')} ')'"
        )

    definitions = set(DEFINITION_RE.findall(text))
    if not definitions:
        report.error("project.pbxproj defines no objects")
        return

    all_tokens = set(UUID_RE.findall(text))
    undefined = sorted(all_tokens - definitions)
    if undefined:
        report.error("project.pbxproj references undefined object ids: " + ", ".join(undefined))
    else:
        report.ok(f"project.pbxproj: {len(definitions)} objects, all references resolve")

    root_match = re.search(r"rootObject\s*=\s*([0-9A-Fa-f]{24})", text)
    root_id = root_match.group(1) if root_match else None
    if not root_id:
        report.error("project.pbxproj has no rootObject")
    elif root_id not in definitions:
        report.error(f"rootObject {root_id} is not defined")

    for token in sorted(definitions):
        if token == root_id:
            continue
        if text.count(token) < 2:
            report.warn(f"project.pbxproj object {token} is defined but never referenced")

    for needed in (
        "PBXFileSystemSynchronizedRootGroup",
        "fileSystemSynchronizedGroups",
        "AISSTV_API_BASE_URL",
    ):
        if needed not in text:
            report.error(f"project.pbxproj is missing `{needed}`")

    sync_match = re.search(
        r"isa = PBXFileSystemSynchronizedRootGroup;\s*\n\s*path = ([^;]+);", text
    )
    if sync_match:
        group_path = sync_match.group(1).strip().strip('"')
        if not (root / group_path).is_dir():
            report.error(f"synchronized group path `{group_path}` does not exist")
        else:
            count = len(list((root / group_path).rglob("*.swift")))
            report.ok(f"synchronized group `{group_path}` exists ({count} Swift files)")

    # Anchor to the start of a line so GENERATE_INFOPLIST_FILE does not match.
    info_match = re.search(r"^\s*INFOPLIST_FILE = \"?([^\";]+)\"?;", text, re.MULTILINE)
    if not info_match:
        report.error("project.pbxproj sets no INFOPLIST_FILE")
    else:
        plist_rel = info_match.group(1).strip()
        if not (root / plist_rel).is_file():
            report.error(f"INFOPLIST_FILE `{plist_rel}` does not exist")
        else:
            report.ok(f"INFOPLIST_FILE `{plist_rel}` exists")


# --------------------------------------------------------------------------- 2


def check_plists_and_assets(root: Path, report: Report) -> None:
    plists = [p for p in root.rglob("*.plist") if "build" not in p.parts]
    if not plists:
        report.error("no Info.plist found")
    for plist in plists:
        try:
            with plist.open("rb") as handle:
                data = plistlib.load(handle)
        except Exception as exc:  # noqa: BLE001 - report whatever went wrong
            report.error(f"{plist.relative_to(root)} is not a valid plist: {exc}")
            continue
        report.ok(f"{plist.relative_to(root)} parses ({len(data)} keys)")
        for key in (
            "NSCameraUsageDescription",
            "NSFaceIDUsageDescription",
            "NSPhotoLibraryUsageDescription",
            "NSAppTransportSecurity",
        ):
            if key not in data:
                report.error(f"{plist.name} is missing `{key}`")

    assets = sorted(root.rglob("Assets.xcassets/**/Contents.json"))
    if not assets:
        report.error("no asset catalog Contents.json found")
    for asset in assets:
        try:
            json.loads(read_text(asset))
        except Exception as exc:  # noqa: BLE001
            report.error(f"{asset.relative_to(root)} is not valid JSON: {exc}")
    if assets:
        report.ok(f"{len(assets)} asset-catalog Contents.json files parse")

    for required in ("AppIcon.appiconset", "AccentColor.colorset"):
        if not any(required in str(path) for path in assets):
            report.error(f"asset catalog is missing {required}")


# --------------------------------------------------------------------------- 3-7


def check_swift_sources(root: Path, report: Report) -> None:
    source_root = root / "AISSTV"
    if not source_root.is_dir():
        report.error("AISSTV/ source folder is missing")
        return

    files = sorted(source_root.rglob("*.swift"))
    if not files:
        report.error("no Swift sources found")
        return
    report.ok(f"{len(files)} Swift files under AISSTV/")

    declarations: dict[str, list[str]] = {}
    contents: dict[Path, str] = {}

    for path in files:
        rel = str(path.relative_to(root))
        text = read_text(path)
        contents[path] = text

        if not text.strip():
            report.error(f"{rel} is empty")
            continue

        depth_ok = True
        depth = 0
        for raw_line in text.splitlines():
            line = sanitize(raw_line)
            depth += line.count("{") - line.count("}")
        if depth != 0:
            report.error(f"{rel} has unbalanced braces (final depth {depth})")
            depth_ok = False

        if depth_ok:
            for _kind, name in top_level_declarations(text):
                declarations.setdefault(name, []).append(rel)

    duplicates = {name: where for name, where in declarations.items() if len(where) > 1}
    if duplicates:
        for name, where in sorted(duplicates.items()):
            report.error(f"type `{name}` declared in multiple files: {', '.join(where)}")
    else:
        report.ok(f"{len(declarations)} distinct top-level types, no duplicates")

    missing = [name for name in REQUIRED_TYPES if name not in declarations]
    if missing:
        report.error("required types are missing: " + ", ".join(missing))
    else:
        report.ok(f"all {len(REQUIRED_TYPES)} required top-level types exist")

    # 4. APIClient methods
    client_methods: set[str] = set()
    for rel_path in ("Core/Networking/APIClient.swift", "Core/Networking/APIEndpoints.swift"):
        candidate = source_root / rel_path
        if candidate.is_file():
            client_methods.update(FUNC_RE.findall(read_text(candidate)))
    if not client_methods:
        report.error("could not read any APIClient methods")
    else:
        call_re = re.compile(r"\b(?:APIClient\.shared|client|api)\.([A-Za-z_][A-Za-z0-9_]*)\s*\(")
        unknown_calls: dict[str, set[str]] = {}
        for path, text in contents.items():
            if path.parent.name == "Networking":
                continue
            for name in call_re.findall(text):
                if name not in client_methods:
                    unknown_calls.setdefault(name, set()).add(str(path.relative_to(source_root)))
        if unknown_calls:
            for name, where in sorted(unknown_calls.items()):
                report.error(
                    f"call to unknown APIClient method `{name}()` in {', '.join(sorted(where))}"
                )
        else:
            report.ok(f"all APIClient calls resolve ({len(client_methods)} methods available)")

    # 5. namespace members
    namespace_members: dict[str, set[str]] = {}
    for namespace, rel_path in NAMESPACE_SOURCES.items():
        candidate = source_root / rel_path
        if not candidate.is_file():
            report.warn(f"namespace source {rel_path} for {namespace} not found")
            continue
        body = read_text(candidate)
        members = set(FUNC_RE.findall(body))
        members.update(re.findall(r"\bstatic\s+(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)", body))
        members.update(re.findall(r"^\s*case\s+([A-Za-z_][A-Za-z0-9_]*)", body, re.MULTILINE))
        # Types nested inside the namespace (for example `Theme.ChipStyle`).
        members.update(
            re.findall(r"\b(?:struct|class|enum|actor|protocol)\s+([A-Za-z_][A-Za-z0-9_]*)", body)
        )
        namespace_members[namespace] = members

    for namespace, members in sorted(namespace_members.items()):
        usage_re = re.compile(rf"\b{namespace}\.([A-Za-z_][A-Za-z0-9_]*)")
        source_file = source_root / NAMESPACE_SOURCES[namespace]
        unknown: dict[str, set[str]] = {}
        for path, text in contents.items():
            if path == source_file:
                continue
            for name in usage_re.findall(text):
                if name in PROTOCOL_PROVIDED_MEMBERS:
                    continue
                if name not in members:
                    unknown.setdefault(name, set()).add(str(path.relative_to(source_root)))
        for name, where in sorted(unknown.items()):
            report.error(f"{namespace}.{name} does not exist (used in {', '.join(sorted(where))})")
    if namespace_members:
        report.ok(f"namespace members verified: {', '.join(sorted(namespace_members))}")

    # 8. Only first-party Apple modules may be imported (no third-party deps).
    allowed_modules = {
        "Foundation",
        "SwiftUI",
        "UIKit",
        "Combine",
        "CoreGraphics",
        "CoreFoundation",
        "CoreImage",
        "CoreMedia",
        "CoreVideo",
        "Dispatch",
        "ImageIO",
        "PhotosUI",
        "LocalAuthentication",
        "Security",
        "UniformTypeIdentifiers",
        "CryptoKit",
        "Network",
        "UserNotifications",
        "QuickLook",
        "WebKit",
        "os",
        "OSLog",
        "Observation",
        "AVFoundation",
        "Charts",
        "MapKit",
        "CoreLocation",
    }
    import_re = re.compile(r"^\s*import\s+([A-Za-z_][A-Za-z0-9_]*)", re.MULTILINE)
    for path, text in contents.items():
        for module in import_re.findall(text):
            if module not in allowed_modules:
                report.error(
                    f"{path.relative_to(source_root)} imports `{module}`, "
                    "which is not an allowed first-party module"
                )

    # 9. A view that reads the AuthStore from the environment must also inject
    #    one in its #Preview, otherwise the preview crashes at runtime.
    for path, text in contents.items():
        if "#Preview" not in text:
            continue
        needs_auth = "@EnvironmentObject" in text and "AuthStore" in text
        if needs_auth and "environmentObject(AuthStore" not in text:
            report.error(
                f"{path.relative_to(source_root)} has a #Preview but never injects an "
                "AuthStore, so the preview will crash"
            )
    report.ok("preview environment injection checked")

    # 10. Anything the `#Preview` blocks call must exist in every build
    #     configuration, because the `#Preview` macro is compiled in Release too.
    #     A preview-only factory hidden behind `#if DEBUG` is a Release-build
    #     failure, so verify the AuthStore preview factory is unconditional.
    auth_store = source_root / "Core/Auth/AuthStore.swift"
    if auth_store.is_file():
        body = read_text(auth_store)
        marker = body.find("func preview(")
        if marker == -1:
            report.error("AuthStore has no `preview(user:)` factory for #Preview blocks")
        else:
            # Anchor to line-start directives so a mention of "#if DEBUG" inside a
            # comment cannot be mistaken for the real thing.
            open_re = re.compile(r"^\s*#if\s+DEBUG\b", re.MULTILINE)
            close_re = re.compile(r"^\s*#endif\b", re.MULTILINE)
            opens = len([m for m in open_re.finditer(body) if m.start() < marker])
            closes = len([m for m in close_re.finditer(body) if m.start() < marker])
            if opens > closes:
                report.error(
                    "AuthStore.preview is inside `#if DEBUG`, but #Preview blocks use it; "
                    "this breaks a Release build"
                )
            else:
                report.ok("AuthStore.preview is available in all build configurations")


# --------------------------------------------------------------------------- main


def main() -> int:
    parser = argparse.ArgumentParser(description="Static checks for the AISSTV iOS project")
    parser.add_argument("--root", default=".", help="folder containing AISSTV.xcodeproj")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not (root / "AISSTV.xcodeproj").is_dir():
        print(f"error: {root} does not contain AISSTV.xcodeproj", file=sys.stderr)
        return 2

    report = Report()
    check_pbxproj(root, report)
    check_plists_and_assets(root, report)
    check_swift_sources(root, report)

    print("=" * 72)
    print(f"AISSTV iOS static verification - {root}")
    print("=" * 72)
    for message in report.passes:
        print(f"  PASS  {message}")
    for message in report.warnings:
        print(f"  WARN  {message}")
    for message in report.errors:
        print(f"  FAIL  {message}")
    print("-" * 72)
    print(
        f"{len(report.passes)} passed, {len(report.warnings)} warnings, "
        f"{len(report.errors)} errors"
    )
    return 1 if report.errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
