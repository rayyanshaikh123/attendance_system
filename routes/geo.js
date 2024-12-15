const express = require('express');
const router = express.Router();
const geolib = require('geolib');
const mysql = require('mysql2');
const axios = require('axios');

// Set up MySQL connection
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10, // Adjust as needed
    queueLimit: 0,
  });

async function callagra() {
    try {
        const temporaryResponse = await axios.get('http://localhost:3000/user/temp-geos');
        return temporaryResponse.data;
    } catch (error) {
        console.error('Error fetching temporary geofences:', error);
        return []; // Return an empty array if there's an error fetching temporary geofences
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
            const permanentResponse = await axios.post('http://localhost:3000/admin-o/curr-geos');
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
            db.query('SELECT * FROM attendance WHERE userid = ? AND date = ?', [userId, ourdate], (err, results) => {
                if (err) {
                    console.error('Error executing query:', err);
                    return res.status(500).json({ message: 'Server error' });
                }
                if (results.length === 0) {
                    db.query('INSERT INTO attendance (userid, status, date, signin_time, accounted_for, curr_loc) VALUES (?, ?, ?, ?, ?, ?)', 
                    [userId, 'online', ourdate, currentTime, acc, closestGeofence.name], (err, results) => {
                        if (err) {
                            console.error('Error executing query:', err);
                            return res.status(500).json({ message: 'Server error' });
                        }
                        res.json({ message: 'Inside closest geofence, attendance recorded' });
                    });
                } else {
                    //start - Checking if the user has already checked out twice
                    const doubleQuery = "SELECT COUNT(*) AS count FROM attendance WHERE date = ? AND userid = ? AND status = ?";
                    db.query(doubleQuery, [ourdate, userId, "offline"], (err, rows) => {
                        if (err) {
                            console.error('Error executing query:', err);
                            return res.status(500).json({ message: 'Server error' });
                        }
                        
                        const count = rows[0].count;
                        
                        if (count < 2) {
                            // If the user has not checked out more than twice, update the status to 'online'
                            db.query('UPDATE attendance SET status = ?, signout_time = NULL WHERE userid = ? AND date = ?', 
                                ['online', userId, ourdate], (err, results) => {
                                if (err) {
                                    console.error('Error executing query:', err);
                                    return res.status(500).json({ message: 'Server error' });
                                }
                                res.json({ message: 'Inside closest geofence, status updated' });
                            });
                        } else {
                            res.status(400).json({ message: 'Maximum check-ins/check-outs exceeded for today' });
                        }
                    });
                    //end
                }
            });
        } else {
            console.log('Outside closest geofence');
            db.query('UPDATE attendance SET status = ?, signout_time = ? WHERE userid = ? AND date = ?', 
            ['offline', currentTime, userId, ourdate], (err, results) => {
                if (err) {
                    console.error('Error executing query:', err);
                    return res.status(500).json({ message: 'Server error' });
                }
                res.json({ message: 'Outside closest geofence, status updated' });
            });
        }
    } catch (error) {
        console.error('Unexpected error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;