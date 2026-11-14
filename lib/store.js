'use strict';
// Penyimpanan JSON sederhana: tulis atomik (file sementara lalu rename) dan ditunda (debounce).
const fs = require('fs');
const path = require('path');

class JsonStore {
  constructor(file, defaults) {
    this.file = file;
    this.data = JSON.parse(JSON.stringify(defaults));
    this.timer = null;
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = { ...this.data, ...raw };
    } catch (_) { /* file belum ada atau rusak: pakai nilai bawaan */ }
    return this.data;
  }

  save(delay = 400) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), delay);
  }

  flush() {
    clearTimeout(this.timer);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { JsonStore };
