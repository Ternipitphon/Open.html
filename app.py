"""
AgriFuture AI — Cost Calculator backend
=========================================
A small Flask API with one endpoint: POST /api/analyze-cost
"""

import os
import logging

from flask import Flask, request, jsonify
from flask_cors import CORS
from google import genai
from google.genai import types
from dotenv import load_dotenv

# โหลดค่าจากไฟล์ .env (สำหรับการรันบนเครื่องตัวเอง Local)
load_dotenv()

app = Flask(__name__)
# เปิดให้หน้าบ้านที่เป็น Static Web (เช่น GitHub Pages) สามารถดึงข้อมูลข้ามโดเมนได้โดยไม่ติดบล็อกความปลอดภัย
CORS(app)

logging.basicConfig(level=logging.INFO)

# ดึงรหัส API Key จากระบบ Environment Variables ของ Render หรือไฟล์ .env
API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    app.logger.warning(
        "WARNING: ยังไม่ได้ตั้งค่า GEMINI_API_KEY ในระบบ — /api/analyze-cost จะไม่สามารถทำงานได้"
    )

# สร้างการเชื่อมต่อกับระบบ Google GenAI SDK เวอร์ชันใหม่
client = genai.Client(api_key=API_KEY) if API_KEY else None

# ใช้โมเดล gemini-3.5-flash มีความเร็วสูงและตอบคำถามภาษาไทยได้ดีเยี่ยม
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
- โครงสร้างคำตอบควรมี 2-3 หัวข้อ เช่น "### จุดที่ควรระวัง", "### คำแนะนำเพื่อลดต้นทุน"
  และถ้าเหมาะสมให้เพิ่ม "### ข้อสังเกตเพิ่มเติม"
- อ้างอิงตัวเลขที่ผู้ใช้ส่งมาจริง ๆ (เช่น สัดส่วนต้นทุนแต่ละหมวดเทียบกับรวม)
  อย่าสมมติตัวเลขที่ไม่ได้รับมา
- ให้คำแนะนำที่เกษตรกรทำได้จริงในทางปฏิบัติ ไม่ใช่คำแนะนำทั่วไปที่คลุมเครือ
"""

@app.route("/api/analyze-cost", methods=["POST"])
def analyze_cost():
    if client is None:
        return jsonify({"error": "เซิร์ฟเวอร์หลังบ้านยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Environment Variables ของ Render"}), 500

    # ดึงข้อมูล JSON Payload จากหน้าบ้าน
    data = request.get_json(force=True, silent=True) or {}
    entries = data.get("entries", [])
    totals = data.get("totals", {})

    if not entries:
        return jsonify({"error": "ไม่พบข้อมูลต้นทุนในระบบที่ส่งมาวิเคราะห์"}), 400

    # แปลงโครงสร้างข้อมูลตัวเลขให้กลายเป็น Prompt สำหรับป้อนให้ AI
    prompt = build_prompt(entries, totals)

    try:
        # เรียกใช้งานโมเดล Gemini เจนข้อความออกมาตามคำสั่งของระบบ
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
            return jsonify({"error": "ระบบปัญญาประดิษฐ์ (AI) ไม่ได้ส่งข้อมูลคำตอบกลับมา"}), 502

        return jsonify({"recommendation": text})

    except Exception as exc:
        app.logger.exception("การเชื่อมต่อผ่านระบบ Gemini API เกิดความล้มเหลว")
        return jsonify({
            "error": "ไม่สามารถติดต่อระบบ AI ได้ในขณะนี้ กรุณาลองใหม่อีกครั้งในภายหลัง", 
            "detail": str(exc)
        }), 502


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
        "configured": client is not None,
        "endpoints": ["/api/analyze-cost (POST)", "/api/health (GET)"]
    })


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok", 
        "model": MODEL, 
        "configured": client is not None
    })


if __name__ == "__main__":
    # รองรับการดึงพอร์ตแบบสุ่มอัตโนมัติที่ Render จ่ายมาให้แอปพลิเคชัน
    port = int(os.environ.get("PORT", 5001))
    debug_mode = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug_mode)
