// Calamity risk estimator. All maths runs in the browser; every number comes from Open-Meteo.
const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const START = 1991, LAST = new Date().getFullYear() - 1;   // last full year
const GRID_START = LAST - 14;                              // grid call covers 15 years to keep it small
const T = { heavy: 64.5, veryHeavy: 115.6, hot: 40, gust: 90 };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f1 = n => n.toFixed(1);
const pct = p => Math.round(p * 100) + '%';
const level = p => p < .1 ? ['Low', 'low'] : p < .4 ? ['Moderate', 'mod'] : ['High', 'high'];   // risk word + css class
const pill = p => `<span class="pill ${level(p)[1]}">${level(p)[0]}</span>`;
const sum = a => a.reduce((x, y) => x + y, 0);

// ---------- statistics ----------

// Least-squares straight line y = intercept + slope * x.
function linearTrend(xs, ys) {
  const mx = sum(xs) / xs.length, my = sum(ys) / ys.length;
  const slope = sum(xs.map((x, i) => (x - mx) * (ys[i] - my))) / sum(xs.map(x => (x - mx) ** 2));
  return { slope, intercept: my - slope * mx };
}

// p-th percentile (0-100) with linear interpolation between sorted values.
function percentile(arr, p) {
  const s = [...arr].sort((a, b) => a - b), i = (s.length - 1) * p / 100;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

// Expected value for the target year = trend + 10th..90th percentile of past residuals. Under 15 years: plain mean.
function forecast(years, vals, target) {
  const lowConf = years.length < 15;
  const mean = sum(vals) / vals.length;
  const { slope, intercept } = lowConf ? { slope: 0, intercept: mean } : linearTrend(years, vals);
  const fit = x => intercept + slope * x;
  const resid = years.map((x, i) => vals[i] - fit(x));
  const expected = fit(target);
  return { expected, lo: expected + percentile(resid, 10), hi: expected + percentile(resid, 90), lowConf, fit, resid };
}

// Chance of exceeding a threshold = average of the raw share of past years and the trend-shifted share.
function probability(years, vals, threshold, target) {
  const share = a => a.filter(v => v > threshold).length / a.length;
  const f = forecast(years, vals, target);
  const hist = share(vals), trended = share(f.resid.map(r => f.expected + r));
  return { p: (hist + trended) / 2, hist, trended, exceed: vals.filter(v => v > threshold).length };
}

// ---------- data ----------

// GET json with localStorage cache (storage may be full or blocked, so always try/catch).
async function getJSON(url) {
  try { const c = localStorage.getItem(url); if (c) return JSON.parse(c); } catch { }
  const r = await fetch(url);
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(r.status === 429 ? 'The free data service is rate-limiting us. Wait a minute and try again.' : `Data service error (${r.status}): ${body.reason || 'unknown'}`);
  }
  const j = await r.json();
  try { localStorage.setItem(url, JSON.stringify(j)); } catch { }
  return j;
}

// "Chennai, India": search by the first part, use the rest as a country/region hint.
async function geocode(q) {
  const [name, ...hints] = q.split(',').map(s => s.trim().toLowerCase());
  const j = await getJSON(`${GEO}?name=${encodeURIComponent(name)}&count=10&language=en&format=json`);
  const list = j.results || [];
  if (!list.length) throw new Error(`Could not find a place called "${q}". Check the spelling or try just the city name.`);
  const match = r => hints.some(h => [r.country, r.admin1].some(s => s && s.toLowerCase() === h) || (r.country_code || '').toLowerCase() === h);
  return list.find(match) || list[0];
}

// One object per past year for the chosen month (1-12), from the daily arrays.
function monthMetrics(daily, month) {
  const byYear = new Map();
  daily.time.forEach((d, i) => {
    if (+d.slice(5, 7) !== month) return;
    const y = +d.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(i);
  });
  return [...byYear].map(([year, idx]) => {
    const vals = key => idx.map(i => daily[key][i]).filter(v => v != null);
    const count = (key, th) => vals(key).filter(v => v > th).length;
    const peak = key => idx.reduce((b, i) => {
      const v = daily[key][i];
      return v != null && (!b || v > b.v) ? { v, date: daily.time[i] } : b;
    }, null) || { v: 0, date: '' };
    return {
      year, total: sum(vals('precipitation_sum')), wet: peak('precipitation_sum'),
      heavy: count('precipitation_sum', T.heavy), veryHeavy: count('precipitation_sum', T.veryHeavy),
      hot: peak('temperature_2m_max'), hotDays: count('temperature_2m_max', T.hot),
      gust: peak('wind_gusts_10m_max'), storms: vals('weather_code').filter(c => c >= 95).length,
    };
  }).sort((a, b) => a.year - b.year);
}

