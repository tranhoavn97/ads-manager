# Apple Design System - Implementation Guide

Hướng dẫn triển khai hệ thống thiết kế Apple cho dự án MetaPilot.

---

## 📋 Tổng Quan

Dự án đã được thiết kế lại hoàn toàn theo chuẩn mực **Human Interface Guidelines (HIG)** của Apple. Hệ thống này bao gồm:

- **Design Tokens** - Biến CSS định nghĩa tất cả các màu, kiểu chữ, khoảng cách, v.v.
- **Components** - Các thành phần UI được xây dựng từ tokens (buttons, cards, forms, tables, modals, v.v.)
- **Layout System** - Hệ thống layout responsive, utilities, và responsive breakpoints
- **Dark Mode Support** - Hỗ trợ chế độ tối tự động
- **Accessibility** - WCAG 2.1 AA compliant

---

## 🚀 Cài Đặt Nhanh

### 1. Import CSS Files

Trong `public/index.html`, thêm các file CSS theo thứ tự:

```html
<!-- Design System (imports trong thứ tự) -->
<link rel="stylesheet" href="apple-design-tokens.css" />
<link rel="stylesheet" href="apple-components.css" />
<link rel="stylesheet" href="apple-layout.css" />

<!-- Project-specific overrides (nếu cần) -->
<link rel="stylesheet" href="styles.css" />
```

**Lưu ý:** Order quan trọng! Cascade CSS phải như vậy:
1. Tokens (biến)
2. Components (thành phần)
3. Layout (bố cục)
4. Project styles (ghi đè)

### 2. HTML Structure Template

```html
<!DOCTYPE html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MetaPilot</title>
    <link rel="stylesheet" href="apple-design-tokens.css" />
    <link rel="stylesheet" href="apple-components.css" />
    <link rel="stylesheet" href="apple-layout.css" />
  </head>
  <body>
    <!-- Skip to content link (accessibility) -->
    <a href="#main-content" class="skip-link">Skip to content</a>

    <!-- Main Layout -->
    <div class="layout">
      <!-- Sidebar -->
      <aside class="sidebar">
        <!-- Sidebar content -->
      </aside>

      <!-- Main Container -->
      <main class="container">
        <!-- Header -->
        <header class="header">
          <!-- Header content -->
        </header>

        <!-- Main Content -->
        <div class="main-content" id="main-content">
          <!-- Page content -->
        </div>
      </main>

      <!-- Dock (bottom bar) -->
      <div class="dock">
        <!-- Dock items -->
      </div>
    </div>
  </body>
</html>
```

---

## 🎨 Sử Dụng Design Tokens

### Màu Sắc

```css
/* Trong CSS file */
.my-element {
  background: var(--color-primary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-gray-2);
}
```

```html
<!-- Hoặc class utilities -->
<button class="text-primary">Text xanh lam</button>
<div style="background: var(--color-background-secondary);">Light gray background</div>
```

### Typography

```html
<!-- Sử dụng class utilities -->
<h1 class="display-large">Large title</h1>
<h2 class="title-1">Section title</h2>
<p class="body">Normal body text</p>
<p class="caption-1">Small caption text</p>

<!-- Hoặc inline styles -->
<span style="font: var(--text-title-2);">Title 2</span>
```

### Spacing

```html
<!-- Padding -->
<div class="p-lg">Padding large (24px)</div>
<div class="px-base py-lg">Padding X base, Y large</div>

<!-- Margin -->
<div class="mt-base mb-lg">Margin top base, bottom large</div>

<!-- Gap (flexbox/grid) -->
<div class="flex gap-lg">
  <div>Item 1</div>
  <div>Item 2</div>
</div>
```

---

## 🧩 Sử Dụng Components

### Buttons

```html
<!-- Primary CTA -->
<button class="btn btn-primary">Create Campaign</button>

<!-- Secondary -->
<button class="btn btn-secondary">Cancel</button>

<!-- Tertiary (ghost) -->
<button class="btn btn-tertiary">Learn More</button>

<!-- Destructive -->
<button class="btn btn-destructive">Delete</button>

<!-- Sizes -->
<button class="btn btn-primary btn-sm">Small</button>
<button class="btn btn-primary btn-base">Base (default)</button>
<button class="btn btn-primary btn-lg">Large</button>

<!-- Disabled -->
<button class="btn btn-primary" disabled>Disabled</button>

<!-- With Icon -->
<button class="btn btn-primary">
  <svg width="18" height="18">...</svg>
  Create
</button>

<!-- Button Group -->
<div class="btn-group">
  <button class="btn btn-secondary">Cancel</button>
  <button class="btn btn-primary">Save</button>
</div>
```

