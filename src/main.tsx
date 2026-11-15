import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './catalog.css';
import './restaurants.css';
import './rating-slider.css';
import './review.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
