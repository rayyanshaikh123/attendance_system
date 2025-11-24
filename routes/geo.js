const express = require('express');
const router = express.Router();
const geolib = require('geolib');
const Attendance = require('../models/Attendance');

const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';




async function callagra() {
    try {
        const temporaryResponse = await axios.get(`${API_BASE_URL}/user/temp-geos`);
        return temporaryResponse.data;
    } catch (error) {
        console.error('Error fetching temporary geofences:', error);
        return [];
    }
}

router.post('/data', async (req, res) => {
    try {
        const userLocation = req.body;
        const userId = req.user.id;

        // Fetch permanent geofences
        let permanentGeofences = [];
        let closestGeofence = null;
        let minDistance = Infinity;

        try {
            const permanentResponse = await axios.post(`${API_BASE_URL}/admin-o/curr-geos`);
            permanentGeofences = permanentResponse.data;
        } catch (error) {
            console.error('Error fetching permanent geofences:', error);
            return res.status(500).json({ message: 'Failed to fetch permanent geofences' });
        }

        // Find the closest geofence in the permanent geofences
        permanentGeofences.forEach(geofence => {
            const distance = geolib.getDistance(
                { latitude: userLocation.latitude, longitude: userLocation.longitude },
                { latitude: geofence.latitude, longitude: geofence.longitude }
            );

            if (distance < minDistance) {
                minDistance = distance;
                closestGeofence = geofence;
            }
        });

        // If no geofence found in permanent geofences, fetch temporary geofences
        if (!closestGeofence || minDistance > closestGeofence.radius) {
            const temporaryGeofences = await callagra();

            // Find the closest geofence in the temporary geofences
            temporaryGeofences.forEach(geofence => {
                const distance = geolib.getDistance(
                    { latitude: userLocation.latitude, longitude: userLocation.longitude },
                    { latitude: geofence.latitude, longitude: geofence.longitude }
                );

                if (distance < minDistance) {
                    minDistance = distance;
                    closestGeofence = geofence;
                }
            });
        }

        if (!closestGeofence) {
            return res.status(404).json({ message: 'No geofence found' });
        }

        const now = new Date();
        const startHour = 9;
        const endHour = 17;
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const ourdate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        const currentTime = `${hours}:${minutes}:${seconds}`;

        let acc = (hours >= startHour && hours < endHour) ? "present" : "absent";

        if (minDistance <= closestGeofence.radius) {
            console.log('Inside closest geofence');
            // Check if attendance already exists for this user and date
            const existing = await Attendance.findOne({ userid: userId, date: ourdate });
            if (!existing) {
                // Create new attendance record
                await Attendance.create({
                    userid: userId,
                    status: 'online',
                    date: ourdate,
                    signin_time: currentTime,
                    accounted_for: acc,
                    curr_loc: closestGeofence.name
                });
                return res.json({ message: 'Inside closest geofence, attendance recorded' });
            } else {
                // Check if user has already checked out twice
                const count = await Attendance.countDocuments({ date: ourdate, userid: userId, status: 'offline' });
                if (count < 2) {
                    // Update status to 'online' and clear signout_time
                    await Attendance.updateOne(
                        { userid: userId, date: ourdate },
                        { $set: { status: 'online', signout_time: null } }
                    );
                    return res.json({ message: 'Inside closest geofence, status updated' });
                } else {
                    return res.status(400).json({ message: 'Maximum check-ins/check-outs exceeded for today' });
                }
            }
        } else {
            console.log('Outside closest geofence');
            // Update status to 'offline' and set signout_time
            await Attendance.updateOne(
                { userid: userId, date: ourdate },
                { $set: { status: 'offline', signout_time: currentTime } }
            );
            return res.json({ message: 'Outside closest geofence, status updated' });
        }
    } catch (error) {
        console.error('Unexpected error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;