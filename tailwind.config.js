/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                'primary': '#3B4D35',
                'accent': '#B4965C',
                'neon': '#4ADE80',
                'background-light': '#F8F9F7',
                'background-dark': '#0D0F0D',
                'surface-dark': '#141714',
                'text-main': '#1A1D19',
                'text-secondary': '#71766F',
                'border-color': '#E2E4DF',
                'cream': '#F3EFE9',
                'rose-soft': '#E8B4BC',
            },
            fontFamily: {
                sans: ['Outfit', 'system-ui', 'sans-serif'],
            },
            boxShadow: {
                'neon-soft': '0 0 30px rgba(74, 222, 128, 0.15)',
                'accent-glow': '0 0 30px rgba(180, 150, 92, 0.3)',
                'soft': '0 4px 20px rgba(0, 0, 0, 0.08)',
            },
        },
    },
    plugins: [],
}
