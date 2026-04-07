from fastapi import FastAPI, Query
from pydantic import BaseModel
import numpy as np
from scipy import signal
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf
from scipy.fft import rfft, rfftfreq

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/data")
def get_market_data(ticker: str = Query("synthetic")):
    if ticker == "synthetic":
        # Return our textbook math waves
        t = np.linspace(0, 365, 365)
        trend_30_day = 10 * np.sin(2 * np.pi * (1/30) * t)
        cycle_7_day = 5 * np.sin(2 * np.pi * (1/7) * t)
        noise = np.random.normal(0, 2, 365)
        y = trend_30_day + cycle_7_day + noise + 100
        
        return {"time": t.tolist(), "price": y.tolist()}
    
    else:
        market_data = yf.download(ticker, period="1y", interval="1d")
        prices = market_data['Close'].values.flatten().tolist()
        t = list(range(len(prices)))
        
        return {"time": t, "price": prices}

# Short Time Fourier Transform
class STFTRequest(BaseModel):
    signal_data: list[float]
    window_size: int         # N
    sampling_rate: float     # fs

@app.post("/api/stft")
def compute_stft(req: STFTRequest):
    y = np.array(req.signal_data)
    
    # Calculate and remove the DC offset (mean)
    global_mean = float(np.mean(y))
    y_centered = y - global_mean
    
    # Run STFT on the centered data
    noverlap = req.window_size - 1
    f, t, Zxx = signal.stft(y_centered, fs=req.sampling_rate, nperseg=req.window_size, noverlap=noverlap)
    magnitudes = np.abs(Zxx)
    
    return {
        "frequencies": f.tolist(),
        "times": t.tolist(),
        "magnitudes": magnitudes.tolist(),
        "real_parts": np.real(Zxx).tolist(),
        "imag_parts": np.imag(Zxx).tolist(),
        "global_mean": global_mean # Send the mean to React
    }

# Inverse Fast Fourier Transform
class IFFTRequest(BaseModel):
    real_parts: list[list[float]]
    imag_parts: list[list[float]]
    window_size: int
    sampling_rate: float
    global_mean: float # Receive the mean from React

@app.post("/api/ifft")
def compute_ifft(req: IFFTRequest):
    real_arr = np.array(req.real_parts)
    imag_arr = np.array(req.imag_parts)
    Zxx_modified = real_arr + 1j * imag_arr
    
    noverlap = req.window_size - 1
    _, y_reconstructed = signal.istft(
        Zxx_modified,
        fs=req.sampling_rate,
        nperseg=req.window_size,
        noverlap=noverlap
    )
    
    # Add the massive DC offset back to the smoothed signal
    y_final = y_reconstructed + req.global_mean
    
    return {
        "reconstructed_signal": y_final.tolist()
    }

class DecomposeRequest(BaseModel):
    signal_data: list[float]
    sampling_rate: float
    num_components: int = 3  # How many dominant frequencies to extract

