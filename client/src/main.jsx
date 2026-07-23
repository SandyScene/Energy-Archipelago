import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// MapLibre owns imperative DOM/WebGL state that doesn't tolerate StrictMode's
// intentional double-mount in dev, so it's left out here.
createRoot(document.getElementById('root')).render(<App />)
