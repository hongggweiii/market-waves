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

  const deltaF = (samplingRate / windowSize).toFixed(4);
  const isNyquistViolated = samplingRate <= 0.28;

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
      const a = spectrogram.imag_parts[i][j].toFixed(2);
      const b = spectrogram.real_parts[i][j].toFixed(2);
      return `Sine Part (a): ${a}<br>Cosine Part (b): ${b}`;
    })
  ) : [];

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

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '1000px', margin: '0 auto' }}>
      <h1>Time-Series STFT Explorer</h1>
      <p>Visualizing BT3017 Frequency Analysis on Market Data</p>

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
            <strong>⚠️ Nyquist Limit Violated:</strong> You are sampling too slowly to capture the fast 7-day cycle. 
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
      </div>
    </div>
  );
}

export default App;