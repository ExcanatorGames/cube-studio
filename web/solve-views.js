import {
  PRESETS,
  formatTime,
  result,
  summary,
  average,
  splitProgress,
  insightPeriods,
  metricChange,
  timeExtremes,
  solveDistribution,
  splitComparisons,
} from './core.js';
import { initSplitCharts } from './split-charts.js';
import { $, esc } from './dom.js';

export function createSolveViews({
  getSolves: all,
  getPage,
  getCustomSteps,
  motion,
  openSolve,
}) {
  let historyPage = 0;
  const renderSplitProgress = initSplitCharts({ openSolve });
  function filtered(scope, period = 'all') {
    let a = all();
    if (scope === 'today')
      a = a.filter(
        (s) => new Date(s.date).toDateString() === new Date().toDateString(),
      );
    if (period !== 'all')
      a = a.filter(
        (s) => Date.parse(s.date) >= Date.now() - Number(period) * 86400000,
      );
    return a;
  }
  function renderRecent() {
    const solves = all(),
      recent = solves.slice(-12).reverse();
    $('#recent-solves').innerHTML = recent.length
      ? recent
          .map(
            (s, i) =>
              `<li><button class="recent-solve" data-id="${esc(s.id)}" title="${esc(new Date(s.date).toLocaleString())}" aria-label="Open solve ${solves.length - i}, ${esc(formatTime(result(s)))}"><span class="recent-solve-index">${solves.length - i}</span><span class="recent-solve-time">${formatTime(result(s))}${s.penalty === '+2' ? '<small>+2</small>' : ''}</span><span class="recent-solve-date">${esc(new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))} · ${esc(new Date(s.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }))}</span></button></li>`,
          )
          .join('')
      : '<li class="empty">No solves yet.</li>';
  }
  function renderHistory() {
    const previousRows = $('#history-body').innerHTML;
    const a = filtered($('#history-scope').value)
        .reverse()
        .filter((s) =>
          [s.date, new Date(s.date).toLocaleString(), s.scramble, s.note]
            .join(' ')
            .toLowerCase()
            .includes($('#search').value.toLowerCase()),
        ),
      n = 25;
    historyPage = Math.max(
      0,
      Math.min(historyPage, Math.ceil(a.length / n) - 1),
    );
    const rows = a.slice(historyPage * n, (historyPage + 1) * n);
    $('#history-body').innerHTML = rows.length
      ? rows
          .map(
            (s, i) =>
              `<tr><td class="history-index">${a.length - historyPage * n - i}</td><td class="history-date">${esc(new Date(s.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }))}<small>${esc(new Date(s.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }))}</small></td><td class="history-time">${formatTime(result(s))}${s.penalty === '+2' ? '<small>includes +2</small>' : ''}</td><td class="history-splits">${s.splits.length || '—'}</td><td class="history-action"><button class="small-button" data-id="${esc(s.id)}" aria-label="Open solve ${esc(formatTime(result(s)))}"><span class="history-details-label">Details </span><span aria-hidden="true">↗</span></button></td></tr>`,
          )
          .join('')
      : '<tr><td colspan="5" class="empty">No matching solves.</td></tr>';
    $('#history-summary').textContent = a.length
      ? `${historyPage * n + 1}–${Math.min(a.length, (historyPage + 1) * n)} of ${a.length} solves`
      : '0 solves';
    $('#prev').disabled = historyPage === 0;
    $('#next').disabled = (historyPage + 1) * n >= a.length;
    $('.history-scroll').scrollTop = 0;
    if (previousRows !== $('#history-body').innerHTML)
      motion.play($('#history-body'), [{ opacity: 0.55 }, { opacity: 1 }], {
        duration: 140,
      });
  }
  function chart(a, width, history = a) {
    if (a.length < 2) return '<div class="empty">Not enough solves.</div>';
    const w = Math.max(260, width || 950),
      h = 280,
      left = 44,
      right = 16,
      top = 12,
      bottom = 44,
      values = a.map(result).filter(Number.isFinite),
      extremes = timeExtremes(values);
    if (!values.length) return '<div class="empty">No completed solves.</div>';
    const indices = new Map(history.map((s, i) => [s.id, i]));
    const averages = a.map((s) => {
      const i = indices.get(s.id);
      return i === undefined
        ? null
        : average(history.slice(Math.max(0, i - 11), i + 1), 12);
    });
    const scaleValues = [...values, ...averages.filter(Number.isFinite)];
    let low = Math.max(
        0,
        Math.floor(Math.min(...scaleValues) / 10000) * 10000 - 10000,
      ),
      high = Math.ceil(Math.max(...scaleValues) / 10000) * 10000 + 5000;
    if (low === high) high += 10000;
    const x = (i) => left + (i / (a.length - 1)) * (w - left - right),
      y = (v) => h - bottom - ((v - low) / (high - low)) * (h - top - bottom);
    let svg = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${a.length} solve times in seconds by solve number, oldest to newest">`;
    for (let i = 0; i <= 3; i++) {
      const v = low + ((high - low) * i) / 3,
        yy = y(v);
      svg += `<line x1="${left}" x2="${w - right}" y1="${yy}" y2="${yy}" stroke="#eef1f6"/><text x="${left - 9}" y="${yy + 4}" text-anchor="end">${(v / 1000).toFixed(0)}s</text>`;
    }
    let path = '',
      avgPath = '',
      dots = '',
      avgOpen = false,
      open = false;
    for (let i = 0; i < a.length; i++) {
      const v = result(a[i]);
      if (Number.isFinite(v)) {
        const fastest = v === extremes.fastest,
          slowest = v === extremes.slowest,
          label =
            fastest && slowest
              ? 'Fastest and slowest'
              : fastest
                ? 'Fastest'
                : slowest
                  ? 'Slowest'
                  : '';
        path += `${open ? 'L' : 'M'}${x(i).toFixed(2)} ${y(v).toFixed(2)} `;
        open = true;
        dots += `<circle class="solve-point${fastest ? ' fastest' : ''}${slowest ? ' slowest' : ''}" data-id="${esc(a[i].id)}" cx="${x(i)}" cy="${y(v)}" r="${label ? 4.5 : 2.8}" fill="#b9c5e9"><title>${label ? label + ' · ' : ''}Solve #${i + 1} · ${esc(new Date(a[i].date).toLocaleString())} · ${formatTime(v)}</title></circle>`;
      } else open = false;
      const av = averages[i];
      if (Number.isFinite(av) && av !== null) {
        avgPath += `${avgOpen ? 'L' : 'M'}${x(i)} ${y(av)} `;
        avgOpen = true;
      } else avgOpen = false;
    }
    svg += `<path d="${path}" fill="none" stroke="#bdc9ed" stroke-width="1" opacity=".65" pointer-events="none"/><path class="solve-average-line" d="${avgPath}" fill="none" stroke="#7489d4" stroke-width="2.5" stroke-linecap="round" pointer-events="none"/>${dots}`;
    svg += `<text x="${left}" y="${h - 24}">#1</text><text x="${w - right}" y="${h - 24}" text-anchor="end">#${a.length}</text><text x="${(left + w - right) / 2}" y="${h - 5}" text-anchor="middle">Solve</text></svg>`;
    return svg;
  }
  let mainChartWidth = 0;
  function renderMainChart(a) {
    mainChartWidth = Math.floor($('#main-chart').clientWidth);
    $('#main-chart').innerHTML = chart(
      a,
      mainChartWidth,
      insightPeriods(all()).view,
    );
    motion.play($('#main-chart'), [{ opacity: 0.5 }, { opacity: 1 }], {
      duration: 200,
    });
  }
  new ResizeObserver(() =>
    requestAnimationFrame(() => {
      if (
        getPage() === 'insights' &&
        Math.floor($('#main-chart').clientWidth) !== mainChartWidth
      )
        renderMainChart(insightPeriods(all(), $('#insight-period').value).view);
    }),
  ).observe($('#main-chart'));
  function renderInsights() {
    const periods = insightPeriods(all(), $('#insight-period').value),
      a = periods.view,
      s = summary(a),
      current = summary(periods.current),
      previous = summary(periods.previous);
    const subMinute = (stats) =>
      stats.completed ? (100 * stats.sub60) / stats.completed : null;
    const cards = [
      ['BEST', formatTime(s.best), 'Fastest result in this view', 'best'],
      ['AO5', formatTime(s.ao5), 'Latest 5 · best and worst removed', 'ao5'],
      [
        'AO12',
        formatTime(s.ao12),
        'Latest 12 · best and worst removed',
        'ao12',
      ],
      [
        'SUB-MINUTE',
        s.completed ? `${Math.round(subMinute(s))}%` : '—',
        `${s.sub60} of ${s.completed} completed solves`,
        'subMinute',
      ],
      ['MEAN', formatTime(s.mean), 'Completed solves, including +2', 'mean'],
      ['MEDIAN', formatTime(s.median), 'Middle completed result', 'median'],
      [
        'AO100',
        formatTime(s.ao100),
        'Latest 100 · trim 5 on each side',
        'ao100',
      ],
      ['SOLVES', String(s.count), 'All attempts in this view', 'count'],
    ];
    $('#insight-comparison').textContent =
      `Change: ${periods.label.toLowerCase()}.`;
    let comparisonCount = 0;
    $('#insight-stats').innerHTML = cards
      .map(([label, value, help, key]) => {
        const higherBetter = key === 'subMinute' || key === 'count';
        const change = metricChange(
          key === 'subMinute' ? subMinute(current) : current[key],
          key === 'subMinute' ? subMinute(previous) : previous[key],
          { higherBetter },
        );
        const direction =
          change?.tone === 'neutral'
            ? 'unchanged'
            : key === 'count'
              ? change?.percent > 0
                ? 'more solves'
                : 'fewer solves'
              : change?.tone === 'good'
                ? 'improved'
                : 'slower';
        const description =
          key === 'subMinute' && change?.tone === 'bad'
            ? 'lower sub-minute rate'
            : direction;
        const percent = change
          ? `${change.percent > 0 ? '+' : ''}${change.percent.toFixed(1)}%`
          : null;
        if (change) comparisonCount++;
        const badge = change
          ? `<small class="stat-change ${change.tone}" title="${esc(periods.label)}" aria-label="${esc(percent + ' ' + description + '. ' + periods.label)}">${percent} <span>${description}</span></small>`
          : '';
        return `<div class="stat" title="${esc(help)}"><span>${label}</span><strong>${value}</strong>${badge}</div>`;
      })
      .join('');
    $('#insight-comparison').hidden = comparisonCount === 0;
    renderMainChart(a);
    const bins = solveDistribution(a),
      max = Math.max(...bins.map((bin) => bin.count), 1);
    $('#distribution').innerHTML = bins.length
      ? bins
          .map(
            (bin) =>
              `<div class="bar-row"><span>${bin.label}</span><div class="bar-track"><div class="bar-fill" style="width:${(bin.count / max) * 100}%"></div></div><strong>${bin.count}</strong></div>`,
          )
          .join('')
      : '<div class="empty">No completed solves.</div>';
    const preset = $('#split-preset').value,
      labels = preset === 'custom' ? getCustomSteps() : PRESETS[preset],
      progress = splitProgress(a, labels, insightPeriods(all()).view);
    progress.comparisons = splitComparisons(
      periods.current,
      periods.previous,
      labels,
    );
    progress.comparisonLabel = periods.label;
    renderSplitProgress(progress);
    if (!progress.count) {
      $('#split-chart').innerHTML = '<div class="empty">No split data.</div>';
      return;
    }
    const mx = Math.max(...progress.means, 1);
    $('#split-chart').innerHTML =
      `<p class="muted">${progress.count} solves</p>` +
      labels
        .map(
          (name, i) =>
            `<div class="bar-row"><span>${esc(name)}</span><div class="bar-track"><div class="bar-fill" style="width:${(progress.means[i] / mx) * 100}%"></div></div><strong>${formatTime(progress.means[i])}</strong></div>`,
        )
        .join('');
  }

  $('#history-scope').onchange = () => {
    historyPage = 0;
    renderHistory();
  };
  $('#search').oninput = () => {
    historyPage = 0;
    renderHistory();
  };
  $('#prev').onclick = () => {
    historyPage--;
    renderHistory();
  };
  $('#next').onclick = () => {
    historyPage++;
    renderHistory();
  };
  $('#insight-period').onchange = renderInsights;
  $('#split-preset').onchange = renderInsights;
  return { renderRecent, renderHistory, renderInsights };
}
