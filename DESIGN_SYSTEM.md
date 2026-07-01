# Apple Design System - MetaPilot Redesign

Một hệ thống thiết kế toàn diện theo chuẩn mực Human Interface Guidelines (HIG) của Apple, áp dụng cho ứng dụng quản lý quảng cáo Facebook hàng loạt **MetaPilot**.

---

## 📋 Mục Lục

1. [Triết Lý Thiết Kế](#triết-lý-thiết-kế)
2. [Thang Màu](#thang-màu)
3. [Typography](#typography)
4. [Spacing & Layout](#spacing--layout)
5. [Components](#components)
6. [Patterns](#patterns)
7. [Accessibility](#accessibility)
8. [Dark Mode](#dark-mode)
9. [Implementation Guide](#implementation-guide)

---

## 🎯 Triết Lý Thiết Kế

### Nguyên Tắc Cốt Lõi

**1. Clarity (Sáng suốt)**
- Nội dung phải dễ đọc, không phức tạp
- Mỗi thành phần phải có mục đích rõ ràng
- Bỏ bớt yếu tố trang trí không cần thiết

**2. Deference (Tôn trọng nội dung)**
- Giao diện không nên cạnh tranh với nội dung
- Hỗ trợ người dùng tập trung vào dữ liệu
- Sử dụng whitespace để tạo hệ thống phân cấp

**3. Depth (Chiều sâu)**
- Sử dụng shadows, layers và animations để tạo cấp độ
- Phân biệt rõ các tầng UI (background, content, overlay)
- Tạo cảm giác thị giác 3D tinh tế

**4. Minimalism (Chủ nghĩa tối giản)**
- Loại bỏ tất cả những gì không cần thiết
- Thiết kế sạch, không rối mắt
- Sử dụng negative space một cách chiến lược

**5. Human-Centered (Tập trung vào con người)**
- Thiết kế cho người dùng, không cho công nghệ
- Ưu tiên khả năng sử dụng dễ dàng
- Cần hỗ trợ trên nhiều thiết bị

---

## 🎨 Thang Màu

### Ngữ Cảnh Màu (Semantic)

```css
/* Màu Sắc Chính */
--color-primary: #0071E3          /* Xanh lam Apple (CTA, nhấn) */
--color-secondary: #34C759        /* Xanh lục (thành công) */
--color-destructive: #FF3B30      /* Đỏ (lỗi, xoá) */
--color-warning: #FF9500          /* Cam (cảnh báo) */
--color-info: #30B0C0             /* Xanh ngọc (thông tin) */

/* Thang Xám (Neutral) */
--color-gray-1: #F5F5F7           /* Nền sáng */
--color-gray-2: #EBEBF0           /* Viền, divider */
--color-gray-3: #D1D1D6           /* Border thứ cấp */
--color-gray-4: #8E8E93           /* Text mờ */
--color-gray-5: #636366           /* Text thứ cấp */
--color-gray-6: #424245           /* Text chính */
--color-gray-7: #1D1D1F           /* Nền tối */

/* Nền Tầng Lớp */
--color-background-primary: #FFFFFF
--color-background-secondary: #F5F5F7
--color-background-tertiary: #EBEBF0

/* Text */
--color-text-primary: #000000
--color-text-secondary: #636366
--color-text-tertiary: #8E8E93
--color-text-inverse: #FFFFFF
```

### Dark Mode Equivalent

```css
@media (prefers-color-scheme: dark) {
  --color-gray-1: #1D1D1F
  --color-gray-2: #424245
  --color-gray-3: #636366
  --color-gray-4: #8E8E93
  --color-gray-5: #A1A1A6
  --color-gray-6: #E5E5EA
  --color-gray-7: #F5F5F7
  
  --color-background-primary: #000000
  --color-background-secondary: #1D1D1F
  --color-background-tertiary: #2C2C30
  
  --color-text-primary: #F5F5F7
  --color-text-secondary: #A1A1A6
  --color-text-tertiary: #8E8E93
}
```

### Màu Hoạt Động

| Trạng Thái | Màu | Ý Nghĩa |
|---|---|---|
| Hợp lệ | `#34C759` | Dữ liệu đầy đủ, sẵn sàng tạo |
| Lỗi | `#FF3B30` | Thiếu dữ liệu hoặc xảy ra lỗi |
| Cảnh báo | `#FF9500` | Cần kiểm tra hoặc chú ý |
| Tạm dừng | `#8E8E93` | Hoạt động bị tạm dừng |
| Đang chạy | `#30B0C0` | Đang hoạt động |

---

## 🔤 Typography

### Font Stack

```css
--font-primary: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
--font-mono: "Menlo", "Monaco", "Courier New", monospace;
```

### Scales Văn Bản

```
Display Large   | 32px | 700 | 1.2  | Tiêu đề chính lớn
Display         | 28px | 600 | 1.2  | Tiêu đề lớn
Title 1         | 24px | 600 | 1.25 | Tiêu đề phần
Title 2         | 20px | 600 | 1.3  | Tiêu đề nhỏ
Title 3         | 18px | 500 | 1.4  | Tiêu đề con
Body Large      | 17px | 400 | 1.5  | Nội dung chính lớn
Body            | 16px | 400 | 1.5  | Nội dung chính
Body Small      | 15px | 400 | 1.45 | Nội dung phụ
Caption 1       | 13px | 400 | 1.4  | Caption, hint
Caption 2       | 12px | 400 | 1.35 | Small text, badge
```

### Tỷ Lệ Hàng

```css
--line-height-tight: 1.2      /* Tiêu đề */
--line-height-normal: 1.5     /* Nội dung */
--line-height-relaxed: 1.75   /* Nội dung dài */
```

### Font Weight

```css
--font-weight-regular: 400
--font-weight-medium: 500
--font-weight-semibold: 600
--font-weight-bold: 700
```

---

## 📐 Spacing & Layout

### Hệ Thống Lưới (8px Grid)

Apple sử dụng hệ thống lưới 8px làm cơ sở cho toàn bộ spacing:

```css
--space-xs: 4px      /* 0.5 units */
--space-sm: 8px      /* 1 unit */
--space-md: 12px     /* 1.5 units */
--space-base: 16px   /* 2 units - DEFAULT */
--space-lg: 24px     /* 3 units */
--space-xl: 32px     /* 4 units */
--space-2xl: 48px    /* 6 units */
--space-3xl: 64px    /* 8 units */
--space-4xl: 80px    /* 10 units */
```

### Layout Cấu Trúc

```
Desktop (≥1024px):
┌─────────────────────────────────────┐
│ Header (56px)                       │
├─────────────────────────────────────┤
│ Sidebar  │ Main Content            │
│ (240px)  │ (padding: 32px)         │
│          │ (max-width: 1280px)     │
│          │                         │
│          │                         │
└─────────────────────────────────────┘
│ Dock (60px)                         │

Tablet (640px - 1024px):
┌─────────────────────────────────────┐
│ Header (56px)                       │
├─────────────────────────────────────┤
│ Main Content                        │
│ (padding: 24px)                     │
│                                     │
└─────────────────────────────────────┘
│ Dock (60px)                         │

Mobile (< 640px):
┌─────────────────────────────────────┐
│ Header (48px)                       │
├─────────────────────────────────────┤
│ Main Content                        │
│ (padding: 16px)                     │
│                                     │
└─────────────────────────────────────┘
│ Dock (60px)                         │
```

### Container Max-Width

```css
--container-sm: 640px    /* Sidebar, modals */
--container-base: 960px  /* Bảng dữ liệu */
--container-lg: 1280px   /* Nội dung rộng */
--container-xl: 1400px   /* Dashboard */
```

---

## 🧩 Components

### 1. Buttons

#### Primary Button (CTA)
- Nền: `--color-primary` (#0071E3)
- Text: Trắng
- Height: 44px (Touch target)
- Border Radius: 10px
- Font Weight: 600
- Padding: 12px 20px

```css
.btn-primary {
  background: var(--color-primary);
  color: white;
  height: 44px;
  border-radius: 10px;
  font-weight: 600;
  padding: 0 20px;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-primary:hover {
  background: #0051CC;
  box-shadow: 0 2px 8px rgba(0, 113, 227, 0.2);
}

.btn-primary:active {
  background: #003DA6;
  transform: scale(0.98);
}
```

#### Secondary Button
- Nền: `--color-gray-2`
- Text: `--color-text-primary`
- Border: 1px `--color-gray-3`

#### Tertiary Button
- Nền: Trong suốt
- Text: `--color-primary`
- Border: Không

#### Destructive Button (Xoá)
- Nền: `--color-destructive`
- Text: Trắng

### 2. Cards & Surfaces

```css
.card {
  background: var(--color-background-primary);
  border-radius: 12px;
  border: 1px solid var(--color-gray-2);
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  transition: box-shadow 0.2s ease;
}

.card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.card-elevated {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
```

### 3. Forms & Inputs

```css
.input, .select, .textarea {
  padding: 12px 16px;
  border-radius: 10px;
  border: 1px solid var(--color-gray-2);
  font-family: var(--font-primary);
  font-size: 16px;
  transition: border-color 0.2s ease;
  background: var(--color-background-primary);
  color: var(--color-text-primary);
}

.input:focus, .select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.1);
}

.input::placeholder {
  color: var(--color-text-tertiary);
}
```

### 4. Badges & Tags

```css
.badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.badge-success { background: rgba(52, 199, 89, 0.15); color: #00AA00; }
.badge-error { background: rgba(255, 59, 48, 0.15); color: #FF3B30; }
.badge-warning { background: rgba(255, 149, 0, 0.15); color: #FF9500; }
.badge-info { background: rgba(48, 176, 192, 0.15); color: #30B0C0; }
```

### 5. Tables

```css
.table {
  width: 100%;
  border-collapse: collapse;
  background: var(--color-background-primary);
}

.table thead th {
  background: var(--color-background-secondary);
  border-bottom: 1px solid var(--color-gray-2);
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-text-secondary);
}

.table tbody tr {
  border-bottom: 1px solid var(--color-gray-2);
}

.table tbody tr:hover {
  background: var(--color-background-secondary);
}

.table td {
  padding: 12px 16px;
  font-size: 14px;
}
```

### 6. Modals & Overlays

```css
.modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(8px);
  animation: fadeIn 0.3s ease;
}

.modal-content {
  background: var(--color-background-primary);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  max-width: 500px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  animation: slideUp 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { transform: translateY(30px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
```

---

## 🎭 Patterns

### 1. Header/Navigation Bar

- Height: 56px (desktop), 48px (mobile)
- Sticky: ✓
- Shadow: Subtle bottom border (1px solid `--color-gray-2`)
- Background: `--color-background-primary`

```
┌─────────────────────────────────────┐
│ Logo | Title         | Actions | 👤 │
└─────────────────────────────────────┘
```

### 2. Sidebar Navigation

- Width: 240px (desktop), collapsible
- Background: `--color-background-secondary`
- Items spacing: 4px

```
┌──────────────────┐
│ Brand            │
├──────────────────┤
│ ▶ Group          │
│   └─ Item 1 ✓    │
│   └─ Item 2      │
│ ▶ Group          │
├──────────────────┤
│ Account Select   │
│ User Profile     │
└──────────────────┘
```

### 3. Data Table

- Row height: 44px
- Hover state: Light background
- Alternating rows: Không (Apple không dùng)
- Sticky header: ✓
- Sortable columns: ✓

### 4. Form Dialog

- Modal width: 90% (mobile), 500px (desktop)
- Padding: 24px
- Bottom action bar: 16px spacing

```
┌─────────────────────────────┐
│ ✕ Title              Help   │
├─────────────────────────────┤
│                             │
│ Form content...             │
│                             │
├─────────────────────────────┤
│              [Cancel] [OK]  │
└─────────────────────────────┘
```

### 5. Empty State

```
        📊
    No data yet
    
Create your first campaign to get started.

    [Create Campaign]
```

### 6. Status Indicators

```
Status | Color | Animation
───────┼───────┼──────────────
✓ OK   | 🟢    | —
⚠ Warn | 🟠    | Pulse (1s)
✕ Err  | 🔴    | Pulse (0.6s)
⟳ Load | 🔵    | Spin (1s)
```

---

## ♿ Accessibility

### WCAG 2.1 AA Compliance

**1. Color Contrast**
- Text: ≥4.5:1 (normal), ≥3:1 (large 18pt+)
- Kiểm tra với: [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)

**2. Focus Management**
- Visible focus ring: 2px solid `--color-primary`
- Outline offset: 2px
- Focus order: Logical tab order

**3. Semantic HTML**
- Sử dụng: `<button>`, `<a>`, `<form>`, `<label>`
- ARIA labels cho icons: `aria-label="Close"`
- Live regions cho updates: `aria-live="polite"`

**4. Keyboard Navigation**
- Tất cả tính năng từ bàn phím
- Escape đóng modals
- Enter confirm actions
- Tab di chuyển giữa elements

**5. Screen Readers**
- Descriptive alt text
- Form labels liên kết
- Headings phân cấp (h1 → h6)

---

## 🌙 Dark Mode

### Implementation

```css
/* Light Mode (default) */
:root {
  --color-primary: #0071E3;
  --color-background-primary: #FFFFFF;
  --color-text-primary: #000000;
}

/* Dark Mode */
@media (prefers-color-scheme: dark) {
  :root {
    --color-primary: #0A84FF;
    --color-background-primary: #000000;
    --color-text-primary: #F5F5F7;
  }
}
```

### Shadow Adjustment
Light mode shadows sẽ quá tối trên dark mode. Cần điều chỉnh opacity:

```css
/* Light Mode */
box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);

/* Dark Mode */
@media (prefers-color-scheme: dark) {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
```

---

## 🔧 Implementation Guide

### 1. File Structure

```
public/
├── index.html
├── app.js
├── styles/
│   ├── tokens.css              # Design tokens
│   ├── components.css            # Component styles
│   ├── layout.css               # Layout patterns
│   ├── theme.css                # Theme overrides
│   └── responsive.css           # Media queries
└── img/
    └── icons/                   # SVG icons
```

### 2. Usage Examples

```html
<!-- Button -->
<button class="btn btn-primary">Tạo quảng cáo</button>
<button class="btn btn-secondary">Hủy</button>
<button class="btn btn-destructive">Xoá</button>

<!-- Card -->
<div class="card">
  <h2 class="title-2">Tiêu đề</h2>
  <p class="body">Nội dung...</p>
</div>

<!-- Input -->
<label for="name" class="label">Tên chiến dịch</label>
<input id="name" type="text" class="input" placeholder="Nhập tên..." />

<!-- Badge -->
<span class="badge badge-success">✓ Hợp lệ</span>

<!-- Table -->
<table class="table">
  <thead>
    <tr>
      <th>Tên</th>
      <th>Trạng thái</th>
    </tr>
  </thead>
</table>
```

### 3. CSS Cascade

```css
/* 1. Tokens (Variables) */
@import url("tokens.css");

/* 2. Reset & Base */
@import url("reset.css");

/* 3. Components */
@import url("components.css");

/* 4. Layout */
@import url("layout.css");

/* 5. Theme Overrides */
@import url("theme.css");

/* 6. Responsive */
@import url("responsive.css");
```

### 4. Responsive Breakpoints

```css
/* Mobile First */
/* default: 320px - 639px */

@media (min-width: 640px) {
  /* Tablet: 640px - 1023px */
}

@media (min-width: 1024px) {
  /* Desktop: 1024px+ */
}

@media (min-width: 1280px) {
  /* Wide: 1280px+ */
}
```

---

## 📱 Mobile-First Approach

Apple thiết kế cho mobile trước, sau đó mở rộng lên. Điều này đảm bảo:

1. ✓ Ưu tiên nội dung chính
2. ✓ Touch targets ≥44x44px
3. ✓ Scrollable content, không horizontal scroll
4. ✓ Stacked layout, không side-by-side
5. ✓ Accessible forms (large labels, inputs)

---

## 🎬 Animations & Transitions

### Duration Guidelines

```
Micro interactions: 150ms - 300ms
Dismissals:       300ms - 400ms
Entrances:        400ms - 500ms
Transitions:      300ms - 500ms
```

### Easing Functions

```css
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--ease-in: cubic-bezier(0.4, 0, 1, 1);
```

### Examples

```css
/* Button hover */
transition: all 0.2s ease-out;

/* Modal appear */
animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);

/* Loading spinner */
animation: spin 1s linear infinite;
```

---

## 📊 Design Tokens Summary

| Category | Token | Value |
|---|---|---|
| **Color** | Primary | #0071E3 |
| | Secondary | #34C759 |
| | Destructive | #FF3B30 |
| **Typography** | Font Family | -apple-system, ... |
| | Base Size | 16px |
| | Line Height | 1.5 |
| **Spacing** | Base Unit | 8px |
| | Small | 8px |
| | Medium | 16px |
| | Large | 24px |
| **Radius** | Small | 8px |
| | Medium | 10px |
| | Large | 12px |
| | Full | 9999px |
| **Shadow** | Subtle | 0 1px 3px rgba(...) |
| | Medium | 0 4px 12px rgba(...) |
| | Large | 0 20px 60px rgba(...) |

---

## 🚀 Next Steps

1. **Implement Design Tokens** → `tokens.css`
2. **Build Components** → `components.css`
3. **Create Layout System** → `layout.css`
4. **Update HTML** → Semantic structure
5. **Add Dark Mode** → Media queries
6. **Test Responsive** → All breakpoints
7. **Audit Accessibility** → WCAG 2.1 AA
8. **Performance Optimization** → CSS minification

---

## 📚 References

- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [System Fonts Stack](https://systemfontstack.com/)
- [Material Design (for comparison)](https://material.io/design/)
