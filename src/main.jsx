import React from 'react'
import { createRoot } from 'react-dom/client'

async function init() {
  const { default: App } = await import('./App.jsx')
  createRoot(document.getElementById('root')).render(<App />)
}

init()
