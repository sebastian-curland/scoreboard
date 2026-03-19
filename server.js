// server.js
const express = require("express");
const cors = require("cors");
const path = require("path");
const gamesRoute = require("./routes/games");

const app = express();
const PORT = process.env.PORT || 3000;
const BASE = (process.env.PASSENGER_BASE_URI || '').replace(/\/$/, '');

app.use(cors());
app.use(express.json());
app.use(BASE + '/', express.static(path.join(__dirname, "public")));

app.use(BASE + "/api", gamesRoute);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});