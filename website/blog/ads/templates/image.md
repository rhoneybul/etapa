# Image Ad — {{POST_TITLE}}

**Slug:** {{SLUG}}
**Format:** AI Image Ad — static 9:16
**Filename when ingested to tool:** this doc maps 1:1 to the "Select an image from your assets" + main ad form

---

## 1. Assets to attach (tool form: Image + Reference)

**Image (required) — recommended:**

- {{IMAGE_PICK}}
- File path in repo: `{{IMAGE_FILE_PATH}}`
- Why this, not a stock photo: {{IMAGE_REASON}}

**Reference (optional) — recommended:**

- {{REFERENCE_PICK}}
- File path in repo: `{{REFERENCE_FILE_PATH}}`
- Why: style-anchor so the model holds the Etapa aesthetic (black bg, pink squiggle, Poppins headline, small wordmark top-left, AI chip bottom-left).

---

## 2. Form field: "What are you going to advertise?"

> {{WHAT_TO_ADVERTISE_ONE_LINER}}

---

## 3. Form field: "Add a few more details"

> {{DETAILS_BLOCK}}

---

## 4. Form field: "Idea" (optional, on the main ad screen)

> {{IDEA_BLOCK}}

---

## 5. Other main-form settings

- Brand DNA toggle: **ON**
- Aspect ratio: **9:16**
- Model: **Nano Banana 2**
- Outputs: **1**

---

## 6. On-creative spec (what the model should produce)

- **Headline (Poppins SemiBold 600, white):** `{{HEADLINE}}`
- **Sub-headline (Poppins Light 300, mid-grey #A0A0A8):** `{{SUBHEAD}}`
- **Accent:** single pink squiggle `#E8458B` as the hero graphic (from brand kit), OR thin maglia rosa underline under the headline.
- **Wordmark:** small `Etapa` top-left, Poppins SemiBold 14px equivalent, white.
- **AI chip (required, bottom-left, 24px margin):** `Made with AI · Etapa`, Poppins Medium, uppercase, 0.8 letter-spacing, #E8458B on 70%-opacity black pill.
- **CTA text (optional, footer):** `{{CTA}}`
- **Background:** true black `#000000` — no photographic background.

---

## 7. Instagram caption (for the post itself)

> {{CAPTION}}

---

## 8. Destination link

- Blog URL + UTM: `{{UTM_URL}}`
