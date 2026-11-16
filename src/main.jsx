import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './styles.css'
import App from './app/App.jsx'
import { ToastProvider } from './ui/Toast'
import { IS_DEMO } from './data/hooks'

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, retry: 1, refetchOnWindowFocus: true } } })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={IS_DEMO ? '/demo' : '/'}>
        <ToastProvider><App /></ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
)
