export const BADGE_CATALOG: { key: string; label: string; hint: string }[] = [
  { key: "placed", label: "Placed", hint: "Took the test" },
  { key: "wpm_40", label: "40 WPM", hint: "A rated 40" },
  { key: "wpm_60", label: "60 WPM", hint: "A rated 60" },
  { key: "wpm_80", label: "80 WPM", hint: "A rated 80" },
  { key: "streak_7", label: "7-day streak", hint: "Seven workouts in a row" },
  { key: "daily_1", label: "Daily #1", hint: "Won a daily" },
  { key: "runs_100", label: "100 runs", hint: "A hundred finishes" },
  ...("abcdefghijklmnopqrstuvwxyz".split("").map((g) => ({
    key: `cleared_${g}`,
    label: `Cleared ${g.toUpperCase()}`,
    hint: `${g.toUpperCase()} used to be a problem`,
  }))),
];
