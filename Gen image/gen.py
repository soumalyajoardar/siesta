#!/usr/bin/env python3
"""
Siesta AI garment-image generator (local automation, no pushing anywhere).

Workflow
  1. python gen.py                  -> tick products -> Generate
  2. A real Chrome window opens Gemini; the tool pastes a ready-made prompt
     (auto-built from each product's gender + name + colour) and sends it.
  3. The finished image is downloaded to  Gen image/downloads/
     as  product-<id>-<name>-<colour>.png
  4. YOU upload it manually in Admin -> Products (nothing is auto-uploaded).

First-time setup
  pip install -r requirements.txt
  playwright install chromium        (skip if you have Google Chrome installed)

  On the very first run the browser asks you to log in to Google by hand.
  The login is remembered in  Gen image/.profile/  (never committed).

Notes
  - Gemini's website changes from time to time. If a step can't find its
    button, update the SELECTORS below (use F12 in the browser to inspect).
  - Keep the browser window visible while generating (minimised is fine,
    fully headless logins get blocked more often).
  - Test everything except the live browser with:  python gen.py --self-test
"""

import json
import os
import re
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(HERE, "downloads")
PROFILE_DIR = os.path.join(HERE, ".profile")
STORE_API = "http://localhost:3000/api/products"  # `npm start` must run for auto product list

# --------------------------------------------------------------------------
# Gemini web-UI map. First selector that matches wins (UI drifts over time).
# --------------------------------------------------------------------------
GEMINI_URL = "https://gemini.google.com/app"
NEW_CHAT = [
    'a[aria-label="New chat"]',
    'button[aria-label="New chat"]',
    'a[href="/app"]',
]
PROMPT_BOX = [
    'div[role="textbox"]',
    'div.ql-editor[contenteditable="true"]',
    'textarea',
]
SEND_BUTTON = [
    'button[aria-label="Send"]',
    'button[aria-label="Send message"]',
    'button.send-button',
]
GENERATED_IMG = [
    'img[src*="googleusercontent"]',
    'message-content img',
    'img[alt*="Generated"]',
]
DOWNLOAD_BUTTON = [
    'button[aria-label="Download full size"]',
    'button[aria-label="Download"]',
]
STEP_TIMEOUT_MS = 30000
SETTLE_SECONDS_AFTER_SEND = 4

# Attach to your own open Chrome (Gemini already signed in there).
# Chrome must be launched once with:  chrome.exe --remote-debugging-port=9222
CDP_URL = "http://127.0.0.1:9222"

# --------------------------------------------------------------------------
# Prompt construction (same studio standard for every garment)
# --------------------------------------------------------------------------
GENDER_WORD = {"men": "Male", "women": "Female", "unisex": "Unisex"}


def build_prompt(gender, name, color):
    """Final Gemini prompt. Raises ValueError naming any missing field."""
    g = GENDER_WORD.get(str(gender or "").strip().lower(), "")
    if not g:
        raise ValueError("Cannot generate image: Gender is missing (expected men, women or unisex).")
    cloth = str(name or "").strip()
    if not cloth:
        raise ValueError("Cannot generate image: Clothing Name is missing.")
    col = str(color or "").strip()
    if not col:
        raise ValueError("Cannot generate image: Clothing Color is missing.")
    paras = [
        f"Create one hyper-realistic professional fashion photograph of a {g} adult model posing naturally for a premium commercial clothing campaign, wearing {cloth} in {col}.",
        "The image should look like a genuine photograph from a high-end professional fashion/e-commerce studio shoot, captured with a professional full-frame camera.",
        "The model should have a natural, confident, relaxed pose that clearly showcases the fit, silhouette, fabric, sleeves, collar, and overall appearance of the clothing. Keep the pose stylish but understated and suitable for a premium clothing brand.",
        "Use a slightly close-up portrait composition, 4:5 aspect ratio, with the clothing filling most of the frame while maintaining comfortable margins.",
        "Background: seamless warm off-white studio background, approximately #F1ECE3\u2013#EFE9DD. Clean, minimal, and distraction-free.",
        "Lighting: soft, diffused, daylight-balanced professional studio lighting with gentle fill from both sides. Natural skin tones, realistic fabric texture, accurate clothing color, and very soft shadows.",
        f"The clothing must look physically real, with authentic fabric texture, stitching, folds, seams, and natural draping. Accurately preserve {col} without changing its hue or saturation.",
        "Add a subtle \u201cSiesta\u201d logo naturally onto the clothing as if it is genuinely printed or embroidered on the garment.",
        "No props, no furniture, no scenery, no additional people, no promotional graphics, no sale badges, no watermark, no text other than the Siesta logo, and no artificial/CGI appearance.",
        "Style: premium, minimal, modern, photorealistic, sophisticated commercial fashion photography.",
        "Maintain the same camera angle, framing, lighting, background, model positioning, and overall photography style so this prompt can be reused consistently across an entire clothing catalog.",
    ]
    prompt = "\n\n".join(paras)
    if "[GENDER]" in prompt or "[CLOTH NAME]" in prompt or "[CLOTH COLOR]" in prompt:
        raise ValueError("Prompt construction failed: unreplaced placeholder remains.")
    return prompt


