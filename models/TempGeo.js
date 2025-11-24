const mongoose = require('mongoose');

const TempGeoSchema = new mongoose.Schema({
  tempid: { type: String, required: true, unique: true },
  latitude: Number,
  longitude: Number,
  radius: Number,
  name: String,
  date: String,
});

module.exports = mongoose.model('TempGeo', TempGeoSchema);