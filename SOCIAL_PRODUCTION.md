# Etapa — Social Asset Production Guide

Companion to `SOCIAL_STRATEGY.md`. This doc covers:

1. Where to store everything
2. How to make the video clips (fastest path)
3. Copy-paste prompts to generate every visual asset via Claude
4. A per-post asset checklist

---

## 1. Where to store it all

**All assets live in Google Drive.** The repo only holds the two strategy docs (this file and `SOCIAL_STRATEGY.md`). Everything else — source video, clips, tiles, carousels, photos — lives in Drive so you can access it from your phone when scheduling posts, and so the repo doesn't bloat with binary files.

### Setup (one-time, ~10 min)

1. **Install Google Drive for Desktop** ([download](https://www.google.com/drive/download/)). This creates a local mount at:
   - Mac: `~/Library/CloudStorage/GoogleDrive-<your@gmail>/My Drive/`
   - Windows: `G:\My Drive\`
   - Linux: use [rclone](https://rclone.org/drive/) as a substitute if needed

2. In Drive, create a top-level folder called **`Etapa Social`**. Everything below goes inside it.

3. Set Drive for Desktop to "Stream files" (not mirror) unless you want 5GB of video locally. The ffmpeg script still reads streamed files fine — they're fetched on access.

### Drive folder structure

Create this inside `Etapa Social/`:

```
Etapa Social/
├── 00-source/
│   ├── hello-etapa.mov           ← the founder video raw
│   └── hello-etapa.srt           ← subtitles (generated once, reused)
├── 01-clips/
│   ├── C01_75_25_ride.mp4        ← finished reel, ready to post
│   ├── C02_childlike.mp4
│   └── ... (C01 through C18)
├── 02-brand-tiles/
│   ├── W01_mon_quote.png
│   ├── W03_fri_unlock.png
│   └── ...
├── 03-carousels/
│   ├── W01_wed_arrival/          ← one folder per carousel post
│   │   ├── slide_1.png
│   │   └── slide_2.png
│   └── W04_wed_partner/
│       └── ...
├── 04-app-mockups/
│   ├── home_screen.png
│   ├── coach_chat.png
│   └── ...
├── 05-photos/
│   ├── ride_01_richmond.jpg
│   ├── kit_flatlay.jpg
│   └── ...
├── 06-stories/
│   └── W02_fri_building.png
├── 07-outros/
│   ├── outro.png                 ← the launching-july card
│   └── outro.mp4                 ← 0.25s version for concatenation
├── captions.gdoc                 ← Google Doc (see below)
└── scheduling-tracker.gsheet     ← Google Sheet (optional)
```

The `00-`, `01-`, `02-` prefixes are there so Drive sorts the folders in workflow order, not alphabetically.

### Two things to create as native Google files (not PNGs)

- **`captions.gdoc`** — paste all 40 post captions into a single Google Doc, headed by their W-codes. Mobile-friendly. When scheduling on phone, just tap into the doc, find the heading, long-press to copy.
- **`scheduling-tracker.gsheet`** — columns: W-code, date, platform, status (draft / scheduled / posted), link, notes. Populate as you go. Also works on phone. Optional — only do this if you want accountability.

### Naming convention

Every asset filename starts with the post code from the strategy doc. So `W04-Mon`'s reel becomes `C15_birthday.mp4` (stored in clips) and any tile becomes `W04_mon_quote.png` (stored in brand-tiles). On a Monday morning with half a coffee, you can filter the Drive by `W04_` and see every asset for that week's posts.

### What the repo keeps

Only `SOCIAL_STRATEGY.md`, `SOCIAL_PRODUCTION.md`, and `cut-clips.sh` live in the repo. Everything else is in Drive. This means:
- The docs stay version-controlled and open from your editor.
- Binary assets don't bloat git history.
- Your phone can see everything via the Drive app.
- Your laptop can see everything via the Drive for Desktop mount.

### Sharing

Right-click `Etapa Social/` in Drive → Share → anyone-with-link view-only. Keep the link in your notes. Future you will want to send it to a designer, a VA, or a cofounder in under 10 seconds.

---

## 2. Making the 18 video clips

You're a software engineer so we'll do this the fast way: ffmpeg script, one command, all 18 clips cut in about 3 minutes.

### Step 1 — Install ffmpeg (if not already)

```bash
brew install ffmpeg          # Mac
sudo apt install ffmpeg      # Linux
winget install ffmpeg        # Windows
```

### Step 2 — Get subtitles once

Clips need to be watchable with sound off, which means burned-in captions. Generate subtitles once from the source.

First, navigate to the Drive-synced folder. The path depends on your OS — set this once as a shell variable so the rest of the guide works copy-paste:

```bash
# Mac
export ETAPA_SOCIAL="$HOME/Library/CloudStorage/GoogleDrive-<your@gmail>/My Drive/Etapa Social"

# Windows (Git Bash / WSL)
export ETAPA_SOCIAL="/g/My Drive/Etapa Social"

# Then:
cd "$ETAPA_SOCIAL"
```

Add the `export` line to your `~/.zshrc` or `~/.bashrc` so it's always available.

Now generate the SRT:

```bash
# Install whisper
pip install openai-whisper

# Generate SRT for the whole video (takes ~5 min)
cd "$ETAPA_SOCIAL/00-source"
whisper hello-etapa.mov --model small --output_format srt --language en
# produces hello-etapa.srt in the same folder
```

Open the SRT in a text editor (VS Code works fine — Drive for Desktop makes it a regular file). Skim it. Fix the auto-transcription errors — I spotted these in your upload: "Girona" was mis-transcribed as "Toronto", "Etapa" as "a tapper", "Balham" as "Balam", "Paris-Roubaix" as "Par". Fix those once, you'll reuse the SRT across all 18 clips.

### Step 3 — Batch-cut all 18 clips

Save this as `cut-clips.sh` in the **repo root** (it's code, not an asset). It reads from Drive and writes back to Drive. Run it once and it'll output 18 vertical 9:16 reels with burned-in subtitles, ready to upload.

```bash
#!/bin/bash
# Etapa — cut 18 founder-video clips at 9:16 with subtitles
# Run from the repo root. Reads/writes to Drive via $ETAPA_SOCIAL.

if [ -z "$ETAPA_SOCIAL" ]; then
  echo "Set \$ETAPA_SOCIAL to your 'Etapa Social' Drive folder path first."
  exit 1
fi

SRC="$ETAPA_SOCIAL/00-source/hello-etapa.mov"
SRT="$ETAPA_SOCIAL/00-source/hello-etapa.srt"
OUT="$ETAPA_SOCIAL/01-clips"
mkdir -p "$OUT"

# Clip definitions: filename | start | end
# (start/end in HH:MM:SS format)
clips=(
  "C01_75_25_ride|00:00:02|00:00:55"
  "C02_childlike|00:00:55|00:01:43"
  "C03_not_a_cyclist|00:02:02|00:02:16"
  "C04_marrakesh|00:03:41|00:04:39"
  "C05_lycra|00:04:43|00:05:18"
  "C06_whatever_weather|00:06:31|00:06:59"
  "C07_shorts_uk|00:07:21|00:08:09"
  "C08_second_pizza|00:08:09|00:08:48"
  "C09_friends_cycling|00:09:02|00:09:17"
  "C10_devon|00:09:47|00:10:01"
  "C11_france_pizza|00:10:22|00:11:18"
  "C12_unlock_so_much|00:11:27|00:12:03"
  "C13_running_vs_cycling|00:12:03|00:12:54"
  "C14_couch_to_5k|00:13:05|00:13:17"
  "C15_birthday|00:14:11|00:14:51"
  "C16_built_with_ai|00:15:28|00:16:31"
  "C17_what_etapa_does|00:16:31|00:17:20"
  "C18_anything_for_anyone|00:18:25|00:19:01"
)

for clip in "${clips[@]}"; do
  IFS='|' read -r name start end <<< "$clip"
  echo "Cutting $name.mp4 from $start to $end"

  ffmpeg -y -ss "$start" -to "$end" -i "$SRC" \
    -vf "crop=ih*9/16:ih,scale=1080:1920,subtitles='$SRT':force_style='FontName=Poppins,FontSize=16,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,Outline=2,BackColour=&H80000000&,BorderStyle=4,Alignment=2,MarginV=140'" \
    -c:v libx264 -preset fast -crf 20 \
    -c:a aac -b:a 192k \
    -movflags +faststart \
    "$OUT/$name.mp4"
done

echo "Done. 18 clips in $OUT/"
```

Make it executable and run:

```bash
chmod +x cut-clips.sh
./cut-clips.sh
```

Output: 18 × 9:16 mp4s at 1080×1920, subtitles burned in, about 3 minutes total. Ready to upload to Instagram.

### Step 4 — Add the Etapa outro (one-time)

Every clip should end with a 0.25s flash of the Etapa logo + "Launching July. etapa.cc". Make this outro once:

```bash
# Save as add-outros.sh in the repo root. Uses $ETAPA_SOCIAL.
# Once you have 07-outros/outro.png (1080x1920), run this:

IN="$ETAPA_SOCIAL/01-clips"
OUT="$ETAPA_SOCIAL/01-clips-final"
OUTRO_IMG="$ETAPA_SOCIAL/07-outros/outro.png"
OUTRO_VID="$ETAPA_SOCIAL/07-outros/outro.mp4"
mkdir -p "$OUT"

# Convert outro.png to 0.25s video once
ffmpeg -y -loop 1 -i "$OUTRO_IMG" -t 0.25 -vf "scale=1080:1920" \
  -c:v libx264 -pix_fmt yuv420p "$OUTRO_VID"

# Concat outro onto every clip
for f in "$IN"/*.mp4; do
  base=$(basename "$f" .mp4)
  ffmpeg -y -f concat -safe 0 \
    -i <(printf "file '%s'\nfile '%s'\n" "$f" "$OUTRO_VID") \
    -c copy "$OUT/${base}.mp4"
done
```

If this gets fiddly, honestly — **CapCut** will let you drag all 18 clips in, add the outro card to each, tweak subtitles visually, and export in about 20 minutes. Free. On your phone or desktop. The ffmpeg route is for when you want to batch-reprocess later.

### Step 5 — Thumbnails (optional but recommended)

For IG Reels, the thumbnail matters. Take a screenshot of the most compelling frame from each clip (usually around the 2-second mark, face visible, interesting composition) and save as `C01_thumb.jpg` etc. Upload as the cover when you post.

---

## 3. Claude prompts for visual assets

These prompts are written to be pasted directly into Claude. Each one produces an HTML/CSS artifact you can open in a browser, then screenshot at 2x retina for Instagram quality.

**Canvas sizes:**
- IG feed post (4:5) → 1080 × 1350
- IG story / Reel cover (9:16) → 1080 × 1920
- IG square → 1080 × 1080

**Brand constants (bake into every prompt):**
- Background: `#000` or `#0a0a0a`
- Accent pink: `#E8458B`
- Text white: `#ffffff`
- Muted text: `#888`
- Font: Poppins (weights 300, 400, 500, 600, 700)
- Logo: use `./assets/etapa-logo.png` placeholder — swap for your real logo

### Prompt A — Brand quote tile (4:5, 1080×1350)

Use for: any post that's just a sentence on a pink/dark background (W3-Fri, W4-Fri, W10-Fri quotes, etc.)

```
Create an HTML artifact sized exactly 1080×1350 pixels (Instagram 4:5
portrait). Use the Etapa brand: background #0a0a0a, accent pink #E8458B,
font Poppins (load from Google Fonts).

Content:
- A centred quote in white, font-weight 600, font-size clamp(44px, 5vw, 64px),
  line-height 1.15, letter-spacing -0.5px. Quote text: "[PASTE QUOTE HERE]"
- Below the quote, a thin pink horizontal line, 40px wide.
- Below the line, "— Rob, Etapa" in muted grey #888, font-size 18px,
  font-weight 400.
- In the top-left corner with 48px padding, the Etapa logo as 32px-tall
  text: "Etapa" in white, font-weight 700, with a 6px pink square dot
  after the 'a'.
- In the bottom-right corner with 48px padding, "etapa.cc" in pink
  #E8458B, font-size 14px, font-weight 500, letter-spacing 1px,
  uppercase.

Centre the main quote both horizontally and vertically. Give it 80px
horizontal padding so it never touches the edges. No other elements.
Make it look calm, premium, Linear-esque, not flashy.
```

**Quotes to generate tiles for:**
- "A bike can unlock so much."
- "Missing a day is fine. Don't make it two."
- "Cycling can mean anything for anyone."
- "I enjoy cycling. I won't call myself a cyclist."
- "Most of my friends now are through cycling."
- "You need less kit than you think."
- "Couch to 5K. But for cycling."

### Prompt B — Carousel slide set (4:5, 5-7 slides)

Use for: W1-Wed arrival, W4-Wed partner, W8-Mon pricing, W9-Wed letter, W12-Mon reflection, etc.

```
Create an HTML artifact that renders a 5-slide Instagram carousel. Each
slide is exactly 1080×1350 pixels (4:5 portrait). Stack them vertically
in the artifact with a 40px black gap between slides so I can scroll
through and screenshot each one individually.

Brand: background #0a0a0a, accent pink #E8458B, font Poppins, white text.

Slide 1 (COVER):
- Big headline centered: "[SLIDE 1 HEADLINE]"
- Font: Poppins 700, 72px, line-height 1.1, letter-spacing -1px
- Below: small pink pill badge containing "[CATEGORY]" e.g. "BEHIND ETAPA"
- Bottom-right: "etapa.cc" in pink, 14px uppercase

Slides 2-4 (CONTENT):
- Top-left: thin "X / 5" counter in muted grey #666, 14px
- Centred body text: "[SLIDE N TEXT]"
- Font: Poppins 500, 44px, line-height 1.3, max-width 80%
- Bottom-right: "etapa.cc" in pink small

Slide 5 (CTA):
- Centered: "Launching July." (Poppins 700, 64px)
- Below: "Register interest at" (muted 22px)
- Below: "etapa.cc" (pink 48px, 700)
- Small Etapa wordmark top-left

Content for this carousel:
- Slide 1: [PASTE]
- Slide 2: [PASTE]
- Slide 3: [PASTE]
- Slide 4: [PASTE]
- Slide 5: [keep standard CTA]

Make the typography breathe. 120px padding on all sides unless specified.
No drop shadows. No gradients. Clean and confident.
```

**Feed this in with content from the calendar, e.g. for W4-Wed (partner):**
- Slide 1: "The moment Etapa started existing."
- Slide 2: "Halfway up a hill, she said: 'I know what I want for my birthday.'"
- Slide 3: "It was a bike."
- Slide 4: "We've been riding together ever since."
- Slide 5: standard CTA

### Prompt C — App mockup on device frame (4:5)

Use for: W5-Wed how-it-works carousel slides, W10 retention content, W5-Mon first-look reel cover.

```
Create an HTML artifact sized 1080×1350, background #0a0a0a.

Render an iPhone 15 Pro device mockup, dark titanium, centred on the
canvas. Use pure HTML/CSS (no images) for the phone frame: black rounded
rectangle with thin grey bezels, dynamic island cutout at the top, subtle
drop shadow. Frame height: 1000px, width proportional.

Inside the phone screen, render this Etapa app UI mockup:
- Status bar at top (black, 9:41, full signal)
- Below status bar: 24px padding
- Title: "Today" (Poppins 700, 40px, white)
- Subtitle: "Week 3 of 12" (Poppins 400, 14px, muted grey)
- A big card (rounded 20px, background #111, padding 24px):
  - Small pink eyebrow: "ZONE 2 ENDURANCE"
  - Card headline (Poppins 600, 24px white): "45-minute steady ride"
  - One line body (Poppins 400, 14px muted): "A conversational pace.
    You should be able to talk."
  - Pink pill button bottom-right: "Start ride"
- Below: 3 smaller cards for "Rest of the week" — just skeletons with
  rounded bars in different widths.
- Bottom tab bar: 4 icons (Home, Plan, Coach, Profile)

Around the phone, top-left of the full canvas: "Etapa" wordmark in white
700 weight. Bottom-right: "etapa.cc" pink uppercase 14px.

Everything should look premium. This is a mockup screenshot of a real app.
```

**Variants to generate:**
- Home screen (above)
- Coach chat (show a 3-message exchange, muted user messages, pink coach replies)
- Week view (7 day pills, two ticked)
- Plan overview (5 phases visible as rows)
- Coach picker (6 personas as cards)

### Prompt D — Logo lockups (SVG)

Use for: brand tiles, outro card, anywhere you need the Etapa logo.

```
Create an SVG artifact of the Etapa wordmark, 4 variants on a single page.

Base mark:
- "Etapa" in Poppins 700 (or a similar geometric sans), kerned tight
- After the final 'a', a pink square dot (#E8458B), size equal to the
  x-height of the lowercase letters, positioned baseline-aligned with
  6px of space before it
- Export as SVG with fonts converted to paths so it works anywhere

Variant 1 (primary): White text on black 400×120 canvas
Variant 2 (inverse): Black text on white 400×120 canvas
Variant 3 (square): 200×200, pink dot becomes 48px below the wordmark,
  centred layout, for use as a profile avatar
Variant 4 (stacked small): 80×80, just the "E" + pink dot, for favicons
  and tiny contexts
```

### Prompt E — "Launching July" outro card (9:16, 1080×1920)

Use for: outro on every video clip.

```
Create an HTML artifact sized 1080×1920. Background #0a0a0a.

Centered vertically:
- Etapa wordmark in white Poppins 700, 120px, with pink dot after the 'a'
- 60px gap
- "Launching July" in Poppins 400, 48px, muted grey #888
- 120px gap
- "etapa.cc" in pink #E8458B, Poppins 600, 56px, uppercase, letter-spacing 4px

Nothing else. Leave the top and bottom thirds empty. Calm, confident.
```

Export as PNG, use as the outro frame in every reel.

### Prompt F — "Meet the coaches" card (4:5)

Use for: W6-Mon carousel.

```
Create an HTML artifact, 1080×1350, for an Instagram carousel slide
introducing one of the 6 Etapa AI coaches.

Content: coach name [NAME], personality line [ONE LINE].

Layout:
- Background #0a0a0a
- Left half: a circular avatar placeholder (pink gradient #E8458B to
  #F472B6, 400px diameter) with the coach's initial in white Poppins 700
  at 200px
- Right half: stacked vertical:
  - Tiny pink eyebrow: "COACH"
  - Coach name in white Poppins 700, 56px, line-height 1
  - Below: one-line personality in muted white #bbb, Poppins 400, 22px,
    line-height 1.4, max-width 90%
  - Below that, small pill badges for their vibe: e.g. "WARM",
    "BEGINNER-FRIENDLY" in dark pills with pink borders
- Bottom-right corner: "etapa.cc"

6 slides total, one per coach. Generate all 6 on the same page, stacked.

Coach data:
1. Clara Moreno — Warm, patient, encouraging. (Beginner pick.)
2. Sophie Laurent — Science-backed, no fluff. (Beginner pick.)
3. Elena Vasquez — Race-day strategist.
4. Lars Eriksen — No-nonsense and direct.
5. Matteo Rossi — Chill but focused.
6. Tom Bridges — Casual riding buddy.
```

### Prompt G — Pricing tile carousel (4:5)

Use for: W8-Mon pricing reveal.

```
Create an HTML artifact, 5 slides × 1080×1350.

Brand: #0a0a0a, pink #E8458B, Poppins.

Slide 1: "Etapa pricing." Big headline centered, 88px Poppins 700.
  Subtitle below: "Pick what fits." muted 22px.

Slide 2 (Starter):
  - Eyebrow: "STARTER — BEGINNER PICK"
  - Big price: "£14.99" Poppins 700 120px pink
  - "one-time, 3 months access" muted 24px
  - Two lines of benefits as bullets with pink dot bullets

Slides 3, 4, 5: same structure for Monthly (£7.99/mo), Annual (£49.99,
"best value"), Lifetime (£99.99, "launch only, gone in July").

Each slide: "etapa.cc" bottom-right. Keep it clean. No shadows.
```

### Prompt H — IG Story frames (9:16, 1080×1920)

Use for: W2-Fri building story, W6-Fri app demo, launch week daily stories.

```
Create 5 HTML artifacts, each 1080×1920, forming an IG story sequence.

Brand: #0a0a0a background, pink #E8458B, Poppins.

Frame 1: Title "Building Etapa today" (Poppins 700, 88px, centred,
  pink coffee cup emoji beside it) — leave top third for story UI.

Frame 2: "[SCREENSHOT OR PLACEHOLDER]" — a rectangular placeholder
  representing a Figma screenshot, 80% width, centred.

Frame 3: Big quote: "The hardest part is naming things." Poppins 500
  64px, white, centred, line-height 1.2.

Frame 4: Small Etapa logo top, then "Register your interest" 48px white,
  then a dotted rectangle representing a "swipe up" link sticker placeholder.

Frame 5: "etapa.cc" huge centered, pink.

Leave 400px of top padding and 300px of bottom padding on every frame
(stories have UI chrome eating these zones).
```

---

## 4. Per-post asset checklist (quick reference)

Given a post from the calendar, what do you need to produce? This table maps every post to its prompt(s) and video clip(s).

| Post | Format | Video clip | Prompt(s) | Photo needed |
|------|--------|------------|-----------|--------------|
| W1-Mon | Reel | C01 + C18 stitched | E (outro) | — |
| W1-Wed | Carousel | — | B (5 slides) | — |
| W1-Fri | Reel | C03 | E (outro) | — |
| W2-Mon | Reel | C04 | E (outro) | — |
| W2-Wed | Carousel | — | B (6 slides) | Rob on bike |
| W2-Fri | Story | — | H (5 frames) | Laptop/coffee candid |
| W3-Mon | Reel | C13 | E (outro) | — |
| W3-Wed | Reel | C08 | E (outro) | Pizza photo |
| W3-Fri | Static | — | A (quote: "A bike can unlock so much") | — |
| W3-Sat | Tweet | — | — | — |
| W4-Mon | Reel | C15 | E (outro) | — |
| W4-Wed | Carousel | — | B (7 slides) | Girlfriend's bike |
| W4-Fri | Reel | C05 | E (outro) | — |
| W5-Mon | Reel | — | C (home screen mockup) | — |
| W5-Wed | Carousel | — | C (6 app screen variants) | — |
| W5-Fri | Reel | C14 | C (beginner programme) | — |
| W6-Mon | Carousel | — | F (6 coach cards) | — |
| W6-Wed | Reel | C09 | E (outro) | Group ride photo |
| W6-Fri | Story | — | H (app demo 8 frames) | — |
| W7-Mon | Reel | C11 | E (outro) | France trip photos |
| W7-Wed | Static | — | A (quote: testimonial or "Soon") | — |
| W7-Fri | Reel | C10 | E (outro) | Devon ride photo |
| W7-Sun | Reel | C16 | E (outro) | — |
| W8-Mon | Carousel | — | G (pricing 5 slides) | — |
| W8-Wed | Reel | C17 | C (app screens) | — |
| W8-Fri | Reel | — | A (dad/Marrakesh quote) | Kit flatlay |
| W9-Mon | Reel | C02+C12+C14 mix | E (countdown outro) | — |
| W9-Wed | Carousel | — | B (6 slides, founder letter) | — |
| W9-Fri | Reel | — | C (app in motion) | — |
| W10-Mon | Reel | C18 recut | E ("LIVE NOW" outro) | — |
| W10-Mon | Stories | — | H (launch day 10+ frames) | Throughout the day |
| W10-Wed | Reel | — | C (coach chat mockup) | — |
| W10-Fri | Carousel | — | A × 5 (testimonials) | — |
| W11-Mon | Reel | C07 | E (outro) | Kit photo |
| W11-Wed | Reel | — | — | User's ride screenshot |
| W11-Fri | Reel | C15 recut short | E (outro) | — |
| W12-Mon | Carousel | — | B (7 slides, 3-months review) | — |
| W12-Wed | Reel | C12 | — | Montage: Girona/Devon/France |
| W12-Fri | Reel | C11 | — | Mallorca/Traka photos |

Approximate totals: **18 clips (one-time), 9 carousels, 10 single brand/app tiles, 3 story sequences, 12 photos.**

---

## 5. Workflow for a normal week

Sunday night, 45 minutes, at your laptop (with Drive for Desktop running):

1. Open `SOCIAL_STRATEGY.md`, find the coming week (e.g. W4).
2. Open the `Etapa Social` Drive folder in a Finder/Explorer window beside it.
3. For each post that week:
   - Identify the video clip — it's already cut in `01-clips-final/`. Done.
   - If there's a prompt needed, open a new Claude conversation, paste the relevant prompt template, fill in the content. Screenshot the artifact at 2x retina. Save directly to `02-brand-tiles/` or `03-carousels/W04_wed_partner/` with the W-code naming. Drive syncs it automatically — it'll be on your phone within a minute.
   - Copy the caption from `captions.gdoc` in Drive (or paste from the strategy doc) into your scheduling tool.
4. Schedule the week in Meta Business Suite (free) or Later or Buffer — upload directly from the Drive app if scheduling from mobile, or from the local Drive mount on desktop.
5. Post stories live during the week — those are never pre-scheduled. Capture them on your phone, drop into `06-stories/` afterwards for the archive.

Batch the prompt work. Don't do one prompt per day — do all 4 of a week's prompts in one 20-minute Claude session on Sunday. You'll be faster and stay in brand voice.

### Mobile-only fallback

If you're travelling and need to schedule from a phone:
- Captions: open `captions.gdoc` in the Drive app, long-press to copy
- Assets: open the Drive app, navigate to `01-clips-final/`, tap to download, share to Instagram
- Scheduling: Meta Business Suite has a fully functional iOS/Android app
- New assets: skip Claude on mobile — just post the pre-generated stuff and do tile generation on Sunday at a laptop

---

## 6. Tool stack (recommended)

| Need | Free tool | Paid upgrade |
|------|-----------|--------------|
| Video editing | CapCut | Premiere Pro |
| Transcription | Whisper (local) | Descript |
| Scheduling | Meta Business Suite | Later / Buffer |
| Asset creation | Claude + screenshots | Figma |
| Analytics | IG Insights + Plausible | Not For Rent |
| Photo editing | Phone native | Lightroom |
| Paid ads | Meta Ads Manager | — |

Total monthly cost with just the free stack: **£0**. Total time to make all 18 clips + 30 static assets if you batch: **one long Saturday**.

---

## 7. One thing to do first

This week, before anything else:

1. Install Google Drive for Desktop. Create the `Etapa Social/` folder and the subfolder structure from Section 1.
2. Set `$ETAPA_SOCIAL` in your shell config and `source ~/.zshrc` (or open a new terminal).
3. Copy the founder video into `Etapa Social/00-source/hello-etapa.mov` (drag it from Finder into the Drive mount).
4. Run Whisper once, get the SRT into `00-source/`, fix the transcription errors (Girona, Etapa, Balham, Paris-Roubaix).
5. Save `cut-clips.sh` in the repo root, `chmod +x cut-clips.sh`, run it. 18 clips land in `01-clips/` in Drive.
6. Open Claude, paste Prompt E (outro card), screenshot to `07-outros/outro.png`.
7. Run `add-outros.sh`, get final clips in `01-clips-final/`.
8. Open the Drive app on your phone, find `C01_75_25_ride.mp4`, post it as your Week 1 Monday reel.

Everything else compounds from there.

— End —
