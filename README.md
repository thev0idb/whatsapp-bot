# Panduan Instalasi Bot WhatsApp

---

## Persyaratan Umum
- Sesi WhatsApp di HP yang aktif untuk memindai QR Code

## jangan gunakan no wa utama untuk bot wa ini

---

## 1. Instalasi di Termux

```bash
pkg update && pkg upgrade -y
pkg install nodejs ffmpeg git -y
mkdir bot-wa
cd bot-wa
git clone https://github.com/thev0idb/whatsapp-bot
npm init -y
npm set type=module
npm install @whiskeysockets/baileys qrcode-terminal

nano config.js
```
* Ubah nilai `MAIN_OWNER` menjadi nomor WhatsApp kamu menggunakan format kode negara (contoh: `'628123456789'`).
* Tekan `Ctrl + O`, lalu `Enter` untuk menyimpan.
* Tekan `Ctrl + X` untuk keluar dari editor.

### Install Node Modules
```bash
npm install
```

### Jalankan Bot
Jalankan bot menggunakan perintah:
```bash
node index.js
```

### penggunaan API key untuk AI chat bot
ubah baris kode ini menggunakan endpoint
```bash
try {
      const apiKey = '';  <--- isi api key di sini
      const response = await fetch('https://endpoint.example.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          messages: [{ 
            role: 'user', 
            content: query }]
        })
      });
```


> **Catatan:** QR Code akan muncul di terminal Termux. Buka WhatsApp di HP $\rightarrow$ **Perangkat Tertaut** $\rightarrow$ **Tautkan Perangkat**, lalu pindai QR Code tersebut.

---



## 2. Instalasi di Laptop / PC (Windows, Linux, macOS)

### Prasyarat Tambahan
1. **Node.js**: Unduh dan install versi LTS dari [nodejs.org](https://nodejs.org/).
2. **Git**: Unduh dan install dari [git-scm.com](https://git-scm.com/).
3. **FFmpeg**:
   - **Windows**: Unduh dari [ffmpeg.org](https://ffmpeg.org/), lalu masukkan folder `bin` ke dalam *Environment Variables (PATH)*.
   - **Linux (Ubuntu/Debian)**: `sudo apt update && sudo apt install ffmpeg -y`
   - **macOS**: `brew install ffmpeg`

---

### Langkah-langkah Instalasi:

1. **Buka Terminal / Command Prompt / PowerShell**
   ```bash
   cd path/to/folder-bot
   ```

2. **Konfigurasi File Owner**
   Buka file `config.js` lalu perbarui nomor WhatsApp pada variabel `MAIN_OWNER`:
   ```javascript
   MAIN_OWNER: '628123456789'
   ```

3. **Install Package Dependencies**
   ```bash
   npm install
   ```

4. **Jalankan Bot**
   ```bash
   node index.js
   ```
   Pindai QR Code yang muncul menggunakan WhatsApp di HP kamu.

---

## 💡 Menjalankan Bot di Background (Opsional)

Aplikasi **PM2** berguna agar bot tetap berjalan secara terus-menerus meskipun terminal/Termux ditutup.

1. Install PM2 secara global:
   ```bash
   npm install -g pm2
   ```
2. Jalankan bot dengan PM2:
   ```bash
   pm2 start index.js --name "bot-wa"
   ```
3. Perintah penting PM2:
   - **Cek Status Bot**: `pm2 status`
   - **Melihat Log/Error**: `pm2 logs bot-wa`
   - **Menghentikan Bot**: `pm2 stop bot-wa`
   - **Restarth Bot**: `pm2 restart bot-wa`
