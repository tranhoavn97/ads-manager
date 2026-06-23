# Trình tạo quảng cáo Facebook hàng loạt

Web tool tiếng Việt giúp tạo **campaign → ad set → ad creative → ad** trên Facebook hàng loạt từ một file **Excel / Google Sheet**, dùng **Meta Marketing API** và **Facebook Login for Business**.

Công cụ tự đọc các cột trong sheet, tự tách **Page ID** từ link Page và **Post/Object ID** từ link bài viết/reel/ảnh, kiểm tra Page có thuộc tài khoản đang đăng nhập không, cho chọn tài khoản quảng cáo và loại chiến dịch, hiển thị **màn hình preview kiểm lỗi từng dòng** trước khi tạo, và có **chế độ nháp** để không bật quảng cáo ngay.

---

## 1. Yêu cầu

- **Node.js >= 18.17** (khuyến nghị 20 hoặc 22).
- Một **Facebook App** (loại Business) đã bật sản phẩm **Facebook Login for Business** và **Marketing API**.
- Tài khoản Facebook có quyền quản lý Page và tài khoản quảng cáo cần dùng.

---

## 2. Cài đặt

```bash
# 1. Cài thư viện
npm install

# 2. Tạo file cấu hình từ mẫu
cp .env.example .env

# 3. Mở .env và điền thông tin App của bạn (xem mục 3)
```

---

## 3. Cấu hình `.env`

Mở file `.env` và điền các biến sau:

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `FB_APP_ID` | ✅ | App ID của Facebook App |
| `FB_APP_SECRET` | ✅ | App Secret (giữ bí mật, **không** đưa lên client) |
| `FB_REDIRECT_URI` | ✅ | URL callback, mặc định `http://localhost:3000/api/auth/callback` |
| `FB_CONFIG_ID` | tùy chọn | Cấu hình **Login for Business** (nếu dùng) |
| `FB_API_VERSION` | tùy chọn | Phiên bản Graph API, mặc định `v20.0` |
| `FB_SCOPES` | tùy chọn | Danh sách quyền, mặc định đã đủ dùng |
| `SESSION_SECRET` | ✅ | Chuỗi bí mật để mã hóa session (đặt chuỗi ngẫu nhiên dài) |
| `PORT` | tùy chọn | Cổng chạy, mặc định `3000` |
| `SECURE_COOKIES` | tùy chọn | Đặt `true` khi chạy qua HTTPS thật |

> **Bảo mật token:** Access token **chỉ** được lưu phía server trong session, **không bao giờ** gửi xuống trình duyệt và **không hardcode** trong mã nguồn.

### Thiết lập trên developers.facebook.com

1. Vào **App của bạn → Settings → Basic** để lấy **App ID** và **App Secret**.
2. Thêm sản phẩm **Facebook Login for Business** (hoặc Facebook Login).
3. Trong phần cấu hình Login → **Valid OAuth Redirect URIs**, thêm đúng giá trị `FB_REDIRECT_URI` (vd: `http://localhost:3000/api/auth/callback`).
4. (Nếu dùng Login for Business) Tạo một **Configuration**, lấy **Config ID** điền vào `FB_CONFIG_ID`. Trong configuration nhớ bật các quyền ở mục 4.
5. Đảm bảo App đã được cấp quyền **Marketing API** và tài khoản test/người dùng có vai trò phù hợp.

---

## 4. Quyền (permissions / scopes) cần có

- `ads_management` — tạo và quản lý quảng cáo.
- `ads_read` — đọc thông tin tài khoản quảng cáo.
- `pages_show_list` — liệt kê các Page bạn quản lý.
- `pages_read_engagement` — đọc nội dung/bài viết của Page.
- `pages_manage_ads` — chạy quảng cáo cho Page.

> Các quyền nâng cao này cần được **App Review** duyệt trước khi dùng với người dùng thật. Khi đang phát triển, hãy thêm tài khoản của bạn làm **Admin/Developer/Tester** của App để dùng thử.

---

## 5. Chạy

```bash
npm start
# hoặc khi phát triển (tự reload):
npm run dev
```

Mở trình duyệt: **http://localhost:3000**

Luồng sử dụng: **Đăng nhập Facebook → Chọn tài khoản quảng cáo → Tải file sheet → Kiểm tra (preview) → Tạo hàng loạt**.

---

## 6. Định dạng file sheet

Hỗ trợ **.xlsx**, **.xls**, **.csv**. Bấm nút **“Tải file mẫu”** trong giao diện để có sẵn template đúng cột.

Các cột (tên cột linh hoạt, công cụ tự nhận diện không phân biệt hoa thường/dấu):

