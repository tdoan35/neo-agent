# UI/UX Design Specification

## Design System: Aura Obsidian

### Creative Direction

**North Star: "The Ethereal Intelligence"**

A premium, dark-mode-first interface that feels like a living environment, not a SaaS dashboard. The AI assistant should feel like a presence — calm, intelligent, always ready. Inspired by the editorial quality of Linear and Raycast, with the character-selection energy of a strategy game for the agent builder.

The interface prioritizes:

- **Depth over flatness** — layered surfaces with glassmorphism, not flat cards on white
- **Negative space as structure** — generous whitespace guides the eye, elements float
- **Content as hero** — the user's conversation and the agent's responses dominate
- **Quiet power** — controls and chrome are subdued; the AI's output is the focus

### Color Tokens

#### Backgrounds & Surfaces (dark → light, layered)

|Token                      |Hex      |Usage                                                     |
|---------------------------|---------|----------------------------------------------------------|
|`surface-lowest`           |`#0c0e14`|Deepest insets, input field backgrounds                   |
|`surface-dim` / `surface`  |`#111319`|Base canvas, infinite floor                               |
|`surface-container-low`    |`#191b22`|Sidebar backgrounds, grouped areas                        |
|`surface-container`        |`#1e1f26`|Primary cards, chat bubbles                               |
|`surface-container-high`   |`#282a30`|Elevated cards, hover states                              |
|`surface-container-highest`|`#33343b`|Popovers, command palettes                                |
|`surface-bright`           |`#373940`|Micro-copy that needs to pop                              |
|`surface-variant`          |`#33343b`|Glassmorphic elements (use at 60% opacity + backdrop-blur)|

#### Accent Colors

|Token                |Hex      |Usage                                         |
|---------------------|---------|----------------------------------------------|
|`primary`            |`#9dcaff`|Primary text links, light accent              |
|`primary-container`  |`#4a9eed`|CTAs, active states, agent avatars            |
|`secondary`          |`#d0bcff`|Light purple accent                           |
|`secondary-container`|`#571bc1`|Purple badges, secondary highlights           |
|`tertiary`           |`#ffba44`|AI insights, smart suggestions, amber warnings|
|`tertiary-container` |`#ce8d00`|Amber emphasis                                |
|`error`              |`#ffb4ab`|Error states                                  |
|`error-container`    |`#93000a`|Critical alerts                               |

#### Text Colors

