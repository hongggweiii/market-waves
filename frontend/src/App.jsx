import { useState, useEffect } from 'react';
import Plotly from 'plotly.js-dist-min';
import PlotlyFactory from 'react-plotly.js/factory';

const createPlotlyComponent = PlotlyFactory.default || PlotlyFactory;
const Plot = createPlotlyComponent(Plotly);

function App() {
  const [time, setTime] = useState([]);
  const [price, setPrice] = useState([]);
  const [spectrogram, setSpectrogram] = useState(null);

  const [windowSize, setWindowSize] = useState(60);
  const [samplingRate, setSamplingRate] = useState(1.0);

  const [isFiltering, setIsFiltering] = useState(false);
  const [cutoffFreq, setCutoffFreq] = useState(0.08);
  const [reconstructedPrice, setReconstructedPrice] = useState([]);

  const [asset, setAsset] = useState('synthetic');

  const [is3DMode, setIs3DMode] = useState(false);
  const [decomposedWaves, setDecomposedWaves] = useState([]);

  const [probePeriod, setProbePeriod] = useState(7);
  const [probeResult, setProbeResult] = useState(null);

  const [forecastData, setForecastData] = useState(null);
  const [forecastHorizon, setForecastHorizon] = useState(60);

  const deltaF = (samplingRate / windowSize).toFixed(4);
  const isNyquistViolated = samplingRate < 2 / 7;

  // Fetch raw data
  useEffect(() => {
    fetch(`http://localhost:8000/api/data?ticker=${asset}`)
      .then(res => res.json())
      .then(data => {
        setTime(data.time);
        setPrice(data.price);
      })
      .catch(err => console.error("Error fetching data:", err));
  }, [asset]);

  // Fetch STFT
  useEffect(() => {
    if (price.length === 0) return;

    fetch('http://localhost:8000/api/stft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signal_data: price,
        window_size: windowSize,
        sampling_rate: samplingRate
      })
    })
      .then(res => res.json())
      .then(stftData => {
        setSpectrogram(stftData);
      })
      .catch(err => console.error("Error fetching STFT:", err));
  }, [price, windowSize, samplingRate]);

  // Run Inverse FFT when filtering is active
  useEffect(() => {
    if (!isFiltering || !spectrogram) {
      return;
    }

    // Mathematically "Mute" frequencies above the cutoff
    // Replace the complex numbers (real and imaginary parts) with 0
    const filteredReal = spectrogram.real_parts.map((row, i) =>
      spectrogram.frequencies[i] > cutoffFreq ? row.map(() => 0) : row
    );
    const filteredImag = spectrogram.imag_parts.map((row, i) =>
      spectrogram.frequencies[i] > cutoffFreq ? row.map(() => 0) : row
    );

    fetch('http://localhost:8000/api/ifft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        real_parts: filteredReal,
        imag_parts: filteredImag,
        window_size: windowSize,
        sampling_rate: samplingRate,
        global_mean: spectrogram.global_mean
      })
    })
      .then(res => res.json())
      .then(data => {
        setReconstructedPrice(data.reconstructed_signal);
      })
      .catch(err => console.error("Error with IFFT:", err));
  }, [isFiltering, cutoffFreq, spectrogram, windowSize, samplingRate]);

  // Fetch 3D Deconstructed Waves
  useEffect(() => {
    if (price.length === 0) return;

    fetch('http://localhost:8000/api/decompose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signal_data: price,
        sampling_rate: 1.0 // 1 point daily
      })
    })
      .then(res => res.json())
      .then(data => {
        setDecomposedWaves(data);
      })
      .catch(err => console.error("Error fetching 3D data:", err));
  }, [price]);

  const hoverTextMatrix = spectrogram ? spectrogram.magnitudes.map((row, i) => 
    row.map((mag, j) => {
      const a = spectrogram.real_parts[i][j].toFixed(2);
      const b = spectrogram.imag_parts[i][j].toFixed(2);
      return `Cosine Part (a): ${a}<br>Sine Part (b): ${b}`;
    })
  ) : [];

  // Fetch Forecast
  useEffect(() => {
    if (price.length === 0) return;

    fetch('http://localhost:8000/api/forecast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signal_data: price,
        sampling_rate: 1.0,
        horizon: forecastHorizon
      })
    })
      .then(res => res.json())
      .then(data => setForecastData(data))
      .catch(err => console.error("Error fetching forecast:", err));
  }, [price, forecastHorizon]);

  // Fetch Dot Product Probe
  useEffect(() => {
    if (price.length === 0) return;

    fetch('http://localhost:8000/api/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signal_data: price,
        target_period: probePeriod
      })
    })
      .then(res => res.json())
      .then(data => {
        setProbeResult(data);
      })
      .catch(err => console.error("Error probing frequency:", err));
  }, [price, probePeriod]);

  // Calculate the mean of the raw data to visually overlay the pure wave correctly
  const priceMean = price.length > 0 ? price.reduce((a, b) => a + b, 0) / price.length : 0;

  // Prepare plot traces dynamically based on filtering
  const topChartTraces = [
    { 
      x: time, 
      y: price, 
      type: 'scatter', 
      mode: 'lines', 
      name: 'Raw Data',
      line: { color: isFiltering ? '#e0e0e0' : '#17BECF' } // Fade out raw data if filtering
    }
  ];

  if (isFiltering && reconstructedPrice.length > 0) {
    topChartTraces.push({
      x: time.slice(0, reconstructedPrice.length), // Match lengths
      y: reconstructedPrice,
      type: 'scatter',
      mode: 'lines',
      name: 'Filtered Trend',
      line: { color: '#ff7f0e', width: 3 } // Bold orange line for the reconstructed signal
    });
  }

  // Insight helpers
  const dominantPeriod = forecastData?.components?.[0]?.period_days;
  const probeFreqDisplay = (1 / probePeriod).toFixed(4);
  const cutoffPeriodDisplay = Math.round(1 / cutoffFreq);

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '1000px', margin: '0 auto' }}>
      <h1>Time-Series STFT Explorer</h1>
      <p>Visualizing BT3017 Frequency Analysis on Market Data</p>

      {/* ── GUIDED WALKTHROUGH ── */}
      <details style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1em' }}>
          📖 Guided Walkthrough — Click to expand step-by-step instructions
        </summary>
        <ol style={{ marginTop: '16px', lineHeight: '2em' }}>
          <li>
            <strong>Start with Synthetic Data.</strong> Select "Textbook Example" from the dropdown. This signal is mathematically constructed from a known <em>30-day cycle</em> and a <em>7-day cycle</em> plus random noise. You know the answer in advance — use this to verify your understanding.
          </li>
          <li>
            <strong>Read the Spectrogram (bottom chart).</strong> The Y-axis is frequency (cycles per day). The X-axis is time. Colour = strength of that frequency at that moment. Look for warm (yellow/red) horizontal bands — those are the dominant cycles. Notice how they appear near the bottom of the chart? Those are the slow, low-frequency cycles.
          </li>
          <li>
            <strong>Explore the Time-Frequency Tradeoff.</strong> Drag the <em>Window Size (N)</em> slider.
            A <strong>large window</strong> gives sharp frequency resolution (you can tell <em>which</em> frequency it is) but blurry time resolution (you can't tell <em>when</em> it changed). A <strong>small window</strong> does the opposite. This is the fundamental tension in STFT — it cannot be avoided.
          </li>
          <li>
            <strong>Apply the Low-Pass Filter.</strong> Enable the filter and drag the cutoff slider down. Watch the orange "Filtered Trend" line appear on the top chart — it traces only the slow, dominant cycles, stripping away short-term noise. This is the Inverse FFT in action: you zeroed out high-frequency bins, then reconstructed the signal from what remained.
          </li>
          <li>
            <strong>Probe a Specific Cycle.</strong> Scroll down to the Dot Product Prober. Set the slider to 30 days, then 7 days. The magnitude score tells you how strongly that exact cycle is present in the data. Try 15 days — the score should drop significantly for the synthetic signal, because no 15-day component was built into it.
          </li>
          <li>
            <strong>Switch to Real Market Data.</strong> Change the asset to S&P 500, Tesla, or Bitcoin. The spectrogram will no longer show clean horizontal bands — real market cycles are messy, non-stationary, and shift over time. Ask yourself: does any dominant frequency persist across the full time window, or does it appear only in certain periods?
          </li>
          <li>
            <strong>Read the Forecast.</strong> Scroll to the Forecast section. The model extrapolates the top 3 detected cycles forward. The shaded band is the 95% confidence interval — it widens over time because cycle-based predictions grow less reliable the further out you project. The key lesson: the forecast is only as good as the cycles being real and stable.
          </li>
        </ol>
      </details>

      {/* Asset Class Selector */}
      <div style={{ background: '#e3f2fd', padding: '15px 20px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '20px' }}>
        <h3 style={{ margin: 0 }}>Select Market Data:</h3>
        <select 
          value={asset} 
          onChange={(e) => setAsset(e.target.value)}
          style={{ padding: '8px', fontSize: '16px', borderRadius: '4px' }}
        >
          <option value="synthetic">Textbook Example (Synthetic Math)</option>
          <option value="^GSPC">Index Fund (S&P 500 - Low Volatility)</option>
          <option value="EURUSD=X">Forex (EUR/USD - Mid Volatility)</option>
          <option value="TSLA">Stock (Tesla - High Volatility)</option>
          <option value="BTC-USD">Crypto (Bitcoin - Extreme Volatility)</option>
        </select>
      </div>

      {/* Interactive Math Sandbox */}
      <div style={{ background: '#f4f4f9', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
        <h3>1. STFT Parameters (Forward Pass)</h3>
        
        {isNyquistViolated && (
          <div style={{ background: '#ffcccc', color: '#cc0000', padding: '10px', borderRadius: '4px', marginBottom: '15px', border: '1px solid #cc0000' }}>
            <strong>⚠️ Nyquist Limit Violated:</strong> Your sampling rate of {samplingRate} samples/day can only detect cycles up to {(samplingRate / 2).toFixed(3)} Hz (i.e., cycles longer than {(2 / samplingRate).toFixed(1)} days). The 7-day cycle at 0.143 Hz is above this limit and will appear distorted or aliased.
          </div>
        )}

        <div style={{ display: 'flex', gap: '40px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <label><strong>Window Size (N): {windowSize} days</strong></label><br/>
            <input type="range" min="7" max="90" value={windowSize} onChange={(e) => setWindowSize(parseInt(e.target.value))} style={{ width: '200px' }}/>
          </div>

          <div>
            <label><strong>Sampling Rate (f_s): {samplingRate}</strong></label><br/>
            <input type="range" min="0.1" max="5.0" step="0.1" value={samplingRate} onChange={(e) => setSamplingRate(parseFloat(e.target.value))} style={{ width: '200px' }}/>
          </div>

          <div style={{ background: '#fff', padding: '10px 20px', border: '1px solid #ccc', borderRadius: '4px' }}>
            <strong>Frequency Bin Size Equation:</strong><br/>
            <span style={{ fontSize: '1.2em', fontFamily: 'monospace' }}>
              Δf = {samplingRate} / {windowSize} = <span style={{ color: 'red' }}>{deltaF} Hz</span>
            </span>
          </div>
        </div>

        {/* STFT insight box */}
        <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: '6px', padding: '10px 14px', marginTop: '16px', fontSize: '0.9em' }}>
          <strong>What this means:</strong> With a window of <strong>{windowSize} days</strong> and sampling rate <strong>{samplingRate}/day</strong>, your frequency resolution is <strong>Δf = {deltaF} Hz</strong>. This means you can distinguish two cycles only if their periods differ by more than <strong>{samplingRate > 0 ? Math.round(1 / parseFloat(deltaF)) : '∞'} days</strong>. Increasing the window makes frequency bands narrower (better frequency precision) but each band covers a longer stretch of time (worse time precision).
        </div>

        <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid #ccc' }} />

        {/* Inverse FFT Noise Filter */}
        <h3>2. Inverse FFT Noise Filter (Backward Pass)</h3>
        <div style={{ display: 'flex', gap: '40px', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input 
              type="checkbox"
              checked={isFiltering} 
              onChange={(e) => {
                const isChecked = e.target.checked;
                setIsFiltering(isChecked);
                // Clear the array here in the event handler instead of the useEffect!
                if (!isChecked) {
                  setReconstructedPrice([]);
                }
              }}
                style={{ width: '20px', height: '20px' }}
            />
            <strong>Enable Low-Pass Filter</strong>
          </label>

          {isFiltering && (
            <div>
              <label><strong>Mute Frequencies Above: <span style={{ color: '#ff7f0e' }}>{cutoffFreq} Hz</span></strong></label><br/>
              <input
                type="range"
                min="0.01" max="0.5" step="0.01"
                value={cutoffFreq}
                onChange={(e) => setCutoffFreq(parseFloat(e.target.value))}
                style={{ width: '250px' }}
              />
            </div>
          )}
        </div>

        {isFiltering && (
          <div style={{ background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: '6px', padding: '10px 14px', marginTop: '14px', fontSize: '0.9em' }}>
            <strong>What the filter is doing:</strong> You are keeping all cycles <strong>longer than {cutoffPeriodDisplay} days</strong> ({cutoffFreq} Hz) and discarding everything faster than that. Each STFT frequency bin above the cutoff has its complex coefficients set to zero before the Inverse FFT is run. The orange line is the result — a smooth trend that only contains the slow, dominant cycles you preserved.
          </div>
        )}
      </div>

      {/* 3D TOGGLE BUTTON */}
      <div style={{ marginBottom: '10px' }}>
        <button 
          onClick={() => setIs3DMode(!is3DMode)}
          style={{ padding: '10px 20px', fontSize: '16px', background: '#17BECF', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          {is3DMode ? "Return to 2D View" : "✨ View 3D Fourier Breakdown"}
        </button>
      </div>

      {/* Top: Time Domain (2D or 3D) */}
      <div style={{ border: '1px solid #ccc', marginBottom: '20px' }}>
        {!is3DMode ? (
          <Plot
            data={topChartTraces} // Uses existing 2D traces
            layout={{ title: 'Time Domain (Raw vs Filtered)', xaxis: { title: 'Days' }, yaxis: { title: 'Price' }, height: 400, margin: { l: 50, r: 50, b: 50, t: 50 } }}
            style={{ width: '100%' }}
          />
        ) : (
          <Plot
            data={[
              // Trace 1: The Raw Data (Z = 0)
              {
                x: time,
                y: price,
                z: Array(time.length).fill(0), // Push the raw data to the front
                type: 'scatter3d',
                mode: 'lines',
                name: 'Raw Market Data',
                line: { color: '#000000', width: 4 }
              },
              // Traces 2-4: The Pure Sine Waves (Mapped to their Z-axis frequencies)
              ...(decomposedWaves.waves || []).map((waveData) => ({
                x: time,
                // We add the mean back so they hover at the same vertical height as the raw data
                y: waveData.wave.map(val => val + decomposedWaves.global_mean),
                z: Array(time.length).fill(waveData.frequency), // Push them back along the Z-axis by frequency
                type: 'scatter3d',
                mode: 'lines',
                name: `Extracted: ${waveData.frequency.toFixed(3)} Hz`,
                line: { width: 4 }
              }))
            ]}
            layout={{ 
              title: '3D Fourier Deconstruction (Raw Data vs Constituent Waves)', 
              scene: {
                xaxis: { title: 'Time (Days)' },
                yaxis: { title: 'Price (Amplitude)' },
                zaxis: { title: 'Frequency (Hz)' }
              },
              height: 600, 
              margin: { l: 0, r: 0, b: 0, t: 50 } 
            }}
            style={{ width: '100%' }}
          />
        )}
      </div>

      {/* Bottom: Frequency Domain (Spectrogram) */}
      <div style={{ border: '1px solid #ccc' }}>
        {spectrogram ? (
          <Plot
            data={[{ 
              x: spectrogram.times, 
              y: spectrogram.frequencies, 
              z: spectrogram.magnitudes, 
              text: hoverTextMatrix,
              type: 'heatmap', 
              colorscale: 'Jet',
              zsmooth: 'best',
              hovertemplate:
                '<b>Time Window:</b> %{x} days<br>' +
                '<b>Frequency:</b> %{y:.4f} Hz<br>' +
                '%{text}<br>' +
                '<b>Total Magnitude (Color):</b> %{z:.2f}' +
                '<extra></extra>' 
            }]}
            layout={{ title: 'Frequency Domain (Spectrogram) - Hover for Math', xaxis: { title: 'Time (Windows)' }, yaxis: { title: 'Frequency (Cycles per Day)' }, height: 400, margin: { l: 50, r: 50, b: 50, t: 50 } }}
            style={{ width: '100%' }}
          />
        ) : (
          <p style={{ padding: '20px' }}>Loading STFT Matrix...</p>
        )}

        {spectrogram && (
          <div style={{ background: '#e3f2fd', borderTop: '1px solid #90caf9', padding: '10px 16px', fontSize: '0.9em' }}>
            <strong>How to read this spectrogram:</strong> Each column is a short time window. Each row is a frequency. The colour shows how much energy exists at that frequency in that window — <span style={{ color: '#d32f2f', fontWeight: 'bold' }}>red/yellow = strong</span>, <span style={{ color: '#1565c0', fontWeight: 'bold' }}>blue = weak</span>. The warm band at the bottom confirms that most of the signal's energy sits at low frequencies (slow, multi-week cycles).
            {dominantPeriod && (
              <span> The strongest detected cycle is approximately <strong>{dominantPeriod} days</strong>.</span>
            )}
            {' '}Hover over any cell to see the exact cosine and sine coefficients at that point.
          </div>
        )}
      </div>

      <hr style={{ margin: '40px 0', border: 'none', borderTop: '2px dashed #ccc' }} />

      {/* THE DOT PRODUCT FREQUENCY PROBER */}
      <div style={{ background: '#f9fbe7', padding: '20px', borderRadius: '8px', marginBottom: '40px', border: '1px solid #cddc39' }}>
        <h2>3. The Math: Dot Product Frequency Prober</h2>
        <p>Does a specific cycle exist in this market data? We mathematically "probe" the data by calculating the dot product between the market prices and a pure sine/cosine wave.</p>

        <div style={{ display: 'flex', gap: '40px', alignItems: 'flex-start', flexWrap: 'wrap', marginTop: '20px' }}>
          
          {/* Slider Controls */}
          <div style={{ flex: '1', minWidth: '300px' }}>
            <label>
              <strong>Target Cycle: <span style={{ color: '#2e7d32', fontSize: '1.2em' }}>{probePeriod} days</span></strong>
              <span style={{ color: '#888', fontSize: '0.9em', marginLeft: '10px' }}>= {probeFreqDisplay} cycles/day</span>
            </label><br/>
            <input
              type="range"
              min="2" max="100" step="1"
              value={probePeriod}
              onChange={(e) => setProbePeriod(parseInt(e.target.value))}
              style={{ width: '100%', marginTop: '10px' }}
            />
            <div style={{ background: '#f1f8e9', border: '1px solid #aed581', borderRadius: '6px', padding: '8px 12px', marginTop: '10px', fontSize: '0.85em' }}>
              <strong>Period vs Frequency:</strong> These are two ways to say the same thing. A <strong>{probePeriod}-day cycle</strong> repeats {probeFreqDisplay} times per day (f = 1 ÷ T). The dot product below measures how much of <em>exactly this rhythm</em> exists in the data. A high score means the data genuinely oscillates at this tempo; a low score means it doesn't.
            </div>
          </div>

          {/* The Math Results Gauge */}
          {probeResult && (
            <div style={{ flex: '1', minWidth: '300px', background: '#fff', padding: '15px', borderRadius: '8px', border: '1px solid #ccc', textAlign: 'center' }}>
              <h3 style={{ margin: '0 0 10px 0' }}>Cycle Amplitude (Magnitude)</h3>
              
              {/* Dynamic Score Display */}
              <div style={{ 
                fontSize: '3em', 
                fontWeight: 'bold', 
                color: probeResult.magnitude > 2 ? '#d32f2f' : (probeResult.magnitude > 0.5 ? '#f57c00' : '#388e3c') 
              }}>
                {probeResult.magnitude.toFixed(2)}
              </div>
              
              <div style={{ fontSize: '0.9em', color: '#666', marginTop: '10px', textAlign: 'left' }}>
                <strong>Behind the scenes:</strong><br/>
                Cosine Dot Product (Σ x·cos): {probeResult.dot_cos.toFixed(0)}<br/>
                Sine Dot Product (Σ x·sin): {probeResult.dot_sin.toFixed(0)}<br/>
                (2/N)·√(cos² + sin²) = Amplitude: {probeResult.magnitude.toFixed(2)}
              </div>
            </div>
          )}
        </div>

        {/* Visual overlay of the probed wave */}
        {probeResult && (
          <div style={{ border: '1px solid #ccc', marginTop: '20px', background: '#fff' }}>
            <Plot
              data={[
                { 
                  x: time, 
                  y: price, 
                  type: 'scatter', 
                  mode: 'lines', 
                  name: 'Raw Market Data',
                  line: { color: '#e0e0e0', width: 2 } 
                },
                { 
                  x: time, 
                  // Add mean back to pure wave so it overlays visually on top of the asset price
                  y: probeResult.pure_wave.map(val => val + priceMean), 
                  type: 'scatter', 
                  mode: 'lines', 
                  name: `${probePeriod}-Day Test Wave`,
                  line: { color: '#2e7d32', width: 3 } 
                }
              ]}
              layout={{ 
                title: `Visualizing the ${probePeriod}-Day Test Wave Alignment`, 
                xaxis: { title: 'Days' }, 
                yaxis: { title: 'Price' }, 
                height: 300, 
                margin: { l: 50, r: 50, b: 50, t: 50 },
                showlegend: true
              }}
              style={{ width: '100%' }}
            />
          </div>
        )}
      </div>
      {/* ── FORECAST SECTION ── */}
      <div style={{ background: '#fce4ec', padding: '20px', borderRadius: '8px', marginBottom: '40px', border: '1px solid #f48fb1' }}>
        <h2>4. Forecasting: Extrapolating Dominant Cycles</h2>
        <p>
          The FFT decomposition isn't only descriptive — it can also be predictive. If the dominant cycles detected in the historical data are <em>real and stable</em>, we can extrapolate them forward. The model takes the top 3 frequency components from the full signal, reconstructs them, then continues the same waves beyond the last data point.
        </p>

        {/* Horizon slider */}
        <div style={{ marginBottom: '16px' }}>
          <label><strong>Forecast Horizon: <span style={{ color: '#880e4f' }}>{forecastHorizon} days ahead</span></strong></label><br/>
          <input
            type="range"
            min="10" max="120" step="5"
            value={forecastHorizon}
            onChange={(e) => setForecastHorizon(parseInt(e.target.value))}
            style={{ width: '300px', marginTop: '8px' }}
          />
        </div>

        {/* Detected components table */}
        {forecastData?.components && (
          <div style={{ marginBottom: '16px', overflowX: 'auto' }}>
            <strong>Top 3 detected components driving the forecast:</strong>
            <table style={{ borderCollapse: 'collapse', marginTop: '8px', fontSize: '0.9em', width: '100%' }}>
              <thead>
                <tr style={{ background: '#f8bbd0' }}>
                  <th style={thStyle}>Rank</th>
                  <th style={thStyle}>Period (days)</th>
                  <th style={thStyle}>Frequency (Hz)</th>
                  <th style={thStyle}>Amplitude (price units)</th>
                  <th style={thStyle}>Interpretation</th>
                </tr>
              </thead>
              <tbody>
                {forecastData.components.map((c, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fce4ec' }}>
                    <td style={tdStyle}>#{i + 1}</td>
                    <td style={tdStyle}>{c.period_days === Infinity ? 'DC (trend)' : `${c.period_days} days`}</td>
                    <td style={tdStyle}>{c.frequency} Hz</td>
                    <td style={tdStyle}>{c.amplitude}</td>
                    <td style={tdStyle}>{c.period_days > 20 ? 'Monthly / macro trend' : c.period_days > 5 ? 'Weekly / short-term cycle' : 'Very fast oscillation'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: '0.85em', color: '#555', marginTop: '6px' }}>
              Explained variance (how much of the signal these 3 components capture): <strong>{forecastData.explained_variance !== undefined ? (forecastData.explained_variance * 100).toFixed(1) + '%' : '—'}</strong>
            </div>
          </div>
        )}

        {/* Forecast chart */}
        {forecastData && price.length > 0 && (
          <div style={{ border: '1px solid #f48fb1', background: '#fff' }}>
            <Plot
              data={[
                {
                  x: time,
                  y: price,
                  type: 'scatter',
                  mode: 'lines',
                  name: 'Historical Data',
                  line: { color: '#17BECF', width: 2 }
                },
                {
                  x: forecastData.forecast_time,
                  y: forecastData.forecast,
                  type: 'scatter',
                  mode: 'lines',
                  name: 'Forecast (cycle extrapolation)',
                  line: { color: '#e91e63', width: 3, dash: 'dash' }
                },
                {
                  x: [...forecastData.forecast_time, ...forecastData.forecast_time.slice().reverse()],
                  y: [...forecastData.band_upper, ...forecastData.band_lower.slice().reverse()],
                  type: 'scatter',
                  fill: 'toself',
                  fillcolor: 'rgba(233,30,99,0.12)',
                  line: { color: 'transparent' },
                  name: '95% Confidence Band',
                  hoverinfo: 'skip'
                }
              ]}
              layout={{
                title: `Cycle-Based Forecast — Next ${forecastHorizon} Days`,
                xaxis: { title: 'Days' },
                yaxis: { title: 'Price' },
                height: 420,
                margin: { l: 50, r: 50, b: 50, t: 50 },
                legend: { orientation: 'h', y: -0.2 }
              }}
              style={{ width: '100%' }}
            />
          </div>
        )}

        {/* Forecast insight box */}
        <div style={{ background: '#fff', border: '1px solid #f48fb1', borderRadius: '6px', padding: '14px', marginTop: '16px', fontSize: '0.9em' }}>
          <strong>How to interpret this:</strong>
          <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px', lineHeight: '1.8em' }}>
            <li>The <span style={{ color: '#e91e63' }}><strong>dashed pink line</strong></span> is the pure cycle-based forecast — what the data would look like if it kept repeating the same dominant rhythms.</li>
            <li>The <span style={{ color: 'rgba(233,30,99,0.5)' }}><strong>shaded band</strong></span> is the 95% confidence interval. It widens over time because small errors in the frequency estimates compound the further out you project.</li>
            <li><strong>When does this work well?</strong> Assets with genuine structural cycles (e.g., seasonal commodities, regular earnings rhythms) where the top components explain a high percentage of variance.</li>
            <li><strong>When does it break down?</strong> When cycles are non-stationary (they shift or disappear over time), or when external shocks occur that are not captured in the historical frequency structure. Notice that real market data (Bitcoin, Tesla) will have a much wider confidence band than the synthetic signal.</li>
            <li>The {forecastData?.explained_variance !== undefined ? <strong>{(forecastData.explained_variance * 100).toFixed(1)}% explained variance</strong> : 'explained variance'} tells you how much the 3 dominant cycles actually describe the past data — higher means the forecast is grounded in a stronger signal.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

const thStyle = { padding: '6px 12px', textAlign: 'left', border: '1px solid #f48fb1' };
const tdStyle = { padding: '6px 12px', border: '1px solid #f0f0f0' };

export default App;