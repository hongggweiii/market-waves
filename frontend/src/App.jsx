import { useState, useEffect } from 'react';
import Plotly from 'plotly.js-dist-min';
import PlotlyFactory from 'react-plotly.js/factory';

const createPlotlyComponent = PlotlyFactory.default || PlotlyFactory;
const Plot = createPlotlyComponent(Plotly);

function App() {
  const [time, setTime] = useState([]);
  const [price, setPrice] = useState([]);
  const [spectrogram, setSpectrogram] = useState(null);

  useEffect(() => {
    // Fetch the synthetic stock market data
    fetch('http://localhost:8000/api/data')
      .then(res => res.json())
      .then(data => {
        setTime(data.time);
        setPrice(data.price);

        // Immediately send that data to the STFT endpoint
        return fetch('http://localhost:8000/api/stft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signal_data: data.price,
            window_size: 28,     // 28-day window for our STFT
            sampling_rate: 1.0   // 1 data point per day
          })
        });
      })
      .then(res => res.json())
      .then(stftData => {
        setSpectrogram(stftData);
      })
      .catch(err => console.error("Error fetching data:", err));
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Time-Series STFT Explorer</h1>
      <p>Visualising BT3017 Frequency Analysis on Market Data</p>

      {/* Top: Time Domain (Line Chart) */}
      <div style={{ border: '1px solid #ccc', marginBottom: '20px' }}>
        <Plot
          data={[{
            x: time,
            y: price,
            type: 'scatter',
            mode: 'lines',
            line: { color: '#17BECF' }
          }]}
          layout={{
            title: 'Time Domain (Raw Price Data)',
            xaxis: { title: 'Days' },
            yaxis: { title: 'Price' },
            height: 300,
            margin: { l: 50, r: 50, b: 50, t: 50 }
          }}
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
              type: 'heatmap',
              colorscale: 'Jet'
            }]}
            layout={{
              title: 'Frequency Domain (Spectrogram)',
              xaxis: { title: 'Time (Windows)' },
              yaxis: { title: 'Frequency (Cycles per Day)' },
              height: 400,
              margin: { l: 50, r: 50, b: 50, t: 50 }
            }}
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