// 3x3 grid of points at -10/0/+10 km from the centre (corners are ~14 km away).
function gridPoints(lat, lon) {
  const pts = [];
  for (const dy of [10, 0, -10]) for (const dx of [-10, 0, 10]) {
    const ns = dy > 0 ? 'North' : dy < 0 ? 'South' : '', ew = dx > 0 ? 'East' : dx < 0 ? 'West' : '';
    const km = Math.round(Math.hypot(dx, dy));
    pts.push({
      lat: lat + dy / 111.2, lon: lon + dx / (111.2 * Math.cos(lat * Math.PI / 180)),
      label: (ns && ew ? `${ns}-${ew}` : ns || ew || 'Centre') + (km ? `, ~${km} km` : ''),
    });
  }
  return pts;
}

// Mean monthly rain and heavy-rain days per year for each point, then a 0-1 relative risk score.
function areaStats(results, pts, month) {
  const rows = results.map((r, i) => {
    const years = new Set(); let total = 0, heavy = 0;
    r.daily.time.forEach((d, k) => {
      if (+d.slice(5, 7) !== month) return;
      const v = r.daily.precipitation_sum[k] || 0;
      years.add(d.slice(0, 4)); total += v; if (v > T.heavy) heavy++;
    });
    return { ...pts[i], elevation: r.elevation, rain: total / years.size, heavy: heavy / years.size, cell: r.latitude + ',' + r.longitude };
  });
  const maxRain = Math.max(...rows.map(r => r.rain)), maxHeavy = Math.max(...rows.map(r => r.heavy));
  rows.forEach(r => r.score = ((maxRain ? r.rain / maxRain : 0) + (maxHeavy ? r.heavy / maxHeavy : 0)) / (maxHeavy ? 2 : 1));
  // If rain differs by <15% and heavy-rain days are equal, the ranking is noise: flag it instead of exaggerating.
  const flat = (maxRain - Math.min(...rows.map(r => r.rain))) < 0.15 * maxRain && maxHeavy === Math.min(...rows.map(r => r.heavy));
  rows.forEach(r => r.flat = flat);
  return rows.sort((a, b) => b.score - a.score);
}

// ---------- page ----------

const latLonList = (pts, k) => pts.map(p => p[k].toFixed(4)).join(',');
let chart, map, layer;

async function run(e) {
  e.preventDefault();
  const q = $('place').value.trim(), month = +$('month').value, year = +$('year').value;
  $('error').hidden = true; $('results').hidden = true;
  if (!q) return showError('Please type a place name.');
  if (!(year > LAST)) return showError(`Please pick ${LAST + 1} or later. Earlier years are already in the data.`);
  $('go').disabled = true;
  try {
    $('status').textContent = 'Finding place…';
    const place = await geocode(q);
    $('status').textContent = `Downloading daily data for ${START}-${LAST}…`;
    const base = `${ARCHIVE}?latitude=${place.latitude}&longitude=${place.longitude}&start_date=${START}-01-01&end_date=${LAST}-12-31&daily=precipitation_sum,temperature_2m_max,wind_gusts_10m_max,weather_code&timezone=auto`;
    const hist = await getJSON(base);
    const rows = monthMetrics(hist.daily, month + 1);
    $('status').textContent = 'Sampling nearby points…';
    const pts = gridPoints(place.latitude, place.longitude);
    const grid = await getJSON(`${ARCHIVE}?latitude=${latLonList(pts, 'lat')}&longitude=${latLonList(pts, 'lon')}&start_date=${GRID_START}-01-01&end_date=${LAST}-12-31&daily=precipitation_sum&timezone=auto`);
    $('results').hidden = false;   // show before drawing so the map gets a real size
    render(place, month, year, rows, areaStats(grid, pts, month + 1));
    $('status').textContent = '';
  } catch (err) {
    showError(err instanceof TypeError ? 'Could not reach the data service. Check your internet connection.' : err.message);
  } finally { $('go').disabled = false; }
}

