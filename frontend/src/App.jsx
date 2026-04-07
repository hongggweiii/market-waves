import { useState, useEffect } from 'react';
import Plotly from 'plotly.js-dist-min';
import PlotlyFactory from 'react-plotly.js/factory';

const createPlotlyComponent = PlotlyFactory.default || PlotlyFactory;
const Plot = createPlotlyComponent(Plotly);

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  navy:        '#1e3a5f',
  navyLight:   '#2d5282',
  blue:        '#3b82f6',
  blueHover:   '#2563eb',
  blueSoft:    '#eff6ff',
  teal:        '#0ea5e9',
  bg:          '#f1f5f9',
  surface:     '#ffffff',
  border:      '#e2e8f0',
  text:        '#1e293b',
  textMuted:   '#64748b',
  green:       '#059669',
  greenSoft:   '#f0fdf4',
  amber:       '#d97706',
  amberSoft:   '#fffbeb',
  red:         '#dc2626',
  pink:        '#db2777',
  pinkSoft:    '#fdf2f8',
  purple:      '#7c3aed',
  purpleSoft:  '#faf5ff',
};

// ── Shared style helpers ──────────────────────────────────────────────────────
const card = (extra = {}) => ({
  background: C.surface,
  borderRadius: '12px',
  border: `1px solid ${C.border}`,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  padding: '20px 24px',
  ...extra,
});

// Reusable small components defined outside App to avoid re-creation on each render
function InsightBox({ bg, border, children }) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: '8px',
      padding: '12px 16px', fontSize: '0.875em', lineHeight: '1.7em', color: C.textMuted }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: '0.68em', fontWeight: 700, letterSpacing: '0.1em',
      textTransform: 'uppercase', color: C.textMuted, marginBottom: '10px' }}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function NavTab({ id, label, activeTab, setActiveTab }) {
  return (
    <button
      onClick={() => setActiveTab(id)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '0 20px', height: '60px', display: 'flex', alignItems: 'center',
        color: activeTab === id ? '#ffffff' : 'rgba(255,255,255,0.55)',
        borderBottom: activeTab === id ? '3px solid #60a5fa' : '3px solid transparent',
        fontWeight: activeTab === id ? 700 : 400,
        fontSize: '0.875em', letterSpacing: '0.02em', whiteSpace: 'nowrap',
        transition: 'color 0.15s',
      }}
    >
      {label}
    </button>
  );
}

