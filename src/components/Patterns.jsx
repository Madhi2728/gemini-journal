import { useMemo } from 'react';

// Mood is drawn as an ink line across the page, with the neutral line ruled
// through it. Sealed entries have no mood by design, so they are not plotted --
// the count is shown instead, because a silent gap would be misleading.

function MoodLine({ points }) {
  const W = 640, H = 200, PAD = 16;

  const path = useMemo(() => {
    if (points.length < 2) return '';
    const step = (W - PAD * 2) / (points.length - 1);
    return points
      .map((p, i) => {
        const x = PAD + i * step;
        const y = PAD + ((1 - p.mood) / 2) * (H - PAD * 2);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [points]);

  if (points.length < 2) {
    return <p className="hint">Two saved conversations and the line starts to mean something.</p>;
  }

  const step = (W - PAD * 2) / (points.length - 1);

  return (
    <svg className="moodline" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Mood across ${points.length} entries`}>
      <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} className="moodline-zero" />
      <path d={path} className="moodline-path" />
      {points.map((p, i) => (
        <circle
          key={p.id}
          cx={PAD + i * step}
          cy={PAD + ((1 - p.mood) / 2) * (H - PAD * 2)}
          r="3.5"
          className="moodline-dot"
        />
      ))}
    </svg>
  );
}

export default function Patterns({ entries }) {
  const analysed = entries.filter((e) => e.kind === 'ai' && typeof e.mood === 'number');
  const sealed = entries.length - analysed.length;
  const points = [...analysed].reverse();

  const themes = useMemo(() => {
    const tally = new Map();
    analysed.forEach((e) =>
      (e.themes ?? []).forEach((t) => tally.set(t, (tally.get(t) ?? 0) + 1)),
    );
    return [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [analysed]);

  const average = analysed.length
    ? analysed.reduce((s, e) => s + e.mood, 0) / analysed.length
    : 0;

  return (
    <article className="page">
      <h2 className="entry-title">How things have been going</h2>

      <MoodLine points={points} />

      <dl className="figures">
        <div>
          <dt>Entries read by the AI</dt>
          <dd className="tabular">{analysed.length}</dd>
        </div>
        <div>
          <dt>Sealed, never analysed</dt>
          <dd className="tabular">{sealed}</dd>
        </div>
        <div>
          <dt>Average mood</dt>
          <dd className="tabular">{average.toFixed(2)}</dd>
        </div>
      </dl>

      {themes.length > 0 && (
        <>
          <h3 className="sub">What keeps coming up</h3>
          <ul className="themes themes--tally">
            {themes.map(([t, n]) => (
              <li key={t}>
                {t} <span className="tabular">{n}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}
