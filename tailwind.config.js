/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Charte Christophe Goubet & Pretto Galaxie
        pretto: '#0C806E',
        olive: '#98AF24',
        cream: '#FAF6F2',
        ink: '#1A1A1A'
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif']
      }
    }
  },
  plugins: []
}