| Cột | Ví dụ | Ghi chú |
|---|---|---|
| **Link Page** | `https://facebook.com/61550000000000` | Tự tách Page ID. Link dạng tên (vanity) sẽ được resolve qua API nếu bạn quản lý Page đó. |
| **Link bài viết/Reel/Ảnh** | `.../posts/1234567890` hoặc `123_456` | Tự tách Post/Object ID. Dùng cho loại “boost bài viết”. |
| **Link CTA** | `https://shop.example.com/sale` | Website đích. **Bắt buộc** với Traffic và Doanh số. |
| **Tên chiến dịch** | `CD Tương tác T6` | |
| **Tên nhóm quảng cáo** | `Nhóm VN 25-45` | |
| **Tên quảng cáo** | `QC Bài viết A` | |
| **Loại chiến dịch** | `Tương tác` | Một trong: **Tin nhắn, Tương tác, Traffic, Lead, Doanh số**. |
| **Nút CTA** | `Mua ngay` hoặc `LEARN_MORE` | *Tùy chọn.* Nút kêu gọi hành động. **Để trống** = tự suy theo loại (Tương tác→Thích Trang, Traffic→Tìm hiểu thêm, Tin nhắn→Gửi tin nhắn, Lead→Đăng ký, Doanh số→Mua ngay). Có thể điền nhãn tiếng Việt hoặc mã (xem sheet **“Danh sách nút CTA”** trong file mẫu). Chỉ áp dụng cho quảng cáo dạng link/website. |
| **Quốc gia** | `Việt Nam` hoặc `VN`, `VN,US` | Tên tiếng Việt hoặc mã ISO; nhiều nước cách nhau bởi dấu phẩy. |
| **Ngân sách** | `200000` | Ngân sách **theo ngày**, đơn vị theo tiền tệ tài khoản (vd VND). |
| **Ngày bắt đầu** | `24/06/2026` | Định dạng `dd/mm/yyyy`. |
| **Ngày kết thúc** | `30/06/2026` | Có thể để trống (chạy liên tục). |
| **Trạng thái** | `Bật` / `Tạm dừng` | `Bật` = ACTIVE, còn lại = PAUSED. **Chế độ nháp luôn ép PAUSED.** |

### Xuất từ Google Sheet
Trong Google Sheet: **File → Download → Microsoft Excel (.xlsx)** (hoặc **.csv**), rồi tải file đó lên công cụ.

---

## 7. Ý nghĩa trạng thái từng dòng

| Trạng thái | Ý nghĩa |
|---|---|
| **Hợp lệ** | Đủ dữ liệu, sẵn sàng tạo. |
| **Thiếu dữ liệu** | Thiếu cột bắt buộc hoặc sai định dạng (xem chi tiết lỗi). |
| **Lỗi quyền** | Page không thuộc tài khoản đang đăng nhập, hoặc thiếu quyền chạy ads cho Page. |
| **Lỗi post** | Không tìm thấy bài viết/Object ID, hoặc không có quyền đọc bài. |
| **Đã tạo thành công** | Đã tạo xong campaign/ad set/ad. |
| **Lỗi khi tạo** | Meta API trả lỗi khi tạo (thông báo lỗi hiển thị bằng tiếng Việt). |

Màn hình preview có **bộ lọc theo trạng thái** và **bảng dữ liệu** để bạn soát lỗi trước khi bấm **Tạo hàng loạt**.

---

## 8. Chế độ nháp (Draft)

Khi bật **Chế độ nháp**, toàn bộ campaign/ad set/ad được tạo ở trạng thái **PAUSED** — quảng cáo **không tự chạy**. Bạn vào Trình quản lý quảng cáo (Ads Manager) kiểm tra rồi tự bật khi sẵn sàng.

---

## 8b. Tính năng giao diện

- **Cột “Nút CTA”** trong bảng: hiển thị nút kêu gọi hành động của từng dòng (chấm vàng nhỏ = nút do bạn tự điền trong file; không có chấm = nút mặc định theo loại).
- **Dock dưới cùng** (luôn hiện): thanh **loading** (đổi **đỏ** khi có lỗi), tab **Nhật ký** hoạt động (đếm lỗi) và tab **Lịch sử camp**.
- **Lịch sử camp** lưu trong trình duyệt (`localStorage`) — ghi lại **mọi camp đã lên, gồm cả camp lỗi**, còn nguyên khi tải lại trang, có bộ lọc *Chỉ camp lỗi*.
- Giao diện tinh chỉnh theo phong cách Apple (file `theme.css`, tách riêng — gỡ link để về giao diện cũ).

---

## 9. Lưu ý & giới hạn quan trọng

