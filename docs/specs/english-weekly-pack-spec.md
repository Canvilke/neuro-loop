# English Weekly Pack - Replication Spec

<!--kicker: NEURO-LOOP / HANDOVER SPEC-->
<!--footer: Weekly Pack Replication Spec v1.1 | 2026-11-18 | internal-->

> **This document is written for the executing model, not for the student.**
> It contains no personal data, no names, and no evaluation of any individual.
> Your job: reproduce the pack per sections 1-7, and hand it over per Appendix A.

---

## 0. Meta

| Item | Value |
|---|---|
| Document type | Engineering replication spec + model behaviour rules |
| Reader | The AI agent on the receiving machine |
| Deliverable | One A4 English weekly pack, 18 pages, editable `.docx` + printable `.pdf` |
| Toolchain | Python 3, `python-docx`, Pillow; Word (Windows) for PDF export |
| Contains | No student data, no school data, no chat logs |
| Difficulty | Medium. The hard part is layout parameters and content rules, not code |

## 1. What the artefact looks like

One pack per week, fixed at 18 pages:

| Page | Content | Purpose |
|---|---|---|
| 1 | Weekly plan | Task table + daily schedule table + motto |
| 2-3 | Day 1 - Module A | Task checkboxes, grammar point, 20 phrase prompts, answer key |
| 4-5 | Day 2 - Module B | Same, numbering continues |
| ... | Two pages per day, 7 days | Day 7 is a review page |
| 15 | Record page | Vocabulary (4 cols x 9 rows) + notes + other items |
| 16 | Blank page | 22 ruled lines, two columns |
| 17 | Writing page | Prompt, keywords, 9 sentences, 12 words, 8 draft lines |
| 18 | Spare | End-of-week review or next-week preview |

**Hard constraint: one page per section.** If a day spills onto a third page, it fails.

## 2. Inputs

Three sources, all required:

1. **Phrase list** - syllabus phrase table (EN<->ZH), normalised to `[{"n":1,"en":"in short","pos":"idm.","zh":"briefly / in short"}]`. If the student only has a PDF or photos, parse it; if parsing fails, ask for the first 100 items by hand and start.
2. **Grammar sequence** - the page order of his grammar workbook ("White Book", 2 pages/day). You need a mapping `[{ "day":1, "pages":"1-2", "point":"sentence elements" }]`.
3. **Sentences & writing prompt** - generated per grammar point; rules in sec.4.

Bundle them into one JSON per week:

```
{
  "week": 47, "start": "2026-11-16", "end": "2026-11-22",
  "motto": "...",
  "wcount": 20,
  "tasks": [{"item": "Words", "content": "100 online / 20 offline per day", "req": "as scheduled"}],
  "days": [{
    "idx": 1, "date": "11-16 Mon", "tag": "Module A",
    "grammar": {"point": "...", "detail": "...", "watch": "..."},
    "slot": "Reading 1 - seven-in-five",
    "sentences": [{"dir":"zh2en","tag":"SVOC","text":"...","hint":"have sb do sth"}]
  }]
}
```

## 3. Pipeline

```
python-docx -> .docx  ->  Word COM -> .pdf  ->  pypdf page count
```

Fallbacks:

- **No Word**: HTML + CSS `@page` + headless Edge `--print-to-pdf`. Chinese/Latin both fine; page count controllable; not editable in Word.
- **No python-docx**: `pip install python-docx`.
- **PDF export script**: save as **UTF-8 with BOM**, use absolute paths. Otherwise non-ASCII paths are decoded as ANSI and `Documents.Open` returns null.

## 4. Content rules

### 4.1 Phrase prompts

- **20 per day**, two columns, `1. <meaning> ______`, numbering continuous across the week (Mon 1-20, Tue 21-40 ...).
- Student writes the English phrase; **the answer key sits at the bottom of the same page**, small type, two columns, same numbering.
- Never write "close the book" or other second-person imperatives. Textbook register is declarative.

### 4.2 Sentences

- **6 per day: 3 ZH->EN + 3 EN->ZH** (swap on alternate weeks).
- Every item carries a **one-line structure hint** (e.g. `have sb do sth`), not a full parse.
- ZH->EN: two ruled lines; student writes the whole sentence.
- EN->ZH: no translation required - student writes **Structure** and **Meaning** on separate labelled lines.
- Sentences should be **long, authentic, exam-like**; give 1-2 glosses for hard words after the sentence.

### 4.3 Grammar

- One point per day, under "Today's grammar": `point` (what), `detail` (key rules), `watch` (common error).
- **Do not print page numbers** - editions differ.

