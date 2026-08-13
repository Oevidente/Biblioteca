import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Add body parsers
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API Routes
  app.post("/api/languagetool", async (req, res) => {
    try {
      const { text, language } = req.body;
      
      const params = new URLSearchParams();
      if (text) params.append("text", text);
      if (language) params.append("language", language);

      const response = await fetch("https://api.languagetool.org/v2/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return res.status(429).json({ error: "Rate limit exceeded" });
        }
        return res.status(response.status).json({ error: `HTTP ${response.status}` });
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("LanguageTool API Proxy Error:", error);
      res.status(500).json({ error: "Failed to fetch from LanguageTool" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
