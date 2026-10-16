"""Pack dist/ into the Bilibili toy zip.

BGM m4a is re-encoded to 64 kbps AAC only as a zip entry. public/ and dist/ are left alone.
Run from the repo root: python -P scripts/pack-toy.py
"""
import os, re, subprocess, tempfile, zipfile

root, cap = "dist", 50 * 1024 * 1024
out = os.path.join("\u7d20\u6750", "moefighters-toy.zip")
# Listening check on 全速前進: 96k and 64k are acceptable, 48k is not.
TOY_BGM_BITRATE = "64k"

def encode_bgm(src, dst):
    subprocess.check_call([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", src,
        "-vn", "-c:a", "aac", "-b:a", TOY_BGM_BITRATE,
        "-movflags", "+faststart",
        dst,
    ])

def main():
    os.makedirs(os.path.dirname(out), exist_ok=True)
    html = open(os.path.join(root, "index.html"), encoding="utf-8").read()
    if re.findall(r"""(?:href|src)=["']/(?!/)""", html) or "./assets/" not in html:
        raise SystemExit("dist/index.html still has site-root urls")
    js = [n for n in os.listdir(os.path.join(root, "assets")) if n.endswith(".js")]
    bundle = open(os.path.join(root, "assets", js[0]), encoding="utf-8").read()
    i = bundle.find("slice(1)")
    if i < 0 or "`./`" not in bundle[max(0, i - 220):i + 40]:
        raise SystemExit("assetUrl default base is not ./")
    for needle in ("/fonts/ma-shan-zheng-kuji.woff2", "/bgm/garupa-pico-instrumental.m4a", "/sfx/ship-horn.mp3"):
        if needle not in bundle:
            raise SystemExit("missing " + needle)
    n = dropped = 0
    bgm_from = bgm_to = 0
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for dp, _dirs, fns in os.walk(root):
            for f in fns:
                p = os.path.join(dp, f)
                rel = os.path.relpath(p, root).replace("\\", "/")
                if f.endswith(".png") and (rel.startswith("sprites/") or rel.startswith("stages/")) and os.path.exists(p[:-4] + ".webp"):
                    dropped += 1
                    continue
                if rel.startswith("bgm/") and rel.endswith(".m4a"):
                    # ponytail: always re-encodes, so a master already at 64k takes another lossy pass.
                    fd, tmp = tempfile.mkstemp(suffix=".m4a")
                    os.close(fd)
                    try:
                        encode_bgm(p, tmp)
                        z.write(tmp, rel)
                        bgm_from += os.path.getsize(p)
                        bgm_to += os.path.getsize(tmp)
                    finally:
                        os.remove(tmp)
                else:
                    z.write(p, rel)
                n += 1
        names = set(z.namelist())
    if "index.html" not in names or any(name.startswith(("/", "dist/")) for name in names):
        raise SystemExit("zip layout")
    if any(name.endswith(".png") and name[:-4] + ".webp" in names and (name.startswith("sprites/") or name.startswith("stages/")) for name in names):
        raise SystemExit("png with webp still packed")
    size = os.path.getsize(out)
    if size >= cap:
        raise SystemExit("over 50MiB: " + str(size))
    print(n, dropped, size, bgm_from, bgm_to)

if __name__ == "__main__":
    main()
