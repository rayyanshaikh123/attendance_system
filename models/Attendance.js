const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  userid: { type: String, required: true },
  status: { type: String, required: true },
  date: { type: String, required: true },
  signin_time: { type: String },
  signout_time: { type: String },
  accounted_for: { type: String },
  curr_loc: { type: String },
});

module.exports = mongoose.model('Attendance', AttendanceSchema);