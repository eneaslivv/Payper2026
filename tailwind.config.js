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
                'background-dark': '#0D0F0D',
                'surface-dark': '#141714',
                'text-main': '#1a1a1a',
                'text-secondary': '#71766F',
                'primary': '#D63C5E',
                'accent': '#B4965C',
                'cream': '#F3EFE9', // Crema suave para textos
                'rose-soft': '#E8B4BC', // Rosa suave
                'neon': '#D63C5E', // Fallback temporal para no romper todo, mapeado al rosa
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
