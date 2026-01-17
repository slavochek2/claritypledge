# Awesome Claude Skills

Installed: **47 skills** with `awesome:` namespace

## Usage

All skills are invoked with the `/awesome:skill-name` format:

```
/awesome:pdf               # Work with PDF files
/awesome:brainstorming     # Brainstorm ideas
/awesome:test-driven-development  # TDD guidance
```

## Official Skills (16)

### Documents
- `/awesome:docx` - Word document creation/editing
- `/awesome:pdf` - PDF manipulation toolkit
- `/awesome:pptx` - PowerPoint presentations
- `/awesome:xlsx` - Excel spreadsheets

### Design & Creative
- `/awesome:algorithmic-art` - Generative art with p5.js
- `/awesome:canvas-design` - Visual art in PNG/PDF
- `/awesome:slack-gif-creator` - Animated GIFs for Slack
- `/awesome:theme-factory` - Theme generation

### Development
- `/awesome:frontend-design` - Bold design decisions, avoid AI slop
- `/awesome:web-artifacts-builder` - React + Tailwind artifacts
- `/awesome:mcp-builder` - Create MCP servers
- `/awesome:webapp-testing` - Test with Playwright

### Communication
- `/awesome:brand-guidelines` - Anthropic brand colors/typography
- `/awesome:internal-comms` - Status reports, newsletters, FAQs
- `/awesome:doc-coauthoring` - Collaborative document editing

### Meta
- `/awesome:skill-creator` - Create new skills interactively

## Community Skills - obra/superpowers (31)

### Collaboration
- `/awesome:brainstorming` - Socratic method idea refinement
- `/awesome:writing-plans` - Plan development
- `/awesome:executing-plans` - Execute plans systematically
- `/awesome:requesting-code-review` - Ask for code review
- `/awesome:receiving-code-review` - Receive feedback gracefully
- `/awesome:remembering-conversations` - Context preservation

### Development Patterns
- `/awesome:subagent-driven-development` - Multi-agent workflows
- `/awesome:dispatching-parallel-agents` - Parallel execution
- `/awesome:test-driven-development` - TDD best practices
- `/awesome:testing-anti-patterns` - What NOT to do
- `/awesome:verification-before-completion` - Pre-completion checks
- `/awesome:finishing-a-development-branch` - Branch completion checklist
- `/awesome:using-git-worktrees` - Git worktree workflows

### Debugging & Problem-Solving
- `/awesome:when-stuck` - Problem-solving dispatch
- `/awesome:systematic-debugging` - Methodical debugging
- `/awesome:root-cause-tracing` - Find the root cause
- `/awesome:defense-in-depth` - Multi-layer validation
- `/awesome:condition-based-waiting` - Wait strategies

### Thinking Patterns
- `/awesome:simplification-cascades` - Simplify iteratively
- `/awesome:collision-zone-thinking` - Identify conflict zones
- `/awesome:meta-pattern-recognition` - Pattern of patterns
- `/awesome:inversion-exercise` - Think backwards
- `/awesome:scale-game` - Scale analysis
- `/awesome:preserving-productive-tensions` - Balance tradeoffs
- `/awesome:tracing-knowledge-lineages` - Knowledge provenance

### Skills Management
- `/awesome:using-skills` - Getting started with skills
- `/awesome:writing-skills` - How to write skills
- `/awesome:sharing-skills` - Share with team
- `/awesome:testing-skills-with-subagents` - Test your skills
- `/awesome:gardening-skills-wiki` - Maintain skills
- `/awesome:pulling-updates-from-skills-repository` - Update skills

## Context Cost

- **Discovery**: ~4,700 tokens (47 skills × 100 tokens)
- **Active skill**: ~2,000-5,000 tokens (only when invoked)
- **Total overhead**: ~2.4% of 200k context window

Skills use **progressive disclosure** - they're nearly free until you use them!

## Sources

- Official: https://github.com/anthropics/skills
- Community: https://github.com/obra/superpowers-skills
- Curated list: https://github.com/travisvn/awesome-claude-skills

## Installed

Date: 2026-01-15
Method: Automated installation with `awesome:` namespace
Location: `.claude/commands/awesome/`
