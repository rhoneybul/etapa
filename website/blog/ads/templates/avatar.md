# Avatar Video Ad — {{POST_TITLE}}

**Slug:** {{SLUG}}
**Format:** AI Avatar Reel — 9:16, ≤ 45s
**Maps to:** the "Quick check-in" avatar flow (AI avatar + Script + Media + Generate).

---

## 1. AI avatar (tool form: AI avatar → See all)

- **Recommended avatar:** {{AVATAR_NAME}} — {{AVATAR_WHY}}
- Backup avatar: {{AVATAR_BACKUP}}

The tool shows the avatar's built-in image set (usually 3–4 images of the presenter). The "Media" panel asks for up to 7 images total — you need to supply the remaining 4 from the Etapa brand kit.

---

## 2. Media (tool form: Media → Upload ≥ 4 more images)

Upload these **four brand-kit images** (in this order — the order matters, because the tool uses them as B-roll in sequence with the script):

1. `{{MEDIA_1}}` — {{MEDIA_1_REASON}}
2. `{{MEDIA_2}}` — {{MEDIA_2_REASON}}
3. `{{MEDIA_3}}` — {{MEDIA_3_REASON}}
4. `{{MEDIA_4}}` — {{MEDIA_4_REASON}}

All four live in `website/blog/ads/_library/` — see `brand-assets-guide.md` for filenames.

**Do NOT use stock photos of cyclists here.** The Etapa aesthetic for avatar Reels is: avatar talks to camera, B-roll cuts to on-brand typographic cards (black + pink squiggle + headline). Clean, confident, unmistakably Etapa.

---

## 2b. Asset-picker fields (shown when uploading each Media image)

When you upload any of the four brand-kit PNGs, the tool opens the same "Select an image from your assets" picker used elsewhere — it asks *What are you going to advertise?* and *Add a few more details*. These only need to be filled once per upload (the assets then sit in your library and can be picked without re-answering), but if you're starting fresh, use:

### Form field: "What are you going to advertise?"

> {{WHAT_TO_ADVERTISE_ONE_LINER}}

### Form field: "Add a few more details"

> {{DETAILS_BLOCK}}

---

## 3. Script (tool form: Script — 700 char max, aim 480–600)

> {{SCRIPT}}

**Character count target:** {{CHAR_COUNT}} (stay under 700 or the tool truncates).

**Opening line requirement:** avatar introduces themselves as AI in the first sentence — e.g. *"Hi, I'm {{AVATAR_NAME}}, Etapa's AI coach."* Non-negotiable — AI transparency is a brand pillar.

**Closing line requirement:** single-sentence CTA pointing to the blog post — e.g. *"Full guide's on our blog — link in bio."*

---

## 4. On-creative spec

- **AI chip (required, bottom-left, 24px margin):** `Made with AI · Etapa`, same spec as image/UGC ads.
- **Lower-third wordmark (subtle):** small `Etapa` top-left throughout, Poppins SemiBold, 14px equivalent, white.
- **B-roll cadence:** cut to a brand-kit image roughly every 8–10s (matches the natural beats in the script).
- **End frame:** last 2s — black, pink squiggle centre, CTA text `{{CTA}}`.

---

## 5. Instagram caption (for the post itself)

> {{CAPTION}}

---

## 6. Destination link

- Blog URL + UTM: `{{UTM_URL}}`