- **Link dạng `pfbid...`** (link rút gọn mới của Facebook) **không chứa ID số** nên không tách được. Hãy thay bằng **ID bài viết dạng số** hoặc dạng **`{pageId}_{postId}`**.
- **Link Page dạng tên** (vanity, vd `facebook.com/tenshop`) chỉ resolve được nếu **bạn quản lý Page đó** (qua `pages_show_list`). Nếu không, hãy dùng link chứa ID số.
- **Doanh số (OFFSITE_CONVERSIONS)** thường cần **Pixel** và sự kiện chuyển đổi đã cấu hình; nếu thiếu, Meta sẽ báo lỗi (hiển thị tiếng Việt). Công cụ tập trung xử lý tốt các loại phổ biến: **boost bài viết** và **Traffic/Tin nhắn**.
- **Lead** cần **mẫu thu thập khách hàng tiềm năng (Lead Form)** gắn với quảng cáo; phần này có thể cần thao tác thêm trong Ads Manager.
- **Ngân sách** đang đặt ở **cấp ad set, theo ngày**. Kiểm tra kỹ **đơn vị tiền tệ** của tài khoản (công cụ tự quy đổi sang đơn vị nhỏ nhất; với tiền không có số lẻ như VND thì giữ nguyên).
- **Đối tượng** mặc định: theo **quốc gia** trong sheet + độ tuổi **18–65**. Cần nhắm chi tiết hơn thì chỉnh trong Ads Manager sau khi tạo.

---

## 10. Cấu trúc dự án

```
fb-bulk-ads/
├─ server.js                 # Khởi tạo Express, session, mount route, phục vụ static
├─ package.json
├─ .env.example              # Mẫu biến môi trường
├─ src/
│  ├─ config.js              # Đọc & kiểm tra biến môi trường
│  ├─ parsers.js             # Tách Page ID / Post (Object) ID từ link
│  ├─ campaign-mapper.js     # Map loại chiến dịch tiếng Việt → mục tiêu ODAX
│  ├─ validators.js          # Kiểm tra từng dòng, quốc gia, ngày, ngân sách, trạng thái
│  ├─ meta-api.js            # Gọi Graph/Marketing API + dịch lỗi sang tiếng Việt
│  └─ routes/
│     ├─ auth.js             # Đăng nhập/đăng xuất Facebook (OAuth), session token
│     ├─ accounts.js         # Liệt kê tài khoản quảng cáo, Page, loại chiến dịch
│     └─ ads.js              # /validate (preview) và /create (tạo hàng loạt)
└─ public/
   ├─ index.html             # Giao diện
   ├─ styles.css             # Hệ thống thiết kế (status màu theo dòng)
   └─ app.js                 # Đọc sheet, map cột, gọi API, render bảng/bộ lọc
```

---

## 11. Khắc phục sự cố nhanh

- **“Chưa cấu hình FB_APP_ID / FB_APP_SECRET”** khi khởi động → bạn chưa điền `.env`.
- **Đăng nhập xong báo lỗi redirect** → kiểm tra `FB_REDIRECT_URI` trùng khít với **Valid OAuth Redirect URIs** trong App.
- **Không thấy tài khoản quảng cáo / Page** → tài khoản chưa được cấp quyền, hoặc App chưa được duyệt các scope ở mục 4; thêm mình làm Tester của App.
- **Token hết hạn** → đăng xuất rồi đăng nhập lại để lấy token mới.

---

## 12. Chế độ DEMO — test giao diện không cần Facebook

Bộ file `demo.*` cho phép xem thử và test **toàn bộ luồng giao diện** mà **không** cần Facebook App, **không** cần `.env`, **không** gọi Meta API và **không** tạo quảng cáo thật. Backend được giả lập ngay trong trình duyệt.

**Cách chạy:**

```bash
# Cách 1: mở thẳng file (không cần server)
#   → mở demo.html bằng trình duyệt

# Cách 2: chạy qua máy chủ tĩnh tối giản
node demo-server.cjs
#   → mở http://localhost:4173
```

**Luồng test:** Đăng nhập (giả lập) → Chọn tài khoản → **Dùng dữ liệu mẫu** → **Kiểm tra với Facebook** → **Tạo hàng loạt**.

Tính năng trong bản demo:
- **Dữ liệu mẫu** minh hoạ đủ mọi trạng thái dòng: hợp lệ, thiếu dữ liệu, lỗi quyền, lỗi post, đã tạo, lỗi khi tạo.
- **Nhận biết nút CTA**: mỗi dòng hiển thị nút kêu gọi hành động tương ứng loại chiến dịch (Tương tác → *Thích Trang*, Traffic → *Tìm hiểu thêm*, Tin nhắn → *Gửi tin nhắn*, Lead → *Đăng ký*, Doanh số → *Mua ngay*).
- **Dock cố định dưới cùng** gồm: thanh loading (đỏ khi có lỗi), tab **Nhật ký** hoạt động (đếm lỗi) và tab **Lịch sử camp**.
- **Lịch sử camp** lưu vào `localStorage` (còn nguyên khi tải lại trang), lưu cả **camp lỗi**, có bộ lọc *Chỉ camp lỗi*.
- **Giao diện tinh chỉnh theo phong cách Apple** (`demo.css`) — không ảnh hưởng giao diện app thật.

Các file demo (độc lập, không động vào logic app thật):

```
demo.html         # Giao diện test
demo.js           # Logic UI + backend giả lập (mock)
demo.css          # Lớp giao diện Apple + dock + CTA + lịch sử
demo-server.cjs   # Máy chủ tĩnh tối giản để xem thử
```