### Cards

```html
<!-- Basic Card -->
<div class="card">
  <h2 class="title-2">Campaign Stats</h2>
  <p class="body">Your campaign data here...</p>
</div>

<!-- Card with Header/Footer -->
<div class="card">
  <div class="card-header">
    <h2 class="title-2">Details</h2>
    <button class="btn btn-tertiary btn-sm">Help</button>
  </div>
  <div class="card-body">
    Content here...
  </div>
  <div class="card-footer">
    <button class="btn btn-secondary">Cancel</button>
    <button class="btn btn-primary">Save</button>
  </div>
</div>

<!-- Elevated Card -->
<div class="card card-elevated">
  Important content with more prominence
</div>
```

### Forms

```html
<!-- Form Group -->
<div class="form-group">
  <label for="name" class="label label-required">Campaign Name</label>
  <input
    id="name"
    type="text"
    class="input"
    placeholder="Enter campaign name"
  />
  <span class="form-help">Give your campaign a descriptive name</span>
</div>

<!-- Select -->
<div class="form-group">
  <label for="country" class="label">Country</label>
  <select id="country" class="select">
    <option>Vietnam</option>
    <option>Thailand</option>
  </select>
</div>

<!-- Textarea -->
<div class="form-group">
  <label for="desc" class="label">Description</label>
  <textarea id="desc" class="textarea" placeholder="Enter description"></textarea>
</div>

<!-- Checkboxes -->
<div class="form-group">
  <label class="checkbox-label">
    <input type="checkbox" class="checkbox" />
    I agree to the terms
  </label>
</div>

<!-- Input Validation -->
<input type="email" class="input is-invalid" />
<span class="form-error">❌ Invalid email address</span>

<input type="email" class="input is-valid" />
```

### Tables

```html
<!-- Basic Table -->
<table class="table">
  <thead>
    <tr>
      <th>Campaign Name</th>
      <th>Status</th>
      <th>Spent</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Summer Sale</td>
      <td><span class="badge badge-success">✓ Active</span></td>
      <td>$1,200</td>
    </tr>
    <tr>
      <td>Holiday Campaign</td>
      <td><span class="badge badge-warning">⚠ Paused</span></td>
      <td>$800</td>
    </tr>
  </tbody>
</table>

<!-- Compact Table -->
<table class="table table-compact">
  <!-- ... -->
</table>

<!-- Interactive Table -->
<table class="table table-interactive">
  <!-- Rows are clickable -->
</table>

<!-- Sortable Headers -->
<th class="sortable">Campaign Name</th>
<th class="sortable sorted">Status</th>
```

### Badges

```html
<!-- Status Badges -->
<span class="badge badge-success">✓ Valid</span>
<span class="badge badge-error">✕ Error</span>
<span class="badge badge-warning">⚠ Warning</span>
<span class="badge badge-info">ℹ Info</span>
<span class="badge badge-primary">Primary</span>
<span class="badge badge-secondary">Secondary</span>

<!-- Dismissible Badge -->
<span class="badge badge-success badge-dismissible">
  Tag
  <button class="badge-close">✕</button>
</span>
```

### Modals

```html
<!-- Modal Backdrop (wraps modal) -->
<div class="modal-backdrop">
  <!-- Modal Dialog -->
  <div class="modal">
    <!-- Modal Header -->
    <div class="modal-header">
      <h2 class="modal-title">Confirm Delete</h2>
      <button class="modal-close" aria-label="Close">✕</button>
    </div>

    <!-- Modal Body -->
    <div class="modal-body">
      <p class="body">Are you sure you want to delete this campaign?</p>
    </div>

    <!-- Modal Footer -->
    <div class="modal-footer">
      <button class="btn btn-secondary">Cancel</button>
      <button class="btn btn-destructive">Delete</button>
    </div>
  </div>
</div>

<!-- Modal Sizes -->
<div class="modal modal-sm">Small modal</div>
<div class="modal">Default modal (500px)</div>
<div class="modal modal-lg">Large modal (720px)</div>
<div class="modal modal-fullscreen">Fullscreen modal</div>
```

