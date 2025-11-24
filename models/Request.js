const mongoose = require('mongoose');

const RequestSchema = new mongoose.Schema({
  reqid: { type: String, required: true, unique: true },
  userid: { type: String, required: true },
  latitude: Number,
  longitude: Number,
  date: String,
  description: String,
  status: { type: String, default: 'pen' },
});

module.exports = mongoose.model('Request', RequestSchema);