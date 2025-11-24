const mongoose = require('mongoose');

const GeofenceSchema = new mongoose.Schema({
  latitude: Number,
  longitude: Number,
  radius: Number,
  name: String,
  type: { type: String, enum: ['permanent', 'temporary'], default: 'permanent' },
});

module.exports = mongoose.model('Geofence', GeofenceSchema);