def sanitize_filename(product_id, name, color):
    """product-<id>-<name>-<colour>.png with filesystem-safe characters."""
    def clean(s):
        s = re.sub(r"[^a-z0-9]+", "-", str(s or "").lower()).strip("-")
        return s[:40]
    parts = [p for p in (clean(product_id), clean(name), clean(color)) if p]
    base = "-".join(parts)[:100] or "product"
    return f"product-{base}.png" if not base.startswith("product-") else f"{base}.png"


def first_color(product):
    colors = product.get("colors") or []
    if colors and isinstance(colors[0], dict):
        return colors[0].get("name", "")
    return str(colors[0]) if colors else ""


def fetch_store_products():
    """Product list from the running Siesta backend (falls back to [])."""
    try:
        with urllib.request.urlopen(STORE_API, timeout=8) as r:
            data = json.loads(r.read().decode("utf-8"))
        if isinstance(data, list) and data:
            return data
    except Exception:
        pass
    return []


# --------------------------------------------------------------------------
# Browser automation (Playwright). Imported lazily so --self-test works
# without the dependency installed.
# --------------------------------------------------------------------------
def first_match(page, selectors, timeout=STEP_TIMEOUT_MS):
    last_err = None
    for sel in selectors:
        try:
            el = page.locator(sel).first
            el.wait_for(state="visible", timeout=min(timeout, 8000))
            return el
        except Exception as e:  # noqa: BLE001 - try next selector
            last_err = e
    raise RuntimeError(f"Gemini UI changed? None of {selectors} appeared ({last_err})")


