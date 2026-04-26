"""WhatsApp OTP delivery via Dailymails automate API."""
import os
import httpx

WHATSAPP_API_URL = "https://automate.dailymails.org/api/v1/send/whatsapp/template/message/"
WHATSAPP_API_KEY = os.environ["WHATSAPP_API_KEY"]
PHONE_NUMBER_ID  = os.environ["WHATSAPP_PHONE_NUMBER_ID"]


def send_otp(phone: str, otp: str) -> None:
    """
    Send OTP to phone in E.164 format (e.g. '+919876543210').
    Raises RuntimeError on non-2xx API response.
    """
    payload = {
        "to_mobile": phone,
        "template_name": "otp_template",
        "language_code": "en_US",
        "phone_number_id": PHONE_NUMBER_ID,
        "components": [
            {
                "type": "body",
                "parameters": [{"type": "text", "text": otp}],
            },
            {
                "type": "button",
                "sub_type": "url",
                "index": "0",
                "parameters": [{"type": "text", "text": otp}],
            },
        ],
    }
    headers = {"APIKEY": WHATSAPP_API_KEY, "Content-Type": "application/json"}
    with httpx.Client(timeout=10.0) as client:
        resp = client.post(WHATSAPP_API_URL, json=payload, headers=headers)
    if not resp.is_success:
        raise RuntimeError(f"WhatsApp API error {resp.status_code}: {resp.text[:200]}")
