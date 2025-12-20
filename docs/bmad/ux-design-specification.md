---
stepsCompleted: [1]
inputDocuments:
  - docs/product-requirements.md
  - features/p19_2_clarity-chat-mvp.md
workflowType: 'ux-design'
lastStep: 1
project_name: 'Clarity Pledge'
user_name: 'Slava'
date: '2025-12-20'
scope: 'full-design-system'
---

# UX Design Specification: Clarity Pledge Design System

**Author:** Slava
**Date:** 2025-12-20
**Scope:** Comprehensive Design System for Clarity Pledge App

---

## Executive Summary

### Project Vision

Clarity Pledge is a public commitment protocol for professionals who want to verify mutual understanding in conversations. Two core experiences:
1. **Pledge Certificate** - Sign a public commitment, get a shareable profile, collect endorsements
2. **Clarity Chat** - Real-time conversation tool where understanding is verified through paraphrasing

Core insight: *"It's a universal human need to be understood."*

### Target Users

- Professionals signaling commitment to clear communication
- Couples/Families wanting to feel understood
- Teams needing verified alignment
- Anyone proving understanding before reacting

### Key Design Challenge

The chat interface evolved with colors and patterns not in the landing page. Need to unify.

---

## Design System (Source: Landing Page)

### Colors

| Token | Value | Usage |
|-------|-------|-------|
| `blue-500` | #3B82F6 | Primary CTA, accent icons, interactive elements |
| `blue-600` | #2563EB | Hover states |
| `blue-50` | Light blue | Highlight backgrounds |
| `foreground` | Near black | Primary text |
| `muted-foreground` | Gray | Secondary text |
| `background` | White | Page background |
| `muted` | Light gray | Secondary backgrounds |
| `primary` | Dark gray | Message bubbles (own) |

### Typography

| Level | Class |
|-------|-------|
| Hero | `text-4xl sm:text-5xl lg:text-7xl font-bold` |
| H2 | `text-3xl md:text-4xl font-bold` |
| H3 | `text-2xl font-bold` |
| Body | `text-base` or `text-lg text-muted-foreground` |
| Small | `text-sm text-muted-foreground` |
| XS | `text-xs text-muted-foreground` |

### Border Radius

| Token | Usage |
|-------|-------|
| `rounded-md` | Buttons, inputs |
| `rounded-lg` | Small cards, message bubbles |
| `rounded-xl` | Medium cards |
| `rounded-2xl` | Large feature cards |
| `rounded-full` | Avatars, pills |

### Buttons

**Primary CTA:**
```
bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-md
shadow-lg shadow-blue-500/20 hover:shadow-xl
```

**Secondary/Outline:**
```
border border-input bg-background hover:bg-accent rounded-md
```

**Ghost:**
```
hover:bg-accent hover:text-accent-foreground
```

---

## Chat Design Audit

### Current Issues

| Element | Problem | Fix |
|---------|---------|-----|
| Status colors | Uses green/amber/orange not in brand | Simplify to blue + minimal semantic |
| "Explain back" button | Gray-based styling | Use `border-blue-300 bg-blue-50 text-blue-700` |
| Verification badges | 4+ color palettes | Reduce to 2: blue (default), green (success only) |
| Expand/collapse | Custom chevron buttons | Fine, but style consistently |
| Rating slider | Default gray | Consider blue accent |

### Recommended Semantic Colors (Minimal)

| State | Color | Rationale |
|-------|-------|-----------|
| **Default/Interactive** | `blue-500` | Brand color |
| **Success/Accepted** | `green-600` | Universal "done" meaning |
| **Pending** | `blue-500` with animation | Don't need amber, blue works |
| **Needs Retry** | `blue-500` with icon | Don't need orange, use messaging |
| **Recording** | `red-500` | Universal "recording" meaning |

### Component Patterns for Chat

#### Message Bubble
```
Own: bg-primary text-primary-foreground rounded-2xl px-4 py-2.5
Other: bg-muted rounded-2xl px-4 py-2.5
```

#### Action Button (e.g., "Explain back")
```
Default: border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-full px-3 py-1.5 text-xs font-medium
Nudged: border-blue-400 bg-blue-100 text-blue-800 animate-pulse
```

#### Status Badge
```
Accepted: bg-green-50 text-green-700 border-green-200 rounded-md px-2 py-1
Pending: bg-blue-50 text-blue-700 border-blue-200 rounded-md px-2 py-1
```

#### Expandable Section
```
Button: flex items-center gap-1.5 text-xs px-2 py-1 rounded-md hover:bg-muted
Expanded: border-l-2 border-blue-200 pl-3 bg-muted/30 rounded-r-lg
```
