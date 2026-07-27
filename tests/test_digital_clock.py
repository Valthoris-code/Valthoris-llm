import unittest

import digital_clock


class TestDigitalClock(unittest.TestCase):
    def test_parse_args_defaults(self):
        args = digital_clock.parse_args([])
        self.assertEqual(args.interval, 1.0)
        self.assertIsNone(args.iterations)

    def test_parse_args_rejects_non_positive_interval(self):
        with self.assertRaises(SystemExit):
            digital_clock.parse_args(["--interval", "0"])

    def test_parse_args_rejects_non_positive_iterations(self):
        with self.assertRaises(SystemExit):
            digital_clock.parse_args(["--iterations", "0"])

    def test_run_clock_stops_at_requested_iterations(self):
        rendered_frames = []
        sleep_calls = []

        digital_clock.run_clock(
            interval=0.5,
            iterations=2,
            clear_screen=False,
            sleep_fn=lambda seconds: sleep_calls.append(seconds),
            print_fn=lambda text, **kwargs: rendered_frames.append(text),
        )

        self.assertEqual(len(rendered_frames), 2)
        self.assertEqual(len(sleep_calls), 1)
        self.assertTrue(all("Digital Clock (24h)" in frame for frame in rendered_frames))


if __name__ == "__main__":
    unittest.main()
