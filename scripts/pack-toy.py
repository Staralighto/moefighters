"""Pack dist/ into the Bilibili toy zip.

BGM m4a is re-encoded to 64 kbps AAC, and portrait webp gets a second lossy pass,
only as zip entries. public/ and dist/ are left alone.
Run from the repo root: python -P scripts/pack-toy.py
"""
import hashlib
import json, os, re, subprocess, tempfile, zipfile

root, cap = "dist", 50 * 1024 * 1024
out = os.path.join("\u7d20\u6750", "moefighters-toy.zip")
# Listening check on 全速前进: 96k and 64k are acceptable, 48k is not.
TOY_BGM_BITRATE = "64k"
# Most aggressive libwebp quality. Alpha stays lossless so the cutout edge does not fringe.
TOY_PORTRAIT_Q = 1
PNG_WEBP = ("sprites/", "stages/", "avatars/", "finale/")

def encode_bgm(src, dst):
    subprocess.check_call([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", src,
        "-vn", "-c:a", "aac", "-b:a", TOY_BGM_BITRATE,
        "-movflags", "+faststart",
        dst,
    ])

def encode_portraits(jobs):
    # jobs: [[src, dst], ...]. One node process; sharp is already the project's webp encoder.
    script = (
        "import sharp from 'sharp'; import { readFileSync } from 'node:fs';"
        "const q = Number(process.env.TOY_PORTRAIT_Q);"
        "for (const [src, dst] of JSON.parse(readFileSync(0, 'utf8')))"
        " await sharp(src).webp({ quality: q, alphaQuality: 100, effort: 6, smartSubsample: true }).toFile(dst);"
    )
    env = os.environ.copy()
    env["TOY_PORTRAIT_Q"] = str(TOY_PORTRAIT_Q)
    subprocess.run(["node", "--input-type=module", "-e", script], input=json.dumps(jobs), text=True, env=env, check=True)

def file_stat(path):
    with open(path, "rb") as fh:
        data = fh.read()
    return os.path.getsize(path), hashlib.sha256(data).hexdigest()[:8]

def main():
    os.makedirs(os.path.dirname(out), exist_ok=True)
    html = open(os.path.join(root, "index.html"), encoding="utf-8").read()
    if re.findall(r"""(?:href|src)=["']/(?!/)""", html) or "./assets/" not in html:
        raise SystemExit("dist/index.html still has site-root urls")
    js = [n for n in os.listdir(os.path.join(root, "assets")) if n.endswith(".js")]
    bundle = "\n".join(open(os.path.join(root, "assets", n), encoding="utf-8").read() for n in js)
    # Code-split builds put assetUrl in one chunk and other slice(1) calls in another.
    start, ok = 0, False
    while True:
        i = bundle.find("slice(1)", start)
        if i < 0: break
        if "`./`" in bundle[max(0, i - 220):i + 40]:
            ok = True
            break
        start = i + 8
    if not ok:
        raise SystemExit("assetUrl default base is not ./")
    for needle in ("/fonts/ma-shan-zheng-kuji.woff2", "/bgm/garupa-pico-instrumental.m4a", "/sfx/ship-horn.mp3"):
        if needle not in bundle:
            raise SystemExit("missing " + needle)
    portraits = []
    for dp, _dirs, fns in os.walk(root):
        for f in fns:
            p = os.path.join(dp, f)
            rel = os.path.relpath(p, root).replace("\\", "/")
            if rel.startswith("portraits/") and rel.endswith(".webp"):
                portraits.append((p, rel))
    portrait_zip = {}
    portrait_from = portrait_to = 0
    tmp_dir = tempfile.mkdtemp()
    try:
        jobs = []
        for p, rel in portraits:
            dst = os.path.join(tmp_dir, rel.replace("/", "__"))
            jobs.append([p, dst])
            portrait_zip[rel] = dst
            portrait_from += os.path.getsize(p)
        if jobs:
            encode_portraits(jobs)
        rewritten = {}
        for rel, dst in portrait_zip.items():
            rewritten[rel] = file_stat(dst)
            portrait_to += rewritten[rel][0]
        n = dropped = 0
        bgm_from = bgm_to = 0
        with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as z:
            for dp, _dirs, fns in os.walk(root):
                for f in fns:
                    p = os.path.join(dp, f)
                    rel = os.path.relpath(p, root).replace("\\", "/")
                    if rel == "asset-manifest.json":
                        continue
                    if f.endswith(".png") and rel.startswith(PNG_WEBP) and os.path.exists(p[:-4] + ".webp"):
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
                            rewritten[rel] = file_stat(tmp)
                        finally:
                            os.remove(tmp)
                    elif rel in portrait_zip:
                        z.write(portrait_zip[rel], rel)
                    else:
                        z.write(p, rel)
                    n += 1
            # 设置 → 资源 lists sizes from this file, and public/sw.js keeps a cached copy only while its hash matches.
            # The zip is what Toy serves, so rewritten bgm and portraits replace size and hash. The ?v= query stays:
            # that is the URL the game already asks for.
            mp = os.path.join(root, "asset-manifest.json")
            if os.path.exists(mp):
                manifest = json.load(open(mp, encoding="utf-8"))
                def apply(entries):
                    out_entries = []
                    for entry in entries:
                        base = entry[0].split("?", 1)[0]
                        out_entries.append([entry[0], *rewritten[base]] if base in rewritten else entry)
                    return out_entries
                manifest["files"] = apply(manifest.get("files") or [])
                manifest["extra"] = apply(manifest.get("extra") or [])
                blob = json.dumps([manifest["files"], manifest["extra"]], separators=(",", ":"))
                manifest["build"] = hashlib.sha256(blob.encode()).hexdigest()[:10]
                z.writestr("asset-manifest.json", json.dumps(manifest, separators=(",", ":")))
                n += 1
            names = set(z.namelist())
    finally:
        for name in os.listdir(tmp_dir):
            os.remove(os.path.join(tmp_dir, name))
        os.rmdir(tmp_dir)
    if "index.html" not in names or any(name.startswith(("/", "dist/")) for name in names):
        raise SystemExit("zip layout")
    if any(name.endswith(".png") and name[:-4] + ".webp" in names and name.startswith(PNG_WEBP) for name in names):
        raise SystemExit("png with webp still packed")
    if any(name.startswith("finale/") and name.endswith(".png") for name in names):
        raise SystemExit("finale png packed")
    size = os.path.getsize(out)
    if size >= cap:
        raise SystemExit("over 50MiB: " + str(size))
    print(n, dropped, size, bgm_from, bgm_to, portrait_from, portrait_to)

if __name__ == "__main__":
    main()