def generate_one(page, product, log):
    gender = product.get("gender", "")
    name = product.get("name", "")
    color = first_color(product)
    prompt = build_prompt(gender, name, color)  # validates fields first
    log(f"--- {name} ({color}) ---")

    page.goto(GEMINI_URL, wait_until="domcontentloaded")
    try:
        first_match(page, NEW_CHAT, timeout=10000).click()
        page.wait_for_timeout(1500)
    except Exception:
        pass  # already in a fresh chat; continue

    box = first_match(page, PROMPT_BOX)
    box.click()
    # Paste via clipboard-safe fill in chunks (huge prompts can lag typing).
    box.fill(prompt)
    page.wait_for_timeout(800)
    first_match(page, SEND_BUTTON).click()
    log("prompt sent, waiting for the image…")
    page.wait_for_timeout(SETTLE_SECONDS_AFTER_SEND * 1000)

    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    filename = sanitize_filename(product.get("id", ""), name, color)
    dest = os.path.join(DOWNLOAD_DIR, filename)

    # Path 1: official download button -> browser download event.
    try:
        with page.expect_download(timeout=120000) as dl_info:
            first_match(page, DOWNLOAD_BUTTON, timeout=90000).click()
        download = dl_info.value
        download.save_as(dest)
        log(f"downloaded -> {filename}")
        return dest
    except Exception as e:  # noqa: BLE001 - fall through to image-src grab
        log(f"download button not usable ({e}); trying image source…")

    # Path 2: grab the rendered <img> bytes directly.
    img = first_match(page, GENERATED_IMG, timeout=60000)
    src = img.get_attribute("src") or ""
    if not src.startswith("http"):
        raise RuntimeError("Generated image has no downloadable source.")
    req = urllib.request.Request(src, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        f.write(r.read())
    log(f"downloaded -> {filename}")
    return dest


def run_browser(products, log, use_open_chrome=True):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise SystemExit("Playwright is missing. Run:  pip install -r requirements.txt")
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    with sync_playwright() as pw:
        close_when_done = True
        if use_open_chrome:
            browser, page = attach_open_chrome(pw, log)
            close_when_done = False  # never close the user's own browser
        else:
            try:
                browser = pw.chromium.launch_persistent_context(
                    user_data_dir=PROFILE_DIR,
                    headless=False,
                    args=["--disable-blink-features=AutomationControlled"],
                )
            except Exception as e:  # noqa: BLE001
                raise SystemExit(
                    "Could not start the browser. Run `playwright install chromium` once, "
                    f"or install Google Chrome. ({e})"
                )
            page = browser.pages[0] if browser.pages else browser.new_page()
        ok, failed = 0, []
        for i, p in enumerate(products, 1):
            try:
                log(f"[{i}/{len(products)}]")
                generate_one(page, p, log)
                ok += 1
                time.sleep(3)  # gentle pacing between generations
            except Exception as e:  # noqa: BLE001 - continue with the rest
                log(f"FAILED {p.get('name')}: {e}")
                failed.append(p.get("name", "?"))
        try:
            if close_when_done:
                browser.close()
        except Exception:
            pass
    return ok, failed


def attach_open_chrome(pw, log):
    """Hook into the user's already-running Chrome (signed-in Gemini)."""
    try:
        browser = pw.chromium.connect_over_cdp(CDP_URL, timeout=10000)
    except Exception:
        raise SystemExit(
            "Couldn't find your open Chrome.\n\n"
            "One-time setup:\n"
            "1. Close EVERY Chrome window completely.\n"
            "2. Press Win+R, paste this, Enter:\n"
            '   \"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe\"'
            " --remote-debugging-port=9222\n"
            "3. In that Chrome, open gemini.google.com and log in.\n"
            "4. Come back here and Generate again.\n\n"
            "(Browsers other than Chrome, or Chrome started normally, cannot be attached to.)"
        )
    ctxs = browser.contexts
    if not ctxs:
        raise SystemExit("Your Chrome has no usable tabs. Open any page and try again.")
    ctx = ctxs[0]
    for pg in ctx.pages:
        try:
            if "gemini.google.com" in (pg.url or ""):
                log("attached to your Chrome (found Gemini tab).")
                pg.bring_to_front()
                return browser, pg
        except Exception:
            pass
    log("attached to your Chrome (opening Gemini in a new tab).")
    return browser, ctx.new_page()


# --------------------------------------------------------------------------
# Tiny picker GUI (tkinter, stdlib only)
# --------------------------------------------------------------------------
def run_gui():
    import tkinter as tk
    from tkinter import messagebox, scrolledtext

    root = tk.Tk()
    root.title("Siesta — AI garment images")
    root.geometry("660x620")

    tk.Label(root, text="Add products below, tick them, then Generate. Images land in Gen image\\downloads\\.",
             font=("Segoe UI", 10, "bold")).pack(pady=8)

    # ---- Add-product form ----
    form = tk.LabelFrame(root, text="Add product", padx=8, pady=8)
    form.pack(fill="x", padx=10)
    tk.Label(form, text="Product ID").grid(row=0, column=0, sticky="w")
    tk.Label(form, text="Name *").grid(row=0, column=1, sticky="w")
    tk.Label(form, text="Gender *").grid(row=0, column=2, sticky="w")
    tk.Label(form, text="Colour *").grid(row=0, column=3, sticky="w")
    e_id = tk.Entry(form, width=14)
    e_id.insert(0, "tee-1")
    e_name = tk.Entry(form, width=26)
    e_name.insert(0, "Oversized T-Shirt")
    gender_var = tk.StringVar(value="men")
    e_gender = tk.OptionMenu(form, gender_var, "men", "women", "unisex")
    e_color = tk.Entry(form, width=16)
    e_color.insert(0, "Black")
    e_id.grid(row=1, column=0, padx=2)
    e_name.grid(row=1, column=1, padx=2)
    e_gender.grid(row=1, column=2, padx=2)
    e_color.grid(row=1, column=3, padx=2)

    # ---- Tick-to-generate queue ----
    tk.Label(root, text="Queue — tick what to generate:",
             font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=12, pady=(6, 0))
    list_frame = tk.Frame(root)
    list_frame.pack(fill="both", expand=True, padx=10)
    canvas = tk.Canvas(list_frame)
    scroll = tk.Scrollbar(list_frame, orient="vertical", command=canvas.yview)
    inner = tk.Frame(canvas)
    inner.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
    canvas.create_window((0, 0), window=inner, anchor="nw")
    canvas.configure(yscrollcommand=scroll.set)
    canvas.pack(side="left", fill="both", expand=True)
    scroll.pack(side="right", fill="y")

    checks = []

    def row_text(p):
        return f"{p.get('name', '?')}  ·  {p.get('gender', '?')}  ·  {first_color(p)}"

    def add_row(p, ticked=True):
        row = tk.Frame(inner)
        row.pack(fill="x", padx=2, pady=1)
        var = tk.BooleanVar(value=ticked)
        tk.Checkbutton(row, text=row_text(p), variable=var, anchor="w",
                       justify="left", wraplength=520).pack(side="left", fill="x", expand=True)

        def remove():
            row.destroy()
            for i, (v, q) in enumerate(checks):
                if q is p:
                    checks.pop(i)
                    break

        tk.Button(row, text="✕", fg="red", command=remove).pack(side="right")
        checks.append((var, p))

    def on_add():
        name, color = e_name.get().strip(), e_color.get().strip()
        if not name or not color:
            messagebox.showwarning("Missing details", "Name and Colour are required.")
            return
        add_row({"id": e_id.get().strip() or "manual", "name": name,
                 "gender": gender_var.get(), "colors": [{"name": color}]})
        e_name.delete(0, tk.END)
        e_color.delete(0, tk.END)

    tk.Button(form, text="+ Add to list", command=on_add).grid(row=1, column=4, padx=6)

    def on_load_store():
        found = fetch_store_products()
        if not found:
            messagebox.showinfo("Store empty/offline",
                                "Start the backend (`npm start`) to pull the catalog, or add products by hand.")
            return
        for p in found:
            add_row(p)
        log(f"Loaded {len(found)} products from the store.")

    tk.Button(form, text="Load from store", command=on_load_store).grid(row=0, column=4, padx=6)

    log_box = scrolledtext.ScrolledText(root, height=9, state="disabled")
    log_box.pack(fill="x", padx=10, pady=4)

    def log(msg):
        log_box.configure(state="normal")
        log_box.insert("end", msg + "\n")
        log_box.see("end")
        log_box.configure(state="disabled")
        root.update_idletasks()

    def on_generate():
        picked = [p for var, p in checks if var.get()]
        if not picked:
            messagebox.showwarning("Nothing ticked", "Tick at least one garment first.")
            return
        btn.configure(state="disabled")
        try:
            ok, failed = run_browser(picked, log, use_open_chrome=(mode_var.get() == "open"))
            summary = f"Done: {ok} downloaded to downloads\\. "
            summary += ("Failed: " + ", ".join(failed)) if failed else "Upload them manually in Admin → Products."
            messagebox.showinfo("Finished", summary)
        except SystemExit as e:
            messagebox.showerror("Cannot start", str(e))
        except Exception as e:  # noqa: BLE001
            messagebox.showerror("Error", str(e))
        finally:
            btn.configure(state="normal")

    mode_frame = tk.Frame(root)
    mode_frame.pack(pady=(2, 0))
    mode_var = tk.StringVar(value="open")
    tk.Radiobutton(mode_frame, text="Use my open Chrome (Gemini signed in)",
                   variable=mode_var, value="open").pack(side="left", padx=8)
    tk.Radiobutton(mode_frame, text="Separate tool browser",
                   variable=mode_var, value="profile").pack(side="left", padx=8)
    btn = tk.Button(root, text="✨ Generate selected images", font=("Segoe UI", 11, "bold"),
                    bg="#1A3C34", fg="white", padx=10, pady=6, command=on_generate)
    btn.pack(pady=8)
    root.mainloop()


# --------------------------------------------------------------------------
def self_test():
    p = build_prompt("men", "Oversized T-Shirt", "Black")
    assert "Male adult model" in p and "wearing Oversized T-Shirt in Black." in p
    assert "Accurately preserve Black " in p
    assert "[GENDER]" not in p and "[CLOTH NAME]" not in p and "[CLOTH COLOR]" not in p
    assert "Variables" not in p.split("\n\n")[0]
    assert "Female adult model" in build_prompt("women", "Tee", "Red")
    assert "Unisex adult model" in build_prompt("unisex", "Tee", "Red")
    for args, field in [({"gender": "", "name": "T", "color": "R"}, "Gender"),
                        ({"gender": "men", "name": " ", "color": "R"}, "Clothing Name"),
                        ({"gender": "men", "name": "T", "color": ""}, "Clothing Color")]:
        try:
            build_prompt(**args)
            raise AssertionError("should have raised for " + field)
        except ValueError as e:
            assert field in str(e), str(e)
    f = sanitize_filename("tee-1", "Oversized T-Shirt / Black!", "Jet Black (New)")
    assert f.endswith(".png") and "/" not in f and "\\" not in f and " " not in f, f
    print("sample filename:", f)
    assert sanitize_filename("a", "b", "c") == "product-a-b-c.png"
    print("12 self-tests passed (browser part needs `pip install playwright` + live Gemini).")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        self_test()
    else:
        run_gui()
