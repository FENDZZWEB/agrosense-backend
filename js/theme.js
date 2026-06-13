/**
 * AgroSense — Dark Mode Theme Toggle
 * Shared across all pages that support dark/light mode switching.
 */

const AgroTheme = {
    /** Initialize theme from localStorage and optionally bind a toggle button */
    init(toggleBtnId = 'theme-toggle', iconId = 'theme-icon') {
        const themeToggle = document.getElementById(toggleBtnId);
        const themeIcon = document.getElementById(iconId);

        // Apply saved theme on load
        if (localStorage.getItem('dark-mode') === 'true') {
            document.body.classList.add('dark-mode');
            if (themeIcon) {
                themeIcon.classList.replace('fa-moon', 'fa-sun');
                if (themeToggle) themeToggle.title = "Mode Siang";
            }
        }

        // Bind toggle button
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                document.body.classList.toggle('dark-mode');
                const isDark = document.body.classList.contains('dark-mode');
                localStorage.setItem('dark-mode', isDark);

                if (themeIcon) {
                    if (isDark) {
                        themeIcon.classList.replace('fa-moon', 'fa-sun');
                        themeToggle.title = "Mode Siang";
                    } else {
                        themeIcon.classList.replace('fa-sun', 'fa-moon');
                        themeToggle.title = "Mode Malam";
                    }
                }
            });
        }
    },

    /** Check if dark mode is currently active */
    isDark() {
        return document.body.classList.contains('dark-mode');
    }
};