### Alerts

```html
<!-- Alert -->
<div class="alert alert-success">
  <span class="alert-icon">✓</span>
  <div class="alert-content">
    <div class="alert-title">Success!</div>
    <div class="alert-description">Your campaign has been created</div>
  </div>
  <button class="alert-close">✕</button>
</div>

<!-- Alert Types -->
<div class="alert alert-error">Error message</div>
<div class="alert alert-warning">Warning message</div>
<div class="alert alert-info">Info message</div>

<!-- Toast (fixed position) -->
<div class="toast alert alert-success">
  Campaign created successfully!
</div>
```

### Loaders & Spinners

```html
<!-- Spinner -->
<div class="spinner"></div>
<div class="spinner spinner-sm"></div>
<div class="spinner spinner-lg"></div>

<!-- Skeleton Loader -->
<div class="skeleton" style="width: 100%; height: 200px;"></div>
```

---

## 📐 Layout Patterns

### Container Sizing

```html
<!-- Fluid container -->
<div class="container-fluid">Full width</div>

<!-- Max-width containers -->
<div class="container-sm">Max 640px</div>
<div class="container-base">Max 960px</div>
<div class="container-lg">Max 1280px</div>
<div class="container-xl">Max 1400px</div>
```

### Flexbox Utilities

```html
<!-- Flex row (default) -->
<div class="flex gap-base">
  <div>Item 1</div>
  <div>Item 2</div>
</div>

<!-- Flex column -->
<div class="flex-col gap-base">
  <div>Item 1</div>
  <div>Item 2</div>
</div>

<!-- Centered flex -->
<div class="flex-center" style="height: 200px;">
  <span>Centered content</span>
</div>

<!-- Space-between -->
<div class="flex-between">
  <span>Left</span>
  <span>Right</span>
</div>
```

### Grid Utilities

```html
<!-- Grid 2 columns -->
<div class="grid grid-cols-2 gap-lg">
  <div class="card">Column 1</div>
  <div class="card">Column 2</div>
</div>

<!-- Grid 3 columns -->
<div class="grid grid-cols-3 gap-md">
  <div class="card">Col 1</div>
  <div class="card">Col 2</div>
  <div class="card">Col 3</div>
</div>

<!-- Responsive grid (1 col mobile, 2 col tablet, 3 col desktop) -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
  <!-- Items -->
</div>
```

---

## 🎬 Animations & Transitions

### Built-in Animations

```css
/* CSS animations đã định nghĩa */
animation: fadeIn 0.3s ease-out;
animation: slideUp 0.3s ease-out;
animation: slideDown 0.3s ease-out;
animation: slideLeft 0.3s ease-out;
animation: slideRight 0.3s ease-out;
animation: scaleIn 0.3s ease-out;
animation: spin 0.8s linear infinite;
animation: pulse 2s ease-in-out infinite;
```

### Using Transitions

```css
/* Fast transition (200ms) */
.element {
  transition: var(--transition-fast);
}

/* Base transition (300ms) */
.element {
  transition: var(--transition-base);
}

/* Custom transition */
.element {
  transition: background var(--duration-base) var(--ease-in-out),
              transform var(--duration-short) var(--ease-out);
}
```

---

## 🌙 Dark Mode

### Automatic Dark Mode

Dark mode được áp dụng tự động qua:

```css
@media (prefers-color-scheme: dark) {
  /* Dark mode colors applied */
}
```

### Manual Dark Mode Toggle

```html
<!-- HTML -->
<button id="darkModeToggle">🌙 Dark Mode</button>

<!-- JavaScript -->
<script>
  const toggle = document.getElementById('darkModeToggle');
  toggle.addEventListener('click', () => {
    document.documentElement.style.colorScheme =
      document.documentElement.style.colorScheme === 'dark' ? 'light' : 'dark';
  });
</script>
```

---

## ♿ Accessibility Implementation

### Semantic HTML

```html
<!-- Good -->
<nav aria-label="Main navigation">
  <button>Menu</button>
</nav>

<main id="main-content">
  <h1>Page Title</h1>
</main>

<!-- Headings hierarchy -->
<h1>Page Title</h1>
<h2>Section Title</h2>
<h3>Subsection Title</h3>

<!-- Forms with labels -->
<label for="email">Email</label>
<input id="email" type="email" />

<!-- Buttons with proper roles -->
<button aria-label="Close dialog">✕</button>
```

