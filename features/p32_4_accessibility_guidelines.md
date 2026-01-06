# P32.4 Accessibility Guidelines

**Applies to:** All P32.4 stories (00-11)
**Priority:** P2 for prototype, **P1 for production**

---

## Overview

These accessibility guidelines apply to all P32.4 components. Follow WCAG 2.1 Level AA standards.

---

## Keyboard Navigation

### All Interactive Elements

**Requirement:** Every clickable element must be keyboard-accessible

```tsx
// ✅ Good: Native button (keyboard accessible)
<button onClick={handleClick}>Click me</button>

// ❌ Bad: Non-semantic div (not keyboard accessible)
<div onClick={handleClick}>Click me</div>

// ✅ Fix: Add role + tabIndex
<div role="button" tabIndex={0} onClick={handleClick} onKeyPress={handleKeyPress}>
  Click me
</div>
```

### Tab Order

**Components affected:** All modals, forms, navigation

```tsx
// Modal should trap focus
<Dialog onOpenChange={setOpen}>
  <DialogContent>
    {/* Focus trapped within modal */}
    {/* Tab cycles through: Close button → Input → Submit → Close */}
  </DialogContent>
</Dialog>
```

### Keyboard Shortcuts

| Component | Shortcut | Action |
|-----------|----------|--------|
| All Modals | `Escape` | Close modal |
| ReactionsModal (P32.4_04) | `Escape` | Close |
| CreateIdeaModal (P32.4_00) | `Escape` | Confirm discard if text entered |
| LiveSession (P32.4_08b) | `Escape` | Confirm cancel if interacted |
| Message hover (P32.4_07) | `Ctrl+V` | Trigger verification (optional) |

---

## Screen Readers

### ARIA Labels

**Required for icon-only buttons:**

```tsx
// ✅ All icon buttons need aria-label
<button aria-label="Close modal" onClick={onClose}>
  <X className="w-5 h-5" />
</button>

<button aria-label="Search" onClick={onSearch}>
  <Search className="w-6 h-6" />
</button>

<button aria-label="Notifications" onClick={onNotifications}>
  <Bell className="w-6 h-6" />
  {hasUnread && <span className="sr-only">You have unread notifications</span>}
</button>
```

### Live Regions

**For dynamic content updates:**

```tsx
// Badge counts that change
<div aria-live="polite" aria-atomic="true">
  <span className="sr-only">
    {badgeCount} new activities from {user.name}
  </span>
  <span aria-hidden="true">{badgeCount}</span>
</div>

// Loading states
<div role="status" aria-live="polite">
  {isLoading && <span className="sr-only">Loading reactions...</span>}
</div>
```

### Semantic HTML

**Use correct elements:**

```tsx
// ✅ Good: Semantic structure
<nav aria-label="Main navigation">
  <ul>
    <li><a href="/feed">Feed</a></li>
    <li><a href="/profile">Profile</a></li>
  </ul>
</nav>

<main>
  <h1>Feed</h1>
  <article>
    <h2>Idea Title</h2>
    <p>Idea text...</p>
  </article>
</main>

// ❌ Bad: Divs everywhere
<div className="nav">
  <div className="nav-item">Feed</div>
</div>
```

---

## Focus Management

### Modals

**When modal opens:**
```tsx
useEffect(() => {
  if (isOpen) {
    // Store previously focused element
    const previouslyFocused = document.activeElement as HTMLElement;

    // Focus first input in modal
    inputRef.current?.focus();

    return () => {
      // Restore focus when modal closes
      previouslyFocused?.focus();
    };
  }
}, [isOpen]);
```

### Focus Visible

**Show focus indicators:**
```css
/* Add to global CSS */
*:focus-visible {
  outline: 2px solid #3B82F6; /* blue-500 */
  outline-offset: 2px;
}

/* Remove outline for mouse users */
*:focus:not(:focus-visible) {
  outline: none;
}
```

---

## Color Contrast

### Text Contrast Ratios

**WCAG AA Requirements:**
- Normal text: 4.5:1
- Large text (18pt+ or 14pt bold): 3:1

**Check all color combinations:**

| Usage | Foreground | Background | Ratio | Pass? |
|-------|-----------|------------|-------|-------|
| Primary text | `gray-900` | `white` | 18.8:1 | ✅ |
| Secondary text | `gray-600` | `white` | 7.5:1 | ✅ |
| Blue button text | `white` | `blue-500` | 7.2:1 | ✅ |
| Meta text | `gray-500` | `white` | 4.6:1 | ✅ |
| Muted text | `gray-400` | `white` | 2.9:1 | ⚠️ Fail (use gray-500) |

**Action:** Replace `text-gray-400` with `text-gray-500` for small text

---

## Touch Targets

### Minimum Size: 44×44px

**Mobile tap targets:**

