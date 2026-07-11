"""
AgriFuture AI — Cost Calculator backend
=========================================
A small Flask API with one endpoint: POST /api/analyze-cost

It receives the cost breakdown that costcalc.js already computed
(seed / fertilizer / labor / water cost per entry, plus totals) and
asks Claude to analyze the cost structure and produce practical,
Thai-language recommendations. The frontend renders the returned
markdown in the "คำแนะนำจาก AI" panel.

Run locally:
    pip install -r requirements.txt
    cp .env.example .env        # then paste your ANTHROPIC_API_KEY
    python app.py

The frontend (costcalc.js CONFIG.apiBaseUrl) expects this to be
running at http://localhost:5001 by default — change both sides
together if you deploy elsewhere.
"""

import os
import logging

from flask import Flask, request, jsonify
from flask_cors import CORS
from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)  # allow the static frontend (served from a different origin/port) to call this API

logging.basicConfig(level=logging.INFO)

API_KEY = os.environ.get("ANTHROPIC_API_KEY")
if not API_KEY:
    app.logger.warning(
        "ANTHROPIC_API_KEY is not set — /api/analyze-cost will fail until you set it "
        "(see .env.example)."
    )

client = Anthropic(api_key=API_KEY) if API_KEY else None

MODEL = "claude-sonnet-5"
MAX_TOKENS = 1200

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
        return jsonify({"error": "เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY"}), 500

    data = request.get_json(force=True, silent=True) or {}
    entries = data.get("entries", [])
    totals = data.get("totals", {})

    if not entries:
        return jsonify({"error": "ไม่มีข้อมูลต้นทุนสำหรับวิเคราะห์"}), 400

    prompt = build_prompt(entries, totals)

    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(
            block.text for block in response.content if block.type == "text"
        ).strip()

        if not text:
            return jsonify({"error": "AI ไม่ได้ส่งคำตอบกลับมา"}), 502

        return jsonify({"recommendation": text})

    except Exception as exc:  # noqa: BLE001 - surface any API error to the client
        app.logger.exception("Claude API call failed")
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


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model": MODEL, "configured": client is not None})


if __name__ == "__main__":
    app.run(debug=True, port=5001)