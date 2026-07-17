import React from "react";
import ReactDOM from "react-dom/client";
import App from "./components/App.jsx";
import AuthGate from "./components/AuthGate.jsx";
import { AuthProvider } from "./components/AuthProvider.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <AuthGate><App /></AuthGate>
    </AuthProvider>
  </React.StrictMode>
);
