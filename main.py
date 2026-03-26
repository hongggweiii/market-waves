from fastapi import FastAPI, Query
from pydantic import BaseModel
import numpy as np
from scipy import signal
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf

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
    f, t, Zxx = signal.stft(y_centered, fs=req.sampling_rate, nperseg=req.window_size)
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
    
    _, y_reconstructed = signal.istft(
        Zxx_modified, 
        fs=req.sampling_rate, 
        nperseg=req.window_size
    )
    
    # Add the massive DC offset back to the smoothed signal
    y_final = y_reconstructed + req.global_mean
    
    return {
        "reconstructed_signal": y_final.tolist()
    }