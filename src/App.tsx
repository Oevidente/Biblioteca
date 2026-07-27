/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HashRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Reader } from "./pages/Reader";
import { Admin } from "./pages/Admin";
import { Writer } from "./pages/Writer";
import { ProfilePage } from "./pages/Profile";

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <HashRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="story/:id" element={<Reader />} />
              <Route path="admin" element={<Admin />} />
              <Route path="writer/:id" element={<Writer />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="community" element={<ProfilePage />} />
              <Route path="user/:usernameParam" element={<ProfilePage />} />
              <Route path="profile/:uidParam" element={<ProfilePage />} />
            </Route>
          </Routes>
        </HashRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}
