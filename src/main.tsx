import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import QuickCaptureWindow from '@/components/QuickCapture';
import './index.css';
import 'highlight.js/styles/github-dark.css';

const isCapture = new URLSearchParams(window.location.search).has('capture');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isCapture ? <QuickCaptureWindow /> : <App />}
  </React.StrictMode>,
);
