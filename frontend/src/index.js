import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AgentRoot from './components/AgentApp';

const isAgentPortal = window.location.pathname.startsWith('/agent');

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {isAgentPortal ? <AgentRoot /> : <App />}
  </React.StrictMode>
);
