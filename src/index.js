// src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Fonte via Google Fonts
const link = document.createElement('link');
link.rel = 'preconnect';
link.href = 'https://fonts.googleapis.com';
document.head.appendChild(link);
const link2 = document.createElement('link');
link2.rel = 'stylesheet';
link2.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Source+Code+Pro:wght@400;600;700&family=Crimson+Pro:ital,wght@0,300;0,400;0,600;1,300&display=swap';
document.head.appendChild(link2);

// Reset global
document.body.style.margin = '0';
document.body.style.padding = '0';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);
