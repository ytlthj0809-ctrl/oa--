#!/usr/bin/env bash
set -Eeuo pipefail

exec /usr/bin/python3 - <<'PY'
import os
import pwd
import re
import stat
from pathlib import Path

LINE = re.compile(r"([A-Z][A-Z0-9_]*)=([A-Za-z0-9._/@:%+-]*)")
deploy = pwd.getpwnam("deploy")
path = Path("/opt/withdraw-oa/secrets/runtime.env")
descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
metadata = os.fstat(descriptor)
if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != 0 or metadata.st_gid != deploy.pw_gid or stat.S_IMODE(metadata.st_mode) != 0o640:
    os.close(descriptor)
    raise SystemExit("untrusted runtime.env metadata")

environment = {
    "HOME": "/home/deploy",
    "USER": "deploy",
    "LOGNAME": "deploy",
    "PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
}
with os.fdopen(descriptor, "r", encoding="ascii") as handle:
    for number, raw_line in enumerate(handle.read().splitlines(), 1):
        if not raw_line or raw_line.startswith("#"):
            continue
        match = LINE.fullmatch(raw_line)
        if not match or match.group(1) in environment:
            raise SystemExit(f"unsafe runtime.env line {number}")
        environment[match.group(1)] = match.group(2)

if any(key.startswith("MYSQL_DBA_") or key in {"DATABASE_DBA_URL", "DBA_DATABASE_URL"} for key in environment):
    raise SystemExit("DBA credential forbidden in application environment")
os.chdir("/opt/withdraw-oa/current")
node = "/usr/bin/node-20"
os.execve(node, [node, "services/api/src/server.mjs"], environment)
PY
