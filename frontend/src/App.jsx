import { useState, useEffect } from 'react';
import Plotly from 'plotly.js-dist-min';
import PlotlyFactory from 'react-plotly.js/factory';

const createPlotlyComponent = PlotlyFactory.default || PlotlyFactory;
const Plot = createPlotlyComponent(Plotly);

function App() {
  const [time, setTime] = useState([]);
  const [price, setPrice] = useState([]);
  const [spectrogram, setSpectrogram] = useState(null);

  const [windowSize, setWindowSize] = useState(28);
  const [samplingRate, setSamplingRate] = useState(1.0);

  const [isFiltering, setIsFiltering] = useState(false);
  const [cutoffFreq, setCutoffFreq] = useState(0.08);
  const [reconstructedPrice, setReconstructedPrice] = useState([]);

  const deltaF = (samplingRate / windowSize).toFixed(4);
  const isNyquistViolated = samplingRate <= 0.28;

  // Fetch raw data
  useEffect(() => {
    fetch('http://localhost:8000/api/data')
      .then(res => res.json())
      .then(data => {
        setTime(data.time);
        setPrice(data.price);
      })
      .catch(err => console.error("Error fetching data:", err));
  }, []);

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

      {/* Top: Time Domain (Line Chart) */}
      <div style={{ border: '1px solid #ccc', marginBottom: '20px' }}>
        <Plot
          data={topChartTraces}
          layout={{ title: 'Time Domain (Raw vs Filtered)', xaxis: { title: 'Days' }, yaxis: { title: 'Price' }, height: 300, margin: { l: 50, r: 50, b: 50, t: 50 } }}
          style={{ width: '100%' }}
        />
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