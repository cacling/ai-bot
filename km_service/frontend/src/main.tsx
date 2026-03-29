import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import '@milkdown/kit/prose/view/style/prosemirror.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
