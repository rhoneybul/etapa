# UGC-style Video — {{POST_TITLE}}

**Slug:** {{SLUG}}
**Format:** UGC-style Reel — 9:16, ≤ 30s
**Maps to:** the "Ready to roll? Let's create your first UGC-style video" flow (Create start image → Set up video → Post).

---

## 0. Preset (shown before Step 1)

The tool opens with a *Select a preset* screen. Pick:

- **{{PRESET}}** — {{PRESET_WHY}}

Never use *Fashion try-on* or *Product showcase* (neither applies — no physical product or clothing). Use *Digital demo* only when a brief explicitly asks for an app-screen tour.

---

## 1. Step 1 — Create start image

The tool needs **Image + Reference + Avatar** to build the start frame. When you add the Image, the "Select an image from your assets" picker also asks for *What are you going to advertise?* and *Add a few more details* — those fields are in section 1b below.

**Image — recommended:**

- {{IMAGE_PICK}}
- File path: `{{IMAGE_FILE_PATH}}`
- Why: {{IMAGE_REASON}}

**Reference — recommended:**

- {{REFERENCE_PICK}}
- File path: `{{REFERENCE_FILE_PATH}}`
- Why: {{REFERENCE_REASON}}

**Avatar — recommended:**

- **{{AVATAR_NAME}}** — {{AVATAR_WHY}}
- Backup avatar if above unavailable: {{AVATAR_BACKUP}}

---

## 1b. Asset-picker fields (shown when adding the Image)

### Form field: "What are you going to advertise?"

> {{WHAT_TO_ADVERTISE_ONE_LINER}}

### Form field: "Add a few more details"

> {{DETAILS_BLOCK}}

---

## 1c. Prompt (optional) — for the start image

On the Step 1 screen, under the three Assets tiles, the tool shows a *Prompt (optional)* box (0/5000). This describes the scene the tool composites — where the avatar is, what they're wearing, how they're posed. It influences the start image only; the script drives what they say in the video.

> {{START_IMAGE_PROMPT}}

Keep it to 1–2 short paragraphs. Mention: setting, lighting, wardrobe, pose, emotion. Stay on-brand: no lycra, no clutter, no fake "motivational" signage in shot.

---

## 2. Step 2 — Video Settings

The tool's Video Settings modal has two tabs: **General** (script, audio, prompt, model, duration) and **Captions** (toggle, colour, position). Both matter.

### General tab

**Script — two versions, pick by budget/duration:**

*Short — 8-second single generation (default, ~250 credits):*

> {{SHORT_SCRIPT}}

*Extended — 25–30s via ~3 stitched generations (~750 credits):*

> {{LONG_SCRIPT}}

Character limit is 1000. Kling 3.0 Pro produces ~8s per generation; longer videos require multiple generations stitched together outside the tool (or by using the extend feature if enabled).

**Generate script button:** do NOT use — the scripts above are tone-tested.

**Audio — do NOT leave on Auto:**

- Voice: **Natural**
- Emotion: **{{EMOTION}}**
- Accent: **{{ACCENT}}**

**Prompt (optional) toggle:** leave OFF. Section 1c already set the start-image scene, and this second prompt would pull motion/setting away from it.

**Model:** Kling 3.0 Pro
**Resolution:** 1080p
**Duration:** `8s` for the short script; extend if using the long script.

### Captions tab

- **Captions toggle:** ON (80%+ of Instagram Reel viewers watch on mute — non-negotiable).
- **Highlight color:** the **pink/rosa swatch** (second colour from the left in the swatch row — the one closest to Etapa's `#E8458B`). This is the ONE place maglia rosa gets to do work on the creative, given the rest of the frame is dictated by the avatar.
- **Position:** bottom (standard Reel caption placement — the AI chip lives bottom-left, so captions should sit bottom-centre, clear of it).

---

## 3. On-creative spec

- **Opening acknowledgment (required first line of script):** The avatar says out loud that they are AI. This is part of the Etapa brand promise, not a disclaimer to hide.
- **AI chip (required, bottom-left, 24px margin):** `Made with AI · Etapa`, same spec as image ads, on every frame.
- **End card (last ~2s):** true black frame, Etapa wordmark centred, pink squiggle below, CTA text `{{CTA}}`.
- **Captions:** handled by Captions tab above — burned-in by the tool, not added manually.

---

## 4. Instagram caption (for the post itself)

> {{CAPTION}}

---

## 5. Destination link

- Blog URL + UTM: `{{UTM_URL}}`