@app.post("/api/decompose")
def compute_3d_decomposition(req: DecomposeRequest):
    y = np.array(req.signal_data)
    N = len(y)
    t = np.arange(N)
    n = max(1, min(req.num_components, N // 2))  # clamp to valid range

    # Remove the DC Offset (baseline) so real waves are not masked
    global_mean = float(np.mean(y))
    y_centered = y - global_mean

    # Run standard 1D FFT over the entire signal
    yf = rfft(y_centered)
    xf = rfftfreq(N, 1 / req.sampling_rate)

    # Find the magnitudes to locate the strongest frequencies
    magnitudes = np.abs(yf)

    # Get the indices of the top N strongest frequencies
    top_indices = np.argsort(magnitudes)[-n:][::-1]
    
    constituent_waves = []
    
    for idx in top_indices:
        freq = xf[idx]
        # Calculate True Amplitude: A = 2 * |X[k]| / N
        amplitude = (2.0 / N) * np.abs(yf[idx])
        # Calculate Phase shift
        phase = np.angle(yf[idx])
        
        # Mathematically reconstruct the pure, perfect wave
        pure_wave = amplitude * np.cos(2 * np.pi * freq * t + phase)
        
        constituent_waves.append({
            "frequency": float(freq),
            "wave": pure_wave.tolist()
        })
        
    return {
        "global_mean": global_mean,
        "waves": constituent_waves
    }

class ForecastRequest(BaseModel):
    signal_data: list[float]
    sampling_rate: float
    horizon: int = 60         # Number of days to forecast ahead
    num_components: int = 3   # How many dominant frequencies to use

@app.post("/api/forecast")
def compute_forecast(req: ForecastRequest):
    y = np.array(req.signal_data)
    N = len(y)
    t_future = np.arange(N, N + req.horizon)

    # Remove DC offset so FFT sees only oscillations
    global_mean = float(np.mean(y))
    y_centered = y - global_mean

    # Full FFT over the historical window
    yf = rfft(y_centered)
    xf = rfftfreq(N, 1.0 / req.sampling_rate)

    # Top N dominant frequency components
    n = max(1, min(req.num_components, N // 2))
    top_3_idx = np.argsort(np.abs(yf))[-n:][::-1]

    # Reconstruct historical signal and extrapolate forward
    hist_recon = np.zeros(N) + global_mean
    forecast = np.zeros(req.horizon)
    components = []

    for idx in top_3_idx:
        freq  = float(xf[idx])
        amp   = (2.0 / N) * float(np.abs(yf[idx]))
        phase = float(np.angle(yf[idx]))

        hist_recon += amp * np.cos(2 * np.pi * freq * np.arange(N) + phase)
        forecast   += amp * np.cos(2 * np.pi * freq * t_future + phase)

        period = (1.0 / freq) if freq > 0 else float('inf')
        components.append({
            "frequency":   round(freq, 4),
            "period_days": round(period, 1),
            "amplitude":   round(amp, 3)
        })

    forecast += global_mean

    # Confidence band: starts at ±1.96σ (reconstruction error) and widens as sqrt(1 + h/N)
    residual_std = float(np.std(y - hist_recon))
    explained_var = float(1.0 - np.var(y - hist_recon) / np.var(y_centered))
    steps = np.arange(1, req.horizon + 1)
    half_band = 1.96 * residual_std * np.sqrt(1 + steps / N)

    return {
        "forecast_time":      t_future.tolist(),
        "forecast":           forecast.tolist(),
        "band_upper":         (forecast + half_band).tolist(),
        "band_lower":         (forecast - half_band).tolist(),
        "components":         components,
        "residual_std":       round(residual_std, 3),
        "explained_variance": round(explained_var, 3)
    }


class ProbeRequest(BaseModel):
    signal_data: list[float]
    target_period: float  # Eg: 7 for a 7 day cycle

@app.post("/api/probe")
def probe_frequency(req: ProbeRequest):
    y = np.array(req.signal_data)
    N = len(y)
    t = np.arange(N)
    
    # Remove the DC offset (mean) so the baseline doesn't skew our dot product
    y_centered = y - np.mean(y)
    
    # Calculate the target frequency (f = 1 / T)
    # Eg: if target_period is 7 days, f = 1/7 cycles per day
    target_freq = 1.0 / req.target_period
    
    # Generate the pure test waves
    test_cos = np.cos(2 * np.pi * target_freq * t)
    test_sin = np.sin(2 * np.pi * target_freq * t)
    
    # Multiply the market data array by the test wave array, then sum it up
    dot_cos = np.dot(y_centered, test_cos)
    dot_sin = np.dot(y_centered, test_sin)
    
    # Calculate the total magnitude
    # Normalise by (2/N) to get the true amplitude of this cycle in the data
    magnitude = (2.0 / N) * np.sqrt(dot_cos**2 + dot_sin**2)
    
    # Reconstruct the pure wave based on the phase so the frontend can draw it
    phase = np.arctan2(dot_sin, dot_cos)
    reconstructed_wave = magnitude * np.cos(2 * np.pi * target_freq * t - phase)
    
    return {
        "target_period": req.target_period,
        "magnitude": float(magnitude),
        "dot_cos": float(dot_cos),           # a_k
        "dot_sin": float(dot_sin),           # b_k
        "pure_wave": reconstructed_wave.tolist()
    }