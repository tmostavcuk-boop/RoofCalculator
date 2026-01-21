import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Basic reset styles
const style = document.createElement('style');
style.innerHTML = `
  body { margin: 0; padding: 0; box-sizing: border-box; }
  * { box-sizing: inherit; }
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
