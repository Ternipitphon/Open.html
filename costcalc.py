"""
AgriFuture AI — Cost Calculator backend
=========================================
A small Flask API with one endpoint: POST /api/analyze-cost

It receives the cost breakdown that costcalc.js already computed
(seed / fertilizer / labor / water cost per entry, plus totals) and
asks Gemini to analyze the cost structure and produce practical,
Thai-language recommendations. The frontend renders the returned
markdown in the "คำแนะนำจาก AI" panel.

Run locally:
    pip install -r requirements.txt
    cp .env.example .env        # then paste your GEMINI_API_KEY
    python app.py

Deploying on Render (or any host that assigns its own port):
    Render sets a PORT environment variable and expects the app to
    bind to it — it will NOT necessarily be 5001. This file now reads
    PORT from the environment (falling back to 5001 for local dev) and
    binds to 0.0.0.0 so the platform can route traffic to it. If the
    app doesn't bind to the right port, Render serves its own error
    page for every request — which has no CORS headers, and shows up
    in the browser as a confusing "blocked by CORS policy" error even
    though CORS(app) is configured correctly below.

    For production, prefer a real WSGI server instead of the Flask
    dev server, e.g. set your Render Start Command to:
        gunicorn app:app --bind 0.0.0.0:$PORT
    (add `gunicorn` to requirements.txt if you use this).
    Running `python app.py` will also work now that it binds to
    the right port, but Flask's built-in server isn't meant for
    production traffic.

The frontend (costcalc.js CONFIG.apiBaseUrl) expects this to be
running at http://localhost:5001 by default for local dev — set
PRODUCTION_API_BASE_URL in costcalc.js to this service's public URL
when deployed.
"""

import os
import logging

from flask import Flask, request, jsonify
from flask_cors import CORS
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)  # allow the static frontend (served from a different origin/port) to call this API

logging.basicConfig(level=logging.INFO)

API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    app.logger.warning(
        "GEMINI_API_KEY is not set — /api/analyze-cost will fail until you set it "
        "(see .env.example)."
    )

client = genai.Client(api_key=API_KEY) if API_KEY else None

# gemini-3.5-flash is fast and cheap, and plenty for this analysis task.
# Swap to gemini-3.1-pro-preview if you want deeper multi-step reasoning
# on more complex cost structures.
MODEL = "gemini-3.5-flash"
MAX_OUTPUT_TOKENS = 1200

SYSTEM_PROMPT = """\
คุณคือที่ปรึกษาด้านต้นทุนการเกษตรของแอป AgriFuture AI
หน้าที่ของคุณคือวิเคราะห์โครงสร้างต้นทุนการผลิตที่ผู้ใช้ส่งมา (ค่าพันธุ์ ค่าปุ๋ย
ค่าแรง ค่าน้ำ) แล้วให้คำแนะนำเชิงลึกที่นำไปปฏิบัติได้จริงในภาษาไทย

กติกาการตอบ:
- ตอบเป็นภาษาไทยเท่านั้น กระชับ ตรงประเด็น ไม่ยืดยาวเกินไป (ไม่เกินประมาณ 300 คำ)
- จัดรูปแบบด้วย Markdown แบบง่าย: ใช้ "### " สำหรับหัวข้อย่อย และ "- " สำหรับ
  รายการ (bullet) และ "**ข้อความ**" สำหรับตัวหนา เท่านั้น ห้ามใช้ตาราง Markdown
- โครงสร้างคำตอบควรมี 2-3 หัวข้อ เช่น "จุดที่ควรระวัง", "คำแนะนำเพื่อลดต้นทุน"
  และถ้าเหมาะสมให้เพิ่ม "ข้อสังเกตเพิ่มเติม"
- อ้างอิงตัวเลขที่ผู้ใช้ส่งมาจริง ๆ (เช่น สัดส่วนต้นทุนแต่ละหมวดเทียบกับรวม)
  อย่าสมมติตัวเลขที่ไม่ได้รับมา
- ให้คำแนะนำที่เกษตรกรทำได้จริงในทางปฏิบัติ ไม่ใช่คำแนะนำทั่วไปที่คลุมเครือ
"""


