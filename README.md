# Armuse

**Pemutar musik desktop audiophile open-source** untuk koleksi lagu pribadi Anda — lengkap dengan deteksi **Hi-Res Lossless & Dolby Atmos**, **Equalizer 10-band**, **Uji Kualitas A/B**, **Dynamic Island 5-Slide**, **Lirik Sinkron Multi-Bahasa**, **YouTube Audio Downloader**, **Google Drive Cloud Streaming**, dan **Aplikasi Pendamping iPhone / Smartphone (PWA)**.

Dibuat oleh **Alfath** · Lisensi **MIT** · Tanpa iklan, tanpa langganan, dan menghormati privasi lokal Anda.

- **Repositori GitHub:** [https://github.com/senioralfath1-ux/Armuse-1.0.3](https://github.com/senioralfath1-ux/Armuse-1.0.3)
- **Dukung Kreator (Saweria):** [https://saweria.co/alfaathhh](https://saweria.co/alfaathhh)

---

## Daftar Fitur Utama

### 1. Pustaka Musik & Pencarian Pintar Multi-Aksara
- **Tampilan Lengkap:** Jelajahi koleksi berdasarkan **Album**, **Artis**, **Lagu**, **Favorit**, **Playlist**, **Statistik**, dan **Tag & Genre**.
- **Format Audio yang Didukung:** `MP3`, `FLAC`, `M4A`, `AAC`, `OGG`, `OPUS`, dan `WAV`.
- **Sampul Album Otomatis & Warna Aksen Adaptif:** Membaca sampul yang tertanam di file lagu atau file gambar di folder album (`cover.jpg`, `folder.jpg`, `front.png`, `albumart.jpg`). Warna aksen antarmuka otomatis menyesuaikan palet warna sampul lagu yang sedang diputar.
- **Pencarian Jepang & Romaji Pintar (`jpSearch`):** Mendukung transliterasi dua arah secara otomatis antara **Romaji ↔ Hiragana ↔ Katakana ↔ Kanji**. Anda dapat mengetik judul lagu J-Pop/Anime dengan huruf latin (Romaji) untuk menemukan lagu beraksara Jepang, atau sebaliknya.

### 2. Lencana Kualitas Audio, Jalur Sinyal & Perbandingan A/B
- **Deteksi Kualitas Presisi:** Menampilkan lencana otomatis di pemutar: **Hi-Res Lossless** (>48 kHz / ≥24-bit), **Lossless** (FLAC, ALAC, WAV, AIFF), **Dolby Atmos (JOC)**, **Dolby Digital Plus (E-AC-3)**, atau detail codec & bitrate format terkompresi.
- **Inspeksi Jalur Sinyal:** Buka panel samping **Kualitas** untuk melihat rincian bit-depth, sample rate, channel, serta diagram rantai pemrosesan sinyal (*Sumber File → Equalizer 10-Band → Pembatas Puncak -0.3 dBFS → Perangkat Output*).
- **Uji Dengar Bandingkan Kualitas (A/B):** Bandingkan file asli Anda (**A**) dengan versi terkompresi (**B** — `AAC 256/128 kbps`, `MP3 320/128 kbps`, `Opus 96/48 kbps`) secara *real-time* tanpa jeda dengan perataan volume otomatis (*loudness matching*).

### 3. Equalizer 10-Band & Pemilihan Perangkat Output Audio
- **Equalizer 10-Band Real-Time:** Mengatur frekuensi `31 Hz` hingga `16 kHz` (±12 dB) lengkap dengan **Penguat Awal (Preamp)**, pembatas anti-pecah (*limiter*), kurva respons frekuensi interaktif, dan spektrum analyzer langsung.
- **11 Preset Bawaan & Preset Kustom:** Termasuk *Flat, Bass Boost, Treble Boost, V-Shape, Vocal, Rock, Pop, Jazz, Classical, Electronic, Acoustic*, serta fitur simpan racikan preset Anda sendiri.
- **Pemilihan Perangkat Output Audio:** Di halaman **Folder musik**, Anda bisa memilih langsung perangkat keluaran (DAC eksternal, headphone, atau speaker) tanpa mengubah perangkat default sistem operasi.

### 4. Layar *Now Playing*, Visualizer & Lirik Sinkron Multi-Tier
- **Layar Penuh Now Playing:** Klik sampul lagu di kiri bawah untuk membuka tampilan panggung dengan sampul besar, **Visualizer Spektrum Audio**, antrean, dan lirik.
- **Mesin Lirik Multi-Tier (`LRC` & Teks):**
  1. Memeriksa lirik tersimpan/manual dan cache lokal terlebih dahulu (100% offline saat memutar).
  2. Tombol **Cari online** mengambil lirik sinkron waktu (`[mm:ss.xx]`) maupun lirik biasa secara paralel dari **LRCLIB** dan *fallback* **Kugou** (sangat akurat untuk lagu Indonesia, Barat, J-Pop, dan Anime).
  3. Mendukung klik baris lirik untuk melompat ke detik lagu tersebut, tab multi-bahasa (**Auto / Indonesia / English / 日本語**), dan **Editor Lirik Manual** per bahasa.

### 5. Mode Jendela: Penuh, Mode Mini Klasik, Dynamic Island & System Tray
- **Mode Mini Klasik (`Alt + M`):** Jendela pemutar ringkas dengan sampul, kontrol putar, favorit, volume, serta menu cepat tambah ke playlist.
- **Dynamic Island (`Alt + I`):** Kapsul interaktif bergaya iOS di bagian atas layar dengan *auto-dock/peek* saat menempel di tepi atas layar dan **5 Slide Multi-Tasking**:
  1. **Pemutar:** Info kualitas, seek bar, volume, favorit/acak/ulangi, dan lompat ±10 detik.
  2. **Lirik Live:** Tampilan lirik sinkron 3 baris berjalan otomatis + pencarian lirik cepat.
  3. **Antrean Berikutnya (Up Next):** Daftar lagu selanjutnya dan tombol acak antrean.
  4. **Studio Audio:** Visualizer spektrum live, sakelar EQ, dan tombol ganti preset EQ cepat.
  5. **Utilitas & Timer:** **Timer Tidur** cepat (`15m`, `30m`, `Akhir lagu`), **Timer Fokus Kerja (Pomodoro)** (`25m` / `15m` / `45m`), dan indikator status server HP.
- **System Tray:** Menutup jendela utama (`X`) menyembunyikan Armuse ke *System Tray* agar musik dan server pendamping iPhone tetap berjalan di latar belakang.

### 6. Statistik Dengar, "Wrapped Kamu" & Kartu Bagikan (Story 1080×1920)
- **Statistik Dengar:** Mencatat total waktu dengar, total pemutaran, lagu paling sering diputar, artis favorit, album favorit, distribusi genre, dan lagu yang baru ditambahkan.
- **✨ Wrapped Kamu:** Generator rekap musik ala *Spotify Wrapped* (6 slide: *Rekap Lengkap, Top 5 Lagu, Top 5 Artis, Waktu Dengar, Genre Musik, Penutup*) dengan 4 tema warna (*Acid, Violet, Coral, Lime*) dan opsi **Ekspor Semua (6 PNG)** resolusi penuh `1080×1920`.
- **Kartu Bagikan Lagu (Share Card):** Ekspor kartu lagu `1080×1920` (simpan PNG atau salin ke clipboard) dengan 5 template (*Klasik, Jurnal, Kartu, Lirik, Vinyl*), pilihan latar, kutipan lirik, serta stiker yang bisa digeser.

### 7. Penyimpanan Cloud Google Drive & Smart Cache Offline
- **Streaming Langsung Tanpa Tunggu Unduh Penuh:** Di halaman **Folder musik → Penyimpanan Cloud**, tempel satu atau beberapa tautan folder publik Google Drive. Lagu langsung berputar instan berkat *multi-stage byte-range streaming* dan *pre-fetch* lagu berikutnya.
- **Smart Cache Offline (LRU):** Mengatur batas jumlah lagu cloud yang disimpan otomatis di disk lokal (mis. 25, 50, 100, 250 lagu) lengkap dengan pustaka sampul album offline.

### 8. Pengunduh & Konverter Audio YouTube (`yt-dlp` + `ffmpeg`)
- **Unduh Langsung ke Pustaka:** Di menu **Unduh YouTube**, tempel tautan video YouTube, periksa pratinjau judul/durasi/sampul, pilih format audio (**MP3 320 kbps**, **FLAC Lossless**, **WAV PCM**, **M4A AAC 256 kbps**, atau **OPUS 160 kbps**), lalu unduh beserta metadata & thumbnail langsung masuk ke folder pustaka musik Anda.

### 9. Aplikasi Pendamping iPhone & Smartphone (PWA Port 4000)
- **Streaming & Offline di HP:** Buka menu **iPhone & HP** lalu pindai kode QR dengan kamera iPhone/Android di jaringan Wi-Fi yang sama (mendukung alamat IP LAN maupun mDNS permanen `http://<nama-pc>.local:4000`).
- **Pengalaman Native iOS PWA:** Tambahkan ke Layar Utama (*Add to Home Screen* di Safari) untuk tampilan layar penuh bergaya Apple Music dengan 3 slide *Now Playing* (Sampul, Lirik, Antrean), audio latar belakang + kontrol layar kunci, dan fitur **Simpan Offline di Memori HP (IndexedDB)** untuk diputar saat keluar rumah tanpa internet.

### 10. Tema Visual (Gelap, Terang, Liquid Glass) & Multi-Bahasa
- **3 Tema Tampilan:** **Gelap** (biru tinta laut khas Armuse), **Terang**, dan **Glass (Air / Liquid Glass)** dengan efek kaca cair bening bergaya iOS dan riak air dinamis.
- **3 Bahasa Antarmuka:** **Bahasa Indonesia**, **English**, dan **日本語 (Jepang)**.

---

## Menjalankan & Memasang Aplikasi

### Cara Cepat (File Pemasang)

| Sistem Operasi | File Pemasang | Cara Pakai |
|---|---|---|
| **Windows** | `Armuse Setup 1.0.3.exe` | Klik dua kali, pilih folder instalasi, dan ikuti panduan pemasang |
| **macOS** | `Armuse-1.0.3.dmg` | Buka file `.dmg`, lalu seret ikon **Armuse** ke folder `Applications` |
| **Linux (AppImage)** | `Armuse-1.0.3.AppImage` | Beri izin jalan (`chmod +x Armuse-1.0.3.AppImage`), lalu klik dua kali |
| **Linux (Debian/Ubuntu)** | `armuse_1.0.3_amd64.deb` | Jalankan `sudo apt install ./armuse_1.0.3_amd64.deb` |

### Menjalankan dari Kode Sumber

Pastikan [Node.js](https://nodejs.org) (versi 18 atau lebih baru) sudah terpasang di komputer Anda.

```bash
git clone https://github.com/senioralfath1-ux/Armuse-1.0.3.git
cd Armuse-1.0.3
npm install
npm start
```

Untuk mode pengembangan dengan *auto-reload* (`nodemon`):
```bash
npm run dev
```

### Membuat File Pemasang Sendiri (Build)

```bash
npm run dist
```

Hasil paket instalasi akan tersedia di dalam folder `dist/`.

---

## Panduan Singkat Penggunaan

### Memulai Pustaka Musik
1. Buka **Armuse**, lalu klik **Tambah folder musik** di layar sambutan (atau buka menu **Folder musik** di bilah kiri).
2. Pilih satu atau beberapa folder tempat lagu Anda disimpan. Seluruh subfolder akan dipindai secara otomatis.
3. Untuk menambahkan koleksi dari cloud, buka tab **Penyimpanan Cloud** di halaman **Folder musik**, tempel tautan folder Google Drive, lalu klik **Sinkronkan Pustaka Cloud**.
4. Tekan tombol **⟳ (Pindai ulang)** di kanan atas kapan saja untuk memperbarui pustaka.

### Kontrol Pemutaran & Antrean

| Aksi | Cara |
|---|---|
| Putar satu album | Klik sampul album lalu tekan **Putar**, atau klik tombol putar pada sampul |
| Putar satu lagu | Klik dua kali pada baris lagu |
| Pilih banyak lagu | Klik lagu pertama, lalu `Shift`+klik lagu terakhir (atau `Ctrl`/`Cmd`+klik satu per satu) |
| Tambah ke antrean / Putar berikutnya | Klik kanan lagu atau album → **Putar berikutnya** / **Tambah ke antrean** |
| Tambah ke playlist | Klik ikon `+ playlist` di pemutar atau klik kanan lagu → pilih playlist |
| Buka layar penuh *Now Playing* & Lirik | Klik gambar sampul lagu kecil di pojok kiri bawah pemutar |
| Buka Antrean / Equalizer / Kualitas | Klik ikon daftar atau slider di pojok kanan bawah pemutar |
| Timer Tidur | Klik ikon bulan sabit di kanan bawah pemutar (`5`, `10`, `15`, `30`, `60` menit, atau *Sampai lagu ini selesai*) |

---

## Pintasan Papan Ketik (Keyboard Shortcuts)

### Pintasan di Dalam Aplikasi

| Tombol | Fungsi |
|---|---|
| `Spasi` | Putar / jeda lagu |
| `Ctrl`/`Cmd` + `←` / `→` | Lagu sebelumnya / berikutnya |
| `Shift` + `←` / `→` | Mundur / maju 10 detik |
| `Ctrl`/`Cmd` + `F` atau `/` | Fokus ke kotak pencarian |
| `Ctrl`/`Cmd` + `A` | Pilih semua lagu yang sedang tampil |
| `Enter` | Putar lagu yang sedang dipilih |
| `A` / `B` | Beralih instan antara audio Asli (A) dan Pembanding (B) saat tab Kualitas terbuka |
| `Esc` | Tutup menu, dialog, panel samping, atau kosongkan pencarian |

### Pintasan Keyboard Global (Berfungsi dari Aplikasi Mana Saja)
Dapat diubah atau dinonaktifkan kapan saja melalui menu **Pengaturan → Pintasan Keyboard Global**:

| Pintasan Bawaan | Fungsi |
|---|---|
| `Alt + I` | Buka / tutup mode **Dynamic Island** |
| `Alt + M` | Buka / tutup **Mode Mini** klasik |
| `Alt + Space` | Putar / jeda musik di latar belakang |
| `Alt + Right` | Lagu berikutnya |
| `Alt + Left` | Lagu sebelumnya |
| `Alt + A` | Tampilkan / sembunyikan jendela utama **Armuse** |

---

## Mengedit Tag & Sampul Lagu

Klik kanan sebuah lagu → **Edit tag**, atau pilih banyak lagu sekaligus lalu klik **Edit tag** pada bilah pilihan di atas daftar.

- **Kolom yang bisa diubah:** Judul, Artis, Artis Album, Album, Genre, Tahun, Nomor Lagu, Nomor Cakram, **Tag Saya** (label kustom seperti *santai*, *kerja*, *nostalgia*), **Rating Bintang (1–5)**, status **Favorit**, dan **Sampul Album**.
- **Aman untuk File Asli:** Secara bawaan, seluruh perubahan disimpan di database internal Armuse tanpa memodifikasi file audio Anda. Jika ingin menulis tag langsung ke dalam file MP3 (agar terbaca di pemutar lain), centang opsi **"Tulis juga ke file MP3"** sebelum menekan **Simpan**.

---

## Tempat Penyimpanan Data & Mode Portabel

Pustaka, pengaturan, playlist, statistik, cache lirik, dan cache sampul disimpan di folder data aplikasi sistem:

- **Windows:** `%APPDATA%\Armuse`
- **macOS:** `~/Library/Application Support/Armuse`
- **Linux:** `~/.config/Armuse`

File musik asli Anda di folder lokal tidak pernah dipindahkan atau diubah.

Untuk menjalankan Armuse dalam **mode portabel** (misalnya menyimpan seluruh data di flashdisk atau folder khusus), gunakan variabel lingkungan `ARMUSE_DATA_DIR` (atau `RD_DATA_DIR`):

```bash
ARMUSE_DATA_DIR=/path/ke/folder-data npm start
```

---

## Dukung Pengembangan Armuse ♥

**Armuse** dikembangkan secara independen oleh **Alfath** dan dibagikan secara gratis serta *open-source* di bawah lisensi MIT.

Jika Anda menyukai Armuse dan ingin mendukung pengembangan fitur-fitur baru ke depannya, Anda dapat memberikan dukungan melalui:

- ☕ **Saweria:** [https://saweria.co/alfaathhh](https://saweria.co/alfaathhh) *(tersedia juga kode QR langsung di menu **Dukung Kreator** di dalam aplikasi)*
- ⭐ **GitHub:** Berikan bintang (*Star*) dan bagikan repositori [senioralfath1-ux/Armuse-1.0.3](https://github.com/senioralfath1-ux/Armuse-1.0.3)

---

## Lisensi

Proyek ini dilisensikan di bawah **MIT License** — lihat berkas [LICENSE](LICENSE) untuk rincian lengkap.