function showError(msg) { $('status').textContent = ''; $('error').textContent = msg; $('error').hidden = false; }

function render(place, month, year, rows, areas) {
  const years = rows.map(r => r.year), n = years.length, mName = MONTHS[month];
  const rain = forecast(years, rows.map(r => r.total), year);
  const lo = Math.max(0, rain.lo), expected = Math.max(0, rain.expected), hi = Math.max(0, rain.hi);

  const hazards = [
    { name: 'Flood-level rain', series: rows.map(r => r.wet.v), th: T.heavy, unit: 'mm', what: 'wettest day went above' },
    { name: 'Very heavy rain', series: rows.map(r => r.wet.v), th: T.veryHeavy, unit: 'mm', what: 'wettest day went above' },
    { name: 'Heat', series: rows.map(r => r.hot.v), th: T.hot, unit: '°C', what: 'hottest day went above' },
    { name: 'Storm-strength wind', series: rows.map(r => r.gust.v), th: T.gust, unit: 'km/h', what: 'strongest gust went above' },
  ].map(h => ({ ...h, f: forecast(years, h.series, year), pr: probability(years, h.series, h.th, year) }));
  const [flood, , heat, storm] = hazards;
  const conf = h => (h.f.lowConf || h.pr.exceed < 3) ? 'Low' : 'Medium';

  // Headline
  $('headline').textContent = `${place.name}, ${mName} ${year} — expected rain ${Math.round(expected)} mm (range ${Math.round(lo)}–${Math.round(hi)}), flood-risk probability ${pct(flood.pr.p)}, heat-risk ${pct(heat.pr.p)}, storm-risk ${pct(storm.pr.p)}`;
  $('headlineText').textContent = `${[place.admin1, place.country].filter(Boolean).join(', ')}. Based on ${n} past ${mName}s (${years[0]}–${years[n - 1]}). The range is where about 80% of past months would fall if the trend continues. It is a typical-month estimate, not a prediction of what will actually fall in ${year}.${rain.lowConf ? ' Less than 15 years of data, so the plain average is used and confidence is low.' : ''}`;

  // Summary tiles: answer first, headline sentence above stays as the full statement
  const tile = (k, v, s) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  $('tiles').innerHTML = tile('Expected rain', Math.round(expected) + ' mm', `Likely ${Math.round(lo)}–${Math.round(hi)} mm`) +
    [['Flood-level rain', flood], ['Heat', heat], ['Strong wind', storm]].map(([k, h]) => tile(k, pct(h.pr.p), pill(h.pr.p) + ' chance')).join('');

  // Chart
  const labels = [...years, year];
  chart?.destroy();
  chart = new Chart($('chart'), {
    data: {
      labels, datasets: [
        { type: 'bar', label: `Total ${mName} rain (mm)`, data: [...rows.map(r => r.total), expected], backgroundColor: [...years.map(() => '#2b6cb0'), '#c05621'] },
        { type: 'line', label: 'Linear trend', data: labels.map(rain.fit), borderColor: '#1a202c', borderDash: [6, 4], pointRadius: 0 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, title: { display: true, text: 'mm' } } },
      plugins: { tooltip: { callbacks: { afterLabel: c => c.dataIndex === n ? `Projection, likely range ${Math.round(lo)}–${Math.round(hi)} mm` : '' } } },
    },
  });
  const slope = rain.lowConf ? 0 : linearTrend(years, rows.map(r => r.total)).slope;
  $('chartText').textContent = `Blue bars are past totals; the orange bar is the ${year} projection (${Math.round(expected)} mm). The dashed line is the straight-line trend, ${rain.lowConf ? 'flat because there is too little data' : `${slope >= 0 ? 'rising' : 'falling'} by about ${f1(Math.abs(slope))} mm per year`}. Individual years swing far more than the trend, so treat the line as a weak signal.`;

  // Hazard table
  $('hazards').innerHTML = '<tr><th>Hazard</th><th>Expected worst day</th><th>Threshold</th><th>Probability</th><th>Confidence</th><th>In plain English</th></tr>' +
    hazards.map(h => `<tr><td>${h.name}</td><td>${f1(h.f.expected)} ${h.unit}</td><td>${h.th} ${h.unit}</td><td><strong>${pct(h.pr.p)}</strong> ${pill(h.pr.p)}</td><td>${conf(h)}</td>
      <td>In ${h.pr.exceed} of ${n} past ${mName}s the ${h.what} ${h.th} ${h.unit}. Adjusting for the trend gives ${pct(h.pr.p)} for ${year}.${conf(h) === 'Low' ? ' Rare or sparse events, so treat with caution.' : ''}</td></tr>`).join('');

  // Preparedness: general steps, hazard blocks only when estimated chance >= 10%
  const steps = {
    Flood: ['Know your nearest higher ground and a route that avoids underpasses and low roads.', 'Move documents, medicines and electronics to upper shelves or waterproof bags.', 'Keep a torch, power bank, drinking water and 3 days of essentials ready.', 'Never walk or drive through flowing floodwater; switch off mains power if water enters.'],
    Heat: ['Avoid going out between 11am and 4pm; wear light, loose clothing.', 'Drink water often, even if not thirsty; carry oral rehydration salts.', 'Check on elderly neighbours, children and outdoor workers.', 'Never leave people or pets in parked vehicles.'],
    Storm: ['Secure or bring in loose objects on balconies, roofs and terraces.', 'Stay away from windows, trees, hoardings and power lines during strong wind.', 'Charge phones and keep a battery radio for official alerts.', 'Avoid the coast and do not shelter under weak structures.'],
  };
  const card = (t, a) => `<div class="card"><strong>${t}</strong><ul>${a.map(s => `<li>${s}</li>`).join('')}</ul></div>`;
  let prep = card('Basics for any month', ['Save local emergency numbers and follow the local disaster-management authority and the national weather service (IMD in India).', 'Agree a family meeting point and keep a small emergency kit.', 'Re-check official warnings in the days before; this tool cannot see them.']);
  if (flood.pr.p >= .1 || hazards[1].pr.p >= .1) prep += card('Heavy rain / flood', steps.Flood);
  if (heat.pr.p >= .1) prep += card('Heat', steps.Heat);
  if (storm.pr.p >= .1) prep += card('Strong wind / storm', steps.Storm);
  if (prep.split('class="card"').length === 2) prep += card('Why no hazard blocks?', [`No hazard reached a 10% chance for ${mName} in this estimate. That lowers, but does not remove, the risk.`]);
  $('prep').innerHTML = prep;

  // Worst years
  const top = get => [...rows].sort((a, b) => get(b) - get(a)).slice(0, 3);
  const list = (title, items) => `<div class="card"><strong>${title}</strong><ol>${items.map(i => `<li>${i}</li>`).join('')}</ol></div>`;
  $('worst').innerHTML =
    list('Wettest months', top(r => r.total).map(r => `${r.year}: ${f1(r.total)} mm in the month; wettest day ${r.wet.date} (${f1(r.wet.v)} mm); ${r.storms} thunderstorm-coded days`)) +
    list('Hottest days', top(r => r.hot.v).map(r => `${r.hot.date}: ${f1(r.hot.v)} °C (${r.hotDays} days above ${T.hot} °C that month)`)) +
    list('Strongest gusts', top(r => r.gust.v).map(r => `${r.gust.date}: ${f1(r.gust.v)} km/h`));

  // Areas
  const cells = new Set(areas.map(a => a.cell)).size;
  $('areaText').textContent = `Nine points around the centre, ranked by average ${mName} rain and heavy-rain days (over ${GRID_START}–${LAST}). ${areas[0].flat ? 'Rain is similar across all points, so no area stands out.' : `${areas[0].label} is highest here.`} ERA5 cells are ~25 km wide, so these 9 points land on only ${cells} distinct cell${cells > 1 ? 's' : ''}; points sharing a cell share values, so treat differences as coarse.`;
  const meanRain = sum(areas.map(a => a.rain)) / areas.length;
  const colour = a => a.flat ? 'hsl(45,70%,45%)' : `hsl(${Math.round(120 * (1 - a.score))},70%,36%)`;
  const tag = a => a.flat ? 'Similar across area' : a.score >= .67 ? 'Higher' : a.score >= .33 ? 'Moderate' : 'Lower';
  $('areas').innerHTML = '<tr><th>#</th><th>Point</th><th>Elevation</th><th>Mean rain / month</th><th>Heavy-rain days / year</th><th>Relative risk</th><th>Flood watch</th></tr>' +
    areas.map((a, i) => `<tr><td>${i + 1}</td><td>${a.label}<br><small class="nm">looking up name…</small></td><td>${Math.round(a.elevation)} m</td><td>${f1(a.rain)} mm</td><td>${a.heavy.toFixed(2)}</td><td>${tag(a)} (${a.score.toFixed(2)})</td><td>${a.elevation < 10 && a.rain >= meanRain ? 'Low-lying and wetter than average' : '—'}</td></tr>`).join('');
  if (!map) {
    map = L.map('map');
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap contributors' }).addTo(map);
    layer = L.layerGroup().addTo(map);
  }
  map.invalidateSize(); layer.clearLayers();
  const markers = [];
  areas.forEach(a => markers.push(L.circleMarker([a.lat, a.lon], { radius: 10 + a.score * 16, color: '#1a202c', weight: 1, fillColor: colour(a), fillOpacity: .7 })
    .bindTooltip(`${a.label}: ${f1(a.rain)} mm/month, elevation ${Math.round(a.elevation)} m`).addTo(layer)));
  map.fitBounds(L.latLngBounds(areas.map(a => [a.lat, a.lon])).pad(0.3));
  nameAreas(areas, markers);
}

