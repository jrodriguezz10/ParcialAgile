import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import App from "./App.jsx";
import "./styles.css";

// Entrypoint React: declara rutas reales y delega contenido a App.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App page="user" />} />
        <Route path="/solicitud" element={<App page="solicitud" />} />
        <Route path="/interesado" element={<App page="portal" />} />
        <Route path="/ingresar" element={<App page="login" />} />
        <Route path="/registro" element={<Navigate to="/solicitud" replace />} />
        <Route path="/admin" element={<App page="admin" />} />
        <Route path="/verificar/:code" element={<App page="verify" />} />
        <Route path="/checkout/resultado" element={<App page="checkout" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
