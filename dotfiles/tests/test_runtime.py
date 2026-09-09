import importlib.util
import contextlib
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "runtime", Path(__file__).resolve().parents[1] / "check-runtime.py"
)
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


class RuntimeChecks(unittest.TestCase):
    def status(self, **overrides):
        return {
            "client": {"version": "0.9.0"},
            "server": {"running": True, "compatible": True, "version": "0.9.0", **overrides},
        }

    def test_current_server(self):
        self.assertEqual(runtime.server_problem(self.status())[0], 0)

    def test_stopped_server_is_pending(self):
        self.assertEqual(runtime.server_problem(self.status(running=False))[0], 2)

    def test_old_compatible_server_is_reported(self):
        self.assertEqual(runtime.server_problem(self.status(version="0.8.2"))[0], 1)

    def test_updated_binary_and_protocol_mismatch_are_reported(self):
        for flag in ("restart_needed", "server_binary_stale"):
            self.assertEqual(runtime.server_problem(self.status(**{flag: True}))[0], 1)
        self.assertEqual(runtime.server_problem(self.status(compatible=False))[0], 1)

    def test_nonempty_no_color_including_zero_disables_colors(self):
        for value in ("1", "true", "0"):
            self.assertTrue(runtime.colors_disabled({"NO_COLOR": value, "TERM": "xterm-256color"}))
        self.assertTrue(runtime.colors_disabled({"TERM": "dumb"}))

    def test_empty_no_color_and_unrelated_variables_are_ignored(self):
        for env in ({"NO_COLOR": "", "TERM": "xterm-ghostty"}, {"OTHER_NO_COLOR": "1"}, {}):
            self.assertFalse(runtime.colors_disabled(env))

    def test_agent_environment_outside_herdr_is_not_treated_as_panel(self):
        with patch.object(runtime, "capture", return_value=json.dumps(self.status())), \
                patch.dict(runtime.os.environ, {"NO_COLOR": "1"}, clear=True), \
                contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(runtime.main(), 2)

    def test_color_check_inside_herdr(self):
        for no_color, expected in (("", 0), ("1", 1)):
            with patch.object(runtime, "capture", return_value=json.dumps(self.status())), \
                    patch.dict(runtime.os.environ, {"HERDR_ENV": "1", "NO_COLOR": no_color}, clear=True), \
                    contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(runtime.main(), expected)


if __name__ == "__main__":
    unittest.main()