@app.route("/api/analyze-cost", methods=["POST"])
def analyze_cost():
    if client is None:
        return jsonify({"error": "เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า GEMINI_API_KEY"}), 500

    data = request.get_json(force=True, silent=True) or {}
    entries = data.get("entries", [])
    totals = data.get("totals", {})

    if not entries:
        return jsonify({"error": "ไม่มีข้อมูลต้นทุนสำหรับวิเคราะห์"}), 400

    prompt = build_prompt(entries, totals)

    try:
        response = client.models.generate_content(
            model=MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                max_output_tokens=MAX_OUTPUT_TOKENS,
                temperature=0.4,
            ),
        )
        text = (response.text or "").strip()

        if not text:
            return jsonify({"error": "AI ไม่ได้ส่งคำตอบกลับมา"}), 502

        return jsonify({"recommendation": text})

    except Exception as exc:  # noqa: BLE001 - surface any API error to the client
        app.logger.exception("Gemini API call failed")
        return jsonify({"error": "เรียก AI ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", "detail": str(exc)}), 502


def build_prompt(entries, totals):
    lines = ["นี่คือข้อมูลต้นทุนการผลิตที่ผู้ใช้เลือกไว้ในระบบคำนวณต้นทุน:\n"]

    for i, e in enumerate(entries, 1):
        lines.append(
            f"{i}. {e.get('title', e.get('cropType', 'ไม่ระบุ'))} "
            f"(พืช: {e.get('cropType', '-')}, พื้นที่: {_num(e.get('area'))} ไร่)\n"
            f"   - ค่าพันธุ์: {_num(e.get('seedCost'))} บาท\n"
            f"   - ค่าปุ๋ย: {_num(e.get('fertilizerCost'))} บาท\n"
            f"   - ค่าแรง: {_num(e.get('laborCost'))} บาท\n"
            f"   - ค่าน้ำ: {_num(e.get('waterCost'))} บาท\n"
            f"   - รวม: {_num(e.get('totalCost'))} บาท"
        )

    lines.append(
        "\nสรุปรวมทุกรายการ:\n"
        f"- พื้นที่รวม: {_num(totals.get('area'))} ไร่\n"
        f"- ค่าพันธุ์รวม: {_num(totals.get('seed'))} บาท\n"
        f"- ค่าปุ๋ยรวม: {_num(totals.get('fertilizer'))} บาท\n"
        f"- ค่าแรงรวม: {_num(totals.get('labor'))} บาท\n"
        f"- ค่าน้ำรวม: {_num(totals.get('water'))} บาท\n"
        f"- ต้นทุนรวมทั้งหมด: {_num(totals.get('grandTotal'))} บาท\n"
        f"- ต้นทุนเฉลี่ยต่อไร่: {_num(totals.get('perRai'))} บาท/ไร่"
    )

    lines.append(
        "\nช่วยวิเคราะห์เชิงลึกว่าโครงสร้างต้นทุนนี้เป็นอย่างไร หมวดไหนสูงผิดปกติ "
        "เมื่อเทียบกับสัดส่วนที่เหมาะสม และให้คำแนะนำที่นำไปปฏิบัติได้จริงเพื่อลดต้นทุน "
        "หรือเพิ่มประสิทธิภาพการผลิต"
    )
    return "\n".join(lines)


def _num(value):
    try:
        return f"{float(value):,.0f}"
    except (TypeError, ValueError):
        return "0"


@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "service": "AgriFuture AI - Cost Calculator backend",
        "status": "running",
        "endpoints": ["/api/analyze-cost (POST)", "/api/health (GET)"]
    })


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model": MODEL, "configured": client is not None})


if __name__ == "__main__":
    # Render (and most PaaS hosts) inject a PORT env var and route traffic
    # to it — the app MUST bind to that port, not a hardcoded one, or the
    # platform's own error page answers every request instead of Flask
    # (which is what caused the "missing CORS header" symptom).
    port = int(os.environ.get("PORT", 5001))
    debug_mode = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug_mode)
