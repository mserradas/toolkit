"""Check Herdr status and only the calling terminal's color settings."""

import json
import os
import subprocess
import sys


def capture(*command):
    return subprocess.run(
        command, check=True, capture_output=True, text=True, timeout=10
    ).stdout


def server_problem(status):
    server = status.get("server", {})
    client = status.get("client", {})
    update = status.get("update", {})
    if server.get("running") is not True:
        return 2, "Herdr detenido: abre Ghostty y repite --check"
    if server.get("compatible") is not True or server.get("endpoint_compatible") is False:
        return 1, "servidor Herdr incompatible con el cliente instalado"
    if any(part.get(key) for part in (server, update)
           for key in ("restart_needed", "server_binary_stale")):
        return 1, "Herdr necesita reiniciarse para usar el binario instalado"
    if server.get("version") != client.get("version"):
        return 1, "el servidor Herdr usa una versión distinta del cliente"
    return 0, ""


def radar_problem(payload):
    # Keep the latest outcome for each command, so a successful retry clears
    # its earlier failure. The server logs expose failures hidden by --check.
    latest = {}
    for entry in sorted(payload["result"]["logs"], key=lambda row: row.get("started_unix_ms", 0)):
        command = tuple(entry.get("command", []))
        if command and command[0] == "node":
            latest[command] = entry
    if any(entry.get("status") == "failed" for entry in latest.values()):
        return 1, "Radar falló al ejecutar Node desde Herdr; revisa herdr plugin log list --plugin hhdebb.herdr-radar. Si corregiste el arranque, el servidor existente necesita reiniciarse con el nuevo entorno."
    return 0, ""


def colors_disabled(environment):
    # Empty NO_COLOR does not disable colors. Never return the values.
    return bool(environment.get("NO_COLOR")) or environment.get("TERM") == "dumb"


def main():
    try:
        code, message = server_problem(json.loads(capture("herdr", "status", "--json")))
        if code:
            print(message)
            return code
        code, message = radar_problem(json.loads(capture(
            "herdr", "plugin", "log", "list", "--plugin", "hhdebb.herdr-radar"
        )))
        if code:
            print(message)
            return code
        if os.environ.get("HERDR_ENV") != "1":
            print("Servidor Herdr correcto; colores pendientes: ejecuta --check directamente en Ghostty/Herdr")
            return 2
        if colors_disabled({key: os.environ.get(key) for key in ("NO_COLOR", "TERM")}):
            print("colores desactivados por NO_COLOR o TERM=dumb en el entorno de esta comprobación")
            return 1
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        print("no comprobado: falló la consulta del servidor Herdr")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
