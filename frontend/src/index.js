import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { SpeedInsights } from "@vercel/speed-insights/react";

const root = createRoot(document.getElementById('root'));
root.render(
    <>
        <App />
        <SpeedInsights />
    </>
);
