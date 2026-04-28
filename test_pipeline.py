import requests
import json

HF_URL = "https://lewis23-finetunnedswat-dcnn.hf.space"

TEST_IMAGE = "https://images.unsplash.com/photo-1587883012610-e3df17d41270?w=400"

print("=" * 60)
print("  End-to-End Pipeline Test — Stage 1 > Stage 2 > Stage 3")
print("=" * 60)
print(f"  Image: {TEST_IMAGE}\n")

r = requests.post(f"{HF_URL}/predict-debug", json={"image_url": TEST_IMAGE}, timeout=120)
data = r.json()

cascade = data.get("cascade", {})
final   = data.get("final", {})

for stage_key in ["stage1", "stage2", "stage3"]:
    if stage_key not in cascade:
        print(f"[{stage_key.upper()}]  Not reached (cascade stopped earlier)\n")
        continue

    s = cascade[stage_key]
    print(f"[{stage_key.upper()}]")
    print(f"  Prediction : {s['prediction']}")
    print(f"  Confidence : {s['confidence']:.4f} ({s['confidence']*100:.1f}%)")
    print(f"  All probs  : {json.dumps(s['all_probs'])}")
    print(f"  Decision   : {s['decision']}")
    print()

print("=" * 60)
print("  FINAL RESULT")
print("=" * 60)
print(f"  stage1     : {final.get('stage1')}")
print(f"  stage2     : {final.get('stage2')}")
print(f"  stage3     : {final.get('stage3')}")
print(f"  confidence : {final.get('confidence')}")
print("=" * 60)
