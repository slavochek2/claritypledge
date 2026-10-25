"""P1563 item 6: every Hugging Face pipeline load carries an immutable commit revision.

pyannote.audio 3.1's Pipeline.from_pretrained has no `revision` argument; it reads
"<repo>@<revision>". A bare repo id (or a branch name) would follow a moved head.

Run: cd services/transcribe && python -m pytest tests/test_p1563_hf_revision_pins.py -v
"""
import ast
import pathlib
import re

SERVICE = pathlib.Path(__file__).resolve().parent.parent
PINNED = re.compile(r"^[\w.-]+/[\w.-]+@[0-9a-f]{40}$")


def _from_pretrained_first_args(path):
    tree = ast.parse(path.read_text())
    out = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and getattr(node.func, "attr", "") == "from_pretrained":
            out.append(node.args[0])
    return tree, out


def _resolve(tree, arg):
    """A string literal, or a module-level constant name holding one."""
    if isinstance(arg, ast.Constant):
        return arg.value
    if isinstance(arg, ast.Name):
        for node in tree.body:
            if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == arg.id for t in node.targets):
                return node.value.value
    raise AssertionError("from_pretrained argument is neither a literal nor a module constant")


def test_every_service_from_pretrained_is_pinned_to_a_commit():
    seen = 0
    for path in sorted(SERVICE.glob("*.py")):
        tree, args = _from_pretrained_first_args(path)
        for arg in args:
            value = _resolve(tree, arg)
            assert PINNED.match(value), "%s loads %r without a 40-hex commit revision" % (path.name, value)
            seen += 1
    assert seen >= 2, "expected the diarizer and VAD loads, found %d" % seen
