# Siesta — AI garment image generator (local tool, nothing leaves your PC except Gemini)

Tick products → the tool opens Gemini in a real browser window, pastes a
ready-made studio prompt built from each product's **gender + name + colour**,
generates the photo, and downloads it to `Gen image/downloads/` as
`product-<id>-<name>-<colour>.png`. **You then upload it manually in
Admin → Products.** Nothing is ever auto-uploaded or auto-attached.

## One-time setup (5 minutes)

```powershell
cd "S:\STUDY MATERIALS\Projects\Siesta\Gen image"
pip install -r requirements.txt
playwright install chromium
```

(If you already have Google Chrome, you can skip the second line.)

## Every time you generate

1. `python gen.py` (from this folder — backend optional).
2. Fill **Add product** (ID optional, Name / Gender dropdown / Colour) →
   **+ Add to list**, repeat per garment. (Or **Load from store** to pull
   the live catalog when `npm start` is running.)
3. Leave **“Use my open Chrome”** ticked. One-time Chrome setup (do this
   before the first run, then never again):
   - Close **every** Chrome window completely.
   - Press **Win+R**, paste, Enter:
     `"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222`
   - In that Chrome, open **gemini.google.com** and log in.
   - Leave this Chrome running whenever you generate.
4. **Tick** what to generate (✕ removes a row), click
   **✨ Generate selected images**. The tool drives your open Chrome —
   Gemini is already signed in, nothing to log into.
5. Finished PNGs land in `Gen image\downloads\` → upload manually in Admin.

(Prefer the old way? Pick **“Separate tool browser”** — it keeps its own
login in `.profile/` instead.)

## If Gemini's website changes and a button can't be found

The error message tells you which step failed. Selectors live at the top of
`gen.py` (`NEW_CHAT`, `PROMPT_BOX`, `SEND_BUTTON`, …): press F12 in the
browser, right-click the button → Inspect → copy a stable selector
(`aria-label` ones survive longest) and add it to the list.

## Honest limits

- One image at a time with a few seconds between — hammering generation
  gets rate-limited, free or not.
- Keep the browser window visible (minimised is OK).
- Check every image before uploading: AI sometimes invents buttons, extra
  sleeves, or garbled logo text. Regenerate duds.
- `python gen.py --self-test` re-checks prompt + filename logic any time.