### Focus Management

```html
<!-- Focus ring automatically applied -->
<button>Click me</button>

<!-- For custom focus styles -->
<div class="element" tabindex="0">Focusable element</div>
```

### ARIA Labels

```html
<!-- Icon buttons need labels -->
<button aria-label="Delete campaign">
  <svg><!-- trash icon --></svg>
</button>

<!-- Live regions for updates -->
<div aria-live="polite" aria-label="Status messages">
  Campaign created successfully!
</div>
```

---

## 📱 Responsive Design

### Breakpoints

```
Mobile:   < 640px    (default)
Tablet:   640 - 1023px
Desktop:  1024px+
Wide:     1280px+
```

### Mobile-First Utilities

```html
<!-- Shows on mobile, hidden on desktop -->
<div class="hidden-desktop">Mobile content</div>

<!-- Shows on tablet+, hidden on mobile -->
<div class="hidden-mobile">Desktop content</div>

<!-- Shows on desktop only -->
<div class="hidden-tablet">Desktop only</div>
```

### Responsive Grid

```html
<!-- 1 col on mobile, 2 on tablet, 3 on desktop -->
<div class="grid grid-cols-1">
  <!-- On tablet add: grid-cols-2 -->
  <!-- On desktop add: grid-cols-3 -->
</div>
```

---

## 🔧 Customization

### Overriding Tokens

```css
/* In your project's CSS file */
:root {
  --color-primary: #FF6600; /* Custom primary color */
  --font-primary: "Helvetica Neue", sans-serif; /* Custom font */
  --space-base: 20px; /* Custom base spacing */
}
```

### Creating Custom Components

```css
/* Use tokens to build custom components */
.my-component {
  padding: var(--space-lg);
  border-radius: var(--radius-md);
  background: var(--color-background-primary);
  border: 1px solid var(--color-gray-2);
  box-shadow: var(--shadow-md);
  transition: var(--transition-base);
}

.my-component:hover {
  box-shadow: var(--shadow-lg);
}
```

---

## 🎯 Migration Checklist

### Step 1: Prepare
- [ ] Backup existing CSS files
- [ ] Add new design system CSS files to project
- [ ] Update index.html with new CSS imports

### Step 2: Update HTML Structure
- [ ] Convert layout to use `.layout`, `.sidebar`, `.container`, `.main-content`, `.dock`
- [ ] Update header markup
- [ ] Update sidebar navigation
- [ ] Add skip-link for accessibility

### Step 3: Migrate Components
- [ ] Update buttons to use `.btn` classes
- [ ] Convert cards to `.card` component
- [ ] Migrate forms to use `.form-group`, `.label`, `.input`
- [ ] Update tables to `.table` component
- [ ] Convert modals to `.modal` structure

### Step 4: Style Updates
- [ ] Replace color references with CSS variables
- [ ] Update spacing to use space tokens
- [ ] Remove old CSS files (gradually or in one go)
- [ ] Test dark mode

### Step 5: Testing
- [ ] Test on all devices (mobile, tablet, desktop)
- [ ] Test dark mode
- [ ] Test keyboard navigation
- [ ] Test with screen readers
- [ ] Performance check (CSS file size)

---

## 📊 File Sizes

```
apple-design-tokens.css    ~12 KB
apple-components.css       ~25 KB
apple-layout.css           ~18 KB
────────────────────────────────
Total (uncompressed)       ~55 KB
Total (gzipped)            ~12 KB
```

---

## 🚨 Common Pitfalls

### ❌ Don't
- Don't import CSS files out of order
- Don't use color hex values directly; use `var(--color-*)`
- Don't create custom spacing; use space tokens
- Don't skip the skip-link for accessibility
- Don't remove focus states for styling

### ✅ Do
- Import CSS in correct order (tokens → components → layout)
- Use CSS variables for consistency
- Use existing components instead of creating new ones
- Test on real devices, not just browser DevTools
- Maintain accessibility standards throughout

---

## 📚 References

- [Design System Document](./DESIGN_SYSTEM.md)
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

---

## 💬 Support

For questions or issues:
1. Check the DESIGN_SYSTEM.md for detailed specifications
2. Review existing component examples in this guide
3. Refer to Apple HIG for design decisions
