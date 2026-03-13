# Project Build Review & Social Media Strategy

This document provides a comprehensive review of the strategic planning, technical requirements, and social media content generated for the **AWT Inventory Tracking V2** project. It captures the narrative evolution from "just another build" to a highly specialized, "Expert-POV" project.

## 🏁 The Core Narrative

Through our discussion, we identified a unique and compelling story for this project:

*   **The Problem ("The Missing Middle"):** Small manufacturers are stuck between **Excel** (Cheap but fragile, no audit trails, no structural integrity) and **Generic ERPs** like Katana or Fishbowl (Powerful but expensive at $500/mo+, and cluttered with generic features).
*   **The Builder:** A former **SAP Project Manager** with 4 years of enterprise implementation experience but **zero coding knowledge**.
*   **The Solution:** Using **AI Agents** (Claude Code, Gemini, TestSprite) to bridge the gap—building "Enterprise-Grade" integrity with "Indie Hacker" speed and costs ($5/mo).

---

## 🛠 Technical Requirements & Capabilities

These are the non-negotiable features we identified as the project's "moat":

1.  **Strict User Tracking:** Every stock movement is stamped with a User ID. No more "Inventory Mysteries."
2.  **Extensive Bill of Materials (BOMs):** Automatic deduction ("Backflushing") of components (Tires, Axles) when a Trailer assembly is logged.
3.  **Solid Data Integrity:** Enforcement of business rules at the database level (e.g., preventing negative inventory). No more broken spreadsheet macros.
4.  **Zero-Training UI:** A "Quick Receive" flow that takes <30 seconds, optimized for the shop floor rather than an office desk.

---

## 📱 Social Media Strategy Evolution

We moved through several iterations to find the most authentic "voice" for this build.

### Phase 1: The "Engagement" Style (Rejected)
*Tone: Marketing-heavy, emoji-rich, hook-driven.*
> [!NOTE]
> This was rejected for feeling "too AI" and "gimmicky." It used a standard Hook → Story → Lesson framework.

### Phase 2: The "A/B Testing" Mega-Threads (Strategy)
*Tone: Targeted at specific audiences (Business, Product, Technical).*

#### Thread A: The Business Logic (ROI focus)
Focuses on the financial impact of building custom software to replace an expensive subscription.
#### Thread B: The Product Capability (Ops focus)
Focuses on the "Solid State" reliability and integrity of the app compared to Excel.
#### Thread C: The Technical Build (AI focus)
Focuses on the "Jetpack" effect of using AI agents for a solo developer workflow.

---

## 📖 The Final "Approved" Version (Forum Style)

This version uses an understated, high-credibility tone inspired by "old school" developer forums like Hacker News. It emphasizes the builder's background and the specific technical constraints.

### Title: Former SAP Consultant building a custom ERP (Zero Coding Knowledge) Node/React

**Post 1: The Background & Problem**
Hi everyone,

My background: I spent 4 years implementing large-scale SAP systems for manufacturing companies. I’m a Project Manager by trade—I know Ops, I know Process, and I know SQL… but I have **zero coding knowledge.**

I now run a small trailer manufacturing shop.

**The Problem:** We were stuck in the "ERP Gap."
1.  **Generic ERPs (Katana/Fishbowl):** They have the features I’m used to (Strict User Tracking, BOMs), but cost $500/mo+ and are built for "everyone," which means they are optimized for "no one."
2.  **Excel:** It’s free, but as an SAP guy, the lack of data integrity (no audit trails, delete-able rows) terrified me.

**Post 2: The Solution & Requirements**
I decided to leverage AI (Gemini + Claude Code) to build a custom "Micro-ERP" that has **Enterprise Integrity** but with a **Startup Price Tag.**

I needed specific capabilities that Excel simply cannot do reliably:
*   **Strict User Tracking:** I need to know *exactly* who moved stock and when. Excel doesn't have a reliable audit trail.
*   **Extensive BOMs:** We build complex assemblies (Trailer = Axles + Tires + Couplers). I needed automatic deduction ("Backflushing") when a unit is completed.
*   **Solid Data Integrity:** I wanted a system that enforces rules (No negative inventory). Spreadsheets are too fragile; one broken macro can halt production.
*   **Zero-Training UI:** The shop floor needs to receive items in <30 seconds. No wizards, no extra clicks.

**Post 3: The "Non-Coder" Stack & Progress**
*   Frontend: React (Vite)
*   Backend: Node.js (Express)
*   DB: PostgreSQL (Prisma)
*   Agent: TestSprite (My "QA Engineer")

**What I Built (Day 1):**
*   Database schema is live with Users, Vendors, and Items.
*   Auth is handled via standard JWT (Admin vs. Shop Floor roles).
*   Transactions (receipts, adjustments) are working and enforcing logic.
*   Leveraging TestSprite for automated QA—it found 6 critical bugs today before I even opened the browser.

I’m documenting this to show that **Domain Experience + AI > Coding Experience.** If you know *what* needs to be built (the Process), the AI can handle the *how* (the Code).

---

## 🗓 Future Build Logs

To maintain this authentic tone, future posts should follow this "Dev Log" pattern:
1.  **The Objective:** What was the goal for today?
2.  **The Progress:** Specific features shipped (e.g., "Connected the BOM logic to the Transactions").
3.  **The Struggle:** An honest mention of a bug or a logic loop that was frustrating (e.g., "Fought with CSV parsing for an hour").
4.  **The Win:** "Tests are passing, and it's 2 seconds faster than the old way."
