import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import '@milkdown/kit/prose/view/style/prosemirror.css'
import App from './App.tsx'
import { AgentWorkstationPage } from './pages/AgentWorkstationPage.tsx'

const isAgent = window.location.pathname.startsWith('/agent');
document.title = isAgent ? '坐席侧' : '客户侧';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAgent ? <AgentWorkstationPage /> : <App />}
  </StrictMode>,
)
