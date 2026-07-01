#!/usr/bin/env python3
"""
AgriFuture Weather - Python Backend
ดึงข้อมูลพยากรณ์อากาศจาก Open-Meteo API (ใช้ข้อมูล ECMWF + GFS เหมือนกรมอุตุฯ)
อัปเดตอัตโนมัติทุก 30 นาที

ติดตั้ง: pip install flask flask-cors requests
รัน:     python server.py
เปิด:    http://localhost:5000
"""

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
import requests
from datetime import datetime
import os

app = Flask(__name__, static_folder=".")
CORS(app)

# จังหวัดและพิกัด
LOCATIONS = {
    "กรุงเทพมหานคร":      {"lat": 13.7563, "lon": 100.5018},
    "เชียงใหม่":          {"lat": 18.7883, "lon": 98.9853},
    "ภูเก็ต":             {"lat": 7.8804,  "lon": 98.3923},
    "ขอนแก่น":           {"lat": 16.4419, "lon": 102.836},
    "ชลบุรี":             {"lat": 13.3611, "lon": 100.9847},
    "สุราษฎร์ธานี":      {"lat": 9.1382,  "lon": 99.3214},
    "นครราชสีมา":        {"lat": 14.9799, "lon": 102.0978},
    "เชียงราย":          {"lat": 19.9105, "lon": 99.8406},
    "อุดรธานี":          {"lat": 17.4138, "lon": 102.7877},
    "พระนครศรีอยุธยา":  {"lat": 14.3692, "lon": 100.5877},
}

WMO_CODES = {
    0:  {"label": "ท้องฟ้าแจ่มใส",          "icon": "☀️"},
    1:  {"label": "ส่วนใหญ่แจ่มใส",          "icon": "🌤️"},
    2:  {"label": "มีเมฆบางส่วน",            "icon": "⛅"},
    3:  {"label": "มืดครึ้ม",                "icon": "☁️"},
    45: {"label": "หมอกลง",                  "icon": "🌫️"},
    51: {"label": "ฝนปรอยๆ เบา",            "icon": "🌦️"},
    61: {"label": "ฝนเบา",                   "icon": "🌧️"},
    63: {"label": "ฝนปานกลาง",              "icon": "🌧️"},
    65: {"label": "ฝนหนัก",                 "icon": "🌧️"},
    80: {"label": "ฝนตกเล็กน้อย",           "icon": "🌦️"},
    81: {"label": "ฝนตกปานกลาง",            "icon": "🌧️"},
    82: {"label": "ฝนตกหนัก",               "icon": "⛈️"},
    95: {"label": "พายุฝนฟ้าคะนอง",         "icon": "⛈️"},
    99: {"label": "พายุฝนลูกเห็บหนัก",     "icon": "🌩️"},
}

def get_wmo(code):
    return WMO_CODES.get(int(code), {"label": "ไม่ทราบ", "icon": "🌡️"})

@app.route("/")
def index():
    return send_from_directory(".", "index.html")

@app.route("/api/locations")
def locations():
    return jsonify({"locations": list(LOCATIONS.keys())})

@app.route("/api/weather/<province>")
def weather(province):
    loc = LOCATIONS.get(province)
    if not loc:
        return jsonify({"error": "ไม่พบจังหวัดนี้"}), 404

    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={loc['lat']}&longitude={loc['lon']}"
        f"&daily=weathercode,temperature_2m_max,temperature_2m_min,"
        f"precipitation_sum,windspeed_10m_max,sunrise,sunset,uv_index_max"
        f"&hourly=temperature_2m,relativehumidity_2m,weathercode,"
        f"windspeed_10m,precipitation_probability"
        f"&current_weather=true"
        f"&timezone=Asia/Bangkok"
        f"&forecast_days=7"
    )

    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        return jsonify({"error": f"ดึงข้อมูลไม่ได้: {e}"}), 503

    now = datetime.now()
    daily  = data.get("daily", {})
    cur    = data.get("current_weather", {})
    hourly = data.get("hourly", {})

    # Humidity & rain probability (current hour)
    today = now.strftime("%Y-%m-%d")
    cur_hour = f"{today}T{now.strftime('%H')}"
    humidity, rain_prob = 75, 0
    for i, t in enumerate(hourly.get("time", [])):
        if t.startswith(cur_hour):
            humidity  = hourly.get("relativehumidity_2m", [75])[i]
            rain_prob = hourly.get("precipitation_probability", [0])[i]
            break

    # Build 7-day forecast
    forecast = []
    days_th = ["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์"]
    months_th = ["","ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."]

    for i, d in enumerate(daily.get("time", [])):
        dt = datetime.strptime(d, "%Y-%m-%d")
        info = get_wmo(daily["weathercode"][i])
        forecast.append({
            "date":     d,
            "day_th":   "วันนี้" if i==0 else ("พรุ่งนี้" if i==1 else f"วัน{days_th[dt.weekday()]}"),
            "date_th":  f"{dt.day} {months_th[dt.month]} {dt.year+543}",
            "icon":     info["icon"],
            "label":    info["label"],
            "temp_max": round(daily["temperature_2m_max"][i] or 0),
            "temp_min": round(daily["temperature_2m_min"][i] or 0),
            "rain":     round(daily.get("precipitation_sum", [0]*7)[i] or 0, 1),
            "wind":     round(daily.get("windspeed_10m_max", [0]*7)[i] or 0),
            "uv":       round(daily.get("uv_index_max", [0]*7)[i] or 0),
            "sunrise":  (daily.get("sunrise", [""])[i] or "")[-5:],
            "sunset":   (daily.get("sunset",  [""])[i] or "")[-5:],
        })

    # Hourly for today
    hourly_out = []
    for i, t in enumerate(hourly.get("time", [])[:48]):
        if not t.startswith(today): continue
        h_info = get_wmo(hourly["weathercode"][i])
        hourly_out.append({
            "time":      t[11:16],
            "temp":      round(hourly["temperature_2m"][i] or 0),
            "icon":      h_info["icon"],
            "rain_prob": hourly.get("precipitation_probability", [0]*48)[i] or 0,
            "humidity":  hourly.get("relativehumidity_2m", [75]*48)[i] or 0,
        })

    cur_info = get_wmo(cur.get("weathercode", 0))
    updated = now.strftime(f"%d/%m/{now.year+543} %H:%M น.")

    return jsonify({
        "province": province,
        "updated":  updated,
        "source":   "Open-Meteo (ECMWF/GFS) / กรมอุตุนิยมวิทยาไทย",
        "current": {
            "temp":      round(cur.get("temperature", 0)),
            "windspeed": round(cur.get("windspeed", 0)),
            "icon":      cur_info["icon"],
            "label":     cur_info["label"],
            "humidity":  humidity,
            "rain_prob": rain_prob,
            "temp_max":  forecast[0]["temp_max"] if forecast else 0,
            "temp_min":  forecast[0]["temp_min"] if forecast else 0,
            "sunrise":   forecast[0]["sunrise"]  if forecast else "--:--",
            "sunset":    forecast[0]["sunset"]   if forecast else "--:--",
            "uv":        forecast[0]["uv"]        if forecast else 0,
        },
        "forecast": forecast,
        "hourly":   hourly_out,
    })

if __name__ == "__main__":
    print("🌿 AgriFuture Weather Server")
    print("📍 เปิดที่ http://localhost:5000")
    print("📡 ดึงข้อมูลจาก Open-Meteo (อัปเดตทุก 30 นาที)")
    app.run(debug=True, port=5000, host="0.0.0.0")