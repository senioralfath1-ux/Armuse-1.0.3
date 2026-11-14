# Pembaruan: Lencana Kualitas Audio + Perbandingan A/B

> **Catatan:** Fitur ini **sudah terintegrasi penuh secara bawaan di Armuse v1.0.3+**. Panduan di bawah ini disimpan sebagai dokumentasi cara kerja modul kualitas audio & perbandingan A/B serta cara memasang ulang pada salinan kode sumber lama bila diperlukan.

Menambahkan ke **Armuse**:
- Lencana di pemutar utama, layar *Now Playing*, Mode Mini, dan *Dynamic Island*: **Lossless**, **Hi-Res Lossless**, **Dolby Atmos**, **Dolby Digital Plus**, atau format terkompresi (MP3/AAC/Opus/dst) beserta detail bit-depth, sample rate, dan bitrate.
- Tab **Kualitas** di panel samping: rincian format lengkap, diagram **Jalur Sinyal** (*Sumber → Equalizer 10-Band → Pembatas/Limiter → Keluaran Perangkat*), dan alat **Bandingkan Kualitas (A/B)** yang membuat versi terkompresi dari lagu yang sedang diputar untuk diuji dengar secara langsung (*blind/instant switch* dengan perataan volume otomatis).

## Yang dibutuhkan
- Proyek **Armuse** (folder yang berisi `main.js`).
- [Node.js](https://nodejs.org) v18 atau lebih baru.
- Internet sekali saja saat `npm install` untuk mengunduh `ffmpeg-static` (~80 MB). Setelah itu semuanya berjalan 100% offline. Tanpa `ffmpeg`, seluruh aplikasi tetap berjalan normal — hanya alat **Bandingkan A/B** yang menampilkan pesan bahwa konverter tidak tersedia.

## Cara pasang (jika menambal kode sumber lama)
1. Buka Command Prompt / Terminal **di dalam folder proyek Armuse** (folder yang berisi `main.js`).
2. Untuk memeriksa kecocokan tanpa mengubah file apa pun:
   ```bash
   node apply-update.js --cek
   ```
3. Untuk menerapkan pembaruan:
   ```bash
   node apply-update.js
   ```
4. Setelah selesai tanpa error, jalankan:
   ```bash
   npm install
   npm start
   ```
5. Pemindaian pertama setelah pembaruan akan membaca ulang semua lagu (sekali saja) untuk mengekstrak metadata format (`lib/audioformat.js`).

## Kalau sesuatu tidak cocok
Skrip `apply-update.js` menambal kode yang ada. Kalau sebagian file (`src/app.js`, `src/engine.js`, dsb.) sudah pernah Anda ubah sendiri, bagian yang sudah terpasang akan ditandai `=` dan dilewati dengan aman. Setiap file yang diubah dicadangkan lebih dulu ke folder `.cadangan-kualitas/`.

## Cara pakai fiturnya di Armuse
- **Melihat Lencana Kualitas:** Putar lagu apa saja. Lencana kualitas (`Hi-Res Lossless`, `Lossless`, `Dolby Atmos`, atau codec/bitrate) otomatis tampil di bawah nama artis pada bilah pemutar bawah, layar *Now Playing*, Mode Mini, dan *Dynamic Island*.
- **Membuka Panel Kualitas & Jalur Sinyal:** Klik langsung lencana kualitas pada pemutar, atau buka panel samping kanan bawah → pilih tab **Kualitas**.
- **Uji Dengar Bandingkan Kualitas (A/B):**
  1. Di tab **Kualitas**, gulir ke bagian **Bandingkan kualitas (A/B)**.
  2. Pilih preset kompresi pembanding:
     - `AAC 256 kbps` (kelas streaming kualitas tinggi)
     - `AAC 128 kbps` (streaming hemat data)
     - `MP3 320 kbps` (MP3 kualitas tertinggi)
     - `MP3 128 kbps` (MP3 standar lama)
     - `Opus 96 kbps` (codec modern efisien)
     - `Opus 48 kbps` (bitrate sangat rendah untuk melatih kepekaan telinga)
  3. Klik **Siapkan**. Armuse akan membuat sampel terkompresi di cache lokal (`ab-cache`) dan menghitung selisih kekerasan suara (*loudness matching*) agar perbandingan adil.
  4. Klik kartu **A (Asli)** dan **B (Pembanding)** — atau tekan tombol **`A`** dan **`B`** di papan ketik saat panel Kualitas terbuka — untuk berpindah jalur audio secara instan tanpa jeda.

## Catatan Teknis & Batasan
- **Deteksi Dolby Atmos:** Dilakukan dengan memeriksa penanda *Joint Object Coding (JOC)* di dalam kontainer E-AC-3/AC-3 (MP4/M4A).
- **Jalur Audio Web Audio API:** Armuse memproses audio melalui *Web Audio API* (`AudioContext`) agar fitur Equalizer 10-band, spektrum visualizer, pemilihan perangkat output (`setSinkId`), dan peralihan instan A/B bekerja mulus. Pembatas puncak (*limiter* `-0.3 dBFS`) selalu menjaga sinyal agar bebas *clipping*.
- **Sumber Multi-Channel (5.1/7.1):** Sampel pembanding A/B dibuat dalam versi stereo, dan perataan volume otomatis dinonaktifkan untuk sumber *surround* agar tidak bias terhadap *downmix* pemutar.