```tsx
// ✅ Good: 44px minimum (icon + padding)
<button className="p-2"> {/* 2 × 8px = 16px padding */}
  <Icon className="w-6 h-6" /> {/* 24px icon */}
</button>
// Total: 24 + 16 + 16 = 56px ✅

// ❌ Bad: Too small
<button className="p-1">
  <Icon className="w-4 h-4" />
</button>
// Total: 16 + 8 + 8 = 32px ❌
```

### Spacing Between Targets

**Minimum 8px gap between tappable elements:**

```tsx
<div className="flex gap-3"> {/* 12px gap ✅ */}
  <button>Agree</button>
  <button>Disagree</button>
  <button>Unsure</button>
</div>
```

---

## Motion & Animation

### Respect prefers-reduced-motion

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

**Or in Tailwind:**
```tsx
<div className="animate-pulse motion-reduce:animate-none">
  Loading...
</div>
```

---

## Forms

### All form inputs need labels

```tsx
// ✅ Good: Visible label
<label htmlFor="idea-input" className="block text-sm font-medium mb-1">
  Your Idea
</label>
<textarea id="idea-input" />

// ✅ Also good: aria-label for hidden labels
<textarea aria-label="Your idea" placeholder="Share your idea..." />
```

### Error messages

```tsx
// Link errors to inputs
<label htmlFor="idea">Your idea</label>
<textarea
  id="idea"
  aria-invalid={hasError}
  aria-describedby={hasError ? "idea-error" : undefined}
/>
{hasError && (
  <p id="idea-error" role="alert" className="text-red-500 text-sm">
    Idea is too long (max 280 characters)
  </p>
)}
```

---

## Component-Specific Guidelines

### P32.4_00: CreateIdeaModal

```tsx
// Focus trap
<Dialog>
  <DialogContent>
    <DialogTitle>New Idea</DialogTitle>
    <textarea
      ref={textareaRef}
      aria-label="Idea text"
      aria-describedby="char-count"
    />
    <div id="char-count" aria-live="polite">
      {charCount} / 280 characters
    </div>
  </DialogContent>
</Dialog>
```

### P32.4_02: Story Badges

```tsx
// Screen reader announcement for badge counts
<button aria-label={`${user.name}, ${badgeCount} new activities`}>
  <div className="relative">
    <Avatar src={user.avatar} />
    {badgeCount > 0 && (
      <span className="badge" aria-hidden="true">
        {badgeCount}
      </span>
    )}
  </div>
</button>
```

### P32.4_04: ReactionsModal

```tsx
// Announce loading/loaded states
<div role="dialog" aria-labelledby="reactions-title">
  <h2 id="reactions-title">People who agreed</h2>
  {isLoading ? (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading reactions...</span>
      {/* Skeleton UI */}
    </div>
  ) : (
    <ul role="list">
      {reactions.map(...)}
    </ul>
  )}
</div>
```

### P32.4_07: Message Verification

```tsx
// Tooltip for screen readers
<button
  onClick={handleVerify}
  aria-label={isOwn
    ? "Verify that they understood your message"
    : "Verify that you understood their message"
  }
>
  {isOwn ? 'Did you understand me?' : 'Did I understand you?'}
</button>
```

---

## Testing Checklist

### Automated Testing
- [ ] Run axe DevTools on all pages
- [ ] Run Lighthouse accessibility audit
- [ ] Check color contrast with WebAIM tool

### Manual Testing
- [ ] Navigate entire app with keyboard only
- [ ] Test with screen reader (VoiceOver/NVDA)
- [ ] Zoom to 200% (text should not break)
- [ ] Test with prefers-reduced-motion enabled

### User Testing
- [ ] Test with users who use assistive tech
- [ ] Test on mobile with VoiceOver/TalkBack
- [ ] Test with keyboard-only users

---

## Priority Matrix

| Feature | Prototype | Production |
|---------|-----------|------------|
| Keyboard navigation | P2 | **P1** |
| ARIA labels | P2 | **P1** |
| Focus management | P2 | **P1** |
| Color contrast | P1 | **P1** |
| Touch targets (mobile) | P1 | **P1** |
| Screen reader support | P3 | **P1** |
| prefers-reduced-motion | P3 | P2 |

---

## Implementation Strategy

### Phase 1 (Now - Prototype)
- ✅ Ensure touch targets ≥ 44px
- ✅ Add aria-label to icon buttons
- ✅ Escape key closes modals
- ✅ Color contrast for text

### Phase 2 (Before Production)
- Add ARIA live regions
- Implement focus trapping in modals
- Full keyboard navigation testing
- Screen reader testing

### Phase 3 (Post-Launch)
- User testing with assistive tech
- Accessibility audit
- Remediate issues

---

## Resources

- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [WebAIM Color Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Inclusive Components](https://inclusive-components.design/)
- [A11y Project Checklist](https://www.a11yproject.com/checklist/)

---

**Status:** Guidelines established
**Next:** Apply to all P32.4 components during implementation
