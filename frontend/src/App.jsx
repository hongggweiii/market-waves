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

  const deltaF = (samplingRate / windowSize).toFixed(4);

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

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '1000px', margin: '0 auto' }}>
      <h1>Time-Series STFT Explorer</h1>
      <p>Visualizing BT3017 Frequency Analysis on Market Data</p>

      {/* Interactive Math Sandbox */}
      <div style={{ background: '#f4f4f9', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
        <h3>Interactive Parameters</h3>
        
        <div style={{ display: 'flex', gap: '40px', alignItems: 'center' }}>
          <div>
            <label><strong>Window Size (N): {windowSize} days</strong></label><br/>
            <input 
              type="range" 
              min="7" max="90" 
              value={windowSize} 
              onChange={(e) => setWindowSize(parseInt(e.target.value))}
              style={{ width: '200px' }}
            />
          </div>

          <div>
            <label><strong>Sampling Rate (f_s): {samplingRate}</strong></label><br/>
            <input 
              type="range" 
              min="0.1" max="5.0" step="0.1"
              value={samplingRate} 
              onChange={(e) => setSamplingRate(parseFloat(e.target.value))}
              style={{ width: '200px' }}
            />
          </div>

          {/* Dynamic Equation */}
          <div style={{ background: '#fff', padding: '10px 20px', border: '1px solid #ccc', borderRadius: '4px' }}>
            <strong>Frequency Bin Size Equation:</strong><br/>
            <span style={{ fontSize: '1.2em', fontFamily: 'monospace' }}>
              Δf = f_s / N = {samplingRate} / {windowSize} = <span style={{ color: 'red' }}>{deltaF} Hz</span>
            </span>
          </div>
        </div>
      </div>

      {/* Top: Time Domain (Line Chart) */}
      <div style={{ border: '1px solid #ccc', marginBottom: '20px' }}>
        <Plot
          data={[{ x: time, y: price, type: 'scatter', mode: 'lines', line: { color: '#17BECF' } }]}
          layout={{ title: 'Time Domain (Raw Price Data)', xaxis: { title: 'Days' }, yaxis: { title: 'Price' }, height: 300, margin: { l: 50, r: 50, b: 50, t: 50 } }}
          style={{ width: '100%' }}
        />
      </div>

      {/* Bottom: Frequency Domain (Spectrogram) */}
      <div style={{ border: '1px solid #ccc' }}>
        {spectrogram ? (
          <Plot
            data={[{ x: spectrogram.times, y: spectrogram.frequencies, z: spectrogram.magnitudes, type: 'heatmap', colorscale: 'Jet' }]}
            layout={{ title: 'Frequency Domain (Spectrogram)', xaxis: { title: 'Time (Windows)' }, yaxis: { title: 'Frequency (Cycles per Day)' }, height: 400, margin: { l: 50, r: 50, b: 50, t: 50 } }}
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