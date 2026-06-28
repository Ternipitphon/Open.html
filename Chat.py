"""
AgriFuture AI — Python Flask Backend (Ollama Gemma Edition)
เวอร์ชันรวมมิตร: เปิดประตูรับทั้ง /chat และ /api/analyze เพื่อแก้ปัญหา CORS 100%
อัปเดต: เปลี่ยนจาก Google Gemini API มาเป็น Ollama (รันโมเดล Gemma ในเครื่องตัวเอง)
"""

import os
import requests
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

# โหลดค่าจากไฟล์ .env อัตโนมัติ
load_dotenv()

app = Flask(__name__)

# ตั้งค่าปลดล็อกระบบความปลอดภัย CORS ขั้นสูงสุดสำหรับทุกช่องทาง
CORS(app, resources={r"/*": {
    "origins": "*",
    "methods": ["GET", "POST", "OPTIONS"],
    "allow_headers": ["Content-Type", "Authorization"]
}})

# ── คอนฟิกการเชื่อมต่อ Ollama ───────────────────────────────────────────────
# Ollama รันอยู่ในเครื่อง (หรือเซิร์ฟเวอร์อื่น) ที่ endpoint /api/generate
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL    = os.getenv("OLLAMA_MODEL", "gemma3:4b")  # เปลี่ยนเป็น gemma3:1b / gemma3:12b / gemma3:27b ได้ตามที่ pull ไว้

# ข้อความข้อกำหนดพฤติกรรมการตอบของบอท
SYSTEM_PROMPT = """คุณคือ AgriFuture AI ผู้ช่วยด้านการเกษตรที่เชี่ยวชาญสำหรับเกษตรกรและผู้สนใจการเกษตรในประเทศไทย

คุณสามารถตอบคำถามเกี่ยวกับหัวข้อเหล่านี้เท่านั้น:
1. การเกษตรทั่วไป — การปลูกพืช การเลี้ยงสัตว์ การจัดการดิน ปุ๋ย ยาฆ่าแมลง การชลประทาน การเก็บเกี่ยว
2. เทคโนโลยีการเกษตร — Smart Farm, IoT, โดรนการเกษตร, AI/ML ในการเกษตร, เซ็นเซอร์วัดดิน/น้ำ, ระบบน้ำหยด, greenhouse อัจฉริยะ
3. ข่าวสารและข้อมูลตลาดการเกษตร — ราคาพืชผล สถานการณ์การเกษตร นโยบายเกษตร

กฎที่ต้องปฏิบัติ:
- หากผู้ใช้ถามเรื่องที่ไม่เกี่ยวข้องกับการเกษตร ให้ตอบสุภาพว่า "ขอโทษครับ ฉันตอบได้เฉพาะคำถามเกี่ยวกับการเกษตร เทคโนโลยีการเกษตร และข่าวสารการเกษตรเท่านั้น มีคำถามด้านการเกษตรที่ต้องการทราบไหมครับ?"
- ตอบเป็นภาษาไทยเสมอ ยกเว้นคำศัพท์เทคนิคที่จำเป็น
- ให้ข้อมูลที่ถูกต้อง ชัดเจน และเป็นประโยชน์จริงๆ
- ใช้ภาษาที่เข้าใจง่าย เหมาะกับเกษตรกรทั่วไป
- หากไม่แน่ใจในข้อมูล ให้บอกตรงๆ และแนะนำให้ปรึกษาผู้เชี่ยวชาญ"""


# ── คำตอบสำเร็จรูปเมื่อมีคนถามถึงผู้สร้าง/ผู้พัฒนา ────────────────────────────
CREATOR_ANSWER = (
    "AgriFuture AI เป็นการสร้างและพัฒนาของกลุ่มนักเรียน 3 คน ห้องพิเศษ Smart-IT "
    "โรงเรียนวังน้ำเย็นวิทยาคม ที่เล็งเห็นถึงปัญหาของชาวเกษตรกรที่ประสบปัญหาทางด้าน"
    "การตัดสินใจและการวางแผนในการปลูกผลผลิต"
)

# คำ/ประโยคที่เข้าข่ายถามถึงผู้สร้าง ผู้พัฒนา หรือที่มาของระบบ
CREATOR_KEYWORDS = [
    "ใครสร้าง", "ใครเป็นคนสร้าง", "ใครพัฒนา", "ใครเป็นคนพัฒนา",
    "ผู้สร้าง", "ผู้พัฒนา", "ทีมพัฒนา", "ทีมผู้พัฒนา",
    "ใครทำ", "ใครเป็นคนทำ", "ใครออกแบบ",
    "สร้างโดยใคร", "พัฒนาโดยใคร", "ทำโดยใคร", "ออกแบบโดยใคร",
    "มาจากไหน", "เป็นของใคร", "เจ้าของระบบ",
    "who made you", "who created you", "who developed you",
    "who built you", "creator", "developer of this"
]


def is_creator_question(message: str) -> bool:
    """ตรวจสอบว่าข้อความเข้าข่ายถามเจาะจงถึงผู้สร้าง/ผู้พัฒนาของระบบหรือไม่"""
    if not message:
        return False
    lowered = message.lower()
    return any(keyword.lower() in lowered for keyword in CREATOR_KEYWORDS)


