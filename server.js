
import express from "express";
import session from "express-session";
import route from "./route/route.js";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 5001;

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(
  session({
    secret: "secretKey",
    resave: false,
    saveUninitialized: true,
  })
);

// View engine
app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));

// Static files with proper MIME types
app.use(express.static("public", {
  setHeaders: (res, path, stat) => {
    if (path.endsWith('.js')) {
      res.set('Content-Type', 'application/javascript');
    }
  }
}));

// Routes
app.use("/", route);

// Env route
app.get("/env", (req, res) => {
  res.json({ API_URL: process.env.PYTHON_HOST });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
