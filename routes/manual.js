const express = require('express');
const Router = express.Router();
const methodOverride = require('method-override');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const Request = require('../models/Request');
const TempGeo = require('../models/TempGeo');
const Attendance = require('../models/Attendance');

// Middleware setup
Router.use(methodOverride('_method'));


// Middleware to check if user is admin
function isAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.type === 'admin') {
        return next();
    }
    res.redirect('/admin/login');
}

function idmake() {
    return uuidv4();
}

const now = new Date();
const year = now.getFullYear();
const month = now.getMonth() + 1;
const day = now.getDate();
const ourdate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

Router.post("/new/temp-geo", async (req, res) => {
    const { longitude, latitude, description } = req.body;
    const userid = req.user.id;
    try {
        let id = idmake();
        const exists = await Request.findOne({ latitude, longitude, date: ourdate });
        if (!exists) {
            await Request.create({ reqid: id, userid, latitude, longitude, date: ourdate, description, status: "pen" });
            res.send("Request created successfully");
        } else {
            res.send("Request already exists for this location and date");
        }
    } catch (error) {
        console.error('Error:', error);
        res.sendStatus(500);
    }
});

Router.get("/new/temp", (req, res) => {
    res.render("new-temp");
});

Router.post("/show/temp", async (req, res) => {
    try {
        const requests = await Request.find({ date: ourdate, status: "pen" });
        res.status(200).json(requests);
    } catch (err) {
        console.log("Error:", err);
        res.sendStatus(500);
    }
});

Router.get("/show/temp-geo", async (req, res) => {
    try {
        const { data: requests } = await axios.post(`${API_BASE_URL}/user/show/temp`);
        res.render("show-temp", { requests });
    } catch (error) {
        console.error("Error fetching data:", error);
        res.sendStatus(500);
    }
});
Router.post("/find/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const request = await Request.findOne({ reqid: id });
        res.send([request]);
    } catch (err) {
        console.log("Error finding request:", err);
        res.sendStatus(500);
    }
});
Router.post("/admin/requests/:id/accept", async (req, res) => {
    const { id } = req.params;
    try {
        let response = await axios.post(`${API_BASE_URL}/user/find/${id}`);
        let temp = response.data[0];
        // Update the status of the request to 'accepted'
        await Request.updateOne({ reqid: id }, { status: 'accept' });
        // Check if a similar entry exists in temgeo
        const exists = await TempGeo.findOne({ latitude: temp.latitude, longitude: temp.longitude, date: temp.date });
        if (!exists) {
            let ide = idmake();
            await TempGeo.create({ tempid: ide, latitude: temp.latitude, longitude: temp.longitude, radius: 200, name: ide, date: temp.date });
        }
        res.redirect("/user/show/temp-geo");
    } catch (error) {
        console.error("Error processing request:", error);
        res.sendStatus(500);
    }
});


Router.post("/admin/requests/:id/reject", async (req, res) => {
    const { id } = req.params;
    try {
        await Request.updateOne({ reqid: id }, { status: 'rejected' });
        res.redirect("/admin/requests");
    } catch (err) {
        console.log("Error updating request status:", err);
        res.sendStatus(500);
    }
});
Router.get("/temp-geos", async (req, res) => {
    try {
        const rows = await TempGeo.find({ date: ourdate });
        res.status(200).send(rows);
    } catch (err) {
        console.log(err);
        res.status(500).send("Error fetching temp geos");
    }
});
Router.post("/history", async (req, res) => {
    const id = req.user.id;
    try {
        const rows = await Attendance.find({ userid: id });
        if (!rows.length) {
            res.status(404).send("error while fetching history ples try later");
        } else {
            res.status(200).send(rows);
        }
    } catch (err) {
        console.log(err);
        res.status(404).send("error while fetching history ples try later");
    }
});
Router.post("/history/req", async (req, res) => {
    const id = req.user.id;
    try {
        const rows = await Request.find({ userid: id });
        if (!rows.length) {
            res.status(404).send("error while fetching history ples try later");
        } else {
            res.status(200).send(rows);
        }
    } catch (err) {
        console.log(err);
        res.status(404).send("error while fetching history ples try later");
    }
});
module.exports = Router;