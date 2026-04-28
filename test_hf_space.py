import requests
import json

HF_URL = "https://lewis23-finetunnedswat-dcnn.hf.space"

test_images = [
    "https://picsum.photos/seed/leaf/400/400",
    "https://images.unsplash.com/photo-1587883012610-e3df17d41270?w=400",
]

print("\n=== HF Space Health Check ===")
try:
    r = requests.get(HF_URL, timeout=30)
    print(f"GET /  →  {r.status_code}")
    print(json.dumps(r.json(), indent=2))
except Exception as e:
    print(f"Error: {e}")

print("\n=== /verify (model summaries) ===")
try:
    r = requests.get(f"{HF_URL}/verify", timeout=30)
    print(f"GET /verify  →  {r.status_code}")
    print(json.dumps(r.json(), indent=2))
except Exception as e:
    print(f"Error: {e}")

print("\n=== /predict endpoint test ===")
for img_url in test_images:
    print(f"\nImage: {img_url}")
    try:
        r = requests.post(
            f"{HF_URL}/predict",
            json={"image_url": img_url},
            timeout=60,
        )
        print(f"Status : {r.status_code}")
        print(f"Raw    : {r.text}")
    except Exception as e:
        print(f"Error  : {type(e).__name__}: {e}")