function App() {

  // ── Navigation ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('home');

  // ── Data & signal state ────────────────────────────────────────────────────
  const [time, setTime]       = useState([]);
  const [price, setPrice]     = useState([]);
  const [asset, setAsset]     = useState('synthetic');

  // STFT
  const [spectrogram, setSpectrogram]   = useState(null);
  const [windowSize, setWindowSize]     = useState(60);
  const [samplingRate, setSamplingRate] = useState(1.0);
  const [is3DMode, setIs3DMode]         = useState(false);
  const [decomposedWaves, setDecomposedWaves] = useState([]);

  // Low-pass filter
  const [isFiltering, setIsFiltering]             = useState(false);
  const [cutoffFreq, setCutoffFreq]               = useState(0.08);
  const [reconstructedPrice, setReconstructedPrice] = useState([]);

  // Frequency prober
  const [probePeriod, setProbePeriod] = useState(7);
  const [probeResult, setProbeResult] = useState(null);

  // Forecasting
  const [forecastData, setForecastData]       = useState(null);
  const [forecastHorizon, setForecastHorizon] = useState(60);

  // Shared component count (used by 3D decomposition and forecasting)
  const [numComponents, setNumComponents] = useState(3);

  // ── Derived values ─────────────────────────────────────────────────────────
  const deltaF               = (samplingRate / windowSize).toFixed(4);
  const isNyquistViolated    = samplingRate < 2 / 7;
  const probeFreqDisplay     = (1 / probePeriod).toFixed(4);
  const cutoffPeriodDisplay  = Math.round(1 / cutoffFreq);
  const dominantPeriod       = forecastData?.components?.[0]?.period_days;
  const priceMean            = price.length > 0 ? price.reduce((a, b) => a + b, 0) / price.length : 0;

  // ── API effects ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/data?ticker=${asset}`)
      .then(r => r.json())
      .then(d => { setTime(d.time); setPrice(d.price); })
      .catch(console.error);
  }, [asset]);

  useEffect(() => {
    if (price.length === 0) return;
    fetch('/api/stft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signal_data: price, window_size: windowSize, sampling_rate: samplingRate }),
    }).then(r => r.json()).then(setSpectrogram).catch(console.error);
  }, [price, windowSize, samplingRate]);

  useEffect(() => {
    if (!isFiltering || !spectrogram) return;
    const filteredReal = spectrogram.real_parts.map((row, i) =>
      spectrogram.frequencies[i] > cutoffFreq ? row.map(() => 0) : row);
    const filteredImag = spectrogram.imag_parts.map((row, i) =>
      spectrogram.frequencies[i] > cutoffFreq ? row.map(() => 0) : row);
    fetch('/api/ifft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ real_parts: filteredReal, imag_parts: filteredImag,
        window_size: windowSize, sampling_rate: samplingRate, global_mean: spectrogram.global_mean }),
    }).then(r => r.json()).then(d => setReconstructedPrice(d.reconstructed_signal)).catch(console.error);
  }, [isFiltering, cutoffFreq, spectrogram, windowSize, samplingRate]);

  useEffect(() => {
    if (price.length === 0) return;
    fetch('/api/decompose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signal_data: price, sampling_rate: 1.0, num_components: numComponents }),
    }).then(r => r.json()).then(setDecomposedWaves).catch(console.error);
  }, [price, numComponents]);

  useEffect(() => {
    if (price.length === 0) return;
    fetch('/api/forecast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signal_data: price, sampling_rate: 1.0, horizon: forecastHorizon, num_components: numComponents }),
    }).then(r => r.json()).then(setForecastData).catch(console.error);
  }, [price, forecastHorizon, numComponents]);

  useEffect(() => {
    if (price.length === 0) return;
    fetch('/api/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signal_data: price, target_period: probePeriod }),
    }).then(r => r.json()).then(setProbeResult).catch(console.error);
  }, [price, probePeriod]);

  // ── Derived chart data ─────────────────────────────────────────────────────
  const hoverTextMatrix = spectrogram
    ? spectrogram.magnitudes.map((row, i) =>
        row.map((_, j) => {
          const a = spectrogram.real_parts[i][j].toFixed(2);
          const b = spectrogram.imag_parts[i][j].toFixed(2);
          return `Cosine Part (a): ${a}<br>Sine Part (b): ${b}`;
        }))
    : [];

  const timeDomainTraces = [
    { x: time, y: price, type: 'scatter', mode: 'lines', name: 'Raw Data',
      line: { color: isFiltering ? '#cbd5e1' : C.teal, width: 2 } },
  ];
  if (isFiltering && reconstructedPrice.length > 0) {
    timeDomainTraces.push({
      x: time.slice(0, reconstructedPrice.length), y: reconstructedPrice,
      type: 'scatter', mode: 'lines', name: 'Filtered Trend',
      line: { color: C.amber, width: 3 },
    });
  }

  // ── Plotly layout factory ──────────────────────────────────────────────────
  const plotLayout = (title, xTitle, yTitle, extra = {}) => ({
    title:  { text: title, font: { size: 14, color: C.text } },
    xaxis:  { title: xTitle, color: C.textMuted, gridcolor: '#f1f5f9' },
    yaxis:  { title: yTitle, color: C.textMuted, gridcolor: '#f1f5f9' },
    plot_bgcolor:  C.surface,
    paper_bgcolor: C.surface,
    margin: { l: 54, r: 24, b: 50, t: 42 },
    font:   { family: "'Inter','Segoe UI',sans-serif", size: 12, color: C.text },
    ...extra,
  });

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text }}>

      {/* ════════════ FIXED NAVBAR ════════════ */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        background: C.navy, boxShadow: '0 2px 16px rgba(0,0,0,0.28)',
        display: 'flex', alignItems: 'stretch', height: '60px',
      }}>
        {/* Logo */}
        <div style={{ padding: '0 22px', display: 'flex', alignItems: 'center',
          gap: '8px', borderRight: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
          <span style={{ color: '#fff', fontWeight: 800, fontSize: '0.95em', letterSpacing: '0.04em' }}>
            Market<span style={{ color: '#60a5fa' }}>Waves</span>
          </span>
        </div>

        {/* Tab links */}
        <div style={{ display: 'flex', alignItems: 'stretch', flex: 1, overflowX: 'auto' }}>
          <NavTab id="home"     label="Home"             activeTab={activeTab} setActiveTab={setActiveTab} />
          <NavTab id="stft"     label="STFT Explorer"    activeTab={activeTab} setActiveTab={setActiveTab} />
          <NavTab id="forecast" label="Forecasting"      activeTab={activeTab} setActiveTab={setActiveTab} />
          <NavTab id="prober"   label="Frequency Prober" activeTab={activeTab} setActiveTab={setActiveTab} />
        </div>

        {/* Dataset selector */}
        <div style={{ padding: '0 20px', display: 'flex', alignItems: 'center',
          gap: '8px', borderLeft: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75em', whiteSpace: 'nowrap' }}>Dataset:</span>
          <select
            value={asset}
            onChange={e => setAsset(e.target.value)}
            style={{ background: 'rgba(255,255,255,0.1)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.25)', borderRadius: '6px',
              padding: '5px 8px', fontSize: '0.82em', cursor: 'pointer' }}
          >
            <option value="synthetic" style={{ background: C.navy }}>Synthetic (Textbook)</option>
            <option value="^GSPC"     style={{ background: C.navy }}>S&amp;P 500</option>
            <option value="EURUSD=X"  style={{ background: C.navy }}>EUR / USD</option>
            <option value="TSLA"      style={{ background: C.navy }}>Tesla (TSLA)</option>
            <option value="BTC-USD"   style={{ background: C.navy }}>Bitcoin (BTC)</option>
          </select>
        </div>
      </nav>

      {/* ════════════ PAGE BODY (offset for fixed nav) ════════════ */}
      <div style={{ paddingTop: '60px' }}>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            HOME
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {activeTab === 'home' && (
          <div>
            {/* Hero banner */}
            <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, #1e40af 100%)`,
              padding: '72px 24px 64px', textAlign: 'center', color: '#fff' }}>
              <h1 style={{ color: '#fff', fontSize: '2.6em', fontWeight: 800,
                margin: '0 0 14px', letterSpacing: '-0.03em' }}>
                MarketWaves
              </h1>
              <p style={{ fontSize: '1.1em', color: 'rgba(255,255,255,0.75)', maxWidth: '560px',
                margin: '0 auto 32px', lineHeight: '1.65em' }}>
                An interactive learning environment for Fourier analysis applied to financial market data.
                Built for BT3017.
              </p>
              <button
                onClick={() => setActiveTab('stft')}
                style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px',
                  padding: '13px 36px', fontSize: '1em', fontWeight: 700, cursor: 'pointer',
                  letterSpacing: '0.02em', boxShadow: '0 4px 14px rgba(59,130,246,0.5)',
                  transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#2563eb'}
                onMouseLeave={e => e.currentTarget.style.background = '#3b82f6'}
              >
                Launch Explorer →
              </button>
            </div>

            {/* Feature cards */}
            <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '52px 24px 0' }}>
              <h2 style={{ textAlign: 'center', fontSize: '1.35em', marginBottom: '28px' }}>
                Three tools, one framework
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
                gap: '20px', marginBottom: '52px' }}>
                {[
                  { id: 'stft', color: C.blue, title: 'STFT Explorer',
                    desc: 'Decompose market prices into time-frequency representations. Adjust window size and sampling rate to observe the time-frequency tradeoff live. Apply a low-pass filter via Inverse FFT to extract trend from noise.' },
                  { id: 'forecast', color: C.pink, title: 'Cycle Forecasting',
                    desc: 'Extrapolate the dominant cycles identified by FFT forward in time. Understand when and why frequency-based forecasting is reliable — and what makes it break down on real market data.' },
                  { id: 'prober', color: C.purple, title: 'Frequency Prober',
                    desc: 'Test whether a specific cycle length exists in the data using the dot product method. Connect the intuitive concept of a "period in days" to the mathematical concept of "frequency in Hz".' },
                ].map(f => (
                  <div
                    key={f.id}
                    onClick={() => setActiveTab(f.id)}
                    style={{ ...card({ borderTop: `4px solid ${f.color}`, cursor: 'pointer' }),
                      transition: 'box-shadow 0.18s, transform 0.18s' }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'; e.currentTarget.style.transform = 'none'; }}
                  >
                    <h3 style={{ fontSize: '1.05em', color: f.color, marginBottom: '10px' }}>{f.title}</h3>
                    <p style={{ color: C.textMuted, lineHeight: '1.65em', fontSize: '0.9em', marginBottom: '16px' }}>{f.desc}</p>
                    <span style={{ color: f.color, fontSize: '0.85em', fontWeight: 700 }}>Open</span>
                  </div>
                ))}
              </div>

              {/* Guided walkthrough */}
              <div style={{ ...card({ marginBottom: '52px' }) }}>
                <h2 style={{ fontSize: '1.15em', marginBottom: '20px', display: 'flex',
                  alignItems: 'center', gap: '8px' }}>
                  Guided Walkthrough
                  <span style={{ fontSize: '0.7em', color: C.textMuted, fontWeight: 400,
                    background: C.blueSoft, padding: '3px 10px', borderRadius: '20px', marginLeft: '4px' }}>
                    7 steps
                  </span>
                </h2>
                <ol style={{ paddingLeft: '22px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  {[
                    ['Start with Synthetic Data.',
                      'Select "Synthetic (Textbook)" from the Dataset dropdown in the top-right corner. This signal is mathematically constructed from a known 30-day cycle and 7-day cycle plus random noise — you already know the correct answer, which makes it ideal for building intuition before moving to noisy real data.'],
                    ['Read the Spectrogram.',
                      'Go to the STFT Explorer tab. The bottom chart is the spectrogram. The Y-axis is frequency (cycles per day), the X-axis is time, and colour shows energy strength — red/yellow is strong, blue is weak. Look for warm horizontal bands: those are the dominant cycles. They appear near the bottom of the chart because they are low-frequency (slow, multi-week) cycles.'],
                    ['Explore the Time-Frequency Tradeoff.',
                      'Drag the Window Size (N) slider. A large window gives sharp frequency resolution (you can tell which frequency is present) but blurry time resolution (you cannot tell when it changed). A small window does the opposite. This tradeoff is the core constraint of STFT — it cannot be avoided.'],
                    ['Apply the Low-Pass Filter.',
                      'Enable the filter and lower the cutoff frequency slider. Watch the orange Filtered Trend line appear on the time domain chart — it keeps only the slow cycles and strips away short-term noise. This is the Inverse FFT in action: high-frequency STFT bins are zeroed, then the signal is reconstructed from what remains.'],
                    ['Probe a Specific Cycle.',
                      'Go to the Frequency Prober tab. Set the slider to 30 days — the magnitude score should be high. Try 7 days — also high. Try 15 days — the score should drop sharply, because no 15-day component was built into the synthetic signal. This demonstrates that the dot product selectively detects only the rhythm you specify.'],
                    ['Switch to Real Market Data.',
                      'Change the dataset to S&P 500, Tesla, or Bitcoin. The spectrogram will no longer show clean horizontal bands — real market cycles are messy and non-stationary. Ask: does any dominant frequency persist across the full time window, or does it appear only in certain periods?'],
                    ['Read the Forecast.',
                      'Go to the Forecasting tab. The model extrapolates the top 3 detected cycles forward in time. The shaded confidence band widens over time, reflecting that cycle-based predictions become less reliable the further out you project. Compare the synthetic signal (tight band) to Bitcoin (wide band).'],
                  ].map(([title, body], i) => (
                    <li key={i} style={{ color: C.textMuted, lineHeight: '1.65em', fontSize: '0.9em' }}>
                      <strong style={{ color: C.text }}>{title} </strong>{body}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            STFT EXPLORER
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {activeTab === 'stft' && (
          <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px 48px' }}>
            <h1 style={{ fontSize: '1.55em', marginBottom: '4px' }}>STFT Explorer</h1>
            <p style={{ color: C.textMuted, marginBottom: '28px', fontSize: '0.9em' }}>
              Decompose market data into frequency components and observe how the frequency content evolves over time.
            </p>

            {/* Controls row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>

              {/* STFT parameters */}
              <div style={card()}>
                <SectionLabel>STFT Parameters — Forward Pass</SectionLabel>

                {isNyquistViolated && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px',
                    padding: '10px 14px', marginBottom: '14px', color: C.red, fontSize: '0.83em',
                    lineHeight: '1.55em' }}>
                    <strong>Nyquist Violated</strong> — at fs = {samplingRate}/day, you can only capture
                    cycles longer than <strong>{(2 / samplingRate).toFixed(1)} days</strong>.
                    The 7-day cycle (0.143 Hz) is above this limit and will appear distorted.
                  </div>
                )}

                <div style={{ marginBottom: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '0.875em', fontWeight: 600 }}>Window Size (N)</label>
                    <span style={{ fontWeight: 700, color: C.blue, fontSize: '0.9em' }}>{windowSize} days</span>
                  </div>
                  <input type="range" min="7" max="90" value={windowSize}
                    onChange={e => setWindowSize(parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: C.blue }} />
                </div>

                <div style={{ marginBottom: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '0.875em', fontWeight: 600 }}>Sampling Rate (fs)</label>
                    <span style={{ fontWeight: 700, color: C.blue, fontSize: '0.9em' }}>{samplingRate} / day</span>
                  </div>
                  <input type="range" min="0.1" max="5.0" step="0.1" value={samplingRate}
                    onChange={e => setSamplingRate(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: C.blue }} />
                </div>

                <div style={{ background: C.blueSoft, borderRadius: '8px', padding: '12px 16px', fontSize: '0.875em' }}>
                  <div style={{ marginBottom: '4px' }}>
                    <strong>Frequency resolution: </strong>
                    df = {samplingRate} / {windowSize} = <span style={{ color: C.blue, fontWeight: 700 }}>{deltaF} Hz</span>
                  </div>
                  <div style={{ color: C.textMuted }}>
                    Smallest distinguishable cycle difference:{' '}
                    <strong style={{ color: C.text }}>
                      {samplingRate > 0 ? Math.round(1 / parseFloat(deltaF)) : 'N/A'} days
                    </strong>
                  </div>
                </div>
              </div>

              {/* Filter */}
              <div style={card()}>
                <SectionLabel>Inverse FFT — Low-Pass Filter</SectionLabel>

                <label style={{ display: 'flex', alignItems: 'center', gap: '10px',
                  cursor: 'pointer', marginBottom: '18px', userSelect: 'none' }}>
                  <input type="checkbox" checked={isFiltering}
                    onChange={e => { setIsFiltering(e.target.checked); if (!e.target.checked) setReconstructedPrice([]); }}
                    style={{ width: '18px', height: '18px', accentColor: C.amber }} />
                  <span style={{ fontWeight: 600, fontSize: '0.9em' }}>Enable Low-Pass Filter</span>
                </label>

                {isFiltering ? (
                  <>
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <label style={{ fontSize: '0.875em', fontWeight: 600 }}>Cutoff Frequency</label>
                        <span style={{ fontWeight: 700, color: C.amber, fontSize: '0.9em' }}>{cutoffFreq} Hz</span>
                      </div>
                      <input type="range" min="0.01" max="0.5" step="0.01" value={cutoffFreq}
                        onChange={e => setCutoffFreq(parseFloat(e.target.value))}
                        style={{ width: '100%', accentColor: C.amber }} />
                    </div>
                    <InsightBox bg={C.amberSoft} border="#fcd34d">
                      Keeping all cycles <strong style={{ color: C.amber }}>longer than {cutoffPeriodDisplay} days</strong>.
                      All STFT frequency bins above {cutoffFreq} Hz are zeroed before the Inverse FFT
                      reconstructs the orange trend line.
                    </InsightBox>
                  </>
                ) : (
                  <p style={{ color: C.textMuted, fontSize: '0.875em', lineHeight: '1.65em' }}>
                    Enable to apply a low-pass filter via the Inverse FFT. An orange Filtered Trend line
                    will appear on the chart below, showing only the slow, dominant cycles with
                    short-term noise removed.
                  </p>
                )}
              </div>
            </div>

            {/* Time-frequency tradeoff insight */}
            <InsightBox bg={C.blueSoft} border="#bfdbfe">
              <strong style={{ color: C.text }}>Time-Frequency Tradeoff: </strong>
              Your current window of <strong>{windowSize} days</strong> resolves frequencies to
              within <strong>df = {deltaF} Hz</strong> — meaning you can distinguish two cycles only
              if their periods differ by more than <strong>{samplingRate > 0 ? Math.round(1 / parseFloat(deltaF)) : 'N/A'} days</strong>.
              Increasing the window sharpens frequency precision but blurs the time axis.
              This tradeoff is fundamental to STFT and cannot be eliminated.
            </InsightBox>

            {/* 3D toggle + component count */}
            <div style={{ margin: '20px 0 14px', display: 'flex', alignItems: 'center',
              gap: '20px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setIs3DMode(!is3DMode)}
                style={{ background: is3DMode ? C.navy : C.blue, color: '#fff', border: 'none',
                  borderRadius: '8px', padding: '9px 22px', fontWeight: 600,
                  cursor: 'pointer', fontSize: '0.875em', transition: 'background 0.15s' }}
              >
                {is3DMode ? 'Return to 2D View' : 'View 3D Fourier Breakdown'}
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ fontSize: '0.875em', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  Components to extract:
                </label>
                <input type="range" min="1" max="8" step="1" value={numComponents}
                  onChange={e => setNumComponents(parseInt(e.target.value))}
                  style={{ width: '100px', accentColor: C.blue }} />
                <span style={{ fontWeight: 700, color: C.blue, minWidth: '12px' }}>{numComponents}</span>
              </div>
              <span style={{ color: C.textMuted, fontSize: '0.82em' }}>
                Real datasets have many frequencies — the slider controls how many dominant ones to isolate.
                More components = better reconstruction, but the 3D chart becomes harder to read.
              </span>
            </div>

            {/* Time domain chart */}
            <div style={{ ...card({ padding: 0, overflow: 'hidden', marginBottom: '16px' }) }}>
              {!is3DMode ? (
                <Plot
                  data={timeDomainTraces}
                  layout={plotLayout('Time Domain — Raw vs Filtered', 'Days', 'Price', { height: 360 })}
                  style={{ width: '100%' }}
                  config={{ responsive: true, displayModeBar: false }}
                />
              ) : (
                <Plot
                  data={[
                    { x: time, y: price, z: Array(time.length).fill(0),
                      type: 'scatter3d', mode: 'lines', name: 'Raw Market Data',
                      line: { color: '#1e293b', width: 3 } },
                    ...(decomposedWaves.waves || []).map(w => ({
                      x: time,
                      y: w.wave.map(v => v + decomposedWaves.global_mean),
                      z: Array(time.length).fill(w.frequency),
                      type: 'scatter3d', mode: 'lines',
                      name: `${w.frequency.toFixed(3)} Hz`,
                      line: { width: 3 },
                    })),
                  ]}
                  layout={{
                    ...plotLayout('3D Fourier Deconstruction', '', '', { height: 500 }),
                    scene: {
                      xaxis: { title: 'Time (Days)' },
                      yaxis: { title: 'Price' },
                      zaxis: { title: 'Frequency (Hz)' },
                    },
                  }}
                  style={{ width: '100%' }}
                  config={{ responsive: true }}
                />
              )}
            </div>

            {/* Spectrogram */}
            <div style={{ ...card({ padding: 0, overflow: 'hidden' }) }}>
              {spectrogram ? (
                <>
                  <Plot
                    data={[{
                      x: spectrogram.times, y: spectrogram.frequencies,
                      z: spectrogram.magnitudes, text: hoverTextMatrix,
                      type: 'heatmap', colorscale: 'Jet', zsmooth: 'best',
                      hovertemplate:
                        '<b>Time:</b> %{x} days<br>' +
                        '<b>Frequency:</b> %{y:.4f} Hz<br>' +
                        '%{text}<br>' +
                        '<b>Magnitude:</b> %{z:.2f}<extra></extra>',
                    }]}
                    layout={plotLayout('Spectrogram — Frequency Content Over Time',
                      'Time (days)', 'Frequency (Hz)', { height: 320 })}
                    style={{ width: '100%' }}
                    config={{ responsive: true, displayModeBar: false }}
                  />
                  <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}`,
                    background: C.blueSoft, fontSize: '0.83em', color: C.textMuted,
                    lineHeight: '1.6em' }}>
                    <strong style={{ color: C.text }}>How to read this: </strong>
                    Warm colours (red/yellow) = strong frequency energy at that moment.
                    Blue = weak. The warm band near the bottom confirms that signal energy
                    is concentrated at low frequencies (slow multi-week cycles).
                    {dominantPeriod && (
                      <span> Dominant detected cycle: <strong style={{ color: C.text }}>{dominantPeriod} days</strong>.</span>
                    )}
                    {' '}Hover any cell to see the cosine and sine STFT coefficients.
                  </div>
                </>
              ) : (
                <div style={{ padding: '48px', textAlign: 'center', color: C.textMuted }}>
                  Computing STFT…
                </div>
              )}
            </div>
          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            FORECASTING
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {activeTab === 'forecast' && (
          <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px 48px' }}>
            <h1 style={{ fontSize: '1.55em', marginBottom: '4px' }}>Cycle-Based Forecasting</h1>
            <p style={{ color: C.textMuted, marginBottom: '28px', fontSize: '0.9em' }}>
              The FFT is not only descriptive — it can be predictive. If the dominant cycles are real
              and stable, extrapolating them forward gives a frequency-based price forecast.
            </p>

            {/* Horizon + model fit */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div style={card()}>
                <SectionLabel>Forecast Parameters</SectionLabel>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.875em', fontWeight: 600 }}>Days to forecast ahead</label>
                  <span style={{ fontWeight: 700, color: C.pink }}>{forecastHorizon} days</span>
                </div>
                <input type="range" min="10" max="120" step="5" value={forecastHorizon}
                  onChange={e => setForecastHorizon(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: C.pink, marginBottom: '16px' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.875em', fontWeight: 600 }}>Frequency components to use</label>
                  <span style={{ fontWeight: 700, color: C.blue }}>{numComponents}</span>
                </div>
                <input type="range" min="1" max="8" step="1" value={numComponents}
                  onChange={e => setNumComponents(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: C.blue }} />
                <p style={{ fontSize: '0.8em', color: C.textMuted, marginTop: '8px' }}>
                  More components capture more of the signal but risk overfitting noise as real cycles.
                  Watch the model fit % change as you increase this.
                </p>
              </div>

              {forecastData && (
                <div style={{ ...card({ display: 'flex', flexDirection: 'column',
                  justifyContent: 'center', alignItems: 'center', textAlign: 'center',
                  borderTop: `4px solid ${C.green}` }) }}>
                  <SectionLabel>Model Fit</SectionLabel>
                  <div style={{
                    fontSize: '2.8em', fontWeight: 800, lineHeight: 1,
                    color: forecastData.explained_variance > 0.7 ? C.green
                         : forecastData.explained_variance > 0.4 ? C.amber : C.red,
                  }}>
                    {(forecastData.explained_variance * 100).toFixed(1)}%
                  </div>
                  <div style={{ color: C.textMuted, fontSize: '0.78em', marginTop: '4px' }}>
                    variance explained<br />by top 3 cycles
                  </div>
                </div>
              )}
            </div>

            {/* Components table */}
            {forecastData?.components && (
              <div style={{ ...card({ marginBottom: '16px', overflowX: 'auto' }) }}>
                <SectionLabel>Top 3 Detected Frequency Components</SectionLabel>
                <table style={{ width: '100%', fontSize: '0.875em' }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                      {['Rank', 'Period (days)', 'Frequency (Hz)', 'Amplitude', 'Interpretation'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left',
                          color: C.textMuted, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {forecastData.components.map((c, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: '10px 12px', fontWeight: 800,
                          color: [C.blue, C.pink, C.purple][i] }}>#{i + 1}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                          {c.period_days === Infinity ? 'DC (trend)' : c.period_days}
                        </td>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: C.textMuted }}>
                          {c.frequency}
                        </td>
                        <td style={{ padding: '10px 12px' }}>{c.amplitude}</td>
                        <td style={{ padding: '10px 12px', color: C.textMuted, fontSize: '0.9em' }}>
                          {c.period_days > 20 ? 'Monthly / macro trend'
                            : c.period_days > 5 ? 'Weekly / short-term cycle'
                            : 'Very fast oscillation'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Forecast chart */}
            {forecastData && price.length > 0 && (
              <div style={{ ...card({ padding: 0, overflow: 'hidden', marginBottom: '16px' }) }}>
                <Plot
                  data={[
                    { x: time, y: price, type: 'scatter', mode: 'lines',
                      name: 'Historical Data', line: { color: C.teal, width: 2 } },
                    { x: forecastData.forecast_time, y: forecastData.forecast,
                      type: 'scatter', mode: 'lines', name: 'Forecast',
                      line: { color: C.pink, width: 3, dash: 'dash' } },
                    { x: [...forecastData.forecast_time, ...forecastData.forecast_time.slice().reverse()],
                      y: [...forecastData.band_upper, ...forecastData.band_lower.slice().reverse()],
                      type: 'scatter', fill: 'toself',
                      fillcolor: 'rgba(219,39,119,0.10)',
                      line: { color: 'transparent' },
                      name: '95% Confidence Band', hoverinfo: 'skip' },
                  ]}
                  layout={plotLayout(`Forecast — Next ${forecastHorizon} Days`, 'Days', 'Price', {
                    height: 400, legend: { orientation: 'h', y: -0.22 },
                  })}
                  style={{ width: '100%' }}
                  config={{ responsive: true, displayModeBar: false }}
                />
              </div>
            )}

            {/* Interpretation card */}
            <div style={card()}>
              <SectionLabel>How to Interpret This Forecast</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px',
                fontSize: '0.875em', lineHeight: '1.7em', color: C.textMuted }}>
                <div>
                  <strong style={{ color: C.text }}>What the model does</strong><br />
                  It identifies the top 3 frequency components from the full FFT spectrum,
                  reconstructs them into sinusoidal waves, then continues those same waves
                  beyond the last data point. The dashed pink line is the pure cycle extrapolation.
                  <br /><br />
                  <strong style={{ color: C.text }}>The confidence band</strong><br />
                  Starts at ±1.96σ (the historical reconstruction error) and widens
                  as √(1 + h/N). The further out you forecast, the less reliable
                  the assumption that cycles remain stable.
                </div>
                <div>
                  <strong style={{ color: C.text }}>When this works well</strong><br />
                  Assets with genuine structural cycles — seasonal commodities, instruments
                  with regular calendar effects. A high explained variance % is a positive sign.
                  <br /><br />
                  <strong style={{ color: C.text }}>When it breaks down</strong><br />
                  Real markets rarely have perfectly stable cycles. External shocks, regime
                  changes, and non-stationarity all violate the model. Compare the synthetic
                  signal (tight band, high fit) to Bitcoin (wide band, low fit) to see
                  this directly.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            FREQUENCY PROBER
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {activeTab === 'prober' && (
          <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px 48px' }}>
            <h1 style={{ fontSize: '1.55em', marginBottom: '4px' }}>Frequency Prober</h1>
            <p style={{ color: C.textMuted, marginBottom: '28px', fontSize: '0.9em' }}>
              Test whether a specific cycle length exists in the data by computing the dot product
              between the market prices and a pure sine/cosine wave at that frequency.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>

              {/* Slider + insight */}
              <div style={card()}>
                <SectionLabel>Target Cycle</SectionLabel>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '2.4em', fontWeight: 800, color: C.purple, lineHeight: 1 }}>
                    {probePeriod}
                  </span>
                  <span style={{ fontSize: '1em', color: C.textMuted }}>days</span>
                  <span style={{ marginLeft: 'auto', background: C.purpleSoft, color: C.purple,
                    borderRadius: '20px', padding: '3px 12px', fontSize: '0.8em', fontWeight: 600 }}>
                    = {probeFreqDisplay} Hz
                  </span>
                </div>
                <input type="range" min="2" max="100" step="1" value={probePeriod}
                  onChange={e => setProbePeriod(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: C.purple, marginBottom: '16px' }} />

                <InsightBox bg={C.purpleSoft} border="#ddd6fe">
                  <strong style={{ color: C.text }}>Period vs Frequency: </strong>
                  A <strong>{probePeriod}-day cycle</strong> and <strong>{probeFreqDisplay} Hz</strong> are
                  the same thing — f = 1 ÷ T. The dot product below measures how much of
                  this exact rhythm exists in the data. Think of it as shining a tuning-fork
                  frequency at the signal and listening for resonance.
                </InsightBox>
              </div>

              {/* Magnitude gauge */}
              {probeResult ? (
                <div style={{ ...card({ borderTop: `4px solid ${C.purple}`,
                  display: 'flex', flexDirection: 'column', gap: '12px' }) }}>
                  <SectionLabel>Cycle Amplitude (Magnitude)</SectionLabel>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      fontSize: '4em', fontWeight: 800, lineHeight: 1,
                      color: probeResult.magnitude > 2 ? C.red
                           : probeResult.magnitude > 0.5 ? C.amber : C.green,
                    }}>
                      {probeResult.magnitude.toFixed(2)}
                    </div>
                    <div style={{ color: C.textMuted, fontSize: '0.82em', marginTop: '4px' }}>
                      {probeResult.magnitude > 2 ? 'Strong cycle detected'
                        : probeResult.magnitude > 0.5 ? 'Moderate presence'
                        : 'Weak / absent'}
                    </div>
                  </div>
                  <div style={{ background: C.bg, borderRadius: '8px',
                    padding: '12px 14px', fontSize: '0.82em', color: C.textMuted }}>
                    <strong style={{ color: C.text }}>Behind the math:</strong><br />
                    Σ x · cos = {probeResult.dot_cos.toFixed(0)}<br />
                    Σ x · sin = {probeResult.dot_sin.toFixed(0)}<br />
                    (2/N) · √(cos² + sin²) ={' '}
                    <strong style={{ color: C.text }}>{probeResult.magnitude.toFixed(2)}</strong>
                  </div>
                </div>
              ) : (
                <div style={{ ...card({ display: 'flex', alignItems: 'center',
                  justifyContent: 'center', color: C.textMuted }) }}>
                  Loading…
                </div>
              )}
            </div>

            {/* Probe chart */}
            {probeResult && (
              <div style={{ ...card({ padding: 0, overflow: 'hidden', marginBottom: '20px' }) }}>
                <Plot
                  data={[
                    { x: time, y: price, type: 'scatter', mode: 'lines',
                      name: 'Raw Market Data', line: { color: '#cbd5e1', width: 2 } },
                    { x: time, y: probeResult.pure_wave.map(v => v + priceMean),
                      type: 'scatter', mode: 'lines',
                      name: `${probePeriod}-Day Test Wave (${probeFreqDisplay} Hz)`,
                      line: { color: C.purple, width: 3 } },
                  ]}
                  layout={plotLayout(
                    `${probePeriod}-Day Cycle Alignment`,
                    'Days', 'Price',
                    { height: 320, legend: { orientation: 'h', y: -0.22 } }
                  )}
                  style={{ width: '100%' }}
                  config={{ responsive: true, displayModeBar: false }}
                />
              </div>
            )}

            {/* How-to card */}
            <div style={card()}>
              <SectionLabel>How to Use the Prober</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px',
                fontSize: '0.875em', lineHeight: '1.7em', color: C.textMuted }}>
                <div>
                  <strong style={{ color: C.text }}>Try these with synthetic data:</strong>
                  <ul style={{ paddingLeft: '18px', margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <li>Set to <strong>30 days</strong> → high magnitude (built-in cycle)</li>
                    <li>Set to <strong>7 days</strong> → high magnitude (built-in cycle)</li>
                    <li>Set to <strong>15 days</strong> → low magnitude (not in signal)</li>
                    <li>Set to <strong>3 days</strong> → very low (noise territory)</li>
                  </ul>
                </div>
                <div>
                  <strong style={{ color: C.text }}>Reading the chart:</strong><br />
                  The purple line is the reconstructed wave at exactly the probed period,
                  scaled to its detected amplitude and phase-aligned to the data.
                  When the purple wave lines up with the raw data's oscillations, the
                  cycle is real. When it looks random relative to the price, the cycle
                  is absent.
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default App;
