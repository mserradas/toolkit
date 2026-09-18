"""Normalize Radar's generated tab-bar path without copying machine state."""

import re
import sys
from pathlib import Path


def normalize(text):
    return re.sub(
        r"""command = 'cat "/[^"\n]+/herdr/plugins/hhdebb\.herdr-radar/tabbar\.txt"'""",
        """command = 'cat "${XDG_STATE_HOME:-$HOME/.local/state}/herdr/plugins/hhdebb.herdr-radar/tabbar.txt"'""",
        text,
    )


if __name__ == "__main__":
    source = normalize(Path(sys.argv[1]).read_text())
    if len(sys.argv) == 3:
        sys.exit(0 if source == normalize(Path(sys.argv[2]).read_text()) else 1)
    sys.stdout.write(source)
