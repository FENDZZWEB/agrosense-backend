/**
 * AgroSense — Security Utilities
 * Sanitasi data untuk mencegah serangan XSS (Cross-Site Scripting).
 */

const AgroSecurity = {
    /**
     * Escape karakter HTML berbahaya dari string.
     * Gunakan ini sebelum memasukkan data dari Firebase ke innerHTML.
     * @param {string} str - String yang akan di-escape
     * @returns {string} String yang sudah aman untuk dimasukkan ke HTML
     */
    escapeHTML(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    },

    /**
     * Sanitasi objek — escape semua nilai string di dalam objek.
     * @param {Object} obj - Objek yang berisi data dari Firebase
     * @returns {Object} Objek baru dengan semua string sudah di-escape
     */
    sanitizeObject(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                sanitized[key] = this.escapeHTML(value);
            } else if (typeof value === 'object' && value !== null) {
                sanitized[key] = this.sanitizeObject(value);
            } else {
                sanitized[key] = value;
            }
        }
        return sanitized;
    }
};
