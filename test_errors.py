import requests
import json

HF_URL  = "https://lewis23-finetunnedswat-dcnn.hf.space"
FLASK_URL = "https://thesis-mobile-app-v15u.onrender.com"

cases = [
    ("Missing image_url field",        {}),
    ("Empty image_url",                {"image_url": ""}),
    ("Unreachable URL",                {"image_url": "https://does-not-exist-xyz.com/img.jpg"}),
    ("URL that returns non-image",     {"image_url": "https://httpbin.org/json"}),
    ("Valid image (should succeed)",   {"image_url": "https://images.unsplash.com/photo-1587883012610-e3df17d41270?w=400"}),
]

print("=" * 65)
print("  HF Space /predict-debug — Error & Success Case Tests")
print("=" * 65)

for label, body in cases:
    print(f"\nCase: {label}")
    print(f"Body: {json.dumps(body)}")
    try:
        r = requests.post(
            f"{HF_URL}/predict-debug",
            json=body,
            timeout=60,
        )
        print(f"HTTP : {r.status_code}")
        try:
            print(f"JSON : {json.dumps(r.json(), indent=2)}")
        except Exception:
            print(f"RAW  : {r.text[:500]}")
    except Exception as e:
        print(f"CONN ERROR: {type(e).__name__}: {e}")
    print("-" * 65)

print("\n\n" + "=" * 65)
print("  Render Flask /analyze — Error Cases")
print("=" * 65)

analyze_cases = [
    ("Missing tree_id",           {"image_urls": ["a","b","c"]}),
    ("Fewer than 3 image URLs",   {"tree_id": "T-001", "image_urls": ["a","b"]}),
    ("Invalid image URLs",        {"tree_id": "T-001", "image_urls": [
        "https://does-not-exist-xyz.com/1.jpg",
        "https://does-not-exist-xyz.com/2.jpg",
        "https://does-not-exist-xyz.com/3.jpg",
    ]}),
]

for label, body in analyze_cases:
    print(f"\nCase: {label}")
    print(f"Body: {json.dumps(body)}")
    try:
        r = requests.post(
            f"{FLASK_URL}/analyze",
            json=body,
            timeout=60,
        )
        print(f"HTTP : {r.status_code}")
        try:
            print(f"JSON : {json.dumps(r.json(), indent=2)}")
        except Exception:
            print(f"RAW  : {r.text[:500]}")
    except Exception as e:
        print(f"CONN ERROR: {type(e).__name__}: {e}")
    print("-" * 65)
