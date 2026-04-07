# Market Waves

A real-time signal analysis and forecasting tool for market data using Fourier analysis and spectral decomposition. An educational tool which visualize frequency analysis concepts to students in a financial context.

## Features

### Signal Analysis
- **Short-Time Fourier Transform (STFT)** - Visualize how frequency content changes over time with interactive spectrograms
- **Frequency Decomposition** - Extract the top N dominant frequency components from price data
- **3D Visualization** - Interactive 3D mode to explore decomposed wave components
- **Frequency Probing** - Test specific periods (e.g., 7-day cycles) to measure amplitude in your data

### Signal Processing
- **Low-Pass Filtering** - Smooth out noise by removing high-frequency components, then reconstruct with inverse FFT
- **DC Offset Handling** - Automatically removes baseline while preserving oscillations
- **Inverse FFT Reconstruction** - Filter frequency components and reconstruct the signal

### Forecasting
- FFT-based forecasting using dominant frequency components
- Adaptive confidence bands that widen with forecast horizon
- Residual standard deviation and explained variance metrics
- Configurable forecast horizon and number of components

### Data Sources
- **Synthetic Data** - Perfect mathematical sine waves for testing and education
- **Real Market Data** - Live data from Yahoo Finance

## Installation & Setup

### Prerequisites
- Python 3.13+
- Node.js 18+
- Git

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/market-waves.git
   cd market-waves
   ```

2. **Set up Python environment**
   ```bash
   python3 -m venv bt3017_env
   source bt3017_env/bin/activate  # On Windows: bt3017_env\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Start the backend**
   ```bash
   uvicorn main:app --reload
   ```
   The API Docs is at `http://localhost:8000/docs`

4. **Set up frontend** 
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   The FE will be available at `http://localhost:5173`


## How It Works

### Signal Decomposition

Market prices are treated as composite signals made up of multiple frequency components. Using FFT (Fast Fourier Transform), the tool:

1. **Removes DC offset** - Subtracts the mean to isolate oscillations
2. **Applies FFT** - Decomposes the signal into frequency domain
3. **Identifies top components** - Finds the N frequencies with highest amplitudes
4. **Reconstructs pure waves** - Creates perfect sinusoids for each component

```
Price Data → FFT → Magnitude Spectrum → Top N Frequencies → Pure Sinusoids
```

### Forecasting with FFT

The forecast assumes that market movements follow patterns driven by cyclical forces. By identifying these cycles, we can extrapolate them forward:

1. Historical signal → FFT → Extract frequencies & amplitudes
2. Project each component into the future: `A × cos(2πft + φ)`
3. Sum components to create forecast
4. Confidence bands widen based on residual error and forecast distance

### Low-Pass Filtering

Remove high-frequency noise while preserving trends:

1. Compute STFT
2. Zero out high-frequency components
3. Apply inverse STFT to reconstruct
