import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import '@milkdown/kit/prose/view/style/prosemirror.css'
import App from './App.tsx'
import { StaffRouter } from './agent/router/StaffRouter.tsx'

const pathname = window.location.pathname;
const isStaff = pathname.startsWith('/staff') || pathname.startsWith('/agent');
document.title = isStaff ? '坐席侧' : '客户侧';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isStaff ? <StaffRouter /> : <App />}
  </StrictMode>,
)