// Fill in real place names from OpenStreetMap Nominatim (reverse geocode); only names it returns are shown.
let nameRun = 0;
async function nameAreas(areas, markers) {
  const me = ++nameRun, cells = document.querySelectorAll('#areas .nm');
  for (let i = 0; i < areas.length && me === nameRun; i++) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&lat=${areas[i].lat.toFixed(4)}&lon=${areas[i].lon.toFixed(4)}`;
    let cached = false; try { cached = !!localStorage.getItem(url); } catch { }
    if (!cached && i) await new Promise(r => setTimeout(r, 1100));   // Nominatim policy: max 1 request/second
    try {
      const a = (await getJSON(url)).address || {};
      const name = a.suburb || a.neighbourhood || a.city_district || a.village || a.town || a.city || a.county;
      if (me !== nameRun) return;
      cells[i].textContent = name ? `near ${name}` : 'no named place (likely sea)';
      if (name) markers[i].setTooltipContent(`${areas[i].label} (near ${name}): ${f1(areas[i].rain)} mm/month, elevation ${Math.round(areas[i].elevation)} m`);
    } catch { if (me === nameRun) cells[i].textContent = 'name unavailable'; }
  }
}

// ---------- self-test (open index.html?test=1) ----------
function runTests() {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const out = [];
  const check = (name, ok) => { out.push((ok ? 'PASS ' : 'FAIL ') + name); console.assert(ok, name); };
  const yrs = Array.from({ length: 20 }, (_, i) => i + 1), ys = yrs.map(x => 2 * x);
  const t = linearTrend(yrs, ys);
  check('trend slope=2, intercept=0', near(t.slope, 2) && near(t.intercept, 0));
  check('percentile median of 1..5 = 3', percentile([1, 2, 3, 4, 5], 50) === 3);
  check('percentile p25 of 1..4 = 1.75', near(percentile([1, 2, 3, 4], 25), 1.75));
  check('percentile p10 of 1..5 = 1.4', near(percentile([1, 2, 3, 4, 5], 10), 1.4));
  const f = forecast(yrs, ys, 21);
  check('forecast year 21 = 42 with zero spread', near(f.expected, 42) && near(f.lo, 42) && near(f.hi, 42) && !f.lowConf);
  const p = probability(yrs, ys, 30, 21);   // past: 5/20 above 30; trend: 20/20 above 30
  check('probability blend = (0.25+1)/2', near(p.p, 0.625) && p.exceed === 5);
  const small = forecast([1, 2, 3, 4], [0, 0, 10, 10], 5);
  check('under 15 years falls back to mean + low confidence', near(small.expected, 5) && small.lowConf);
  $('testOut').textContent = out.join('\n'); $('testOut').hidden = false;
}

// ---------- start ----------
$('month').innerHTML = MONTHS.map((m, i) => `<option value="${i}">${m}</option>`).join('');
$('month').value = 6;                  // July as a starting example
$('year').value = LAST + 2;            // next year
$('year').min = LAST + 1;
$('form').addEventListener('submit', run);
document.querySelectorAll('.chip').forEach(b => b.onclick = () => { $('place').value = b.dataset.p; $('month').value = b.dataset.m; $('go').click(); });
if (new URLSearchParams(location.search).get('test')) runTests();