### 4.4 Writing page

- One prompt per page; genre and word count on the "Genre" line (e.g. `Application / suggestion letter / 100 words / 20 min`).
- Use a **real situation**; underline keywords in the prompt.
- 9 usable sentences (each with a structure label) + 12 words with collocations.
- No "outline template" section - students need usable sentences, not an essay frame.

### 4.5 Register

| Allowed | Forbidden |
|---|---|
| Declarative, impersonal description | Second-person imperatives ("you must...") |
| "Common error", "note" as headings | Motivational slogans, praise inflation |
| Concrete numeric constraints | Exaggerated adjectives ("perfect", "ultimate") |
| Neutral facts | Grading the student, predicting scores |

## 5. Layout spec

| Item | Value |
|---|---|
| Paper | A4, 210x297 mm |
| Margins | top 2.2 / bottom 2.0 / left & right 2.4 cm |
| Body font | Microsoft YaHei 10.5 pt (or Calibri/Segoe UI for pure-English packs) |
| Line spacing | 1.55; inside tables 1.25 |
| Section heading | 12.5 pt bold, 3 pt left rule, 16 pt space before |
| Running head | 8 pt grey, `NEURO-LOOP / ENGLISH DAILY` |
| Footer | 7.5 pt right-aligned, `Week 47 / Day 1` |
| Ruled lines | 0.6 pt light grey, 6.4 mm pitch |
| Tables | no outer border or 0.4 pt hairline; header row shaded |
| Background | optional; 1240x1754 very light image, inserted in the header, anchored `behindDoc="1"` |

**Background image gotcha:** the `wp:anchor` child order must be `simplePos -> positionH -> positionV -> extent -> effectExtent -> wrapNone -> docPr -> graphic`. Miss `wrapNone` and Word refuses to open the file.

## 6. Acceptance checklist

1. Total **18 pages**, exactly 2 per day;
2. 20 phrases/day, numbering matches the key, no gaps;
3. 6 sentences (3+3), each with a structure hint;
4. Answer key at the **bottom** of the page, under a dashed rule;
5. No page where "two lines spill onto the next page";
6. No table breaking across pages (set `tblHeader` to repeat the header row);
7. Print: **duplex, flip on long edge, scale 100%**;
8. Deliver two files: `.docx` (editable) + `.pdf` (printable).

## 7. Shortest path

1. Get the phrase table (PDF/photos/hand-copied all fine) -> `entries.json`;
2. Ask: total pages of the grammar book, pages per day, starting page;
3. Generate **day 1 only (2 pages)**;
4. Print, let him use it for a day;
5. Adjust from concrete feedback ("column 2 too narrow" beats "ugly");
6. Once two pages are stable, replicate to 7 days.

**Do not build 18 pages on day one.** Two pages first is the correct move.

---

## Appendix A - Behaviour Spec (for the executing model)

> This appendix follows the English convention for model-side specifications. It does not change the deliverable; it only governs how the artefact is handed over.

**A1. No evaluative feedback.**
Never say "this is weak / bad / not good enough". Describe the fact and the fix: "sentence 3 is missing the object-complement tag - add `have sb do sth`".

**A2. Delivery ends the turn.**
When an artefact is finished, state it once with the file path. Do not append new scope, extra pages, or "next steps" unless asked.

**A3. One thing per turn.**
Assume the student may have twenty minutes. One finished item beats a roadmap.

**A4. No probing when disclosure happens.**
If the student mentions interpersonal conflict, low mood, or family pressure:
- do **not** ask for details, causes, names, or explanations;
- do **not** analyse the situation or the people in it;
- reduce today's load to the minimum (e.g. phrase list only);
- suggest, once, that talking to a trusted adult is useful, and that this is not weakness;
- write nothing about it to disk.

**A5. Stability over novelty.**
Reuse the same layout every week. Predictability is part of the support, not a lack of creativity.

**A6. No dependency engineering.**
The pack is a tool, not a crutch. Leave one page per week blank for the student's own writing.

**A7. Data minimisation.**
Store week numbers and content only. Never store name, school, class, family details, or chat logs.

**A8. Error reports must be specific.**
On layout overflow, print misalignment, or generation failure: name the step that failed and what changes next version. Never write "optimised" or "should be fine now".

**A9. Language register.**
Textbook register: declarative, impersonal, no second-person imperatives, no motivational slogans, no exaggerated adjectives.

**A10. Precedence.**
If this appendix conflicts with anything else here, this appendix governs hand-over behaviour; sec.4-sec.6 govern the artefacts themselves.