|Token               |Hex      |Usage                                   |
|--------------------|---------|----------------------------------------|
|`on-surface`        |`#e2e2eb`|Primary text (never use pure white #fff)|
|`on-surface-variant`|`#c0c7d3`|Secondary text, descriptions            |
|`outline`           |`#8a919c`|Tertiary text, timestamps               |
|`outline-variant`   |`#404751`|Ghost borders (15% opacity), dividers   |

#### Semantic Colors (for agent avatars + identity cards)

|Agent |Color      |Hex      |
|------|-----------|---------|
|Dana  |Blue       |`#4a9eed`|
|Carlos|Green      |`#22c55e`|
|Yuki  |Amber      |`#f59e0b`|
|Aria  |Purple     |`#8b5cf6`|
|Custom|User-chosen|—        |

### Typography

|Role      |Font          |Weight|Size      |Usage                                   |
|----------|--------------|------|----------|----------------------------------------|
|Display   |Manrope       |700   |2.5-3.5rem|Hero headings, onboarding titles        |
|Headline  |Manrope       |600   |1.5-2rem  |Section titles, agent names in preview  |
|Title     |Manrope       |600   |1.25rem   |Card titles, sidebar section headers    |
|Body      |Inter         |400   |1rem      |Chat messages, descriptions, form labels|
|Body Small|Inter         |400   |0.875rem  |Timestamps, tool indicators, meta text  |
|Label     |Inter         |500   |0.75rem   |Tags, badges, pill text                 |
|Code      |JetBrains Mono|400   |0.875rem  |Code blocks, terminal output            |

**Rules:**

- Headlines use tight letter-spacing (-0.02em)
- Body text uses default letter-spacing
- Never use font size below 0.75rem
- Line height: 1.5 for body, 1.2 for headlines

### Spacing Scale

|Token       |Value         |Usage                    |
|------------|--------------|-------------------------|
|`spacing-1` |0.25rem (4px) |Inline padding, icon gaps|
|`spacing-2` |0.5rem (8px)  |Tight element spacing    |
|`spacing-3` |0.75rem (12px)|Standard element gap     |
|`spacing-4` |1rem (16px)   |Card internal padding    |
|`spacing-6` |1.5rem (24px) |Section gaps             |
|`spacing-8` |2rem (32px)   |Major section separation |
|`spacing-12`|3rem (48px)   |Page-level padding       |
|`spacing-16`|4rem (64px)   |Hero section padding     |

### Corner Radius

|Token        |Value |Usage                            |
|-------------|------|---------------------------------|
|`radius-sm`  |4px   |Small elements, tags             |
|`radius-md`  |8px   |Buttons, inputs, small cards     |
|`radius-lg`  |12px  |Standard cards, chat bubbles     |
|`radius-xl`  |16px  |Large cards, identity cards      |
|`radius-2xl` |24px  |Hero cards, modal containers     |
|`radius-full`|9999px|Pills, avatars, circular elements|

### Component Rules

**No-Line Boundary Rule:** Never use 1px solid borders to define sections. Create boundaries exclusively through background color shifts between surface tokens. If a separator is absolutely required, use spacing (1.2rem gap) rather than a line.

**Ghost Border (accessibility fallback):** `outline-variant` at 15% opacity. Should be felt, not seen. Only when high-contrast mode demands it.

**Glass & Gradient Rule:**

- CTAs: linear-gradient from `primary` to `primary-container` at 135°
- Floating elements: `surface-variant` at 60% opacity + `backdrop-filter: blur(20px)`

**Shadow Rule:**

- No standard drop shadows
- Floating elements: 40-60px blur, `on-surface` at 4% opacity (tinted, not black)

-----

## Application Flows

### Flow 1: First-Time Onboarding

```
App Launch (first time)
  │
  ├─→ Step 1: Welcome & User Profile
  │     Questions (5-6 max):
  │     • "What's your name?"
  │     • "What do you do?" (text input)
  │     • "What will you primarily use this for?" (pill multi-select)
  │     • "How do you prefer communication?" (toggle cards: Concise vs Detailed)
  │     • "What tools do you use daily?" (icon grid with toggles)
  │     [Continue →]
  │
  ├─→ Step 2: Agent Builder Canvas
  │     Top: Live agent preview card (updates as user picks cards)
  │     Bottom: Four-deck tab interface
  │     • Identity Deck → pick a preset or build custom
  │     • Skills/Tools Deck → toggle integrations
  │     • Context Deck → memory + knowledge sources
  │     • Settings Deck → model preference, notifications
  │     [Continue →]
  │
  ├─→ Step 3: First Conversation
  │     Agent introduces itself in character
  │     Guided first task based on connected tools
  │     "I see you connected Gmail and Calendar. Want me to
  │      summarize your schedule for today?"
  │
  └─→ Main Chat Interface
```

### Flow 2: Returning User

```
App Launch (returning)
  │
  ├─→ Gateway daemon already running (or auto-start)
  │
  ├─→ Main Chat Interface
  │     • Working memory loaded (kanban tasks visible in sidebar)
  │     • Last session's context available via memory retrieval
  │     • Agent greets contextually: "Welcome back. You were
  │       working on the auth module refactor yesterday."
  │
  └─→ (All features available: chat, /commands, cron, etc.)
```

### Flow 3: Agent Swap

```
During conversation:
  │
  ├─→ User: /agent switch aria
  │     OR: clicks agent avatar dropdown in top bar
  │
  ├─→ System: saves current working memory state
  │
  ├─→ New agent loads:
  │     • Different identity (Aria: Coding Partner)
  │     • Different tone, persona, boundaries
  │     • Same working memory (kanban carries over)
  │     • Same KB access (global + team scoped)
  │     • May have different tools enabled
  │
  └─→ Aria: "Hey, picking up where Dana left off.
  │          I see the auth refactor is active. Want
  │          to dive into the code?"
```

-----

## Screen Specifications

### Screen 1: Welcome & User Profile

**Layout:** Centered single column, max-width 640px
**Background:** `surface` (#111319)

**Header:**

- Heading: "Let's get to know you" — `display` size, `on-surface` color
- Subheading: "Your assistant gets smarter the more it knows about you" — `body`, `on-surface-variant`
- Vertical spacing below header: `spacing-12`

**Form Card:**

- Background: `surface-container`
- Corner radius: `radius-2xl`
- Padding: `spacing-8`
- Internal spacing between fields: `spacing-6`

**Field 1 — Name:**

- Label: "What's your name?" — `title` size
- Input: `surface-lowest` background, `radius-md`, full width
- Focus state: ghost border `primary` at 40% + subtle glow

**Field 2 — Occupation:**

- Label: "What do you do?"
- Input with placeholder: "e.g. Software engineer, Product manager"

**Field 3 — Use Case:**

- Label: "What will you primarily use this assistant for?"
- Pill-style multi-select (toggle on/off):
  - "Coding & Development"
  - "Project Management"
  - "Research"
  - "Writing"
  - "Personal Productivity"
  - "Other"
- Pill styling: `surface-container-high` unselected, `primary-container` selected
- Corner radius: `radius-full`
- Spacing between pills: `spacing-2`

**Field 4 — Communication Preference:**

- Label: "How do you prefer communication?"
- Two large toggle cards side by side:
  - Left: "Concise — short and to the point" with a lightning bolt icon
  - Right: "Detailed — thorough explanations" with a book icon
- Card styling: `surface-container-high` unselected, `primary-container` border/glow when selected
- Corner radius: `radius-xl`

**Field 5 — Daily Tools:**

- Label: "What tools do you use daily?"
- 2×4 grid of tool cards with icon + name + toggle switch:
  - Gmail, Google Calendar, Slack, Notion
  - GitHub, Linear, VS Code, Terminal
- Card styling: `surface-container-high`, `radius-lg`
- Toggle: standard switch component
- Each card: icon (24px), name below, toggle top-right

**Footer:**

- Progress: "Step 1 of 3" — `body-small`, `outline` color
- Three small dots indicating progress (first filled `primary`, others `outline-variant`)
- "Continue" button: gradient `primary` → `primary-container`, `radius-md`, right-aligned
- Footer padding: `spacing-8` top

-----

### Screen 2: Agent Builder Canvas

**Layout:** Full viewport, two sections stacked vertically

**Top Section — Agent Preview (55-60% height):**

- Background: `surface` with a subtle radial gradient glow behind the preview card (primary at 5% opacity, 400px radius)
- Centered floating preview card:
  - Background: `surface-container` with glassmorphism (backdrop-blur 20px, slight transparency)
  - Corner radius: `radius-2xl`
  - Padding: `spacing-8`
  - Shadow: 60px blur, `on-surface` at 4% opacity
  - Content (vertically centered):
    - Circular avatar: 80px, agent color fill, white letter centered
    - Agent name: `headline` size, `on-surface`
    - Role: `body`, `on-surface-variant`
    - Tone badge: `label` size pill, `secondary-container` background, `secondary` text
    - Skill tags row: small pills (`radius-full`), green tint (`#22c55e` at 15% bg, green text)
    - Context tags row: small pills, purple tint
    - Footer text: "Live preview updates as you pick cards" — `body-small`, `outline`

**Bottom Section — Card Deck (40-45% height):**

- Background: `surface-container-low`
- Corner radius: `radius-2xl` on top corners only (sheets up from bottom)

**Tab Bar:**

- Horizontal row at top of bottom section
- 4 tabs: "Identity", "Skills / Tools", "Context", "Settings"
- Active tab: `primary-container` background, white text, `radius-md`
- Inactive tabs: transparent, `on-surface-variant` text
- Tab bar background: `surface-container-low`
- Padding: `spacing-3` vertical, `spacing-4` horizontal per tab

**Card Row (scrollable horizontally):**

- Horizontal scroll with snap points
- Padding: `spacing-6` around the row
- Gap between cards: `spacing-4`

**Identity Card (preset):**

- Width: 200px, Height: 300px
- Background: `surface-container`
- Corner radius: `radius-xl`
- Padding: `spacing-4`
- Content stack (vertical, centered):
  - Avatar circle: 56px, agent color fill, white letter
  - Name: `title` size, `on-surface`
  - Role: `body-small`, `on-surface-variant`
  - Tone badge: `label` pill, `secondary-container` bg
  - Description: `body-small`, `on-surface-variant`, max 3 lines
  - Bottom: "Select" button or "Selected" state
- **Selected state:** `primary-container` border (2px), subtle blue glow (box-shadow), "Selected" button in `primary-container` color
- **Unselected state:** no border (uses surface shift), "Select" button in `surface-container-high`

**Build Custom Card (last in row):**

- Same dimensions as preset cards
- Dashed border: 2px dashed `outline-variant`
- Background: transparent
- Content: large "+" icon (`outline` color, 48px), "Build Custom" text, description

**Navigation:**

- Bottom-right: "Continue" button (same gradient style as onboarding)
- Bottom-left: "Step 2 of 3" progress indicator

-----

### Screen 3: Main Chat Interface

**Layout:** Three-column, full viewport height

#### Left Sidebar (250px fixed width)

- Background: `surface-container-low`
- No border on right edge (use surface color shift)

**Top:**

- App logo / name: small, `spacing-4` padding
- "New Chat" button: full width, `surface-container-high` bg, `radius-md`, "+" icon left
- Spacing below: `spacing-4`

**Conversation List:**

- Grouped by "Today", "Yesterday", "This Week" (section headers in `label` size, `outline` color)
- Each item:
  - Small agent avatar circle (24px) with agent color
  - Title: `body` size, `on-surface`, single line truncated
  - Timestamp: `body-small`, `outline`
  - Padding: `spacing-3` vertical
  - Active item: `primary-container` at 10% opacity background
  - Hover: `surface-container-high` background

**Bottom:**

- Row of small icon buttons: Settings (gear), Memory (brain), User avatar + name
- Spacing: `spacing-3` from bottom edge

#### Center Chat Area (flexible, ~60%)

- Background: `surface`

**Top Bar:**

- Height: 56px
- Background: `surface-container-low` (barely different from sidebar, creates unified header)
- Left side: agent avatar (32px) + name (`title` size) + role (`body-small`, `outline`) + online dot (green 8px circle)
- Right side: model name "Claude Opus 4.6" (`body-small`, `outline`) + small dropdown chevron
- Padding: `spacing-4` horizontal

**Chat Messages Area:**

- Scrollable, padding: `spacing-6` horizontal, `spacing-4` between messages

**User Message (right-aligned):**

- Background: `surface-container`
- Corner radius: `radius-lg` (bottom-right: `radius-sm` for chat bubble feel)
- Max width: 70% of chat area
- Padding: `spacing-4`
- Text: `body`, `on-surface`

**Agent Message (left-aligned):**

- Background: `surface-container-low`
- Corner radius: `radius-lg` (bottom-left: `radius-sm`)
- Max width: 80% of chat area
- Padding: `spacing-4`
- Text: `body`, `on-surface`
- **Tool indicator** (bottom of message): small pill with icon + "Used: Google Calendar" — `body-small`, `outline`, icon tinted `tertiary`
- **Structured outputs** (tables, lists): rendered inline with `surface-lowest` background rows, clean formatting

**Input Area (bottom of chat):**

- Background: `surface-container-low`
- Padding: `spacing-4`

**Context Pills (above input):**

- Row of small pills showing active context:
  - "Working on: Calendar Management" — `tertiary-container` at 15% bg, `tertiary` text
  - "Memory: Active" — green tint, brain icon
- Pill styling: `radius-full`, `spacing-2` gap, `label` size

**Input Bar:**

- Background: `surface-lowest`
- Corner radius: `radius-lg`
- Height: 48px minimum, auto-grows for multiline
- Left: attachment button (paperclip icon, `outline`)
- Center: text input area
- Right: send button (circular, `primary-container` bg, arrow icon)
- Focus state: ghost border `primary` at 40%

#### Right Sidebar (250px, collapsible)

- Background: `surface-container-low`
- Toggle button on left edge to collapse/expand

**Working Memory Section:**

- Header: "Working Memory" + small kanban icon — `title` size
- Mini kanban:
  - **Active** tasks: blue dot (8px `primary-container`) + task title (`body-small`, `on-surface`)
  - **Blocked** tasks: amber dot + task title + blocker reason in `outline` text
  - **Backlog** tasks: gray dot (`outline`) + task title
  - Each task: `spacing-2` vertical gap, `spacing-3` left padding
  - Max 5 visible, "Show all" link if more

**Recent Facts Section:**

- Header: "Recent Memories" — `title` size
- List of 3-5 recently learned facts:
  - Fact text: `body-small`, `on-surface-variant`
  - Timestamp: `label`, `outline`
  - Small brain icon tinted `secondary`

**Footer:**

- "Memory Palace →" link/button: `body-small`, `primary` color, arrow icon
- Opens full knowledge base browser view

-----

### Screen 4: Memory Palace (Knowledge Base Browser)

**Layout:** Full viewport, two panels

**Left Panel (300px) — Navigation:**

- Background: `surface-container-low`
- PARA container tree:
  - **Projects** section (folder icon, blue): list of active projects with status badges
  - **Areas** section (infinity icon, green): list of ongoing areas
  - **Resources** section (book icon, purple): list of reference topics
  - **Archives** section (archive icon, gray): collapsed by default
- Each container: name + fact count badge (`surface-container-high`, `label` size)
- Active container: `primary-container` at 10% background
- Search bar at top: same styling as chat input

**Right Panel — Content:**

- Background: `surface`

**When a container is selected:**

- Container header: name (`headline`), PARA type badge, description (`body`, `on-surface-variant`)
- Tabs below header: "Facts", "Entities", "Skills", "Relations"

**Facts Tab:**

- List of facts with:
  - Content: `body`, `on-surface`
  - Type badge: colored pill (preference=blue, decision=purple, convention=green, etc.)
  - Confidence bar: thin bar, `primary` fill proportional to confidence score
  - Timestamps: `label`, `outline` — "Learned: Mar 15 · Last confirmed: Mar 20"
  - Source: "From session: Auth refactor discussion" — `label`, `outline`
- Each fact: card in `surface-container`, `radius-lg`, `spacing-4` padding

**Entities Tab:**

- Grid or list of entity cards:
  - Entity name: `title`
  - Type badge: small pill (person=blue, tool=green, service=amber)
  - Aliases listed below name: `body-small`, `outline`
  - Fact count: "12 facts" — `label`
  - Clicking opens entity detail view with all linked facts and relations

**Skills Tab:**

- List of skill cards:
  - Name: `title`
  - Description: `body-small`
  - Usage stats: "Used 5 times · Last: 2 days ago · Success: 90%"
  - Tags: category pills
  - "View Procedure →" link to full SKILL.md content

-----

### Screen 5: Agent Builder Canvas (Full Version — Web GUI)

**Layout:** Full viewport, same two-section layout as onboarding Step 2 but with full feature set

**Enhanced from onboarding version:**

- All four decks fully functional (not just Identity during onboarding)
- Can manage multiple agents (tabs or list of agent cards at the very top)
- Each agent is a card in a horizontal row: avatar + name + role + status (active/inactive)
- Clicking an agent card opens its builder canvas below

**Identity Deck (enhanced):**

- All presets visible
- Custom builder form (inline, not separate screen):
  - Name input
  - Role input (with suggestions dropdown)
  - Tone selector (slider or predefined options)
  - Persona textarea (long-form behavioral description)
  - Boundaries list (add/remove items)
  - "Open SOUL.md in editor" button for power users
- Preview: SOUL.md rendered in a code-style panel on the right

**Skills/Tools Deck:**

- Cards grouped by category with section headers:
  - **Communication**: Gmail, Slack, Discord — each with icon, name, toggle, "Connect" button for OAuth
  - **Productivity**: Calendar, Notion, Linear, Jira
  - **Development**: GitHub, Terminal, File System, Web Search
  - **Custom MCP**: "Add MCP Server" card (dashed border, +, enter URL)
- Connected tools show green checkmark badge
- Disconnected tools show gray state with "Connect" CTA

**Context Deck:**

- **Personal Memory** card (always on, non-toggleable):
  - Brain icon
  - "Your agent learns about you over time"
  - Mini stats: "42 facts · 12 entities · 3 skills learned"
  - Visual: small ring chart showing memory fill level
- **Connected Knowledge** cards:
  - Google Drive: connect OAuth, select folders
  - Notion workspace: connect OAuth
  - Local docs folder: file picker
  - Each shows: source name, connection status, last sync time
- **Project Scoping** card:
  - "What are you working on?"
  - Project name input
  - Outcome description
  - Optional: link GitHub repo, Notion page
  - Creates a PARA Project container

**Settings Deck:**

- Model preference: dropdown or radio (Claude → GLM → Local → OpenRouter)
- Working hours: time pickers for start/end (affects cron scheduling)
- Notification preference: dropdown (all / important only / silent)
- Data preference: toggle (local-only vs allow cloud APIs for search)
- Advanced: max token budget for memory injection, decay rate overrides

-----

## Component Library

### Buttons

**Primary:** `linear-gradient(135deg, primary, primary-container)`, `radius-md`, padding `spacing-3 spacing-6`. Hover: outer glow `primary` at 20% opacity.

**Secondary:** `surface-container-high` background, `on-surface` text, `radius-md`. Hover: `surface-bright` background.

**Ghost:** transparent background, `primary` text. Hover: `primary` at 10% background.

**Danger:** `error-container` background, `on-error-container` text. Used sparingly.

### Pills / Tags

**Standard:** `radius-full`, padding `spacing-1 spacing-3`, `label` size text.

- Scope: blue for global, purple for team, gray for private
- PARA: blue for project, green for area, purple for resource, gray for archive
- Memory type: based on brain taxonomy colors
- Tools: green tint when connected

### Input Fields

**Text Input:** `surface-lowest` background, `radius-md`, padding `spacing-3`. Focus: ghost border `primary` at 40% + soft glow.

**Textarea:** Same as text input but auto-grows. Min-height 48px.

**Toggle Switch:** 40px wide, 24px tall, `radius-full`. Off: `outline-variant` track. On: `primary-container` track with white thumb.

### Avatar

**Agent Avatar:** Circular, background in agent's assigned color, centered letter in white. Sizes: 24px (inline), 32px (top bar), 56px (card), 80px (preview).

**User Avatar:** Circular, `surface-container-high` background, user initial. Same sizes.

### Cards

**Standard Card:** `surface-container` background, `radius-lg`, padding `spacing-4`. No border.

**Elevated Card:** Same + glassmorphism (backdrop-blur) + ambient shadow.

**Identity Card:** `surface-container`, `radius-xl`, padding `spacing-4`, 200×300px. Selected: `primary-container` 2px border + blue glow.

**Chat Bubble:** `radius-lg` with one squared corner. User: `surface-container`. Agent: `surface-container-low`.

### Status Indicators

**Online dot:** 8px circle, `#22c55e` (green)
**Active task dot:** 8px circle, `primary-container` (blue)
**Blocked dot:** 8px circle, `tertiary` (amber)
**Backlog dot:** 8px circle, `outline` (gray)
**Confidence bar:** 4px height, `surface-container-high` track, `primary` fill

-----

## Responsive Behavior

### Desktop (>1200px)

- Three-column chat layout (sidebar + chat + working memory)
- Full agent builder canvas with all decks

### Tablet (768-1200px)

- Two-column chat layout (sidebar collapsed by default, chat + working memory)
- Agent builder: stacked layout (preview on top, decks below, full width)

### Mobile Web (< 768px)

- Single column, bottom nav
- Chat takes full width
- Sidebars as slide-out drawers
- Agent builder: single card at a time, swipe between decks

### TUI (Terminal)

- Simplified to text-based equivalents
- Onboarding: sequential prompts, no visual cards
- Chat: standard terminal chat with markdown rendering
- Working memory: `/tasks` command output
- Agent builder: `/agent` wizard with numbered menus

-----

## Stitch Reference

Google Stitch project ID: `9175834258934623646`

Screens generated:

1. **Welcome & User Profile** (onboarding step 1) — screen ID: `ce32b09bf937420db708ea974881f44e`
1. **Agent Builder Canvas** (onboarding step 2) — screen ID: `7924a09bc3b140e4b5c775d342f289d7`
1. **Main Chat Interface** (primary experience) — screen ID: `17b86234a419444489d8de303e1732a5`

Design system generated: "Aura Obsidian" — asset ID: `ea0ac053404a4c3b9e32412ed3e85cec`

These serve as initial direction. The final implementation should follow this spec document for detailed measurements, with the Stitch screens as visual reference for overall feel and layout proportions.
