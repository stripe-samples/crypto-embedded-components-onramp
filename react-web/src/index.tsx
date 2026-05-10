import React from 'react';
import ReactDOM from 'react-dom/client';
import {ExampleApp} from './ExampleApp';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <ExampleApp />
  </React.StrictMode>
);