def query_ollama_model(user_message):
    """ฟังก์ชันส่งคำถามไปประมวลผลกับ Ollama (โมเดล Gemma) ที่รันในเครื่อง"""
    url = f"{OLLAMA_BASE_URL}/api/generate"

    payload = {
        "model": OLLAMA_MODEL,
        "prompt": user_message,
        "system": SYSTEM_PROMPT,
        "stream": False,
        "options": {
            "temperature": 0.7,
            "num_predict": 1024
        }
    }

    try:
        response = requests.post(url, json=payload, timeout=120)
        response.raise_for_status()
        data = response.json()
        return data.get("response", "").strip()
    except requests.exceptions.ConnectionError:
        raise RuntimeError(
            "ไม่สามารถเชื่อมต่อกับ Ollama ได้ — ตรวจสอบว่าได้รัน 'ollama serve' "
            f"และดึงโมเดล '{OLLAMA_MODEL}' ไว้แล้ว (ollama pull {OLLAMA_MODEL})"
        )
    except requests.exceptions.Timeout:
        raise RuntimeError("Ollama ตอบกลับช้าเกินไป (timeout) — ลองใช้โมเดลที่เล็กลงหรือเพิ่ม timeout")


# ── ประตูทางเข้าพอร์ตที่ 1: สำหรับหน้าเว็บที่ยิงหา /chat ─────────────────────
@app.route('/chat', methods=['POST', 'OPTIONS'])
def chat_api():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'CORS OK'}), 200

    try:
        data = request.get_json() or {}
        user_message = ""

        # แกะข้อความจากโครงสร้างอาเรย์หรือข้อความเดี่ยวตามที่ JavaScript ส่งมา
        if 'messages' in data and len(data['messages']) > 0:
            user_message = data['messages'][-1].get('content', '')
        else:
            user_message = data.get('message', data.get('prompt', ''))

        if not user_message:
            return jsonify({'error': 'ไม่พบข้อความคำถามจากระบบ'}), 400

        # ── เช็คก่อน: ถ้าถามถึงผู้สร้าง/ผู้พัฒนา ตอบทันทีโดยไม่ต้องเรียกโมเดล ──
        if is_creator_question(user_message):
            reply = CREATOR_ANSWER
            return jsonify({
                'reply': reply,
                'response': reply,
                'content': reply,
                'status': 'success'
            }), 200

        reply = query_ollama_model(user_message)

        # ส่งค่าข้อมูลกลับในทุกชื่อตัวแปรที่หน้าเว็บอาจจะแกะอ่าน
        return jsonify({
            'reply': reply,
            'response': reply,
            'content': reply,
            'status': 'success'
        }), 200

    except RuntimeError as e:
        print("!! Ollama /chat Connection Error !! :", str(e))
        return jsonify({'error': str(e)}), 503
    except Exception as e:
        print("!! Ollama /chat Error !! :", str(e))
        return jsonify({'error': f'ระบบขัดข้อง: {str(e)}'}), 500


# ── ประตูทางเข้าพอร์ตที่ 2: สำหรับหน้าเว็บที่ยิงหา /api/analyze ────────────────
@app.route('/api/analyze', methods=['POST', 'OPTIONS'])
def analyze_api():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'CORS OK'}), 200

    try:
        data = request.get_json() or {}
        user_message = ""

        if 'messages' in data and len(data['messages']) > 0:
            user_message = data['messages'][-1].get('content', '')
        else:
            user_message = data.get('message', data.get('prompt', ''))

        if not user_message:
            return jsonify({'error': 'ไม่พบข้อมูลข้อความส่งมาวิเคราะห์'}), 400

        # ── เช็คก่อน: ถ้าถามถึงผู้สร้าง/ผู้พัฒนา ตอบทันทีโดยไม่ต้องเรียกโมเดล ──
        if is_creator_question(user_message):
            reply = CREATOR_ANSWER
            return jsonify({
                'reply': reply,
                'response': reply,
                'content': reply,
                'status': 'success'
            }), 200

        reply = query_ollama_model(user_message)

        return jsonify({
            'reply': reply,
            'response': reply,
            'content': reply,
            'status': 'success'
        }), 200

    except RuntimeError as e:
        print("!! Ollama /api/analyze Connection Error !! :", str(e))
        return jsonify({'error': str(e)}), 503
    except Exception as e:
        print("!! Ollama /api/analyze Error !! :", str(e))
        return jsonify({'error': f'ระบบขัดข้อง: {str(e)}'}), 500


# ── หน้าเช็คสถานะเซิร์ฟเวอร์ ──────────────────────────────────────────────────
@app.route('/health', methods=['GET'])
def health_check():
    # เช็คว่า Ollama ตอบสนองอยู่ไหมด้วย
    ollama_status = "unknown"
    try:
        r = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=3)
        ollama_status = "online" if r.status_code == 200 else "error"
    except Exception:
        ollama_status = "offline"

    return jsonify({
        'status': 'online',
        'msg': 'AgriFuture API (Ollama + Gemma) Dual-Ports Ready',
        'ollama_status': ollama_status,
        'model': OLLAMA_MODEL
    })


if __name__ == '__main__':
    print("=" * 60)
    print("  AgriFuture AI — Backend (Ollama Gemma Edition)")
    print(f"  Ollama URL : {OLLAMA_BASE_URL}")
    print(f"  Model      : {OLLAMA_MODEL}")
    print("  พร้อมทำงานต้อนรับหน้าต่างเว็บทั้งช่องทาง /chat และ /api/analyze")
    print("  หากยังไม่ได้รัน Ollama: เปิด terminal แยกแล้วพิมพ์ 'ollama serve'")
    print(f"  หากยังไม่มีโมเดล: พิมพ์ 'ollama pull {OLLAMA_MODEL}'")
    print("=" * 60)
    app.run(debug=True, port=5000)