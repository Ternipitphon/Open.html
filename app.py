import os
import json
import time
from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__)

# อนุญาต CORS สำหรับทุกโดเมนและรองรับ Content-Type: application/json ข้ามโดเมนได้ 100%
CORS(app, resources={r"/api/*": {"origins": "*"}})

# กำหนด API Key ของ Gemini
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))

# ฟังก์ชันช่วยลองใหม่หากติด Rate Limit (429) ด้วยวิธี Exponential Backoff
def generate_content_with_retry(model, prompt, retries=5, backoff_in_seconds=2):
    for i in range(retries):
        try:
            return model.generate_content(prompt)
        except Exception as e:
            if "429" in str(e) and i < retries - 1:
                # เพิ่มระยะเวลาดีเลย์ขึ้นทีละเท่าตัว
                time.sleep(backoff_in_seconds * (2 ** i))
                continue
            raise e

@app.route('/api/analyze', methods=['POST'])
def analyze_crop():
    try:
        data = request.json
        if not data:
            return jsonify({"success": False, "error": "[AgriFuture-Backend] ไม่พบข้อมูลที่ส่งมาจากหน้าบ้าน (Body ว่างเปล่า)"}), 400
        
        # ดึงข้อมูลจาก JSON ที่ส่งมาจากหน้าบ้าน
        province        = data.get('province', '')
        district        = data.get('district', '')
        budget          = data.get('budget', '')
        area            = data.get('area', '')
        water_source    = data.get('water_source', '')
        planting_month  = data.get('planting_month', '')
        interested_crop = data.get('interested_crop', '')

        # ตรวจสอบว่ามีข้อมูลพืชที่สนใจส่งมาวิเคราะห์หรือไม่ (ป้องกัน Error 400 จากเงื่อนไขคีย์ว่าง)
        if not interested_crop:
            return jsonify({"success": False, "error": "[AgriFuture-Backend] ไม่พบข้อมูลชื่อพืชที่สนใจส่งมาวิเคราะห์"}), 400

        # ตรวจสอบความถูกต้องของ API Key
        if not os.environ.get("GEMINI_API_KEY"):
            return jsonify({"success": False, "error": "[AgriFuture-Backend] ไม่พบ GEMINI_API_KEY กรุณาตั้งค่าในไฟล์ .env"}), 500

        # ประกอบ Prompt ส่งให้ AI พร้อมกำหนดสเปค JSON ที่ต้องการอย่างละเอียด
        prompt = f"""
คุณคือ AI ผู้เชี่ยวชาญด้านการเกษตรอัจฉริยะ (AgriFuture AI)
จงวิเคราะห์ความเหมาะสมในการปลูกพืชตามข้อมูลของผู้ใช้ต่อไปนี้ด้วยความรอบคอบสูงสุด:
- พืชที่สนใจปลูก: {interested_crop}
- พื้นที่แปลงปลูก: อำเภอ {district} จังหวัด {province} (ขนาดพื้นที่: {area})
- งบประมาณเริ่มต้นที่ตั้งไว้: {budget} บาท
- แหล่งน้ำที่สามารถเข้าถึงได้: {water_source}
- ช่วงเวลาที่จะเริ่มทำการปลูก: เดือน {planting_month}

จงประเมินความเป็นไปได้เชิงวิชาการเกษตรและการคาดการณ์สภาวะตลาด และตอบกลับมาเป็นรูปแบบโครงสร้าง JSON ภาษาไทยเท่านั้น ห้ามมีคำอธิบายอื่นนอกเหนือจาก JSON โครงสร้างต้องตรงตามรูปแบบตัวอย่างนี้เป๊ะๆ:
{{
  "selected_crop": {{
    "name": "{interested_crop}",
    "success_chance": "สูง หรือ ปานกลาง หรือ ต่ำ",
    "success_percent": 85,
    "estimated_income": "80,000 - 120,000",
    "roi_months": "6 - 8",
    "pros": ["ระบุข้อดีเกษตรกรรม/การตลาดของพืชนี้ตัวเลือกที่ 1", "ระบุข้อดีตัวเลือกที่ 2"],
    "cons": ["ระบุปัจจัยเสี่ยง/ปัญหาของพืชนี้ตัวเลือกที่ 1", "ระบุปัจจัยเสี่ยงตัวเลือกที่ 2"],
    "tips": ["เคล็ดลับการปลูกให้ได้ผลผลิตดีสำหรับมือใหม่ 1", "เคล็ดลับที่ 2"]
  }},
  "alternative_crops": [
    {{
      "name": "ชื่อพืชทางเลือกแนะนำชนิดที่ 1",
      "success_percent": 90,
      "success_chance": "สูง",
      "difficulty": "ง่าย",
      "market_trend": "เติบโตสูง",
      "estimated_income": "100,000",
      "roi_months": "5",
      "reason": "อธิบายเหตุผลว่าทำไมพืชชนิดนี้ถึงเหมาะสมกับทรัพยากรของเขาในพื้นที่นี้"
    }}
  ],
  "monthly_crops": {{
    "มกราคม": {{ "crop": "พืชราคาดีที่ควรปลูกเดือนนี้", "note": "เหตุผลประกอบทางเศรษฐศาสตร์" }},
    "กุมภาพันธ์": {{ "crop": "พืชราคาดีที่ควรปลูกเดือนนี้", "note": "เหตุผลประกอบทางเศรษฐศาสตร์" }},
    "มีนาคม": {{ "crop": "พืชราคาดีที่ควรปลูกเดือนนี้", "note": "เหตุผลประกอบทางเศรษฐศาสตร์" }},
    "เมษายน": {{ "crop": "พืชราคาดีที่ควรปลูกเดือนนี้", "note": "เหตุผลประกอบทางเศรษฐศาสตร์" }},
    "พฤษภาคม": {{ "crop": "พืชราคาดีที่ควรปลูกเดือนนี้", "note": "เหตุผลประกอบทางเศรษฐศาสตร์" }},
    "มิถุนายน": {{ "crop": "พืชราคาดีที่ควรปลูกเดือนนี้", "note": "เหตุผลประกอบทางเศรษฐศาสตร์" }},
    "กรกฎาคม": {{ "crop": "พืชราคาดีที่ควรปลูกเดือนนี้", "note": "เหตุผลประกอบทางเศรษฐศาสตร์" }},
    "สิงหาคม": {{ "crop": "พืชราคาดีที่ควรปลูกเดือนนี้", "note": "เหตุผลประกอบทางเศรษฐศาสตร์" }},
    "กันยายน": {{ "crop": "พืชราคาดีที่ควรปลูกเดือนนี้", "note": "เหตุผลประกอบทางเศรษฐศาสตร์" }},
    "ตุลาคม": {{ "crop": "พืชราคาดีที่ควรปลูกเดือนนี้", "note": "เหตุผลประกอบทางเศรษฐศาสตร์" }},
    "พฤศจิกายน": {{ "crop": "พืชราคาดีที่ควรปลูกเดือนนี้", "note": "เหตุผลประกอบทางเศรษฐศาสตร์" }},
    "ธันวาคม": {{ "crop": "พืชราคาดีที่ควรปลูกเดือนนี้", "note": "เหตุผลประกอบทางเศรษฐศาสตร์" }}
  }},
  "general_advice": "บทสรุปเชิงลึกและคำแนะนำภาพรวมจากระบบ AI เพื่อความมั่นใจของเกษตรกร",
  "warning": "คำเตือนวิกฤตที่ต้องเฝ้าระวังเป็นพิเศษ เช่น โรคระบาดประจำพื้นที่ หรือช่วงแล้งวิกฤต ถ้าไม่มีให้ระบุเป็นสตริงว่าง"
}}
"""
        
        # เรียกใช้งานโมเดลล่าสุด gemini-2.5-flash
        model = genai.GenerativeModel(
            "gemini-2.5-flash",
            generation_config={
                "temperature": 0.15,
                "response_mime_type": "application/json"
            }
        )
        
        response = generate_content_with_retry(model, prompt)
        raw_text = response.text.strip()
        
        # ตรวจเช็คเพื่อความปลอดภัย หากมี Markdown backticks ห่อหุ้มมาให้ทำการถอดออก
        if raw_text.startswith("```json"):
            raw_text = raw_text.split("```json")[1].split("```")[0].strip()
        elif raw_text.startswith("```"):
            raw_text = raw_text.split("```")[1].split("```")[0].strip()
            
        ai_result = json.loads(raw_text)
        return jsonify({
            "success": True, 
            "data": ai_result,
            "backend_signature": "AgriFuture-Gemini-v2"
        })

    except json.JSONDecodeError as e:
        return jsonify({
            "success": False, 
            "error": f"[AgriFuture-Backend] AI ประมวลผลข้อมูลกลับมาคลาดเคลื่อนจากโครงสร้างมาตรฐาน: {str(e)}"
        }), 500
    except Exception as e:
        return jsonify({
            "success": False, 
            "error": f"[AgriFuture-Backend] ระบบเกิดข้อผิดพลาดในการประมวลผล: {str(e)}"
        }), 500

if __name__ == '__main__':
    # เปลี่ยนย้าย Port รันหนีระบบ Chatbot เก่าที่ขวางพอร์ตอยู่ เพื่อตัดปัญหาพอร์ตทับซ้อนกัน 100%
    app.run(host='0.0.0.0', port=5001, debug=True)