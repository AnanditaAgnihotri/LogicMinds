// WHERE IS MY BUS — simple backend
const express = require("express");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json());

// In-memory store for buses
let buses = {};

// POST /api/updateBus  <- ESP32 will call this
app.post("/api/updateBus", (req, res) => {
  const data = req.body;
  if (!data || !data.bus_id) return res.status(400).json({ error: "Missing bus_id" });

  buses[data.bus_id] = { ...data, last_update: Date.now() };
  console.log("Updated:", data.bus_id);
  return res.json({ status: "OK" });
});

// GET /api/buses  <- returns array of bus objects
app.get("/api/buses", (req, res) => {
  res.json(Object.values(buses));
});

// Utility: distance in meters
function toRad(x) { return x * Math.PI / 180; }
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// GET /api/nearest?lat=...&lng=...&limit=...
app.get("/api/nearest", (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const limit = parseInt(req.query.limit || "5", 10);

  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: "Invalid lat/lng" });

  let list = [];
  Object.values(buses).forEach(b => {
    if (!b.gps || typeof b.gps.lat === "undefined") return;
    const d = distanceMeters(lat, lng, b.gps.lat, b.gps.lng);
    list.push({
      bus_id: b.bus_id,
      gps: b.gps,
      passenger_count: b.passenger_count,
      crowd_density: b.crowd_density,
      distance_m: Math.round(d),
      last_update: b.last_update
    });
  });

  list.sort((a,b) => a.distance_m - b.distance_m);
  res.json(list.slice(0, limit));
});

app.get("/", (req, res) => res.send("Where Is My Bus Backend Running 🚍"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
