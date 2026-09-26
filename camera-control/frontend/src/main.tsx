import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LiveView from "./pages/LiveView";
import CameraControl from "./pages/CameraControl";
import Cameras from "./pages/Cameras";
import Recordings from "./pages/Recordings";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/live" replace />} />
        <Route path="/live" element={<LiveView />} />
        <Route path="/cameras" element={<Cameras />} />
        <Route path="/cameras/:id" element={<CameraControl />} />
        <Route path="/recordings" element={<Recordings />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);